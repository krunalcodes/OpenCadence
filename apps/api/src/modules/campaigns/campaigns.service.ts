import { InjectQueue } from "@nestjs/bullmq";
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import type { Queue } from "bullmq";
import { apiError } from "../../common/api-error";
import type { WorkspaceAuthContext } from "../../common/guards/workspace-auth.guard";
import {
  clampLimit,
  decodeKeysetCursor,
  encodeKeysetCursor,
} from "../../common/pagination/keyset-cursor";
import { isUuid } from "../../common/uuid";
import { BrandService } from "../brand/brand.service";
import { ContactsService } from "../contacts/contacts.service";
import { DispatchService } from "../dispatch/dispatch.service";
import { SendingSourcesService } from "../integrations/sending-sources.service";
import { type Audience, AudienceService } from "../segments/audience.service";
import {
  isValidEmail,
  normalizeEmail,
} from "../suppression/suppression.service";
import {
  type Template,
  TemplatesService,
} from "../templates/templates.service";
import {
  type CampaignProblem,
  hasUnsubscribeTag,
  mergeTagProblems,
} from "./campaign-problems";
import {
  addFanoutJob,
  CAMPAIGN_FANOUT_QUEUE,
  type CampaignFanoutJob,
  type CampaignStatus,
  campaignStatuses,
} from "./campaigns.constants";
import {
  type CampaignRow,
  CampaignsRepository,
  type DraftValues,
} from "./campaigns.repository";

export type CampaignStats = {
  recipients: number;
  skipped: number;
  sent: number;
  delivered: number;
  bounced: number;
  complained: number;
  failed: number;
  opened: number;
  clicked: number;
  unsubscribed: number;
};

export type CampaignSummary = {
  id: string;
  name: string;
  status: CampaignStatus;
  subject: string;
  audienceLabel: string | null;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  stats: CampaignStats;
  createdAt: string;
  updatedAt: string;
};

export type CampaignActivity = Omit<CampaignSummary, "audienceLabel"> & {
  sourceId: string | null;
  trackOpens: boolean;
  trackClicks: boolean;
  fanoutDone: boolean;
  error: { code: string; message: string } | null;
};

export type CampaignSource = {
  id: string;
  name: string;
  email: string | null;
  integrationType: string;
  status: string;
};

export type Campaign = CampaignSummary & {
  template: { id: string; name: string } | null;
  previewText: string;
  from: { name: string | null; email: string | null };
  replyTo: string | null;
  source: CampaignSource | null;
  audience: Audience | null;
  trackOpens: boolean;
  trackClicks: boolean;
  error: { code: string; message: string } | null;
  fanoutDone: boolean;
};

export type CampaignCheck = {
  ready: boolean;
  recipientCount: number | null;
  problems: CampaignProblem[];
};

export type CampaignRecipient = {
  messageId: string;
  contactId: string | null;
  email: string;
  status: string;
  openedAt: string | null;
  clickedAt: string | null;
  unsubscribedAt: string | null;
  error: { code: string; message: string } | null;
  sentAt: string | null;
};

export type CampaignsQuery = {
  status?: string;
  search?: string;
  cursor?: string;
  limit?: number;
};

export type RecipientsQuery = {
  status?: string;
  cursor?: string;
  limit?: number;
};

type SendSource = Awaited<ReturnType<SendingSourcesService["resolveForSend"]>>;

type Inspection = {
  check: CampaignCheck;
  template: Template | null;
  source: SendSource | null;
};

const maxNameLength = 120;
const maxSubjectLength = 998;
const maxPreviewTextLength = 300;
const maxFromNameLength = 120;
const maxSearchLength = 200;
const defaultLimit = 30;
const maxLimit = 100;
const copySuffix = " copy";

function validation(message: string, field: string) {
  return apiError(HttpStatus.BAD_REQUEST, "validation", message, field);
}

function notFound() {
  return apiError(
    HttpStatus.NOT_FOUND,
    "not_found",
    "This campaign was not found. It may have been deleted.",
  );
}

function notEditable() {
  return apiError(
    HttpStatus.CONFLICT,
    "not_editable",
    "Only a draft can be changed. Unschedule the campaign, or duplicate it and edit the copy.",
  );
}

function invalidStatus(message: string) {
  return apiError(HttpStatus.CONFLICT, "invalid_status", message);
}

function statusOf(error: unknown) {
  return error instanceof HttpException ? error.getStatus() : null;
}

