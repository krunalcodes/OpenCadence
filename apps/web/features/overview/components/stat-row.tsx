import { cn } from "@workspace/ui/lib/utils";
import type { OverviewStat } from "@/features/overview/lib/sample";

type StatRowProps = {
  stats: OverviewStat[];
  comparison: string;
};

export function StatRow({ stats, comparison }: StatRowProps) {
  return (
    <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border-subtle shadow-xs @md:grid-cols-2 @4xl:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.id} className="min-w-0 bg-card px-[18px] py-4">
          <dt className="truncate text-[13px] font-medium text-muted-foreground">
            {stat.label}
          </dt>
          <dd className="mt-1.5">
            <span className="flex items-baseline gap-2">
              <span className="text-[26px] leading-[1.2] font-semibold tracking-[-0.025em] text-foreground tabular-nums">
                {stat.value}
              </span>
              <span
                className={cn(
                  "rounded-[6px] px-1.5 py-px text-xs font-medium whitespace-nowrap tabular-nums",
                  stat.deltaTone === "good"
                    ? "bg-success-surface text-success"
                    : "bg-danger-surface text-danger",
                )}
              >
                {stat.delta}
              </span>
            </span>
            <span className="block truncate text-xs text-ink-tertiary tabular-nums">
              {stat.caption ?? comparison}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
