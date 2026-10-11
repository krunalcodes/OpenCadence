import { InjectQueue } from "@nestjs/bullmq";
import { HttpException, Inject, Injectable, Logger } from "@nestjs/common";
import { contactMergeValues, renderMergeTags } from "@workspace/email-renderer";
import type { Queue } from "bullmq";
import { BrandService } from "../brand/brand.service";
import type { MessageOutcomeJob } from "../dispatch/dispatch.constants";
import {
  type BatchCommon,
  DispatchService,
  type MessageStatus,
} from "../dispatch/dispatch.service";
import { SendingSourcesService } from "../integrations/sending-sources.service";
import { AudienceService } from "../segments/audience.service";
import {
  addFanoutJob,
  CAMPAIGN_FANOUT_QUEUE,
  type CampaignFanoutJob,
  fanoutPageSize,
  maxQueuedPerCampaign,
  reconcileBatchSize,
  reconcileFinishedWithinMs,
} from "./campaigns.constants";
import {
  type CampaignRow,
  CampaignsRepository,
  type DeliveryCounts,
  type OutcomeCounter,
  outcomeCounters,
} from "./campaigns.repository";

export type FanoutOutcome = "done" | "stopped" | "wait" | "paused" | "failed";

export type FanoutResult = { outcome: FanoutOutcome; pages: number };

const maxSubjectLength = 998;
const maxErrorLength = 500;

const pauseCodes = new Set(["source_unavailable"]);

type Failure = { code: string; message: string };

function failureOf(error: unknown): Failure | null {
  if (!(error instanceof HttpException) || error.getStatus() >= 500) {
    return null;
  }
  const response = error.getResponse();
  const body =
    typeof response === "object" && response !== null
      ? (response as { code?: unknown; message?: unknown })
      : {};
  return {
    code: typeof body.code === "string" ? body.code : "send_rejected",
    message: (typeof body.message === "string"
      ? body.message
      : error.message
    ).slice(0, maxErrorLength),
  };
}

export function deliveryCounts(
  counts: Record<MessageStatus, number>,
): DeliveryCounts {
  return {
    sent:
      counts.sent +
      counts.delivered +
      counts.delayed +
      counts.bounced +
      counts.complained,
    delivered: counts.delivered + counts.complained,
    bounced: counts.bounced,
    complained: counts.complained,
    failed: counts.failed,
    skipped: counts.skipped,
  };
}

function sameCounts(row: CampaignRow, counts: DeliveryCounts) {
  return (
    row.sentCount === counts.sent &&
    row.deliveredCount === counts.delivered &&
    row.bouncedCount === counts.bounced &&
    row.complainedCount === counts.complained &&
    row.failedCount === counts.failed &&
    (row.fanoutDoneAt === null || row.skippedCount === counts.skipped)
  );
}

@Injectable()
export class CampaignsEngine {
  private readonly logger = new Logger(CampaignsEngine.name);

  constructor(
    @Inject(CampaignsRepository)
    private readonly repository: CampaignsRepository,
    @Inject(DispatchService) private readonly dispatch: DispatchService,
    @Inject(AudienceService) private readonly audiences: AudienceService,
    @Inject(BrandService) private readonly brand: BrandService,
    @Inject(SendingSourcesService)
    private readonly sources: SendingSourcesService,
    @InjectQueue(CAMPAIGN_FANOUT_QUEUE)
    private readonly fanoutQueue: Queue<CampaignFanoutJob>,
  ) {}

