"use client";

import { Kbd } from "@workspace/ui/components/kbd";
import { Progress } from "@workspace/ui/components/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import { PanelLeft, Search } from "lucide-react";
import Link from "next/link";
import { focusRing, pageIcon } from "@/components/app-shell/page-header";
import { WorkspaceSwitcher } from "@/components/app-shell/workspace-switcher";
import {
  appHref,
  type NavArea,
  type NavPage,
  type NavView,
} from "@/lib/navigation";
import type { Workspace } from "@/lib/session";

export const viewToneClass: Record<NavView["tone"], string> = {
  live: "bg-live outline outline-1 outline-primary",
  warning: "bg-warning",
  danger: "bg-danger",
  neutral: "bg-ink-tertiary",
};

type PageLinksProps = {
  pages: NavPage[];
  activePath: string;
  onNavigate?: () => void;
};

export function PageLinks({ pages, activePath, onNavigate }: PageLinksProps) {
  return (
    <ul className="flex flex-col gap-px">
      {pages.map((page) => {
        const Icon = pageIcon(page.path);
        const active = page.path === activePath;
        return (
          <li key={page.path}>
            <Link
              href={appHref(page.path)}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-[9px] rounded-lg px-2 py-1.5 font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                focusRing,
                active &&
                  "bg-card text-foreground shadow-xs ring-1 ring-border hover:bg-card",
              )}
            >
              <Icon
                className={cn("size-4 shrink-0", active && "text-primary")}
                strokeWidth={1.6}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate">{page.title}</span>
              {page.count ? (
                <span className="font-normal text-[11.5px] text-ink-tertiary tabular-nums">
                  {page.count}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

type AreaPanelProps = {
  workspace: Workspace;
  workspaces: Workspace[];
  switching: boolean;
  onSwitchWorkspace: (id: string) => void;
  onCreateWorkspace: () => void;
  area: NavArea;
  activePath: string;
  onCollapse: () => void;
  onSearch: () => void;
  warmup?: PanelWarmup | null;
};

export type PanelWarmup = {
  warming: number;
  earliestDay: number | null;
  readyAfterDays: number;
};

function warmupLine(warmup: PanelWarmup) {
  const day = `day ${warmup.earliestDay} of ${warmup.readyAfterDays}`;
  return warmup.warming === 1
    ? `1 mailbox, ${day}`
    : `${warmup.warming} mailboxes, earliest on ${day}`;
}

export function AreaPanel({
  workspace,
  workspaces,
  switching,
  onSwitchWorkspace,
  onCreateWorkspace,
  area,
  activePath,
  onCollapse,
  onSearch,
  warmup,
}: AreaPanelProps) {
  return (
    <aside
      aria-label={`${area.title} navigation`}
      className="hidden w-[232px] shrink-0 flex-col gap-3.5 overflow-y-auto border-border border-r bg-sidebar p-2.5 md:flex"
    >
      <WorkspaceSwitcher
        workspace={workspace}
        workspaces={workspaces}
        pending={switching}
        onSwitch={onSwitchWorkspace}
        onCreate={onCreateWorkspace}
      />

      <div className="flex h-8 shrink-0 items-center justify-between pr-0.5 pl-2">
        <h2 className="truncate font-semibold text-[15px] text-foreground tracking-[-0.01em]">
          {area.title}
        </h2>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label="Collapse panel"
                aria-keyshortcuts="Meta+B Control+B"
                onClick={onCollapse}
              />
            }
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              focusRing,
            )}
          >
            <PanelLeft className="size-4" strokeWidth={1.6} aria-hidden />
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Collapse panel
            <Kbd>⌘B</Kbd>
          </TooltipContent>
        </Tooltip>
      </div>

      <button
        type="button"
        onClick={onSearch}
        aria-keyshortcuts="Meta+K Control+K"
        className={cn(
          "flex h-8 w-full shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-[9px] text-left text-muted-foreground shadow-xs transition-colors hover:text-foreground",
          focusRing,
        )}
      >
        <Search className="size-4 shrink-0" strokeWidth={1.6} aria-hidden />
        <span className="min-w-0 flex-1 truncate">Search or jump to</span>
        <Kbd
          aria-hidden
          className="h-[18px] rounded-[5px] border border-border bg-sidebar px-[5px] text-[11px] text-ink-tertiary"
        >
          ⌘K
        </Kbd>
      </button>

      <nav aria-label={`${area.title} pages`}>
        <PageLinks pages={area.pages} activePath={activePath} />
      </nav>

      {area.views.length > 0 ? (
        <section aria-labelledby="saved-views-heading">
          <h3
            id="saved-views-heading"
            className="px-2 py-1 font-medium text-[11.5px] text-muted-foreground"
          >
            Saved views
          </h3>
          <ul className="flex flex-col gap-px">
            {area.views.map((view) => (
              <li
                key={view.title}
                className="flex items-center gap-[9px] px-2 py-1.5 text-muted-foreground"
              >
                <span className="grid size-4 shrink-0 place-items-center">
                  <span
                    aria-hidden
                    className={cn(
                      "size-2 rounded-[2px]",
                      viewToneClass[view.tone],
                    )}
                  />
                </span>
                <span className="min-w-0 flex-1 truncate">{view.title}</span>
                {view.count ? (
                  <span className="text-[11.5px] text-ink-tertiary tabular-nums">
                    {view.count}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {warmup && warmup.warming > 0 && warmup.earliestDay !== null ? (
        <Link
          href={appHref("warmup")}
          className={cn(
            "mt-auto block rounded-[10px] border border-border bg-card p-[11px] shadow-xs transition-colors hover:bg-muted",
            focusRing,
          )}
        >
          <p className="font-semibold text-foreground">Warm-up in progress</p>
          <p className="mt-0.5 mb-2 text-muted-foreground text-xs tabular-nums">
            {warmupLine(warmup)}
          </p>
          <Progress
            value={Math.min(warmup.earliestDay, warmup.readyAfterDays)}
            max={warmup.readyAfterDays}
            aria-label={`Warm-up progress, day ${warmup.earliestDay} of ${warmup.readyAfterDays}`}
            className="**:data-[slot=progress-track]:h-[5px] **:data-[slot=progress-track]:bg-border-subtle"
          />
        </Link>
      ) : null}
    </aside>
  );
}
