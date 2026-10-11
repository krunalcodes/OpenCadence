import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Optional,
} from "@nestjs/common";
import { apiError } from "../../common/api-error";
import { REDIS, type Redis } from "../../infra/redis/redis.module";
import {
  type CampaignActivity,
  CampaignsService,
} from "../campaigns/campaigns.service";
import { ContactsService } from "../contacts/contacts.service";
import {
  DispatchService,
  type EngagementTotalsRow,
} from "../dispatch/dispatch.service";
import { DomainsService } from "../domains/domains.service";
import {
  type SendingSourceDto,
  SendingSourcesService,
} from "../integrations/sending-sources.service";
import {
  type SequenceSummary,
  SequencesService,
} from "../sequences/sequences.service";
import { TemplatesService } from "../templates/templates.service";
import {
  campaignBlock,
  dayWindow,
  emptyTotals,
  hourBlocks,
  hourlyCounts,
  hourOfDay,
  type OverviewPayload,
  type OverviewRange,
  type OverviewSend,
  type OverviewSetup,
  type OverviewTotals,
  overviewRanges,
  parseRange,
  pickAlert,
  rangeWindow,
  rateOf,
  resolveTimezone,
  toStats,
} from "./overview";

export const overviewCacheSeconds = 60;
const campaignLimit = 50;
const sequenceLimit = 8;
const sendRows = 8;
const listedCampaignStatuses = new Set([
  "scheduled",
  "sending",
  "paused",
  "sent",
  "failed",
]);

export function overviewCacheKey(
  workspaceId: string,
  range: OverviewRange,
  timezone: string,
) {
  return `opencadence:overview:v1:${workspaceId}:${range}:${timezone}`;
}

function validation(message: string, field: string) {
  return apiError(HttpStatus.BAD_REQUEST, "validation", message, field);
}

function totalsOf(
  rows: EngagementTotalsRow[],
  current: boolean,
): OverviewTotals {
  const row = rows.find((item) => item.current === current);
  if (!row) {
    return { ...emptyTotals };
  }
  const { current: _current, ...totals } = row;
  return totals;
}

function campaignSend(
  campaign: CampaignActivity,
  sources: Map<string, SendingSourceDto>,
): OverviewSend {
  const { stats } = campaign;
  const total = Math.max(stats.recipients - stats.skipped, 0);
  const source = campaign.sourceId ? sources.get(campaign.sourceId) : undefined;
  return {
    id: campaign.id,
    kind: "campaign",
    name: campaign.name,
    detail: campaign.subject || null,
    status: campaign.status,
    source: source
      ? {
          id: source.id,
          name: source.name,
          integrationType: source.integrationType,
        }
      : null,
    scheduledAt: campaign.scheduledAt,
    at: campaign.startedAt ?? campaign.scheduledAt ?? campaign.createdAt,
    sent: stats.sent,
    done: Math.min(stats.sent, total),
    total,
    steps: null,
    openRate: campaign.trackOpens
      ? rateOf(stats.opened, stats.delivered, stats.sent)
      : null,
    clickRate: campaign.trackClicks
      ? rateOf(stats.clicked, stats.delivered, stats.sent)
      : null,
  };
}

function sequenceSend(sequence: SequenceSummary): OverviewSend {
  const { stats } = sequence;
  return {
    id: sequence.id,
    kind: "sequence",
    name: sequence.name,
    detail: null,
    status: sequence.status,
    source: null,
    scheduledAt: null,
    at: sequence.updatedAt,
    sent: stats.sent,
    done: Math.max(stats.enrolled - stats.active, 0),
    total: stats.enrolled,
    steps: sequence.stepCount,
    openRate: stats.opened > 0 ? rateOf(stats.opened, 0, stats.sent) : null,
    clickRate: stats.clicked > 0 ? rateOf(stats.clicked, 0, stats.sent) : null,
  };
}