function codeOf(error: unknown) {
  if (!(error instanceof HttpException)) {
    return null;
  }
  const response = error.getResponse();
  const code =
    typeof response === "object" && response !== null
      ? (response as { code?: unknown }).code
      : null;
  return typeof code === "string" ? code : null;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function userOf(context: WorkspaceAuthContext) {
  return context.method === "session" ? context.userId : null;
}

function parseName(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw validation("Give the campaign a name.", "name");
  }
  const name = value.trim();
  if (name.length > maxNameLength || /[\r\n\0]/.test(name)) {
    throw validation(
      `Keep the name to one line of ${maxNameLength} characters or fewer.`,
      "name",
    );
  }
  return name;
}

function parseLine(value: unknown, field: string, label: string, max: number) {
  if (typeof value !== "string") {
    throw validation(`${field} must be text.`, field);
  }
  const line = value.trim();
  if (line.length > max || /[\r\n\0]/.test(line)) {
    throw validation(
      `Keep ${label} to one line of ${max} characters or fewer.`,
      field,
    );
  }
  return line;
}

function parseEmail(value: unknown, field: string, label: string) {
  if (value === null || value === "") {
    return null;
  }
  if (typeof value !== "string" || !isValidEmail(value)) {
    throw validation(`Enter ${label} as a valid email address.`, field);
  }
  return normalizeEmail(value);
}

function parseId(value: unknown, field: string) {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string" || !isUuid(value)) {
    throw validation(`${field} is not a valid id.`, field);
  }
  return value.toLowerCase();
}

function parseFlag(value: unknown, field: string) {
  if (typeof value !== "boolean") {
    throw validation(`${field} must be true or false.`, field);
  }
  return value;
}

function parseScheduledAt(value: unknown) {
  if (value === undefined || value === null) {
    return null;
  }
  const date = typeof value === "string" ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    throw validation(
      "scheduledAt must be a date and time in ISO 8601 format.",
      "scheduledAt",
    );
  }
  return date;
}

function copyName(name: string) {
  return `${name.slice(0, maxNameLength - copySuffix.length).trimEnd()}${copySuffix}`;
}

function statsOf(row: CampaignRow): CampaignStats {
  return {
    recipients: row.recipientCount,
    skipped: row.skippedCount,
    sent: row.sentCount,
    delivered: row.deliveredCount,
    bounced: row.bouncedCount,
    complained: row.complainedCount,
    failed: row.failedCount,
    opened: row.openedCount,
    clicked: row.clickedCount,
    unsubscribed: row.unsubscribedCount,
  };
}

