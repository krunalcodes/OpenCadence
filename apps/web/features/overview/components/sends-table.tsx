import { TickProgress } from "@workspace/ui/blocks/tick-progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import Link from "next/link";
import { StatusBadge } from "@/features/overview/components/status-badge";
import {
  type BadgeTone,
  type SendStatus,
  sendsCard,
  type TodaySend,
} from "@/features/overview/lib/sample";
import { appHref } from "@/lib/navigation";

const statusTones: Record<SendStatus, BadgeTone> = {
  sending: "live",
  sent: "success",
  scheduled: "warning",
  draft: "neutral",
};

const countFormat = new Intl.NumberFormat("en-US");

function progressLabel(send: TodaySend) {
  if (send.status === "sent" || send.status === "draft") {
    return countFormat.format(send.total);
  }
  return `${countFormat.format(send.sent)} / ${countFormat.format(send.total)}`;
}

function rateLabel(rate: number | null) {
  return rate === null ? sendsCard.emptyValue : `${rate.toFixed(1)}%`;
}

const headClass =
  "h-auto bg-muted/50 px-4 py-2 text-xs font-medium text-ink-tertiary";
const cellClass = "px-4 py-[11px] text-[13px]";

type SendsTableProps = {
  sends: TodaySend[];
};

export function SendsTable({ sends }: SendsTableProps) {
  const { columns } = sendsCard;

  return (
    <Table className="min-w-[680px] text-[13px]">
      <TableHeader className="[&_tr]:border-border-subtle">
        <TableRow className="hover:bg-transparent">
          <TableHead className={headClass}>{columns.name}</TableHead>
          <TableHead className={headClass}>{columns.via}</TableHead>
          <TableHead className={headClass}>{columns.status}</TableHead>
          <TableHead className={headClass}>{columns.progress}</TableHead>
          <TableHead className={`${headClass} text-right`}>
            {columns.opens}
          </TableHead>
          <TableHead className={`${headClass} text-right`}>
            {columns.clicks}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sends.map((send) => (
          <TableRow
            key={send.id}
            className="border-border-subtle hover:bg-muted/50"
          >
            <TableCell className={`${cellClass} max-w-56`}>
              <Link
                href={appHref(send.path)}
                className="block truncate rounded-[4px] font-medium text-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {send.name}
              </Link>
              <div className="truncate text-xs text-ink-tertiary">
                {send.detail}
              </div>
            </TableCell>
            <TableCell className={cellClass}>
              {send.via ? (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground tabular-nums">
                  <span
                    aria-hidden="true"
                    className="grid size-4 place-items-center rounded-[4px] border border-border bg-muted text-[9px] font-semibold text-muted-foreground"
                  >
                    {send.via.mark}
                  </span>
                  {send.via.label}
                </span>
              ) : (
                <span className="text-xs text-ink-tertiary">
                  {sendsCard.viaFallback}
                </span>
              )}
            </TableCell>
            <TableCell className={cellClass}>
              <StatusBadge tone={statusTones[send.status]}>
                {send.statusLabel}
              </StatusBadge>
            </TableCell>
            <TableCell className={cellClass}>
              <div className="flex min-w-[150px] items-center gap-2">
                <TickProgress
                  value={send.sent}
                  max={send.total}
                  tone={send.status === "sent" ? "success" : "brand"}
                  className="min-w-[60px] flex-1"
                  aria-label={`${send.name}: ${countFormat.format(send.sent)} of ${countFormat.format(send.total)} sent`}
                />
                <span className="text-xs text-ink-tertiary tabular-nums">
                  {progressLabel(send)}
                </span>
              </div>
            </TableCell>
            <TableCell
              className={`${cellClass} text-right tabular-nums ${send.openRate === null ? "text-xs text-ink-tertiary" : ""}`}
            >
              {rateLabel(send.openRate)}
            </TableCell>
            <TableCell
              className={`${cellClass} text-right tabular-nums ${send.clickRate === null ? "text-xs text-ink-tertiary" : ""}`}
            >
              {rateLabel(send.clickRate)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