  async fanOut(workspaceId: string, campaignId: string): Promise<FanoutResult> {
    let pages = 0;
    const campaign = await this.repository.find(workspaceId, campaignId);
    if (campaign?.status !== "sending") {
      return { outcome: "stopped", pages };
    }
    if (campaign.fanoutDoneAt) {
      return { outcome: "done", pages };
    }
    const { audience } = campaign;
    const snapshot = campaign.snapshotId
      ? await this.dispatch.getSnapshot(workspaceId, campaign.snapshotId)
      : null;
    if (!snapshot || !audience) {
      return this.stop(campaign, pages, {
        code: "content_missing",
        message:
          "The content or the audience saved for this campaign is missing. Duplicate the campaign and send the copy.",
      });
    }

    try {
      const [brand, source] = await Promise.all([
        this.brand.get(workspaceId),
        this.sources.resolveForSend(
          workspaceId,
          campaign.sourceId ?? undefined,
        ),
      ]);
      const fromEmail = source.email ?? campaign.fromEmail;
      if (!fromEmail) {
        return this.stop(campaign, pages, {
          code: "from_missing",
          message: `${source.name} has no fixed address and the campaign has no From address. Duplicate the campaign, set one, and send the copy.`,
        });
      }
      const fromName =
        (campaign.fromName ?? brand.brandName)
          .replace(/[\r\n]+/g, " ")
          .trim() || null;
      const onlyList =
        audience.type === "lists" && audience.listIds.length === 1
          ? audience.listIds[0]
          : undefined;
      const common: BatchCommon = {
        workspaceId,
        kind: "campaign",
        sourceId: source.id,
        from: { email: fromEmail, name: fromName },
        replyTo: campaign.replyTo,
        snapshotId: snapshot.id,
        campaignId,
        tracking: { opens: campaign.trackOpens, clicks: campaign.trackClicks },
        unsubscribe: onlyList ? { listId: onlyList } : {},
      };
      const brandValues = {
        name: brand.brandName,
        address: brand.postalAddress,
        website: brand.websiteUrl,
      };

      let queued = (
        await this.dispatch.countByStatus(workspaceId, { campaignId })
      ).queued;
      for (;;) {
        const current = await this.repository.find(workspaceId, campaignId);
        if (current?.status !== "sending") {
          return { outcome: "stopped", pages };
        }
        if (current.fanoutDoneAt) {
          return { outcome: "done", pages };
        }
        if (queued > maxQueuedPerCampaign) {
          return { outcome: "wait", pages };
        }
        const contacts = await this.audiences.page(
          workspaceId,
          audience,
          current.fanoutCursor,
          fanoutPageSize,
        );
        const results =
          contacts.length > 0
            ? await this.dispatch.enqueueBatch(
                common,
                contacts.map((contact) => {
                  const variables = contactMergeValues({
                    contact,
                    brand: brandValues,
                  });
                  return {
                    contactId: contact.id,
                    to: contact.email,
                    subject: renderMergeTags(snapshot.subject, variables)
                      .replace(/\s+/g, " ")
                      .trim()
                      .slice(0, maxSubjectLength),
                    variables,
                    idempotencyKey: `campaign:${campaignId}:${contact.id}`,
                  };
                }),
              )
            : [];
        const skipped = results.filter(
          (result) => result.status === "skipped",
        ).length;
        const done = contacts.length < fanoutPageSize;
        const advanced = await this.repository.advanceFanout(
          workspaceId,
          campaignId,
          {
            previousCursor: current.fanoutCursor,
            cursor: contacts.at(-1)?.id ?? current.fanoutCursor,
            recipients: results.length,
            skipped,
            done,
          },
        );
        pages += 1;
        if (advanced) {
          queued += results.length - skipped;
          if (done) {
            return { outcome: "done", pages };
          }
        }
      }
    } catch (error) {
      const failure = failureOf(error);
      if (!failure) {
        throw error;
      }
      return this.stop(campaign, pages, failure);
    }
  }

  async applyOutcome(job: MessageOutcomeJob) {
    if (
      !job.campaignId ||
      !job.first ||
      !Object.hasOwn(outcomeCounters, job.type)
    ) {
      return;
    }
    await this.repository.increment(
      job.workspaceId,
      job.campaignId,
      job.type as OutcomeCounter,
    );
  }

  async startDue(now = new Date()) {
    const started = await this.repository.startDue(now);
    for (const campaign of started) {
      await this.ensureFanout(campaign.workspaceId, campaign.id);
    }
    return started.length;
  }

  async reconcile(now = new Date()) {
    const finishedSince = new Date(now.getTime() - reconcileFinishedWithinMs);
    let after: string | null = null;
    let completed = 0;
    for (;;) {
      const rows = await this.repository.listToReconcile(
        finishedSince,
        after,
        reconcileBatchSize,
      );
      for (const row of rows) {
        completed += (await this.reconcileOne(row, now)) ? 1 : 0;
      }
      const last = rows.at(-1);
      if (rows.length < reconcileBatchSize || !last) {
        return completed;
      }
      after = last.id;
    }
  }

  private async reconcileOne(row: CampaignRow, now: Date) {
    const counts = await this.dispatch.countByStatus(row.workspaceId, {
      campaignId: row.id,
    });
    const delivery = deliveryCounts(counts);
    if (!sameCounts(row, delivery)) {
      await this.repository.setDeliveryCounts(
        row.workspaceId,
        row.id,
        delivery,
      );
    }
    if (row.status !== "sending") {
      return false;
    }
    if (!row.fanoutDoneAt) {
      await this.ensureFanout(row.workspaceId, row.id);
      return false;
    }
    if (counts.queued > 0) {
      return false;
    }
    const finished = await this.repository.transition(
      row.workspaceId,
      row.id,
      ["sending"],
      "sent",
      { completedAt: now },
    );
    return finished !== null;
  }

  private async ensureFanout(workspaceId: string, campaignId: string) {
    try {
      await addFanoutJob(this.fanoutQueue, { workspaceId, campaignId });
    } catch (error) {
      this.logger.error(
        `The fan-out job for campaign ${campaignId} was not queued: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
  }

  private async stop(
    campaign: CampaignRow,
    pages: number,
    failure: Failure,
  ): Promise<FanoutResult> {
    const pause = pauseCodes.has(failure.code);
    await this.repository.transition(
      campaign.workspaceId,
      campaign.id,
      ["sending"],
      pause ? "paused" : "failed",
      {
        errorCode: failure.code,
        errorMessage: failure.message,
        ...(pause ? {} : { completedAt: new Date() }),
      },
    );
    this.logger.warn(
      `Campaign ${campaign.id} ${pause ? "paused" : "failed"}: ${failure.code}`,
    );
    return { outcome: pause ? "paused" : "failed", pages };
  }
}