function toSummary(
  row: CampaignRow,
  audienceLabel: string | null,
): CampaignSummary {
  return {
    id: row.id,
    name: row.name,
    status: row.status as CampaignStatus,
    subject: row.subject,
    audienceLabel,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    stats: statsOf(row),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    @Inject(CampaignsRepository)
    private readonly repository: CampaignsRepository,
    @Inject(TemplatesService) private readonly templates: TemplatesService,
    @Inject(BrandService) private readonly brand: BrandService,
    @Inject(SendingSourcesService)
    private readonly sources: SendingSourcesService,
    @Inject(DispatchService) private readonly dispatch: DispatchService,
    @Inject(AudienceService) private readonly audiences: AudienceService,
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @InjectQueue(CAMPAIGN_FANOUT_QUEUE)
    private readonly fanoutQueue: Queue<CampaignFanoutJob>,
  ) {}

  async list(
    workspaceId: string,
    query: CampaignsQuery,
  ): Promise<{ items: CampaignSummary[]; nextCursor: string | null }> {
    if (
      query.status &&
      !campaignStatuses.includes(query.status as CampaignStatus)
    ) {
      throw validation(
        `status must be one of: ${campaignStatuses.join(", ")}.`,
        "status",
      );
    }
    const cursor = query.cursor ? decodeKeysetCursor(query.cursor) : undefined;
    if (cursor === null) {
      throw validation(
        "The cursor is not valid. Start again from the first page.",
        "cursor",
      );
    }
    const search = query.search?.trim().slice(0, maxSearchLength);
    const limit = clampLimit(query.limit, defaultLimit, maxLimit);
    const rows = await this.repository.list(workspaceId, {
      status: query.status as CampaignStatus | undefined,
      search: search || undefined,
      cursor,
      limit: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    const labels = new Map<string, Promise<string | null>>();
    const labelFor = (audience: Audience | null) => {
      const key = JSON.stringify(audience);
      const known = labels.get(key);
      if (known) {
        return known;
      }
      const label = this.audienceLabel(workspaceId, audience);
      labels.set(key, label);
      return label;
    };
    return {
      items: await Promise.all(
        page.map(async ({ campaign }) =>
          toSummary(campaign, await labelFor(campaign.audience)),
        ),
      ),
      nextCursor:
        rows.length > limit && last
          ? encodeKeysetCursor({ at: last.cursorAt, id: last.campaign.id })
          : null,
    };
  }

  async listActivity(
    workspaceId: string,
    limit: number,
  ): Promise<CampaignActivity[]> {
    const rows = await this.repository.listActivity(
      workspaceId,
      clampLimit(limit, defaultLimit, maxLimit),
    );
    return rows.map((row) => {
      const { audienceLabel: _label, ...summary } = toSummary(row, null);
      return {
        ...summary,
        sourceId: row.sourceId,
        trackOpens: row.trackOpens,
        trackClicks: row.trackClicks,
        fanoutDone: row.fanoutDoneAt !== null,
        error: row.errorCode
          ? { code: row.errorCode, message: row.errorMessage ?? "" }
          : null,
      };
    });
  }

  async get(workspaceId: string, id: string): Promise<Campaign> {
    return this.toCampaign(await this.require(workspaceId, id));
  }

  async create(context: WorkspaceAuthContext, input: unknown) {
    const body = record(input);
    const name = parseName(body.name);
    const values = await this.parseDraft(context.workspaceId, body, null);
    const row = await this.repository.insert(
      context.workspaceId,
      {
        templateId: null,
        subject: "",
        previewText: "",
        fromName: null,
        fromEmail: null,
        replyTo: null,
        sourceId: null,
        audience: null,
        trackOpens: true,
        trackClicks: true,
        ...values,
        name,
      },
      userOf(context),
    );
    return this.toCampaign(row);
  }

  async update(workspaceId: string, id: string, input: unknown) {
    const current = await this.require(workspaceId, id);
    if (current.status !== "draft") {
      throw notEditable();
    }
    const values = await this.parseDraft(workspaceId, record(input), current);
    if (Object.keys(values).length === 0) {
      return this.toCampaign(current);
    }
    const row = await this.repository.updateDraft(workspaceId, id, values);
    if (!row) {
      throw (await this.repository.find(workspaceId, id))
        ? notEditable()
        : notFound();
    }
    return this.toCampaign(row);
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    await this.require(workspaceId, id);
    if (await this.repository.deleteUnlessSending(workspaceId, id)) {
      return;
    }
    if (await this.repository.find(workspaceId, id)) {
      throw apiError(
        HttpStatus.CONFLICT,
        "campaign_sending",
        "This campaign is sending. Pause or cancel it before deleting it.",
      );
    }
  }

  async duplicate(context: WorkspaceAuthContext, id: string) {
    const source = await this.require(context.workspaceId, id);
    const row = await this.repository.insert(
      context.workspaceId,
      {
        name: copyName(source.name),
        templateId: source.templateId,
        subject: source.subject,
        previewText: source.previewText,
        fromName: source.fromName,
        fromEmail: source.fromEmail,
        replyTo: source.replyTo,
        sourceId: source.sourceId,
        audience: source.audience,
        trackOpens: source.trackOpens,
        trackClicks: source.trackClicks,
      },
      userOf(context),
    );
    return this.toCampaign(row);
  }

  async check(
    workspaceId: string,
    id: string,
    scheduledAt?: string,
  ): Promise<CampaignCheck> {
    const row = await this.require(workspaceId, id);
    const inspection = await this.inspect(
      row,
      parseScheduledAt(scheduledAt || undefined),
    );
    return inspection.check;
  }

  async send(workspaceId: string, id: string, input: unknown) {
    const scheduledAt = parseScheduledAt(record(input).scheduledAt);
    const row = await this.require(workspaceId, id);
    if (row.status !== "draft") {
      throw invalidStatus(
        "Only a draft can be sent. Duplicate the campaign to send it again.",
      );
    }
    const { check, template, source } = await this.inspect(row, scheduledAt);
    if (!check.ready || !template || !source) {
      throw new HttpException(
        {
          statusCode: HttpStatus.CONFLICT,
          code: "not_ready",
          message:
            "This campaign is not ready to send. Fix the problems listed and try again.",
          problems: check.problems,
        },
        HttpStatus.CONFLICT,
      );
    }
    const snapshot = await this.dispatch.createSnapshot(workspaceId, {
      subject: row.subject,
      previewText: row.previewText,
      html: template.html,
      text: template.text,
    });
    const now = new Date();
    const started = await this.repository.transition(
      workspaceId,
      id,
      ["draft"],
      scheduledAt ? "scheduled" : "sending",
      {
        snapshotId: snapshot.id,
        sourceId: source.id,
        scheduledAt,
        startedAt: scheduledAt ? null : now,
        completedAt: null,
        fanoutCursor: null,
        fanoutDoneAt: null,
        errorCode: null,
        errorMessage: null,
      },
    );
    if (!started) {
      throw invalidStatus("This campaign was already sent or scheduled.");
    }
    if (!scheduledAt) {
      await this.startFanout(workspaceId, id);
    }
    return this.toCampaign(started);
  }

  async unschedule(workspaceId: string, id: string) {
    return this.move(workspaceId, id, ["scheduled"], "draft", {
      values: { scheduledAt: null, snapshotId: null },
      refusal: "Only a scheduled campaign can be unscheduled.",
    });
  }

  async pause(workspaceId: string, id: string) {
    return this.move(workspaceId, id, ["sending"], "paused", {
      refusal: "Only a campaign that is sending can be paused.",
    });
  }

  async resume(workspaceId: string, id: string) {
    const campaign = await this.move(workspaceId, id, ["paused"], "sending", {
      values: { errorCode: null, errorMessage: null },
      refusal: "Only a paused campaign can be resumed.",
    });
    await this.startFanout(workspaceId, id);
    return campaign;
  }

  async cancel(workspaceId: string, id: string) {
    return this.move(
      workspaceId,
      id,
      ["scheduled", "sending", "paused"],
      "cancelled",
      {
        values: { completedAt: new Date() },
        refusal:
          "Only a scheduled, sending or paused campaign can be cancelled.",
      },
    );
  }

  async recipients(
    workspaceId: string,
    id: string,
    query: RecipientsQuery,
  ): Promise<{ items: CampaignRecipient[]; nextCursor: string | null }> {
    await this.require(workspaceId, id);
    const page = await this.dispatch.list(workspaceId, {
      campaignId: id,
      status: query.status,
      cursor: query.cursor,
      limit: query.limit,
    });
    return {
      items: page.emails.map((message) => ({
        messageId: message.id,
        contactId: message.contactId,
        email: message.to[0] ?? message.suppressed[0] ?? "",
        status: message.status,
        openedAt: message.openedAt,
        clickedAt: message.clickedAt,
        unsubscribedAt: message.unsubscribedAt,
        error: message.error,
        sentAt: message.sentAt,
      })),
      nextCursor: page.nextCursor,
    };
  }

  async sendTest(workspaceId: string, id: string, input: unknown) {
    const row = await this.require(workspaceId, id);
    const template = await this.template(workspaceId, row.templateId);
    if (!template || template.html.trim() === "") {
      throw validation(
        "Choose a template with content before sending a test.",
        "template",
      );
    }
    return this.templates.sendTest(workspaceId, {
      to: record(input).to,
      subject: row.subject,
      html: template.html,
      text: template.text === "" ? null : template.text,
      sourceId: row.sourceId,
      from: row.fromEmail,
    });
  }

  private async move(
    workspaceId: string,
    id: string,
    from: CampaignStatus[],
    to: CampaignStatus,
    options: {
      values?: Parameters<CampaignsRepository["transition"]>[4];
      refusal: string;
    },
  ) {
    await this.require(workspaceId, id);
    const row = await this.repository.transition(
      workspaceId,
      id,
      from,
      to,
      options.values,
    );
    if (!row) {
      throw (await this.repository.find(workspaceId, id))
        ? invalidStatus(options.refusal)
        : notFound();
    }
    return this.toCampaign(row);
  }

  private async startFanout(workspaceId: string, campaignId: string) {
    try {
      await addFanoutJob(this.fanoutQueue, { workspaceId, campaignId });
    } catch (error) {
      this.logger.error(
        `The fan-out job for campaign ${campaignId} was not queued and will be picked up by the next reconcile: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
  }

  private async parseDraft(
    workspaceId: string,
    body: Record<string, unknown>,
    current: CampaignRow | null,
  ): Promise<Partial<DraftValues>> {
    const values: Partial<DraftValues> = {};
    if (body.name !== undefined && current) {
      values.name = parseName(body.name);
    }
    if (body.subject !== undefined) {
      values.subject = parseLine(
        body.subject,
        "subject",
        "the subject",
        maxSubjectLength,
      );
    }
    if (body.previewText !== undefined) {
      values.previewText = parseLine(
        body.previewText,
        "previewText",
        "the preview text",
        maxPreviewTextLength,
      );
    }
    if (body.fromName !== undefined) {
      values.fromName =
        body.fromName === null
          ? null
          : parseLine(
              body.fromName,
              "fromName",
              "the from name",
              maxFromNameLength,
            ) || null;
    }
    if (body.fromEmail !== undefined) {
      values.fromEmail = parseEmail(
        body.fromEmail,
        "fromEmail",
        "the from address",
      );
    }
    if (body.replyTo !== undefined) {
      values.replyTo = parseEmail(
        body.replyTo,
        "replyTo",
        "the reply-to address",
      );
    }
    if (body.trackOpens !== undefined) {
      values.trackOpens = parseFlag(body.trackOpens, "trackOpens");
    }
    if (body.trackClicks !== undefined) {
      values.trackClicks = parseFlag(body.trackClicks, "trackClicks");
    }
    if (body.sourceId !== undefined) {
      values.sourceId = parseId(body.sourceId, "sourceId");
      if (values.sourceId) {
        await this.sources.resolveForSend(workspaceId, values.sourceId);
      }
    }
    if (body.audience !== undefined) {
      values.audience =
        body.audience === null
          ? null
          : await this.audiences.validate(workspaceId, body.audience);
    }
    if (body.templateId !== undefined) {
      values.templateId = parseId(body.templateId, "templateId");
      if (values.templateId) {
        const template = await this.template(workspaceId, values.templateId);
        if (!template) {
          throw apiError(
            HttpStatus.NOT_FOUND,
            "not_found",
            "This template was not found. It may have been deleted.",
            "templateId",
          );
        }
        if ((values.subject ?? current?.subject ?? "") === "") {
          values.subject = template.subject;
        }
        if ((values.previewText ?? current?.previewText ?? "") === "") {
          values.previewText = template.previewText;
        }
      }
    }
    return values;
  }

  private async inspect(
    row: CampaignRow,
    scheduledAt: Date | null,
  ): Promise<Inspection> {
    const { workspaceId } = row;
    const problems: CampaignProblem[] = [];
    const error = (
      field: CampaignProblem["field"],
      code: string,
      message: string,
    ) => problems.push({ severity: "error", field, code, message });
    const warning = (
      field: CampaignProblem["field"],
      code: string,
      message: string,
    ) => problems.push({ severity: "warning", field, code, message });

    const [template, brand, fields] = await Promise.all([
      this.template(workspaceId, row.templateId),
      this.brand.get(workspaceId),
      this.contacts.listFields(workspaceId),
    ]);

    if (!template) {
      error(
        "template",
        "template_missing",
        row.templateId
          ? "The template chosen for this campaign was deleted. Choose another."
          : "Choose a template.",
      );
    } else if (template.html.trim() === "") {
      error(
        "template",
        "template_empty",
        "The template has no content. Add content to it or choose another.",
      );
    }
    if (row.subject.trim() === "") {
      error("subject", "subject_missing", "Write a subject line.");
    }
    problems.push(
      ...mergeTagProblems({
        subject: row.subject,
        previewText: row.previewText,
        html: template?.html ?? "",
        text: template?.text ?? "",
        fieldKeys: fields.map((field) => field.key),
      }),
    );
    if (
      template &&
      template.html.trim() !== "" &&
      !hasUnsubscribeTag(template.html)
    ) {
      warning(
        "template",
        "unsubscribe_link_missing",
        "The template has no unsubscribe link, so one will be added at the bottom of the email.",
      );
    }

    let recipientCount: number | null = null;
    if (!row.audience) {
      error(
        "audience",
        "audience_missing",
        "Choose who receives this campaign.",
      );
    } else {
      try {
        const audience = await this.audiences.validate(
          workspaceId,
          row.audience,
        );
        recipientCount = await this.audiences.count(workspaceId, audience);
        if (recipientCount === 0) {
          error(
            "audience",
            "audience_empty",
            "Nobody in this audience can receive email. Choose another audience or add contacts.",
          );
        }
      } catch (failure) {
        if (statusOf(failure) !== HttpStatus.NOT_FOUND) {
          throw failure;
        }
        error(
          "audience",
          "audience_not_found",
          "A list or segment chosen for this campaign was deleted. Choose the audience again.",
        );
      }
    }

    let source: SendSource | null = null;
    try {
      source = await this.sources.resolveForSend(
        workspaceId,
        row.sourceId ?? undefined,
      );
    } catch (failure) {
      if (statusOf(failure) === HttpStatus.NOT_FOUND) {
        error(
          "source",
          "source_not_found",
          "The sending source chosen for this campaign was disconnected. Choose another.",
        );
      } else if (codeOf(failure) === "no_default_source") {
        error(
          "source",
          "source_missing",
          "Choose a sending source, or set a default one on the Integrations page.",
        );
      } else {
        throw failure;
      }
    }
    if (source?.pausedAt) {
      error(
        "source",
        "source_paused",
        `Sending through ${source.name} is paused. Resume it or choose another source.`,
      );
    } else if (source?.status === "needs_attention") {
      error(
        "source",
        "source_needs_attention",
        `${source.name} needs attention before it can send. Fix it on the Integrations page.`,
      );
    }
    if (source) {
      if (source.email) {
        if (row.fromEmail && row.fromEmail !== normalizeEmail(source.email)) {
          error(
            "from",
            "from_mismatch",
            `${source.name} can only send as ${source.email}. Clear the From address or choose another source.`,
          );
        }
      } else if (!row.fromEmail) {
        error(
          "from",
          "from_missing",
          `${source.name} has no fixed address. Enter a From address on a domain that is verified in that account.`,
        );
      }
      if (
        recipientCount !== null &&
        source.dailySendLimit !== null &&
        recipientCount > source.dailySendLimit
      ) {
        warning(
          "source",
          "over_daily_limit",
          `${source.name} sends up to ${source.dailySendLimit.toLocaleString("en-US")} emails a day, so this campaign will take about ${Math.ceil(recipientCount / source.dailySendLimit)} days to finish.`,
        );
      }
    }

    if (!brand.postalAddress) {
      warning(
        "brand",
        "brand_address_missing",
        "Your brand has no postal address. Most anti-spam laws require one in marketing email. Add it in the brand settings.",
      );
    }
    if (scheduledAt && scheduledAt.getTime() <= Date.now()) {
      error(
        "schedule",
        "schedule_in_past",
        "The scheduled time has passed. Choose a later time or send now.",
      );
    }

    return {
      check: {
        ready: !problems.some((problem) => problem.severity === "error"),
        recipientCount,
        problems,
      },
      template,
      source,
    };
  }

  private async template(workspaceId: string, id: string | null) {
    if (!id) {
      return null;
    }
    try {
      return await this.templates.get(workspaceId, id);
    } catch (error) {
      if (statusOf(error) === HttpStatus.NOT_FOUND) {
        return null;
      }
      throw error;
    }
  }

  private async audienceLabel(workspaceId: string, audience: Audience | null) {
    if (!audience) {
      return null;
    }
    try {
      return (await this.audiences.describe(workspaceId, audience)).label;
    } catch (error) {
      if (statusOf(error) === HttpStatus.NOT_FOUND) {
        return null;
      }
      throw error;
    }
  }

  private async source(
    workspaceId: string,
    id: string | null,
  ): Promise<CampaignSource | null> {
    if (!id) {
      return null;
    }
    const { sources } = await this.sources.list(workspaceId);
    const found = sources.find((source) => source.id === id);
    return found
      ? {
          id: found.id,
          name: found.name,
          email: found.email,
          integrationType: found.integrationType,
          status: found.status,
        }
      : null;
  }

  private async toCampaign(row: CampaignRow): Promise<Campaign> {
    const [audienceLabel, template, source] = await Promise.all([
      this.audienceLabel(row.workspaceId, row.audience),
      this.template(row.workspaceId, row.templateId),
      this.source(row.workspaceId, row.sourceId),
    ]);
    return {
      ...toSummary(row, audienceLabel),
      template: template ? { id: template.id, name: template.name } : null,
      previewText: row.previewText,
      from: { name: row.fromName, email: row.fromEmail },
      replyTo: row.replyTo,
      source,
      audience: row.audience,
      trackOpens: row.trackOpens,
      trackClicks: row.trackClicks,
      error: row.errorCode
        ? { code: row.errorCode, message: row.errorMessage ?? "" }
        : null,
      fanoutDone: row.fanoutDoneAt !== null,
    };
  }

  private async require(workspaceId: string, id: string) {
    const row = isUuid(id) ? await this.repository.find(workspaceId, id) : null;
    if (!row) {
      throw notFound();
    }
    return row;
  }
}
