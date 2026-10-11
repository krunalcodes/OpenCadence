import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import { apiError } from "../../common/api-error";
import { TrackingKeys } from "../../infra/tracking-keys/tracking-keys";
import { BrandService, fontStack } from "../brand/brand.service";
import { type Contact, ContactsService } from "../contacts/contacts.service";
import { DispatchService } from "../dispatch/dispatch.service";
import { ListsService } from "../lists/lists.service";
import {
  normalizeEmail,
  SuppressionService,
} from "../suppression/suppression.service";
import { maskEmail, type Visitor } from "../tracking/request-info";
import { buildConfirmationEmail } from "./confirmation-email";
import {
  type FormField,
  FormInputError,
  type FormSettings,
  isHoneypotFilled,
  parseSubmission,
  resolveSettings,
  submissionContact,
} from "./form-input";
import {
  confirmToken,
  readConfirmToken,
  readRenderToken,
  renderToken,
} from "./form-tokens";
import {
  confirmTokenTtlMs,
  type FormRateGroup,
  honeypotField,
  minFillMs,
  renderTokenField,
} from "./forms.constants";
import { FormsRateLimiter } from "./forms.rate-limiter";
import {
  type FormRow,
  FormsRepository,
  type SubmissionRow,
} from "./forms.repository";
import { FormsService } from "./forms.service";

export type PublicForm = {
  name: string;
  brand: {
    name: string;
    logoUrl: string | null;
    primaryColor: string;
    backgroundColor: string;
    contentColor: string;
    textColor: string;
    fontFamily: string;
    fontStack: string;
  };
  fields: FormField[];
  settings: Omit<FormSettings, "fromEmail">;
  doubleOptIn: boolean;
  submitUrl: string;
  protection: {
    honeypotField: string;
    renderTokenField: string;
    renderToken: string;
  };
};

export type SubmitResult = {
  status: "pending" | "subscribed";
  redirectUrl: string | null;
};

export type ConfirmState = "pending" | "confirmed" | "already" | "expired";

export type ConfirmResult = {
  status: ConfirmState;
  brandName: string;
  redirectUrl: string | null;
  email: string | null;
};

const publicIdPattern = /^[a-z0-9]{12,32}$/;
const maxUserAgentLength = 500;

function formNotFound() {
  return apiError(
    HttpStatus.NOT_FOUND,
    "not_found",
    "This form does not exist or is not accepting sign-ups.",
  );
}

function linkNotFound() {
  return apiError(
    HttpStatus.NOT_FOUND,
    "not_found",
    "This link is not valid or has expired.",
  );
}

function rateLimited() {
  return apiError(
    HttpStatus.TOO_MANY_REQUESTS,
    "rate_limited",
    "Too many requests. Wait a minute and try again.",
  );
}

function isNotFound(error: unknown) {
  return (
    error instanceof HttpException && error.getStatus() === HttpStatus.NOT_FOUND
  );
}

export function isPublicId(value: unknown): value is string {
  return typeof value === "string" && publicIdPattern.test(value);
}

@Injectable()
export class PublicFormsService {
  private readonly logger = new Logger(PublicFormsService.name);

  constructor(
    @Inject(FormsRepository) private readonly repository: FormsRepository,
    @Inject(FormsService) private readonly forms: FormsService,
    @Inject(FormsRateLimiter) private readonly limiter: FormsRateLimiter,
    @Inject(TrackingKeys) private readonly keys: TrackingKeys,
    @Inject(BrandService) private readonly brand: BrandService,
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Inject(ListsService) private readonly lists: ListsService,
    @Inject(SuppressionService)
    private readonly suppression: SuppressionService,
    @Inject(DispatchService) private readonly dispatch: DispatchService,
  ) {}

  async allow(group: FormRateGroup, subject: string) {
    if (!(await this.limiter.take(group, subject))) {
      throw rateLimited();
    }
  }

  async get(
    publicId: string,
    visitor: Visitor,
    now = new Date(),
  ): Promise<PublicForm> {
    await this.allow("page", visitor.ip);
    const form = await this.requirePublished(publicId);
    const [brand, catalog] = await Promise.all([
      this.brand.get(form.workspaceId),
      this.forms.catalog(form.workspaceId),
    ]);
    const { fromEmail: _fromEmail, ...settings } = resolveSettings(
      form.settings,
      form.doubleOptIn,
    );
    return {
      name: form.name,
      brand: {
        name: brand.brandName,
        logoUrl: brand.logo?.url ?? null,
        primaryColor: brand.primaryColor,
        backgroundColor: brand.backgroundColor,
        contentColor: brand.contentColor,
        textColor: brand.textColor,
        fontFamily: brand.fontFamily,
        fontStack: fontStack(brand.fontFamily),
      },
      fields: this.forms.toPublicFields(form, catalog),
      settings,
      doubleOptIn: form.doubleOptIn,
      submitUrl: this.forms.submitUrl(form.publicId),
      protection: {
        honeypotField,
        renderTokenField,
        renderToken: renderToken(form.id, now, this.keys.secret),
      },
    };
  }

