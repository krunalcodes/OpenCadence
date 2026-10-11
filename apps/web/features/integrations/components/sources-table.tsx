import { HealthStrip } from "@workspace/ui/blocks/health-strip";
import { TickProgress } from "@workspace/ui/blocks/tick-progress";
import { Button } from "@workspace/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
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
import {
  Ellipsis,
  Gauge,
  Pause,
  Pencil,
  Play,
  PlugZap,
  Send,
  Unplug,
} from "lucide-react";
import { buttonFocusRing, focusRing } from "@/components/app-shell/page-header";
import { Spinner } from "@/components/spinner";
import { StatusBadge } from "@/components/status-badge";
import {
  SourceMark,
  secondaryButtonClass,
} from "@/features/integrations/components/integration-parts";
import { integrationMark } from "@/features/integrations/lib/catalog";
import {
  copy,
  sourceSecondLine,
  sourceStatusView,
} from "@/features/integrations/lib/copy";
import {
  isNearLimit,
  needsReconnect,
  type SendingSource,
} from "@/features/integrations/lib/sources";

const countFormat = new Intl.NumberFormat("en-US");

const headClass =
  "h-auto bg-muted/50 px-4 py-2 text-xs font-medium text-ink-tertiary";
const cellClass = "px-4 py-[11px] text-[13px]";
const menuItemClass = "rounded-lg px-2 py-1.5 text-[13px]";

export type RowAction = "test" | "pause" | "reconnect";

type SourceHandler = (source: SendingSource) => void;

type SourcesTableProps = {
  sources: SendingSource[];
  busy: { id: string; action: RowAction } | null;
  onTest: SourceHandler;
  onTestEmail: SourceHandler;
  onRename: SourceHandler;
  onSetLimit: SourceHandler;
  onTogglePause: SourceHandler;
  onDisconnect: SourceHandler;
  onReconnect: SourceHandler;
};

export function SourcesTable({
  sources,
  busy,
  onTest,
  onTestEmail,
  onRename,
  onSetLimit,
  onTogglePause,
  onDisconnect,
  onReconnect,
}: SourcesTableProps) {
  const { columns } = copy.connected;

  return (
    <Table className="min-w-[760px] text-[13px]">
      <TableHeader className="[&_tr]:border-border-subtle">
        <TableRow className="hover:bg-transparent">
          <TableHead className={headClass}>{columns.source}</TableHead>
          <TableHead className={headClass}>{columns.today}</TableHead>
          <TableHead className={headClass}>{columns.health}</TableHead>
          <TableHead className={headClass}>{columns.status}</TableHead>
          <TableHead className={headClass}>
            <span className="sr-only">{columns.actions}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sources.map((source) => {
          const rowBusy = busy?.id === source.id ? busy.action : null;
          const testing = rowBusy === "test";
          const reconnecting = rowBusy === "reconnect";
          const sent = countFormat.format(source.sentToday);
          const nearLimit = isNearLimit(source);
          const status = sourceStatusView(source);

          return (
            <TableRow
              key={source.id}
              className="group border-border-subtle hover:bg-muted/50"
            >
              <TableCell className={cn(cellClass, "max-w-72")}>
                <div className="flex items-center gap-2.5">
                  <SourceMark
                    integration={integrationMark(source.integrationType)}
                    className="bg-card"
                  />
                  <div className="min-w-0">
                    <div className="truncate font-medium text-foreground">
                      {source.name}
                    </div>
                    <div className="truncate text-xs text-ink-tertiary">
                      {sourceSecondLine(source)}
                    </div>
                  </div>
                </div>
              </TableCell>
              <TableCell className={cellClass}>
                {source.dailySendLimit === null ? (
                  <div className="flex items-baseline gap-2">
                    <span className="tabular-nums text-foreground">{sent}</span>
                    <span className="text-xs text-ink-tertiary">
                      {copy.connected.noLimit}
                    </span>
                  </div>
                ) : (
                  <div className="flex min-w-[170px] items-center gap-2">
                    <TickProgress
                      value={source.sentToday}
                      max={source.dailySendLimit}
                      tone={nearLimit ? "warning" : "brand"}
                      className="max-w-[96px] min-w-[60px] flex-1"
                      aria-label={copy.connected.progressFor(
                        source.name,
                        sent,
                        countFormat.format(source.dailySendLimit),
                      )}
                    />
                    <span className="text-xs whitespace-nowrap text-ink-tertiary tabular-nums">
                      {sent} / {countFormat.format(source.dailySendLimit)}
                    </span>
                  </div>
                )}
              </TableCell>
              <TableCell className={cellClass}>
                <HealthStrip
                  days={source.health.map((day) => day.health)}
                  className="align-middle"
                  aria-label={copy.connected.healthFor(source.name)}
                />
              </TableCell>
              <TableCell className={cellClass}>
                <div className="flex items-center gap-2">
                  {status.detail ? (
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
                  {needsReconnect(source) ? (
                    <button
                      type="button"
                      disabled={rowBusy !== null}
                      aria-busy={reconnecting || undefined}
                      onClick={() => onReconnect(source)}
                      className="inline-flex items-center gap-1 rounded-[4px] text-[12.5px] font-medium whitespace-nowrap text-danger underline decoration-danger/40 underline-offset-[3px] hover:decoration-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
                    >
                      {reconnecting ? <Spinner className="size-3.5" /> : null}
                      {copy.connected.reconnect}
                    </button>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className={cn(cellClass, "text-right")}>
                <div className="flex items-center justify-end gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={rowBusy !== null}
                    aria-busy={testing || undefined}
                    aria-label={`${copy.connected.testLong}: ${source.name}`}
                    onClick={() => onTest(source)}
                    className={cn(
                      secondaryButtonClass,
                      "px-[9px] text-[12.5px] opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 disabled:opacity-100",
                    )}
                  >
                    {testing ? <Spinner className="size-3.5" /> : null}
                    {copy.connected.test}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label={copy.connected.actionsFor(source.name)}
                      disabled={rowBusy === "pause"}
                      aria-busy={rowBusy === "pause" || undefined}
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
                      {rowBusy === "pause" ? (
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
                        disabled={rowBusy !== null}
                        onClick={() => onTest(source)}
                      >
                        <PlugZap aria-hidden strokeWidth={1.6} />
                        {copy.connected.testLong}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className={menuItemClass}
                        onClick={() => onTestEmail(source)}
                      >
                        <Send aria-hidden strokeWidth={1.6} />
                        {copy.connected.testEmail}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className={menuItemClass}
                        onClick={() => onRename(source)}
                      >
                        <Pencil aria-hidden strokeWidth={1.6} />
                        {copy.connected.rename}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className={menuItemClass}
                        onClick={() => onSetLimit(source)}
                      >
                        <Gauge aria-hidden strokeWidth={1.6} />
                        {copy.connected.setLimit}
                      </DropdownMenuItem>
                      {source.status === "needs_attention" ? null : (
                        <DropdownMenuItem
                          className={menuItemClass}
                          disabled={rowBusy !== null}
                          onClick={() => onTogglePause(source)}
                        >
                          {source.status === "paused" ? (
                            <Play aria-hidden strokeWidth={1.6} />
                          ) : (
                            <Pause aria-hidden strokeWidth={1.6} />
                          )}
                          {source.status === "paused"
                            ? copy.connected.resume
                            : copy.connected.pause}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        className={menuItemClass}
                        onClick={() => onDisconnect(source)}
                      >
                        <Unplug aria-hidden strokeWidth={1.6} />
                        {copy.connected.disconnect}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
