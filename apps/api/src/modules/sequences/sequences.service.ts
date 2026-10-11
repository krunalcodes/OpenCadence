import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { contactMergeKeys, findMergeTags } from "@workspace/email-renderer";
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
import {
  type SendingSourceDto,
  SendingSourcesService,
} from "../integrations/sending-sources.service";
import {
  type Template,
  TemplatesService,
} from "../templates/templates.service";
import {
  maxNameLength,
  parseDraft,
  parseName,
  parseSettings,
  parseSteps,
  record,
  validation,
} from "./sequence-input";
import {
  type SequenceStatus,
  sequenceStatuses,
  shortWindowMinutes,
} from "./sequences.constants";
import {
  type SequenceRow,
  type SequenceSettings,
  SequencesRepository,
  type StepRow,
  type StepValues,
} from "./sequences.repository";

export type SequenceStats = {
  enrolled: number;
  active: number;
  completed: number;
  replied: number;
  bounced: number;
  unsubscribed: number;
  sent: number;
  opened: number;
  clicked: number;
};

export type SequenceSummary = {
  id: string;
  name: string;
  status: SequenceStatus;
  stepCount: number;
  stats: SequenceStats;
  createdAt: string;
  updatedAt: string;
};

export type StepDto = {
  id: string;
  position: number;
  type: "email";
  delayMinutes: number;
  template: { id: string; name: string } | null;
  subject: string;
  threadMode: "reply" | "new";
  stats: {
    sent: number;
    opened: number;
    clicked: number;
    replied: number;
    bounced: number;
  };
};

export type SequenceSourceDto = {
  id: string;
  name: string;
  email: string | null;
  integrationType: string;
  status: string;
  hasInbox: boolean;
};

export type Sequence = SequenceSummary & {
  steps: StepDto[];
  sources: SequenceSourceDto[];
  fromName: string | null;
  fromEmail: string | null;
  trackOpens: boolean;
  trackClicks: boolean;
  stopOnReply: boolean;
  timezone: string;
  sendDays: number[];
  windowStartMinute: number;
  windowEndMinute: number;
  dailyLimitPerSource: number | null;
  layout: Record<string, { x: number; y: number }> | null;
};

export type SequenceProblem = {
  severity: "error" | "warning";
  field: "steps" | "sources" | "brand" | "window";
  code: string;
  message: string;
  stepId?: string;
};

export type SequenceCheck = { ready: boolean; problems: SequenceProblem[] };

export type SequencesQuery = {
  status?: string;
  search?: string;
  cursor?: string;
  limit?: number;
};

const defaultLimit = 30;
const maxLimit = 100;
const maxSearchLength = 200;
const duplicateAttempts = 5;
const templateNameAttempts = 20;
const maxTemplateNameLength = 120;
const builtInTags = new Set([
  ...contactMergeKeys,
  "brand.name",
  "brand.address",
  "brand.website",
  "unsubscribe_url",
  "preferences_url",
]);

function notFound() {
  return apiError(
    HttpStatus.NOT_FOUND,
    "not_found",
    "This sequence was not found. It may have been deleted.",
  );
}

function nameTaken() {
  return apiError(
    HttpStatus.CONFLICT,
    "name_taken",
    "A sequence with this name already exists. Choose another name.",
    "name",
  );
}

function archived() {
  return apiError(
    HttpStatus.CONFLICT,
    "not_editable",
    "This sequence is archived. Activate it again to change it.",
  );
}

function codeOf(error: unknown) {
  if (!(error instanceof HttpException)) {
    return null;
  }
  const response = error.getResponse();
  const code =
    typeof response === "object" && response !== null
      ? (response as { code?: unknown }).code
      : undefined;
  return typeof code === "string" ? code : null;
}

function stepTemplateName(sequenceName: string, step: number, attempt: number) {
  const suffix = `: step ${step}${attempt === 0 ? "" : ` (${attempt + 1})`}`;
  return `${sequenceName.slice(0, maxTemplateNameLength - suffix.length).trimEnd()}${suffix}`;
}

