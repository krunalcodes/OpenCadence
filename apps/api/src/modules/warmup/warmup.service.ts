import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { apiError } from "../../common/api-error";
import { isUuid } from "../../common/uuid";
import {
  type SendingSourceDto,
  SendingSourcesService,
} from "../integrations/sending-sources.service";
import {
  dayMs,
  readyAfterDays,
  restartAfterOffDays,
  statsDays,
  WARMUP_RANDOM,
  type WarmupPausedReason,
  type WarmupRandom,
  warmupDefaults,
  warmupLimits,
} from "./warmup.constants";
import { generateIdentifier } from "./warmup.content";
import {
  dayStart,
  emailDomain,
  isSendingDay,
  lastDays,
  rampDay,
  rampTarget,
  utcDay,
} from "./warmup.ramp";
import {
  type DailyCountsRow,
  type MailboxRow,
  type NewMailboxRow,
  WarmupRepository,
} from "./warmup.repository";

export type WarmupSettings = {
  startPerDay: number;
  incrementPerDay: number;
  maxPerDay: number;
  randomize: boolean;
  replyRate: number;
  weekdaysOnly: boolean;
};

export type WarmupMailbox = {
  sourceId: string;
  name: string;
  email: string | null;
  integrationType: string;
  capable: boolean;
  enabled: boolean;
  status: "off" | "warming" | "ready" | "paused" | "unavailable";
  pausedReason: WarmupPausedReason | null;
  day: number | null;
  readyAfterDays: 14;
  todayTarget: number;
  todaySent: number;
  settings: WarmupSettings;
  identifier: string | null;
  placement: { inbox: number; spam: number; rate: number | null };
  days: { day: string; sent: number; inbox: number; spam: number }[];
  lastError: { code: string; message: string } | null;
};

export type WarmupUpdate = {
  enabled?: unknown;
  paused?: unknown;
  startPerDay?: unknown;
  incrementPerDay?: unknown;
  maxPerDay?: unknown;
  randomize?: unknown;
  replyRate?: unknown;
  weekdaysOnly?: unknown;
};

const numberFields = [
  "startPerDay",
  "incrementPerDay",
  "maxPerDay",
  "replyRate",
] as const;
const booleanFields = [
  "enabled",
  "paused",
  "randomize",
  "weekdaysOnly",
] as const;

const numberLabels: Record<(typeof numberFields)[number], string> = {
  startPerDay: "emails on the first day",
  incrementPerDay: "daily increase",
  maxPerDay: "daily maximum",
  replyRate: "reply rate",
};

function validation(message: string, field: string) {
  return apiError(HttpStatus.BAD_REQUEST, "validation", message, field);
}

function settingsOf(row: MailboxRow | null): WarmupSettings {
  return row
    ? {
        startPerDay: row.startPerDay,
        incrementPerDay: row.incrementPerDay,
        maxPerDay: row.maxPerDay,
        randomize: row.randomize,
        replyRate: row.replyRate,
        weekdaysOnly: row.weekdaysOnly,
      }
    : { ...warmupDefaults };
}

@Injectable()
export class WarmupService {
  constructor(
    @Inject(WarmupRepository) private readonly repository: WarmupRepository,
    @Inject(SendingSourcesService)
    private readonly sources: SendingSourcesService,
    @Inject(WARMUP_RANDOM) private readonly random: WarmupRandom,
  ) {}

  async list(workspaceId: string, now = new Date()) {
    const [{ sources }, rows, pool] = await Promise.all([
      this.sources.list(workspaceId),
      this.repository.listMailboxes(workspaceId),
      this.repository.poolCounts(),
    ]);
    return {
      mailboxes: await this.toDtos(workspaceId, sources, rows, now),
      pool,
    };
  }