@Injectable()
export class OverviewService {
  private readonly logger = new Logger(OverviewService.name);

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(DispatchService) private readonly dispatch: DispatchService,
    @Inject(CampaignsService) private readonly campaigns: CampaignsService,
    @Inject(SendingSourcesService)
    private readonly sources: SendingSourcesService,
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Inject(TemplatesService) private readonly templates: TemplatesService,
    @Inject(DomainsService) private readonly domains: DomainsService,
    @Optional()
    @Inject(SequencesService)
    private readonly sequences?: SequencesService,
  ) {}

  async get(
    workspaceId: string,
    query: { range?: unknown; timezone?: unknown },
    now = new Date(),
  ): Promise<OverviewPayload> {
    const range = parseRange(query.range);
    if (!range) {
      throw validation(
        `range must be one of: ${overviewRanges.join(", ")}.`,
        "range",
      );
    }
    const timezone = resolveTimezone(query.timezone);
    if (!timezone) {
      throw validation(
        "timezone must be an IANA time zone name, for example Europe/Berlin.",
        "timezone",
      );
    }
    const key = overviewCacheKey(workspaceId, range, timezone);
    const cached = await this.read(key);
    if (cached) {
      return cached;
    }
    const payload = await this.build(workspaceId, range, timezone, now);
    await this.write(key, payload);
    return payload;
  }

  private async read(key: string): Promise<OverviewPayload | null> {
    try {
      const value = await this.redis.get(key);
      return value ? (JSON.parse(value) as OverviewPayload) : null;
    } catch (error) {
      this.logger.warn(`The overview cache could not be read: ${error}`);
      return null;
    }
  }

  private async write(key: string, payload: OverviewPayload) {
    try {
      await this.redis.set(
        key,
        JSON.stringify(payload),
        "EX",
        overviewCacheSeconds,
      );
    } catch (error) {
      this.logger.warn(`The overview cache could not be written: ${error}`);
    }
  }

  private async build(
    workspaceId: string,
    range: OverviewRange,
    timezone: string,
    now: Date,
  ): Promise<OverviewPayload> {
    const window = rangeWindow(range, now);
    const day = dayWindow(now, timezone);
    const [
      { sources },
      campaigns,
      sequences,
      totalRows,
      hourly,
      hasMessages,
      failingDomains,
    ] = await Promise.all([
      this.sources.list(workspaceId),
      this.campaigns.listActivity(workspaceId, campaignLimit),
      this.sequences
        ? this.sequences
            .list(workspaceId, { status: "active", limit: sequenceLimit })
            .then((page) => page.items)
        : Promise.resolve<SequenceSummary[]>([]),
      this.dispatch.engagementTotals(workspaceId, window),
      this.dispatch.hourlyByKind(workspaceId, {
        from: day.start,
        to: day.end,
        timezone,
        kinds: ["sequence", "transactional"],
      }),
      this.dispatch.hasMessages(workspaceId),
      this.domains.failing(workspaceId),
    ]);

    const current = totalsOf(totalRows, true);
    const previous = totalsOf(totalRows, false);
    const nowHour = hourOfDay(now, day, timezone);
    const sourcesById = new Map(sources.map((source) => [source.id, source]));
    const hasSent =
      hasMessages ||
      campaigns.some((campaign) => campaign.status !== "scheduled");
    const failedCampaigns = campaigns.filter(
      (campaign) =>
        campaign.status === "failed" &&
        new Date(campaign.completedAt ?? campaign.updatedAt).getTime() >=
          window.split.getTime(),
    );
    const sends = [
      ...campaigns
        .filter((campaign) => listedCampaignStatuses.has(campaign.status))
        .map((campaign) => campaignSend(campaign, sourcesById)),
      ...sequences.map(sequenceSend),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, sendRows);

    return {
      range,
      timezone,
      generatedAt: now.toISOString(),
      period: {
        from: window.split.toISOString(),
        to: window.to.toISOString(),
        previousFrom: window.from.toISOString(),
      },
      stats: toStats(current, previous),
      today: {
        date: day.date,
        nowHour,
        campaigns: campaigns.flatMap((campaign) => {
          const block = campaignBlock(campaign, day, timezone, now);
          return block ? [block] : [];
        }),
        sequences: hourBlocks(hourlyCounts(hourly, "sequence"), nowHour),
        transactional: hourBlocks(
          hourlyCounts(hourly, "transactional"),
          nowHour,
        ),
      },
      sends,
      mailboxes: sources.map((source) => ({
        id: source.id,
        name: source.name,
        email: source.email,
        integrationType: source.integrationType,
        status: source.status,
        sentToday: source.sentToday,
        dailySendLimit: source.dailySendLimit,
        health: source.health,
      })),
      alert: pickAlert({
        failingDomains,
        sources,
        failedCampaigns,
        totals: current,
      }),
      summary: {
        running:
          campaigns.filter((campaign) => campaign.status === "sending").length +
          sequences.length,
        scheduledToday: campaigns.filter(
          (campaign) =>
            campaign.status === "scheduled" &&
            campaign.scheduledAt !== null &&
            new Date(campaign.scheduledAt).getTime() >= day.start.getTime() &&
            new Date(campaign.scheduledAt).getTime() < day.end.getTime(),
        ).length,
        hasSent,
        sequences: this.sequences ? "service" : "messages",
        setup: hasSent
          ? null
          : await this.setup(workspaceId, sources.length > 0),
      },
    };
  }

  private async setup(
    workspaceId: string,
    source: boolean,
  ): Promise<OverviewSetup> {
    const [contacts, templates] = await Promise.all([
      this.contacts.count(workspaceId, {}),
      this.templates.list(workspaceId, { limit: 1 }),
    ]);
    return {
      source,
      contacts: contacts > 0,
      template: templates.items.length > 0,
      campaign: false,
    };
  }
}
