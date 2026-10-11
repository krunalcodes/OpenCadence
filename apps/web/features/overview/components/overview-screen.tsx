"use client";

import {
  type CadenceEventState,
  CadenceTimeline,
} from "@workspace/ui/blocks/cadence-timeline";
import { cn } from "@workspace/ui/lib/utils";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { LoadFailed } from "@/components/product/load-failed";
import { Spinner } from "@/components/spinner";
import { DeliverabilityAlert } from "@/features/overview/components/deliverability-alert";
import { GettingStarted } from "@/features/overview/components/getting-started";
import { MailboxList } from "@/features/overview/components/mailbox-list";
import {
  CardLink,
  OverviewCard,
} from "@/features/overview/components/overview-card";
import { RangeSwitch } from "@/features/overview/components/range-switch";
import { SendsTable } from "@/features/overview/components/sends-table";
import { StatRow } from "@/features/overview/components/stat-row";
import { useTimezoneSync } from "@/features/overview/components/timezone-setup";
import { useOverviewRefresh } from "@/features/overview/hooks/use-overview-refresh";
import { copy } from "@/features/overview/lib/copy";
import {
  cadenceLanes,
  dayPart,
  defaultOverviewRange,
  hasCadence,
  type Overview,
  type OverviewRangeId,
  type OverviewResult,
  type OverviewWarmup,
  timelineWindow,
} from "@/features/overview/lib/overview";
import { appHref } from "@/lib/navigation";

const legendSwatches: Record<CadenceEventState, string> = {
  sending: "bg-live",
  sent: "bg-sent-surface",
  scheduled: "bg-card outline outline-dashed outline-ink-tertiary",
  warmup: "bg-warmup-surface",
};

type OverviewScreenProps = {
  firstName: string;
  range: OverviewRangeId;
  timezone: string;
  result: OverviewResult;
  warmup: OverviewWarmup | null;
};

export function OverviewScreen({
  firstName,
  range,
  timezone,
  result,
  warmup,
}: OverviewScreenProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [navigating, startNavigation] = useTransition();
  const [retrying, startRetry] = useTransition();
  const [picked, setPicked] = useState(range);
  const [fresh, setFresh] = useState<Overview | null>(null);
  const loaded = result.state === "ready" ? result.overview : null;

  useEffect(() => {
    setPicked(range);
  }, [range]);

  useTimezoneSync(timezone);

  const handleFresh = useCallback((overview: Overview) => {
    setFresh(overview);
  }, []);
  useOverviewRefresh(range, timezone, handleFresh);

  const overview =
    loaded &&
    fresh &&
    fresh.range === loaded.range &&
    fresh.timezone === loaded.timezone &&
    fresh.generatedAt > loaded.generatedAt
      ? fresh
      : (loaded ?? (fresh?.range === range ? fresh : null));

  function changeRange(next: OverviewRangeId) {
    setPicked(next);
    startNavigation(() => {
      router.replace(
        next === defaultOverviewRange ? pathname : `${pathname}?range=${next}`,
        { scroll: false },
      );
    });
  }

  if (!overview) {
    return (
      <div className="flex min-w-0 flex-col gap-[18px] text-[13px] leading-normal">
        <PageHeader title={copy.title} />
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          <LoadFailed
            title={copy.failed.title}
            body={copy.failed.body}
            retryLabel={copy.failed.retry}
            pending={retrying}
            onRetry={() => startRetry(() => router.refresh())}
          />
        </div>
      </div>
    );
  }

  const { summary, today } = overview;
  const title = copy.greeting(dayPart(today.nowHour), firstName);
  const alert = overview.alert ? (
    <DeliverabilityAlert alert={overview.alert} range={overview.range} />
  ) : null;
  const mailboxes = (
    <OverviewCard
      id="overview-mailboxes"
      title={copy.mailboxes.title}
      description={copy.mailboxes.description(overview.mailboxes.length)}
      action={
        <CardLink href={appHref(copy.mailboxes.actionPath)}>
          {copy.mailboxes.actionLabel}
        </CardLink>
      }
    >
      <MailboxList rows={overview.mailboxes} />
    </OverviewCard>
  );

  if (!summary.hasSent && summary.setup) {
    return (
      <div className="@container flex min-w-0 flex-col gap-[18px] text-[13px] leading-normal">
        <PageHeader title={title} description={copy.setup.description} />
        {alert}
        <GettingStarted setup={summary.setup} />
        {overview.mailboxes.length > 0 ? mailboxes : null}
      </div>
    );
  }

  const lanes = cadenceLanes(today, warmup, copy.cadence.lanes);
  const window = timelineWindow(today);

  return (
    <div className="@container flex min-w-0 flex-col gap-[18px] text-[13px] leading-normal">
      <PageHeader
        title={title}
        description={copy.description(summary.running, summary.scheduledToday)}
        actions={
          <>
            {navigating ? (
              <span role="status" className="text-muted-foreground">
                <Spinner />
                <span className="sr-only">{copy.refreshing}</span>
              </span>
            ) : null}
            <RangeSwitch value={picked} onValueChange={changeRange} />
          </>
        }
      />
      {alert}
      <StatRow
        stats={overview.stats}
        range={overview.range}
        pending={navigating}
      />

      <OverviewCard
        id="overview-cadence"
        title={copy.cadence.title}
        description={
          hasCadence(lanes) ? copy.cadence.description : copy.cadence.empty
        }
        action={
          <ul className="flex flex-wrap gap-x-3.5 gap-y-1 text-[12.5px] text-muted-foreground">
            {copy.cadence.legend.map((item) => (
              <li key={item.state} className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-2 rounded-[2px]",
                    legendSwatches[item.state],
                  )}
                />
                {item.label}
              </li>
            ))}
          </ul>
        }
      >
        <CadenceTimeline
          startHour={window.startHour}
          endHour={window.endHour}
          now={today.nowHour}
          lanes={lanes}
        />
      </OverviewCard>

      <div className="grid grid-cols-1 items-start gap-[18px] @5xl:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)] @[87.5rem]:grid-cols-[minmax(0,1fr)_400px]">
        <OverviewCard
          id="overview-sends"
          title={copy.sends.title}
          description={copy.sends.description}
          action={
            <CardLink href={appHref(copy.sends.actionPath)}>
              {copy.sends.actionLabel}
            </CardLink>
          }
        >
          <SendsTable sends={overview.sends} timezone={overview.timezone} />
        </OverviewCard>
        {mailboxes}
      </div>
    </div>
  );
}
