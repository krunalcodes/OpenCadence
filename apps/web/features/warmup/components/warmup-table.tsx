import { HealthStrip } from "@workspace/ui/blocks/health-strip";
import { TickProgress } from "@workspace/ui/blocks/tick-progress";
import { Button } from "@workspace/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { Switch } from "@workspace/ui/components/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import { Ellipsis, Pause, Play, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { buttonFocusRing, focusRing } from "@/components/app-shell/page-header";
import { SourceMark } from "@/components/product/source-mark";
import {
  menuItemClass,
  tableCellClass,
  tableHeadClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import { StatusBadge } from "@/components/status-badge";
import {
  copy,
  mailboxSecondLine,
  statusView,
} from "@/features/warmup/lib/copy";
import {
  healthOf,
  type PlacementTone,
  placementTone,
  type WarmupMailbox,
} from "@/features/warmup/lib/warmup";
import { appHref } from "@/lib/navigation";

const placementClass: Record<PlacementTone, string> = {
  normal: "text-foreground",
  warning: "text-warning",
  danger: "text-danger",
};

const placementNote: Record<PlacementTone, string | null> = {
  normal: null,
  warning: copy.placementLow,
  danger: copy.placementVeryLow,
};

type MailboxHandler = (mailbox: WarmupMailbox) => void;

type WarmupTableProps = {
  mailboxes: WarmupMailbox[];
  busyIds: string[];
  onToggle: (mailbox: WarmupMailbox, enabled: boolean) => void;
  onSettings: MailboxHandler;
  onTogglePause: MailboxHandler;
};

function Dash() {
  return (
    <>
      <span aria-hidden="true" className="text-ink-tertiary">
        -
      </span>
      <span className="sr-only">{copy.none}</span>
    </>
  );
}

export function WarmupTable({
  mailboxes,
  busyIds,
  onToggle,
  onSettings,
  onTogglePause,
}: WarmupTableProps) {
  const { columns } = copy;

  return (
    <Table className="min-w-[1040px] text-[13px]">
      <TableHeader className="[&_tr]:border-border-subtle">
        <TableRow className="hover:bg-transparent">
          <TableHead className={tableHeadClass}>{columns.mailbox}</TableHead>
          <TableHead className={tableHeadClass}>{columns.warmup}</TableHead>
          <TableHead className={tableHeadClass}>{columns.status}</TableHead>
          <TableHead className={tableHeadClass}>{columns.today}</TableHead>
          <TableHead className={tableHeadClass}>{columns.placement}</TableHead>
          <TableHead className={tableHeadClass}>{columns.days}</TableHead>
          <TableHead className={tableHeadClass}>
            <span className="sr-only">{columns.actions}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {mailboxes.map((mailbox) => {
          const busy = busyIds.includes(mailbox.sourceId);
          const status = statusView(mailbox);
          const running =
            mailbox.status === "warming" || mailbox.status === "ready";
          const paused = mailbox.status === "paused";
          const showToday = running || paused;
          const { placement } = mailbox;
          const tone =
            placement.rate === null ? "normal" : placementTone(placement.rate);
          const health = mailbox.days.map(healthOf);

          return (
            <TableRow
              key={mailbox.sourceId}
              className="border-border-subtle hover:bg-muted/50"
            >
              <TableCell className={cn(tableCellClass, "max-w-[420px]")}>
                <div className="flex items-center gap-2.5">
                  <SourceMark
                    integration={{ id: mailbox.integrationType, mark: null }}
                    className={cn("bg-card", !mailbox.capable && "opacity-60")}
                  />
                  <div className="min-w-0">
                    <div className="truncate font-medium text-foreground">
                      {mailbox.name}
                    </div>
                    <div className="truncate text-xs text-ink-tertiary">
                      {mailboxSecondLine(mailbox)}
                    </div>
                    {mailbox.capable ? null : (
                      <p className="mt-0.5 text-xs whitespace-normal text-ink-tertiary">
                        {copy.notCapable}{" "}
                        <Link
                          href={appHref("integrations")}
                          className={cn(
                            "rounded-[4px] font-medium text-foreground underline decoration-border underline-offset-[3px] hover:decoration-foreground",
                            focusRing,
                          )}
                        >
                          {copy.notCapableLink}
                        </Link>{" "}
                        {copy.notCapableEnd}
                      </p>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell className={tableCellClass}>
                {mailbox.capable ? (
                  <Switch
                    checked={mailbox.enabled}
                    aria-label={copy.switchLabel(mailbox.name)}
                    onCheckedChange={(next) => onToggle(mailbox, next)}
                    className="align-middle"
                  />
                ) : (
                  <Tooltip>
                    <TooltipTrigger
                      render={<span className="inline-flex align-middle" />}
                    >
                      <Switch
                        checked={false}
                        readOnly
                        aria-disabled="true"
                        aria-label={copy.switchLabel(mailbox.name)}
                        className="cursor-not-allowed opacity-50"
                      />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-72 text-left leading-normal">
                      {copy.notCapableTooltip}
                    </TooltipContent>
                  </Tooltip>
                )}
              </TableCell>
              <TableCell className={tableCellClass}>
                {status.tone === null ? (
                  <span className="whitespace-nowrap text-ink-tertiary">
                    {status.label}
                  </span>
                ) : status.detail ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          className={cn("rounded-[6px]", focusRing)}
                        />
                      }
                    >
                      <StatusBadge tone={status.tone}>
                        {status.label}
                      </StatusBadge>
                      <span className="sr-only">
                        {copy.status.detailFor(status.label, status.detail)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-72 text-left leading-normal">
                      {status.detail}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                )}
              </TableCell>
              <TableCell className={tableCellClass}>
                {showToday ? (
                  <div className="flex min-w-[150px] items-center gap-2">
                    <TickProgress
                      value={mailbox.todaySent}
                      max={mailbox.todayTarget}
                      tone={
                        mailbox.todayTarget > 0 &&
                        mailbox.todaySent >= mailbox.todayTarget
                          ? "success"
                          : "brand"
                      }
                      className="max-w-[96px] min-w-[60px] flex-1"
                      aria-label={copy.todayFor(
                        mailbox.name,
                        mailbox.todaySent,
                        mailbox.todayTarget,
                      )}
                    />
                    <span className="text-xs whitespace-nowrap text-ink-tertiary tabular-nums">
                      {copy.todayNumbers(
                        mailbox.todaySent,
                        mailbox.todayTarget,
                      )}
                    </span>
                  </div>
                ) : (
                  <Dash />
                )}
              </TableCell>
              <TableCell className={cn(tableCellClass, "whitespace-nowrap")}>
                {placement.rate === null ? (
                  <span className="text-ink-tertiary">{copy.noData}</span>
                ) : (
                  <div className="flex items-baseline gap-2">
                    <span
                      className={cn(
                        "font-medium tabular-nums",
                        placementClass[tone],
                      )}
                    >
                      {copy.placementRate(placement.rate)}
                    </span>
                    {placementNote[tone] ? (
                      <span className="sr-only">{placementNote[tone]}</span>
                    ) : null}
                    <span className="text-xs text-ink-tertiary tabular-nums">
                      {copy.placementCounts(
                        placement.inbox,
                        placement.inbox + placement.spam,
                      )}
                    </span>
                  </div>
                )}
              </TableCell>
              <TableCell className={tableCellClass}>
                <HealthStrip
                  days={health}
                  className="align-middle"
                  aria-label={copy.daysFor(
                    mailbox.name,
                    health.filter((day) => day === "warning").length,
                    health.filter((day) => day === "healthy").length,
                    health.filter((day) => day === "none").length,
                  )}
                />
              </TableCell>
              <TableCell className={cn(tableCellClass, "text-right")}>
                {mailbox.capable ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label={copy.actionsFor(mailbox.name)}
                      disabled={busy}
                      aria-busy={busy || undefined}
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className={cn(
                            "-mr-1.5 text-muted-foreground hover:bg-accent",
                            buttonFocusRing,
                          )}
                        />
                      }
                    >
                      {busy ? (
                        <Spinner />
                      ) : (
                        <Ellipsis aria-hidden strokeWidth={1.6} />
                      )}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="w-48 p-1 text-[13px]"
                    >
                      <DropdownMenuItem
                        className={menuItemClass}
                        onClick={() => onSettings(mailbox)}
                      >
                        <SlidersHorizontal aria-hidden strokeWidth={1.6} />
                        {copy.settings}
                      </DropdownMenuItem>
                      {running || paused ? (
                        <DropdownMenuItem
                          className={menuItemClass}
                          onClick={() => onTogglePause(mailbox)}
                        >
                          {paused ? (
                            <Play aria-hidden strokeWidth={1.6} />
                          ) : (
                            <Pause aria-hidden strokeWidth={1.6} />
                          )}
                          {paused ? copy.resume : copy.pause}
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