  successLocation(publicId: string, status: SubmitResult["status"]) {
    return `${this.forms.formUrl(publicId)}?submitted=${status}`;
  }

  errorLocation(publicId: string, code: string, field?: string) {
    const query = new URLSearchParams({ error: code });
    if (field) {
      query.set("field", field);
    }
    return `${this.forms.formUrl(publicId)}?${query.toString()}`;
  }

  async submit(
    publicId: string,
    values: Map<string, string>,
    visitor: Visitor,
    now = new Date(),
  ): Promise<SubmitResult> {
    await this.allow("submitPerIpMinute", visitor.ip);
    await this.allow("submitPerIpHour", visitor.ip);
    const form = await this.requirePublished(publicId);
    await this.allow("submitPerForm", form.id);

    const settings = resolveSettings(form.settings, form.doubleOptIn);
    const result: SubmitResult = {
      status: form.doubleOptIn ? "pending" : "subscribed",
      redirectUrl: settings.redirectUrl,
    };
    if (isHoneypotFilled(values) || this.isTooFast(form, values, now)) {
      return result;
    }

    const fields = this.forms.toPublicFields(
      form,
      await this.forms.catalog(form.workspaceId),
    );
    let submitted: ReturnType<typeof parseSubmission>;
    try {
      submitted = parseSubmission(values, fields);
    } catch (error) {
      if (error instanceof FormInputError) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          "validation",
          error.message,
          error.field,
        );
      }
      throw error;
    }

    if (
      !(await this.limiter.take(
        "addressPerForm",
        `${form.id}:${submitted.email}`,
      )) ||
      !(await this.limiter.take("addressPerDay", submitted.email))
    ) {
      return result;
    }

    try {
      await this.accept(form, settings, fields, submitted, visitor);
    } catch (error) {
      this.logger.error(
        `A submission to form ${form.id} was not completed: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
        error instanceof Error ? error.stack : undefined,
      );
    }
    return result;
  }

  async inspect(token: string, visitor: Visitor): Promise<ConfirmResult> {
    await this.allow("page", visitor.ip);
    const found = await this.findConfirmation(token);
    return "result" in found
      ? found.result
      : this.confirmResult(found, found.state);
  }

  async confirm(token: string, visitor: Visitor): Promise<ConfirmResult> {
    await this.allow("page", visitor.ip);
    const found = await this.findConfirmation(token);
    if ("result" in found) {
      return found.result;
    }
    if (found.state !== "pending") {
      return this.confirmResult(found, found.state);
    }
    const fields = this.forms.toPublicFields(
      found.form,
      await this.forms.catalog(found.form.workspaceId),
    );
    await this.subscribe(found.form, found.submission, fields, true);
    return this.confirmResult(found, "confirmed");
  }

  private isTooFast(form: FormRow, values: Map<string, string>, now: Date) {
    const token = values.get(renderTokenField);
    if (token === undefined || token === "") {
      return false;
    }
    const renderedAt = readRenderToken(token, form.id, this.keys.secret);
    return (
      renderedAt === null || now.getTime() - renderedAt.getTime() < minFillMs
    );
  }

  private async accept(
    form: FormRow,
    settings: FormSettings,
    fields: FormField[],
    submitted: { email: string; data: Record<string, string> },
    visitor: Visitor,
  ) {
    const blocked = await this.suppression.findBlocked(
      form.workspaceId,
      [submitted.email],
      "transactional",
    );
    const submission = await this.repository.insertSubmission({
      workspaceId: form.workspaceId,
      formId: form.id,
      email: submitted.email,
      data: submitted.data,
      status: blocked.has(submitted.email) ? "rejected" : "pending",
      consentText: settings.consentText,
      userAgent: visitor.userAgent?.slice(0, maxUserAgentLength) || null,
    });
    if (submission.status === "rejected") {
      return;
    }
    if (form.doubleOptIn) {
      await this.sendConfirmation(form, settings, submission);
    } else {
      await this.subscribe(form, submission, fields, false);
    }
  }

  private async sendConfirmation(
    form: FormRow,
    settings: FormSettings,
    submission: SubmissionRow,
  ) {
    const resolved = await this.forms.resolveSender(form);
    if ("problem" in resolved) {
      throw new Error(resolved.problem.message);
    }
    const brand = await this.brand.get(form.workspaceId);
    const token = confirmToken(
      submission.id,
      new Date(submission.createdAt.getTime() + confirmTokenTtlMs),
      this.keys.secret,
    );
    const email = buildConfirmationEmail({
      brand: {
        name: brand.brandName,
        logoUrl: brand.logo?.url ?? null,
        primaryColor: brand.primaryColor,
        backgroundColor: brand.backgroundColor,
        contentColor: brand.contentColor,
        textColor: brand.textColor,
        fontStack: fontStack(brand.fontFamily),
      },
      subject: settings.confirmSubject,
      confirmUrl: this.forms.confirmUrl(token),
    });
    const message = await this.dispatch.enqueue({
      workspaceId: form.workspaceId,
      kind: "transactional",
      sourceId: resolved.sender.sourceId,
      from: {
        email: resolved.sender.fromEmail,
        name: brand.brandName.replace(/[\r\n]+/g, " ").trim() || null,
      },
      to: [submission.email],
      subject: email.subject,
      html: email.html,
      text: email.text,
      tags: { purpose: "form_confirmation" },
      idempotencyKey: `form-confirm:${submission.id}`,
    });
    await this.repository.setConfirmationMessage(
      form.workspaceId,
      submission.id,
      message.id,
    );
  }

  private async subscribe(
    form: FormRow,
    submission: SubmissionRow,
    fields: FormField[],
    verified: boolean,
  ) {
    const workspaceId = form.workspaceId;
    for (const scope of ["all", "columns", "email"] as const) {
      const written = await this.contacts.upsertMany(
        workspaceId,
        [submissionContact(submission.email, submission.data, fields, scope)],
        { origin: "form", updateExisting: verified },
      );
      if (written.errors.length === 0) {
        break;
      }
    }
    const contact = await this.findContact(workspaceId, submission.email);
    if (!contact) {
      throw new Error("The contact for a form submission was not found.");
    }
    const existing = new Set(
      (await this.lists.catalog(workspaceId)).map((list) => list.id),
    );
    const listIds = form.listIds.filter((id) => existing.has(id));
    if (listIds.length > 0) {
      await this.lists.addMembers(workspaceId, listIds, [contact.id]);
    }
    for (const listId of listIds) {
      const membership = contact.lists.find((list) => list.id === listId);
      if (membership?.status === "unsubscribed") {
        await this.lists.setMemberStatus(workspaceId, listId, contact.id, {
          status: "subscribed",
        });
      }
    }
    await this.liftUnsubscribe(workspaceId, submission.email);
    await this.repository.completeSubmission(
      workspaceId,
      submission.id,
      contact.id,
    );
  }

  private async findContact(
    workspaceId: string,
    email: string,
  ): Promise<Contact | null> {
    const page = await this.contacts.list(workspaceId, {
      filter: {
        match: "all",
        conditions: [{ field: "email", op: "is", value: email }],
      },
      limit: 1,
    });
    return page.contacts.find((contact) => contact.email === email) ?? null;
  }

  private async liftUnsubscribe(workspaceId: string, address: string) {
    const email = normalizeEmail(address);
    const { suppressions } = await this.suppression.list(workspaceId, {
      reason: "unsubscribed",
      search: email,
      limit: 100,
    });
    for (const suppression of suppressions) {
      if (suppression.email !== email) {
        continue;
      }
      try {
        await this.suppression.remove(workspaceId, suppression.id);
      } catch (error) {
        if (!isNotFound(error)) {
          throw error;
        }
      }
    }
  }

  private async requirePublished(publicId: string) {
    const form = isPublicId(publicId)
      ? await this.repository.findByPublicId(publicId)
      : null;
    if (form?.status !== "published") {
      throw formNotFound();
    }
    return form;
  }

  private async findConfirmation(
    token: string,
  ): Promise<
    | { result: ConfirmResult }
    | { form: FormRow; submission: SubmissionRow; state: ConfirmState }
  > {
    const parsed = readConfirmToken(token, this.keys.secret);
    if (!parsed) {
      throw linkNotFound();
    }
    const found = await this.repository.findSubmissionWithForm(
      parsed.submissionId,
    );
    if (!found) {
      return {
        result: {
          status: "expired",
          brandName: "",
          redirectUrl: null,
          email: null,
        },
      };
    }
    const { status } = found.submission;
    return {
      ...found,
      state:
        status === "subscribed"
          ? "already"
          : parsed.expired || status === "rejected"
            ? "expired"
            : "pending",
    };
  }

  private async confirmResult(
    found: { form: FormRow; submission: SubmissionRow },
    status: ConfirmState,
  ): Promise<ConfirmResult> {
    const brand = await this.brand.get(found.form.workspaceId);
    return {
      status,
      brandName: brand.brandName.trim(),
      redirectUrl: resolveSettings(found.form.settings, found.form.doubleOptIn)
        .redirectUrl,
      email: maskEmail(found.submission.email),
    };
  }
}
