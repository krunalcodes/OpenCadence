import { HealthStrip } from "@workspace/ui/blocks/health-strip";
import { SourceMark } from "@/components/product/source-mark";
import { StatusBadge } from "@/components/status-badge";
import { CardLink } from "@/features/overview/components/overview-card";
import { copy } from "@/features/overview/lib/copy";
import type { OverviewMailbox } from "@/features/overview/lib/overview";
import { appHref } from "@/lib/navigation";

export function MailboxList({ rows }: { rows: OverviewMailbox[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
        <p className="min-w-0 text-[13px] text-muted-foreground">
          <span className="font-medium text-foreground">
            {copy.mailboxes.emptyTitle}
          </span>{" "}
          {copy.mailboxes.emptyBody}
        </p>
        <CardLink href={appHref(copy.mailboxes.actionPath)}>
          {copy.mailboxes.emptyAction}
        </CardLink>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border-subtle">
      {rows.map((row) => {
        return (
          <li key={row.id} className="flex items-center gap-2.5 px-4 py-[11px]">
            <SourceMark integration={{ id: row.integrationType, mark: null }} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium text-foreground">
                {row.name}
              </div>
              <div className="truncate text-xs text-ink-tertiary tabular-nums">
                {copy.mailboxes.detail(row)}
              </div>
            </div>
            <HealthStrip
              days={row.days}
              className="shrink-0"
              aria-label={`${row.name}: ${copy.mailboxes.healthLabel}`}
            />
            <StatusBadge tone={copy.mailboxes.tone(row)}>
              {copy.mailboxes.status(row)}
            </StatusBadge>
          </li>
        );
      })}
    </ul>
  );
}
