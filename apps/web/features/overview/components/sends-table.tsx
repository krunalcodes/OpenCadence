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
import { SourceMark } from "@/components/product/source-mark";
import { tableCellClass, tableHeadClass } from "@/components/product/styles";
import { StatusBadge } from "@/components/status-badge";
import { CardLink } from "@/features/overview/components/overview-card";
import {
  copy,
  formatRate,
  sendStatusTones,
} from "@/features/overview/lib/copy";
import { type OverviewSend, sendPath } from "@/features/overview/lib/overview";
import { appHref } from "@/lib/navigation";

type SendsTableProps = {
  sends: OverviewSend[];
  timezone: string;
};

function RateCell({ rate }: { rate: number | null }) {
  return (
    <TableCell
      className={`${tableCellClass} text-right tabular-nums ${rate === null ? "text-ink-tertiary" : ""}`}
    >
      {formatRate(rate)}
    </TableCell>
  );
}

export function SendsTable({ sends, timezone }: SendsTableProps) {
  const { columns } = copy.sends;

  if (sends.length === 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
        <p className="min-w-0 text-[13px] text-muted-foreground">
          <span className="font-medium text-foreground">
            {copy.sends.emptyTitle}
          </span>{" "}
          {copy.sends.emptyBody}
        </p>
        <CardLink href={appHref(copy.sends.actionPath)}>
          {copy.sends.emptyAction}
        </CardLink>
      </div>
    );
  }

  return (
    <Table className="min-w-[680px] text-[13px]">
      <TableHeader className="[&_tr]:border-border-subtle">
        <TableRow className="hover:bg-transparent">
          <TableHead className={tableHeadClass}>{columns.name}</TableHead>
          <TableHead className={tableHeadClass}>{columns.via}</TableHead>
          <TableHead className={tableHeadClass}>{columns.status}</TableHead>
          <TableHead className={tableHeadClass}>{columns.progress}</TableHead>
          <TableHead className={`${tableHeadClass} text-right`}>
            {columns.opens}
          </TableHead>
          <TableHead className={`${tableHeadClass} text-right`}>
            {columns.clicks}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sends.map((send) => (
          <TableRow
            key={`${send.kind}-${send.id}`}
            className="border-border-subtle hover:bg-muted/50"
          >
            <TableCell className={`${tableCellClass} max-w-56`}>
              <Link
                href={appHref(sendPath(send))}
                className="block truncate rounded-[4px] font-medium text-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {send.name}
              </Link>
              <div className="truncate text-xs text-ink-tertiary">
                {copy.sends.detail(send)}
              </div>
            </TableCell>
            <TableCell className={tableCellClass}>
              {send.source ? (
                <span className="inline-flex max-w-44 items-center gap-1.5 text-muted-foreground">
                  <SourceMark
                    integration={{
                      id: send.source.integrationType,
                      mark: null,
                    }}
                    className="size-4 rounded-[4px] [&_svg]:size-2.5"
                  />
                  <span className="truncate">{send.source.name}</span>
                </span>
              ) : (
                <span className="text-xs text-ink-tertiary">
                  {send.kind === "sequence"
                    ? copy.sends.sequenceVia
                    : copy.sends.viaFallback}
                </span>
              )}
            </TableCell>
            <TableCell className={tableCellClass}>
              <StatusBadge tone={sendStatusTones[send.status]}>
                {copy.sends.status(send, timezone)}
              </StatusBadge>
            </TableCell>
            <TableCell className={tableCellClass}>
              <div className="flex min-w-[150px] items-center gap-2">
                <TickProgress
                  value={send.done}
                  max={send.total}
                  tone={send.status === "sent" ? "success" : "brand"}
                  className="min-w-[60px] flex-1"
                  aria-label={copy.sends.progressLabel(send)}
                />
                <span className="text-xs text-ink-tertiary tabular-nums">
                  {copy.sends.progress(send)}
                </span>
              </div>
            </TableCell>
            <RateCell rate={send.openRate} />
            <RateCell rate={send.clickRate} />
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
