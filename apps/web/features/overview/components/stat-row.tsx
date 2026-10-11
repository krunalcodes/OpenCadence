import { cn } from "@workspace/ui/lib/utils";
import { copy, formatCount, formatRate } from "@/features/overview/lib/copy";
import {
  type DeltaTone,
  deltaTone,
  type OverviewRangeId,
  type OverviewStats,
} from "@/features/overview/lib/overview";

type Stat = {
  id: string;
  label: string;
  value: string;
  delta: string | null;
  tone: DeltaTone;
  caption: string;
};

const toneClasses: Record<DeltaTone, string> = {
  good: "bg-success-surface text-success",
  bad: "bg-danger-surface text-danger",
  flat: "bg-border-subtle text-muted-foreground",
};

function statsOf(stats: OverviewStats, range: OverviewRangeId): Stat[] {
  const points = (change: number | null) =>
    change === null ? null : copy.stats.pointChange(change);
  const sent = stats.sent.value ?? 0;
  return [
    {
      id: "sent",
      label: copy.stats.sent,
      value: formatCount(sent),
      delta:
        stats.sent.change === null
          ? null
          : copy.stats.percentChange(stats.sent.change),
      tone: deltaTone(stats.sent.change ?? 0, true),
      caption:
        sent === 0 && !stats.sent.previous
          ? copy.stats.noSends(range)
          : copy.stats.comparison(range),
    },
    {
      id: "open-rate",
      label: copy.stats.openRate,
      value: formatRate(stats.openRate.value),
      delta: points(stats.openRate.change),
      tone: deltaTone(stats.openRate.change ?? 0, true),
      caption:
        stats.openRate.value === null
          ? copy.stats.noTracking
          : copy.stats.opens(stats.opened.value ?? 0),
    },
    {
      id: "reply-rate",
      label: copy.stats.replyRate,
      value: formatRate(stats.replyRate.value),
      delta: points(stats.replyRate.change),
      tone: deltaTone(stats.replyRate.change ?? 0, true),
      caption:
        stats.replyRate.value === null
          ? copy.stats.noSequences
          : copy.stats.replies(stats.replied.value ?? 0),
    },
    {
      id: "bounce-rate",
      label: copy.stats.bounceRate,
      value: formatRate(stats.bounceRate.value),
      delta: points(stats.bounceRate.change),
      tone: deltaTone(stats.bounceRate.change ?? 0, false),
      caption:
        (stats.bounced.value ?? 0) > 0
          ? copy.stats.bounces(stats.bounced.value ?? 0)
          : copy.stats.bounceTarget,
    },
  ];
}

type StatRowProps = {
  stats: OverviewStats;
  range: OverviewRangeId;
  pending: boolean;
};

export function StatRow({ stats, range, pending }: StatRowProps) {
  return (
    <dl
      aria-busy={pending || undefined}
      className={cn(
        "grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border-subtle shadow-xs transition-opacity @md:grid-cols-2 @4xl:grid-cols-4",
        pending && "opacity-60",
      )}
    >
      {statsOf(stats, range).map((stat) => (
        <div key={stat.id} className="min-w-0 bg-card px-[18px] py-4">
          <dt className="truncate text-[13px] font-medium text-muted-foreground">
            {stat.label}
          </dt>
          <dd className="mt-1.5">
            <span className="flex items-baseline gap-2">
              <span className="text-[26px] leading-[1.2] font-semibold tracking-[-0.025em] text-foreground tabular-nums">
                {stat.value}
              </span>
              {stat.delta ? (
                <span
                  className={cn(
                    "rounded-[6px] px-1.5 py-px text-xs font-medium whitespace-nowrap tabular-nums",
                    toneClasses[stat.tone],
                  )}
                >
                  {stat.delta}
                </span>
              ) : null}
            </span>
            <span className="block truncate text-xs text-ink-tertiary tabular-nums">
              {stat.caption}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