  async update(
    workspaceId: string,
    sourceId: string,
    input: WarmupUpdate,
    now = new Date(),
  ): Promise<WarmupMailbox> {
    const source = isUuid(sourceId)
      ? (await this.sources.list(workspaceId)).sources.find(
          (candidate) => candidate.id === sourceId,
        )
      : undefined;
    if (!source) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        "not_found",
        "This sending source does not exist in the workspace.",
      );
    }

    const existing = await this.repository.findMailbox(workspaceId, sourceId);
    const patch = this.validate(input, settingsOf(existing));

    const domain = emailDomain(source.email);
    if (!this.sources.hasInbox(source.integrationType) || !domain) {
      throw apiError(
        HttpStatus.CONFLICT,
        "not_capable",
        "Warm-up needs to read the inbox, and this sending source cannot. Connect the mailbox with IMAP/SMTP to warm it up.",
      );
    }

    if (!existing) {
      await this.repository.insertMailboxIfMissing({
        sourceId,
        workspaceId,
        domain,
        identifier: generateIdentifier(this.random),
      });
    }
    const current =
      existing ?? (await this.repository.findMailbox(workspaceId, sourceId));
    if (!current) {
      throw new Error("The warm-up settings were not saved.");
    }

    const changes: Partial<NewMailboxRow> = { ...patch.settings, domain };
    const enabled = patch.enabled ?? current.enabled;
    let clearScheduled = false;

    if (patch.enabled === true) {
      const offForMs = now.getTime() - current.updatedAt.getTime();
      const restart =
        !current.startedOn ||
        (!current.enabled && offForMs > restartAfterOffDays * dayMs);
      changes.enabled = true;
      changes.pausedReason = null;
      changes.plannedCount = 0;
      changes.lastErrorCode = null;
      changes.lastErrorMessage = null;
      if (restart) {
        changes.startedOn = utcDay(now);
        changes.holdDays = 0;
        changes.plannedOn = null;
      }
    }
    if (patch.enabled === false) {
      changes.enabled = false;
      changes.pausedReason = null;
      clearScheduled = current.enabled;
    }
    if (enabled && patch.paused === true) {
      changes.pausedReason = "manual";
      clearScheduled = true;
    }
    if (enabled && patch.paused === false && current.pausedReason) {
      changes.pausedReason = null;
      changes.plannedCount = 0;
      changes.lastErrorCode = null;
      changes.lastErrorMessage = null;
    }

    await this.repository.updateMailbox(sourceId, changes);
    if (clearScheduled) {
      await this.repository.deleteScheduled(sourceId);
    }

    const updated = await this.repository.findMailbox(workspaceId, sourceId);
    const [dto] = await this.toDtos(
      workspaceId,
      [source],
      updated ? [updated] : [],
      now,
    );
    if (!dto) {
      throw new Error("The warm-up settings were not saved.");
    }
    return dto;
  }

  private validate(input: WarmupUpdate, current: WarmupSettings) {
    const settings: Partial<WarmupSettings> = {};
    const flags: { enabled?: boolean; paused?: boolean } = {};

    for (const field of booleanFields) {
      const value = input[field];
      if (value === undefined) {
        continue;
      }
      if (typeof value !== "boolean") {
        throw validation(`Send ${field} as true or false.`, field);
      }
      if (field === "enabled" || field === "paused") {
        flags[field] = value;
      } else {
        settings[field] = value;
      }
    }

    for (const field of numberFields) {
      const value = input[field];
      if (value === undefined) {
        continue;
      }
      const { min, max } = warmupLimits[field];
      if (
        typeof value !== "number" ||
        !Number.isInteger(value) ||
        value < min ||
        value > max
      ) {
        throw validation(
          `Enter a whole number between ${min} and ${max} for the ${numberLabels[field]}.`,
          field,
        );
      }
      settings[field] = value;
    }

    const merged = { ...current, ...settings };
    if (merged.maxPerDay < merged.startPerDay) {
      throw validation(
        "The daily maximum cannot be lower than the number of emails on the first day.",
        settings.maxPerDay !== undefined ? "maxPerDay" : "startPerDay",
      );
    }
    return { settings, ...flags };
  }

  private async toDtos(
    workspaceId: string,
    sources: SendingSourceDto[],
    rows: MailboxRow[],
    now: Date,
  ): Promise<WarmupMailbox[]> {
    const today = utcDay(now);
    const days = lastDays(today, statsDays);
    const rowsById = new Map(rows.map((row) => [row.sourceId, row]));
    const counts = await this.repository.dailyCounts(
      workspaceId,
      sources
        .filter((source) => rowsById.has(source.id))
        .map((source) => source.id),
      dayStart(days[0] ?? today),
    );
    const countsByKey = new Map<string, DailyCountsRow>(
      counts.map((count) => [`${count.sourceId}:${count.day}`, count]),
    );

    return sources.map((source) => {
      const row = rowsById.get(source.id) ?? null;
      const capable = this.sources.hasInbox(source.integrationType);
      const enabled = Boolean(row?.enabled);
      const settings = settingsOf(row);
      const day =
        row && enabled && row.startedOn
          ? rampDay(row.startedOn, row.holdDays, today)
          : null;
      const pausedReason = enabled
        ? ((row?.pausedReason ?? null) as WarmupPausedReason | null)
        : null;

      let status: WarmupMailbox["status"] = "off";
      if (!capable) {
        status = "unavailable";
      } else if (enabled && pausedReason) {
        status = "paused";
      } else if (enabled && day !== null) {
        status = day > readyAfterDays ? "ready" : "warming";
      }

      let todayTarget = 0;
      if (row && enabled && !pausedReason && day !== null) {
        if (row.plannedOn === today && row.plannedCount > 0) {
          todayTarget = row.plannedCount;
        } else if (isSendingDay(now, settings.weekdaysOnly)) {
          todayTarget = rampTarget(settings, day);
        }
      }

      const perDay = days.map((dayKey) => {
        const count = countsByKey.get(`${source.id}:${dayKey}`);
        return {
          day: dayKey,
          sent: count?.sent ?? 0,
          inbox: count?.inbox ?? 0,
          spam: count?.spam ?? 0,
        };
      });
      const inbox = perDay.reduce((sum, item) => sum + item.inbox, 0);
      const spam = perDay.reduce((sum, item) => sum + item.spam, 0);

      return {
        sourceId: source.id,
        name: source.name,
        email: source.email,
        integrationType: source.integrationType,
        capable,
        enabled,
        status,
        pausedReason,
        day,
        readyAfterDays,
        todayTarget,
        todaySent: countsByKey.get(`${source.id}:${today}`)?.openers ?? 0,
        settings,
        identifier: row?.startedOn ? row.identifier : null,
        placement: {
          inbox,
          spam,
          rate: inbox + spam > 0 ? inbox / (inbox + spam) : null,
        },
        days: perDay,
        lastError:
          row?.lastErrorCode && enabled
            ? { code: row.lastErrorCode, message: row.lastErrorMessage ?? "" }
            : null,
      };
    });
  }
}
