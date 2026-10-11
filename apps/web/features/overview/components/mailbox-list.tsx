import { HealthStrip } from "@workspace/ui/blocks/health-strip";
import { Layers, Mail } from "lucide-react";
import { StatusBadge } from "@/features/overview/components/status-badge";
import { type MailboxRow, mailboxesCard } from "@/features/overview/lib/sample";

export function MailboxList({ rows }: { rows: MailboxRow[] }) {
  return (
    <ul className="divide-y divide-border-subtle">
      {rows.map((row) => {
        const Icon = row.kind === "mailbox" ? Mail : Layers;
        return (
          <li key={row.id} className="flex items-center gap-2.5 px-4 py-[11px]">
            <span
              aria-hidden="true"
              className="grid size-7 shrink-0 place-items-center rounded-[7px] border border-border bg-muted text-muted-foreground"
            >
              <Icon className="size-4" strokeWidth={1.6} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium text-foreground">
                {row.name}
              </div>
              <div className="truncate text-xs text-ink-tertiary tabular-nums">
                {row.detail}
              </div>
            </div>
            <HealthStrip
              days={row.days}
              className="shrink-0"
              aria-label={`${row.name}: ${mailboxesCard.healthLabel}`}
            />
            <StatusBadge tone={row.statusTone}>{row.statusLabel}</StatusBadge>
          </li>
        );
      })}
    </ul>
  );
}