function userOf(context: WorkspaceAuthContext) {
  return context.method === "session" ? context.userId : null;
}

function copyName(name: string, taken: Set<string>) {
  for (let number = 1; ; number += 1) {
    const suffix = number === 1 ? " copy" : ` copy ${number}`;
    const candidate = `${name.slice(0, maxNameLength - suffix.length).trimEnd()}${suffix}`;
    if (!taken.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
}

function toStats(row: SequenceRow): SequenceStats {
  return {
    enrolled: row.enrolledCount,
    active: row.activeCount,
    completed: row.completedCount,
    replied: row.repliedCount,
    bounced: row.bouncedCount,
    unsubscribed: row.unsubscribedCount,
    sent: row.sentCount,
    opened: row.openedCount,
    clicked: row.clickedCount,
  };
}

function toSummary(row: SequenceRow, stepCount: number): SequenceSummary {
  return {
    id: row.id,
    name: row.name,
    status: row.status as SequenceStatus,
    stepCount,
    stats: toStats(row),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function hasContent(template: Template | null | undefined) {
  return Boolean(template && template.html.trim() !== "");
}

@Injectable()
export class SequencesService {
  constructor(
    @Inject(SequencesRepository)
    private readonly repository: SequencesRepository,
    @Inject(TemplatesService) private readonly templates: TemplatesService,
    @Inject(DispatchService) private readonly dispatch: DispatchService,
    @Inject(SendingSourcesService)
    private readonly sources: SendingSourcesService,
    @Inject(BrandService) private readonly brand: BrandService,
    @Inject(ContactsService) private readonly contacts: ContactsService,
  ) {}

  async list(
    workspaceId: string,
    query: SequencesQuery,
  ): Promise<{ items: SequenceSummary[]; nextCursor: string | null }> {
    if (
      query.status &&
      !sequenceStatuses.includes(query.status as SequenceStatus)
    ) {
      throw validation(
        `status must be one of: ${sequenceStatuses.join(", ")}.`,
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
    const limit = clampLimit(query.limit, defaultLimit, maxLimit);
    const rows = await this.repository.listSequences(workspaceId, {
      status: query.status as SequenceStatus | undefined,
      search: query.search?.trim().slice(0, maxSearchLength) || undefined,
      cursor,
      limit: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map((row) => toSummary(row, row.stepCount)),
      nextCursor:
        rows.length > limit && last
          ? encodeKeysetCursor({ at: last.cursorAt, id: last.id })
          : null,
    };
  }

  async get(workspaceId: string, id: string): Promise<Sequence> {
    return this.view(workspaceId, await this.require(workspaceId, id));
  }

  async create(context: WorkspaceAuthContext, input: unknown) {
    const body = record(input);
    const values = parseSettings(body);
    const name = parseName(body.name);
    this.assertWindow(values);
    if (values.sourceIds) {
      await this.assertSources(context.workspaceId, values.sourceIds);
    }
    const result = await this.repository.insertSequence(
      context.workspaceId,
      { ...values, name },
      userOf(context),
    );
    if (!result.ok) {
      throw nameTaken();
    }
    return this.view(context.workspaceId, result.row);
  }

  async createFromDraft(context: WorkspaceAuthContext, input: unknown) {
    const { workspaceId } = context;
    const draft = parseDraft(input);
    const taken = await this.repository.namesStartingWith(
      workspaceId,
      draft.name,
    );
    if (taken.some((name) => name.toLowerCase() === draft.name.toLowerCase())) {
      throw nameTaken();
    }
    const templateIds: string[] = [];
    let created: SequenceRow;
    try {
      const steps: StepValues[] = [];
      for (const [index, step] of draft.steps.entries()) {
        const template = await this.createStepTemplate(
          context,
          draft.name,
          index + 1,
          step,
        );
        templateIds.push(template.id);
        steps.push({
          delayMinutes: step.delayMinutes,
          templateId: template.id,
          subject: step.subject,
          threadMode: step.threadMode,
          snapshotId: await this.snapshot(workspaceId, template, step.subject),
        });
      }
      const result = await this.repository.insertSequence(
        workspaceId,
        { name: draft.name },
        userOf(context),
        steps,
      );
      if (!result.ok) {
        throw nameTaken();
      }
      created = result.row;
    } catch (error) {
      await this.removeTemplates(workspaceId, templateIds);
      throw error;
    }
    return this.view(workspaceId, created);
  }

  async update(workspaceId: string, id: string, input: unknown) {
    const current = await this.require(workspaceId, id);
    if (current.status === "archived") {
      throw archived();
    }
    const values = parseSettings(input);
    this.assertWindow({
      windowStartMinute: values.windowStartMinute ?? current.windowStartMinute,
      windowEndMinute: values.windowEndMinute ?? current.windowEndMinute,
    });
    if (values.sourceIds) {
      if (current.status === "active" && values.sourceIds.length === 0) {
        throw validation(
          "An active sequence needs at least one mailbox. Pause it first to remove them all.",
          "sourceIds",
        );
      }
      await this.assertSources(workspaceId, values.sourceIds);
    }
    if (Object.keys(values).length === 0) {
      return this.view(workspaceId, current);
    }
    const result = await this.repository.updateSequence(
      workspaceId,
      id,
      values,
    );
    if (!result.ok) {
      throw result.reason === "name_taken" ? nameTaken() : notFound();
    }
    return this.view(workspaceId, result.row);
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const current = await this.require(workspaceId, id);
    if (
      current.status === "active" ||
      !(await this.repository.deleteSequence(workspaceId, id))
    ) {
      throw apiError(
        HttpStatus.CONFLICT,
        "sequence_active",
        "Pause or archive this sequence before deleting it.",
      );
    }
  }

  async duplicate(context: WorkspaceAuthContext, id: string) {
    const { workspaceId } = context;
    const source = await this.require(workspaceId, id);
    const steps = await this.repository.listSteps(workspaceId, id);
    const prefix = source.name.slice(0, maxNameLength - " copy 999".length);
    for (let attempt = 0; attempt < duplicateAttempts; attempt += 1) {
      const names = await this.repository.namesStartingWith(
        workspaceId,
        prefix,
      );
      const result = await this.repository.insertSequence(
        workspaceId,
        {
          name: copyName(
            source.name,
            new Set(names.map((name) => name.toLowerCase())),
          ),
          sourceIds: source.sourceIds,
          fromName: source.fromName,
          fromEmail: source.fromEmail,
          trackOpens: source.trackOpens,
          trackClicks: source.trackClicks,
          stopOnReply: source.stopOnReply,
          timezone: source.timezone,
          sendDays: source.sendDays,
          windowStartMinute: source.windowStartMinute,
          windowEndMinute: source.windowEndMinute,
          dailyLimitPerSource: source.dailyLimitPerSource,
          layout: null,
        },
        userOf(context),
        steps.map((step) => ({
          delayMinutes: step.delayMinutes,
          templateId: step.templateId,
          subject: step.subject,
          threadMode: step.threadMode as "reply" | "new",
          snapshotId: step.snapshotId,
        })),
      );
      if (result.ok) {
        return this.view(workspaceId, result.row);
      }
    }
    throw nameTaken();
  }

  async replaceSteps(workspaceId: string, id: string, input: unknown) {
    const sequence = await this.require(workspaceId, id);
    if (sequence.status === "archived") {
      throw archived();
    }
    const inputs = parseSteps(input);
    const existing = new Map(
      (await this.repository.listSteps(workspaceId, id)).map((step) => [
        step.id,
        step,
      ]),
    );
    const templates = await this.loadTemplates(
      workspaceId,
      inputs.map((step) => step.templateId),
    );
    const values: StepValues[] = [];
    for (const [index, step] of inputs.entries()) {
      const before = step.id ? existing.get(step.id) : undefined;
      if (step.id && !before) {
        throw validation(
          "This step is not part of the sequence. Leave id out to add a step.",
          `steps.${index}.id`,
        );
      }
      const template = step.templateId
        ? templates.get(step.templateId)
        : undefined;
      if (step.templateId && !template) {
        throw apiError(
          HttpStatus.NOT_FOUND,
          "not_found",
          "This template was not found. It may have been deleted.",
          `steps.${index}.templateId`,
        );
      }
      const subject =
        (step.subject ?? before?.subject ?? "") || (template?.subject ?? "");
      const unchanged =
        before?.snapshotId &&
        before.templateId === step.templateId &&
        before.subject === subject;
      values.push({
        id: step.id,
        delayMinutes: step.delayMinutes,
        templateId: step.templateId,
        subject,
        threadMode: step.threadMode,
        snapshotId: unchanged
          ? before.snapshotId
          : await this.snapshot(workspaceId, template, subject),
      });
    }
    if (
      sequence.status === "active" &&
      (values.length === 0 || values.some((step) => !step.snapshotId))
    ) {
      throw validation(
        "An active sequence needs at least one step, and every step needs a template with content. Pause it first to make this change.",
        "steps",
      );
    }
    if (!(await this.repository.replaceSteps(workspaceId, id, values))) {
      throw notFound();
    }
    return this.get(workspaceId, id);
  }

  async check(workspaceId: string, id: string): Promise<SequenceCheck> {
    const sequence = await this.require(workspaceId, id);
    const steps = await this.repository.listSteps(workspaceId, id);
    return this.problems(workspaceId, sequence, steps);
  }

  async activate(workspaceId: string, id: string) {
    const sequence = await this.require(workspaceId, id);
    if (sequence.status === "active") {
      return this.view(workspaceId, sequence);
    }
    const steps = await this.repository.listSteps(workspaceId, id);
    const check = await this.problems(workspaceId, sequence, steps);
    if (!check.ready) {
      throw new HttpException(
        {
          statusCode: HttpStatus.CONFLICT,
          code: "not_ready",
          message: "Fix the problems listed before activating this sequence.",
          problems: check.problems,
        },
        HttpStatus.CONFLICT,
      );
    }
    const templates = await this.loadTemplates(
      workspaceId,
      steps.map((step) => step.templateId),
    );
    for (const step of steps) {
      await this.repository.setStepSnapshot(
        workspaceId,
        step.id,
        await this.snapshot(
          workspaceId,
          step.templateId ? templates.get(step.templateId) : undefined,
          step.subject,
        ),
      );
    }
    const row = await this.repository.setStatus(workspaceId, id, "active", [
      "draft",
      "paused",
      "archived",
    ]);
    return this.view(workspaceId, row ?? (await this.require(workspaceId, id)));
  }

  async pause(workspaceId: string, id: string) {
    const sequence = await this.require(workspaceId, id);
    if (sequence.status === "paused") {
      return this.view(workspaceId, sequence);
    }
    const row = await this.repository.setStatus(workspaceId, id, "paused", [
      "active",
    ]);
    if (!row) {
      throw apiError(
        HttpStatus.CONFLICT,
        "not_active",
        "Only an active sequence can be paused.",
      );
    }
    return this.view(workspaceId, row);
  }

  async archive(workspaceId: string, id: string) {
    await this.require(workspaceId, id);
    const row = await this.repository.setStatus(workspaceId, id, "archived", [
      "draft",
      "active",
      "paused",
      "archived",
    ]);
    if (!row) {
      throw notFound();
    }
    return this.view(workspaceId, row);
  }

  private async require(workspaceId: string, id: string) {
    const row = isUuid(id)
      ? await this.repository.findSequence(workspaceId, id)
      : null;
    if (!row) {
      throw notFound();
    }
    return row;
  }

  private assertWindow(values: Partial<SequenceSettings>) {
    const start = values.windowStartMinute ?? 540;
    const end = values.windowEndMinute ?? 1020;
    if (start >= end) {
      throw validation(
        "The sending window must end after it starts.",
        "windowEndMinute",
      );
    }
  }

  private async assertSources(workspaceId: string, ids: string[]) {
    if (ids.length === 0) {
      return;
    }
    const { sources } = await this.sources.list(workspaceId);
    const known = new Set(sources.map((source) => source.id));
    if (ids.some((id) => !known.has(id))) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        "not_found",
        "One or more mailboxes were not found. They may have been disconnected.",
        "sourceIds",
      );
    }
  }

  private async createStepTemplate(
    context: WorkspaceAuthContext,
    sequenceName: string,
    step: number,
    content: { subject: string; html: string; text: string },
  ) {
    for (let attempt = 0; attempt < templateNameAttempts; attempt += 1) {
      try {
        return await this.templates.create(context, {
          name: stepTemplateName(sequenceName, step, attempt),
          subject: content.subject,
          html: content.html,
          text: content.text,
        });
      } catch (error) {
        if (codeOf(error) !== "name_taken") {
          throw error;
        }
      }
    }
    throw apiError(
      HttpStatus.CONFLICT,
      "template_name_taken",
      "Templates named after this sequence already exist. Choose another sequence name.",
      "name",
    );
  }

  private async removeTemplates(workspaceId: string, ids: string[]) {
    for (const id of ids) {
      await this.templates.remove(workspaceId, id).catch(() => undefined);
    }
  }

  private async loadTemplates(workspaceId: string, ids: (string | null)[]) {
    const templates = new Map<string, Template>();
    for (const id of new Set(ids)) {
      if (!id) {
        continue;
      }
      const template = await this.templates
        .get(workspaceId, id)
        .catch((error: unknown) => {
          if (
            error instanceof HttpException &&
            error.getStatus() === HttpStatus.NOT_FOUND
          ) {
            return null;
          }
          throw error;
        });
      if (template) {
        templates.set(id, template);
      }
    }
    return templates;
  }

  private async snapshot(
    workspaceId: string,
    template: Template | undefined,
    subject: string,
  ) {
    if (!template || !hasContent(template)) {
      return null;
    }
    const created = await this.dispatch.createSnapshot(workspaceId, {
      subject: subject || template.subject,
      previewText: template.previewText,
      html: template.html,
      text: template.text,
    });
    return created.id;
  }

  private async sourcesOf(
    workspaceId: string,
    ids: string[],
  ): Promise<SendingSourceDto[]> {
    if (ids.length === 0) {
      return [];
    }
    const { sources } = await this.sources.list(workspaceId);
    const byId = new Map(sources.map((source) => [source.id, source]));
    return ids.flatMap((id) => byId.get(id) ?? []);
  }

  private async view(workspaceId: string, row: SequenceRow): Promise<Sequence> {
    const steps = await this.repository.listSteps(workspaceId, row.id);
    const [templates, sources] = await Promise.all([
      this.loadTemplates(
        workspaceId,
        steps.map((step) => step.templateId),
      ),
      this.sourcesOf(workspaceId, row.sourceIds),
    ]);
    return {
      ...toSummary(row, steps.length),
      steps: steps.map((step): StepDto => {
        const template = step.templateId
          ? templates.get(step.templateId)
          : undefined;
        return {
          id: step.id,
          position: step.position,
          type: "email",
          delayMinutes: step.delayMinutes,
          template: template ? { id: template.id, name: template.name } : null,
          subject: step.subject,
          threadMode: step.threadMode as "reply" | "new",
          stats: {
            sent: step.sentCount,
            opened: step.openedCount,
            clicked: step.clickedCount,
            replied: step.repliedCount,
            bounced: step.bouncedCount,
          },
        };
      }),
      sources: sources.map((source) => ({
        id: source.id,
        name: source.name,
        email: source.email,
        integrationType: source.integrationType,
        status: source.status,
        hasInbox: this.sources.canDetectReplies(source),
      })),
      fromName: row.fromName,
      fromEmail: row.fromEmail,
      trackOpens: row.trackOpens,
      trackClicks: row.trackClicks,
      stopOnReply: row.stopOnReply,
      timezone: row.timezone,
      sendDays: row.sendDays,
      windowStartMinute: row.windowStartMinute,
      windowEndMinute: row.windowEndMinute,
      dailyLimitPerSource: row.dailyLimitPerSource,
      layout: row.layout ?? null,
    };
  }

  private async problems(
    workspaceId: string,
    sequence: SequenceRow,
    steps: StepRow[],
  ): Promise<SequenceCheck> {
    const problems: SequenceProblem[] = [];
    const error = (
      field: SequenceProblem["field"],
      code: string,
      message: string,
      stepId?: string,
    ) =>
      problems.push({
        severity: "error",
        field,
        code,
        message,
        ...(stepId ? { stepId } : {}),
      });
    const warning = (
      field: SequenceProblem["field"],
      code: string,
      message: string,
    ) => problems.push({ severity: "warning", field, code, message });

    const [templates, sources, brand, fields] = await Promise.all([
      this.loadTemplates(
        workspaceId,
        steps.map((step) => step.templateId),
      ),
      this.sourcesOf(workspaceId, sequence.sourceIds),
      this.brand.get(workspaceId),
      this.contacts.listFields(workspaceId),
    ]);
    const knownTags = new Set([
      ...builtInTags,
      ...fields.map((field) => `fields.${field.key}`),
    ]);

    if (steps.length === 0) {
      error("steps", "no_steps", "Add at least one step.");
    }
    for (const [index, step] of steps.entries()) {
      const label = `Step ${index + 1}`;
      const template = step.templateId
        ? templates.get(step.templateId)
        : undefined;
      if (!template) {
        error(
          "steps",
          "step_without_template",
          `${label} has no template. Choose one.`,
          step.id,
        );
        continue;
      }
      if (!hasContent(template)) {
        error(
          "steps",
          "step_template_empty",
          `${label} uses a template with no content. Add content to the template.`,
          step.id,
        );
        continue;
      }
      const startsThread = index === 0 || step.threadMode === "new";
      if (startsThread && step.subject.trim() === "") {
        error(
          "steps",
          "step_without_subject",
          `${label} has no subject. Add one.`,
          step.id,
        );
      }
      const unknown = new Set(
        findMergeTags(`${step.subject}\n${template.html}\n${template.text}`)
          .map((tag) => tag.key)
          .filter((key) => !knownTags.has(key)),
      );
      if (unknown.size > 0) {
        error(
          "steps",
          "unknown_merge_tag",
          `${label} uses merge tags that do not exist: ${[...unknown].join(", ")}.`,
          step.id,
        );
      }
    }

    if (sources.length === 0) {
      error(
        "sources",
        "no_sources",
        "Choose at least one mailbox to send from.",
      );
    }
    for (const source of sources) {
      if (source.status !== "active") {
        error(
          "sources",
          source.status === "paused"
            ? "source_paused"
            : "source_needs_attention",
          source.status === "paused"
            ? `Sending through ${source.name} is paused. Resume it or remove it from this sequence.`
            : `${source.name} needs attention before it can send. Fix it on the Integrations page.`,
        );
      } else if (!source.email && !sequence.fromEmail) {
        error(
          "sources",
          "source_without_address",
          `${source.name} has no fixed address. Set a from address in the sequence settings, on a domain verified for ${source.name}.`,
        );
      } else if (
        sequence.stopOnReply &&
        !this.sources.canDetectReplies(source)
      ) {
        warning(
          "sources",
          "source_without_inbox",
          `Replies cannot be detected for ${source.name}, so its contacts keep receiving steps after they reply.`,
        );
      }
    }
    if (!brand.postalAddress) {
      warning(
        "brand",
        "brand_without_address",
        "Your brand has no postal address. Many countries require one in outreach email.",
      );
    }
    if (
      sequence.windowEndMinute - sequence.windowStartMinute <
      shortWindowMinutes
    ) {
      warning(
        "window",
        "window_short",
        "The sending window is shorter than an hour, so few emails will go out each day.",
      );
    }
    return {
      ready: problems.every((problem) => problem.severity !== "error"),
      problems,
    };
  }
}
