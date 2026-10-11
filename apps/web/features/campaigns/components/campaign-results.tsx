"use client";

import { TickProgress } from "@workspace/ui/blocks/tick-progress";
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { CircleAlert, Pause, Play, RefreshCw, Undo2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { focusRing } from "@/components/app-shell/page-header";
import { SectionCard } from "@/components/product/section-card";
import { secondaryButtonClass } from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import { StatusBadge } from "@/components/status-badge";
import { BackToCampaigns } from "@/features/campaigns/components/campaign-unavailable";
import { CancelCampaignDialog } from "@/features/campaigns/components/cancel-campaign-dialog";
import { RecipientsTable } from "@/features/campaigns/components/recipients-table";
import { useCampaignRefresh } from "@/features/campaigns/hooks/use-campaign-refresh";
import {
  type Campaign,
  progressOf,
  type RecipientsPage,
  rateOf,
  refreshInterval,
  type StatKey,
} from "@/features/campaigns/lib/campaigns";
import {
  copy,
  describeError,
  fromLine,
  statusLabels,
  statusTones,
} from "@/features/campaigns/lib/copy";
import { exactMoment } from "@/features/campaigns/lib/schedule";
import {
  type CampaignAction,
  runCampaignAction,
} from "@/features/campaigns/queries/client";
import { useHydrated } from "@/hooks/use-hydrated";
import type { ApiResult } from "@/lib/api";
import { appHref } from "@/lib/navigation";

const text = copy.results;

const issueKeys: StatKey[] = [
  "bounced",
  "unsubscribed",
  "complained",
  "failed",
];

type CampaignResultsProps = {
  campaign: Campaign;
  recipients: RecipientsPage | null;
};

function clockTime(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function CampaignResults({
  campaign,
  recipients,
}: CampaignResultsProps) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [seen, setSeen] = useState(campaign);
  const [live, setLive] = useState(campaign);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [acting, setActing] = useState<CampaignAction | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  if (seen !== campaign) {
    setSeen(campaign);
    setLive(campaign);
  }

  const handleRefresh = useCallback(
    (result: ApiResult<Campaign>) => {
      if (!result.ok) {
        if (result.error.status === 404) {
          router.refresh();
          return;
        }
        setRefreshFailed(true);
        return;
      }
      setRefreshFailed(false);
      setUpdatedAt(new Date());
      setLive(result.data);
      setRefreshKey((current) => current + 1);
      if (result.data.status === "draft") {
        router.refresh();
      }
    },
    [router],
  );

  const { refreshing, refresh } = useCampaignRefresh(
    live.id,
    acting ? null : refreshInterval(live.status),
    handleRefresh,
  );

  async function run(action: CampaignAction) {
    if (acting) {
      return;
    }
    setActing(action);
    const result = await runCampaignAction(live.id, action);
    if (!result.ok) {
      setActing(null);
      toast.error(text.actionFailed[action], {
        description: describeError(result.error),
      });
      refresh();
      return;
    }
    toast.success(text.actionDone[action]);
    setCancelOpen(false);
    if (action === "unschedule") {
      router.refresh();
      return;
    }
    setActing(null);
    setRefreshFailed(false);
    setUpdatedAt(new Date());
    setLive(result.data);
  }

  const mode = hydrated ? "local" : "stable";
  const stats = live.stats;
  const status = live.status;
  const name = live.name || copy.untitled;
  const progress = progressOf(stats);
  const scheduled = live.scheduledAt
    ? exactMoment(live.scheduledAt, mode)
    : null;
  const started = live.startedAt ? exactMoment(live.startedAt, mode) : null;
  const completed = live.completedAt
    ? exactMoment(live.completedAt, mode)
    : null;
  const openRate = rateOf(stats.opened, stats);
  const clickRate = rateOf(stats.clicked, stats);
  const rateBase = stats.delivered > 0 ? text.rateOfDelivered : text.rateOfSent;
  const from = live.source?.email ?? live.from.email;
  const showStats = status !== "scheduled";
  const showProgress = status === "sending" || status === "paused";

  let lead: string;
  if (status === "scheduled") {
    lead = scheduled
      ? text.scheduledFor(scheduled.day, scheduled.time, scheduled.zone)
      : text.scheduledHint;
  } else if (status === "sending") {
    lead =
      stats.recipients === 0
        ? text.starting
        : text.progress(progress.sent, progress.total);
  } else if (status === "paused") {
    lead = text.progress(progress.sent, progress.total);
  } else if (status === "sent") {
    lead = completed
      ? text.sentOn(completed.day, completed.time)
      : started
        ? text.startedOn(started.day, started.time)
        : "";
  } else if (status === "cancelled") {
    lead = text.cancelledHint;
  } else {
    lead = text.failedHint;
  }

  const hint =
    status === "scheduled" && scheduled
      ? text.scheduledHint
      : status === "paused"
        ? text.pausedHint
        : status === "sending" && !live.fanoutDone && stats.recipients > 0
          ? text.preparing
          : null;

  const primary: {
    key: StatKey;
    value: string;
    note: string | null;
  }[] = [
    {
      key: "recipients",
      value: copy.number(stats.recipients),
      note: stats.skipped > 0 ? text.skippedNote(stats.skipped) : null,
    },
    { key: "sent", value: copy.number(stats.sent), note: null },
    { key: "delivered", value: copy.number(stats.delivered), note: null },
    {
      key: "opened",
      value: openRate === null ? copy.none : copy.percent(openRate),
      note: !live.trackOpens
        ? text.openTrackingOff
        : openRate === null
          ? null
          : `${copy.number(stats.opened)} ${rateBase}`,
    },
    {
      key: "clicked",
      value: clickRate === null ? copy.none : copy.percent(clickRate),
      note: !live.trackClicks
        ? text.clickTrackingOff
        : clickRate === null
          ? null
          : `${copy.number(stats.clicked)} ${rateBase}`,
    },
  ];

  const details: {
    label: string;
    value: React.ReactNode;
    missing?: boolean;
  }[] = [
    {
      label: text.details.audience,
      value: live.audienceLabel ?? text.details.missing,
      missing: !live.audienceLabel,
    },
    {
      label: text.details.subject,
      value: live.subject || text.details.missing,
      missing: !live.subject,
    },
    ...(live.previewText
      ? [{ label: text.details.previewText, value: live.previewText }]
      : []),
    {
      label: text.details.from,
      value:
        (from ? fromLine(live.from.name ?? "", from) : null) ??
        text.details.missing,
      missing: !from,
    },
    ...(live.replyTo
      ? [{ label: text.details.replyTo, value: live.replyTo }]
      : []),
    {
      label: text.details.source,
      value: live.source?.name ?? text.details.missing,
      missing: !live.source,
    },
    {
      label: text.details.template,
      value: live.template ? (
        <Link
          href={appHref(`templates/${encodeURIComponent(live.template.id)}`)}
          className={cn(
            "rounded-[4px] font-medium text-primary underline-offset-2 hover:underline",
            focusRing,
          )}
        >
          {live.template.name}
        </Link>
      ) : (
        text.details.templateRemoved
      ),
      missing: !live.template,
    },
    {
      label: text.details.tracking,
      value: text.details.trackingValue(live.trackOpens, live.trackClicks),
    },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-[18px] text-[13px] leading-normal">
      <div className="flex flex-col gap-2">
        <BackToCampaigns />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
          <div className="flex min-w-0 flex-1 basis-64 flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="min-w-0 truncate text-2xl leading-[1.2] font-semibold tracking-[-0.025em] text-foreground">
              {name}
            </h1>
            <StatusBadge tone={statusTones[status]}>
              {statusLabels[status]}
            </StatusBadge>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p
              aria-live="polite"
              className={cn(
                "text-[12.5px] tabular-nums",
                refreshFailed ? "text-danger" : "text-ink-tertiary",
              )}
            >
              {refreshFailed
                ? text.refreshFailed(updatedAt ? clockTime(updatedAt) : "")
                : updatedAt
                  ? text.updated(clockTime(updatedAt))
                  : null}
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={refreshing || acting !== null}
              aria-busy={refreshing || undefined}
              onClick={refresh}
              className={secondaryButtonClass}
            >
              {refreshing ? (
                <Spinner />
              ) : (
                <RefreshCw aria-hidden strokeWidth={1.6} />
              )}
              {text.refresh}
            </Button>
            {status === "scheduled" ? (
              <Button
                type="button"
                variant="outline"
                disabled={acting !== null}
                aria-busy={acting === "unschedule" || undefined}
                onClick={() => void run("unschedule")}
                className={secondaryButtonClass}
              >
                {acting === "unschedule" ? (
                  <Spinner />
                ) : (
                  <Undo2 aria-hidden strokeWidth={1.6} />
                )}
                {text.actions.unschedule}
              </Button>
            ) : null}
            {status === "sending" ? (
              <Button
                type="button"
                variant="outline"
                disabled={acting !== null}
                aria-busy={acting === "pause" || undefined}
                onClick={() => void run("pause")}
                className={secondaryButtonClass}
              >
                {acting === "pause" ? (
                  <Spinner />
                ) : (
                  <Pause aria-hidden strokeWidth={1.6} />
                )}
                {text.actions.pause}
              </Button>
            ) : null}
            {status === "paused" ? (
              <Button
                type="button"
                variant="outline"
                disabled={acting !== null}
                aria-busy={acting === "resume" || undefined}
                onClick={() => void run("resume")}
                className={secondaryButtonClass}
              >
                {acting === "resume" ? (
                  <Spinner />
                ) : (
                  <Play aria-hidden strokeWidth={1.6} />
                )}
                {text.actions.resume}
              </Button>
            ) : null}
            {status === "scheduled" ||
            status === "sending" ||
            status === "paused" ? (
              <Button
                type="button"
                variant="outline"
                disabled={acting !== null}
                onClick={() => setCancelOpen(true)}
                className={cn(secondaryButtonClass, "text-danger")}
              >
                <X aria-hidden strokeWidth={1.6} />
                {text.actions.cancel}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <section
        aria-label={text.headline[status]}
        className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card px-4 py-4 shadow-xs"
      >
        <div aria-live="polite" className="flex flex-col gap-0.5">
          <h2 className="text-sm font-semibold tracking-[-0.005em] text-foreground">
            {text.headline[status]}
          </h2>
          <p
            className={cn(
              "tabular-nums",
              showProgress
                ? "text-[26px] leading-[1.2] font-semibold tracking-[-0.025em] text-foreground"
                : "text-[15px] font-medium text-foreground",
            )}
            suppressHydrationWarning
          >
            {lead}
          </p>
          {hint ? <p className="text-muted-foreground">{hint}</p> : null}
        </div>
        {showProgress ? (
          <TickProgress
            value={progress.handled}
            max={Math.max(progress.total, 1)}
            tone={status === "paused" ? "warning" : "brand"}
            aria-label={text.progressLabel}
          />
        ) : null}
        {status === "failed" ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg bg-danger-surface px-3 py-2.5 text-danger"
          >
            <CircleAlert
              aria-hidden
              strokeWidth={1.6}
              className="mt-0.5 size-4 shrink-0"
            />
            <span className="min-w-0 break-words">
              {live.error?.message || text.errorFallback}
            </span>
          </p>
        ) : null}
      </section>

      {showStats ? (
        <section
          aria-label={text.statsLabel}
          className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-xs"
        >
          <dl className="grid grid-cols-2 gap-px bg-border-subtle md:grid-cols-5">
            {primary.map((tile) => (
              <div
                key={tile.key}
                className="flex min-w-0 flex-col gap-0.5 bg-card px-4 py-3.5"
              >
                <dt className="text-xs font-medium text-ink-tertiary">
                  {text.stats[tile.key]}
                </dt>
                <dd className="flex min-w-0 flex-col">
                  <span className="text-[26px] leading-[1.2] font-semibold tracking-[-0.025em] text-foreground tabular-nums">
                    {tile.value}
                  </span>
                  <span className="min-h-[18px] truncate text-[12.5px] text-ink-tertiary tabular-nums">
                    {tile.note}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
          <dl
            aria-label={text.issuesLabel}
            className="flex flex-wrap gap-x-8 gap-y-2 border-t border-border-subtle bg-muted/40 px-4 py-3"
          >
            {issueKeys.map((key) => (
              <div key={key} className="flex items-baseline gap-2">
                <dt className="text-muted-foreground">{text.stats[key]}</dt>
                <dd
                  className={cn(
                    "font-semibold tabular-nums",
                    stats[key] > 0 && key !== "unsubscribed"
                      ? "text-danger"
                      : "text-foreground",
                  )}
                >
                  {copy.number(stats[key])}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <div className="grid items-start gap-[18px] xl:grid-cols-[minmax(0,1fr)_360px]">
        <RecipientsTable
          campaignId={live.id}
          campaignStatus={status}
          initial={recipients}
          refreshKey={refreshKey}
        />
        <SectionCard id="campaign-details-title" title={text.details.title}>
          <dl className="flex flex-col divide-y divide-border-subtle">
            {details.map((row) => (
              <div key={row.label} className="flex min-w-0 gap-3 px-4 py-2.5">
                <dt className="w-24 shrink-0 text-ink-tertiary">{row.label}</dt>
                <dd
                  className={cn(
                    "min-w-0 flex-1 break-words",
                    row.missing ? "text-ink-tertiary" : "text-foreground",
                  )}
                >
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </SectionCard>
      </div>

      <CancelCampaignDialog
        open={cancelOpen}
        campaign={live}
        pending={acting === "cancel"}
        onConfirm={() => void run("cancel")}
        onOpenChange={setCancelOpen}
      />
    </div>
  );
}
