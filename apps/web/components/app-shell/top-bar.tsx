"use client";

import { Kbd } from "@workspace/ui/components/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import { Menu, PanelLeft, Upload } from "lucide-react";
import Link from "next/link";
import { buttonFocusRing, focusRing } from "@/components/app-shell/page-header";
import { WorkspaceSwitcher } from "@/components/app-shell/workspace-switcher";
import { appHref } from "@/lib/navigation";
import type { Workspace } from "@/lib/session";

const iconButton =
  "grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

type TopBarProps = {
  workspace: Workspace;
  workspaces: Workspace[];
  switching: boolean;
  onSwitchWorkspace: (id: string) => void;
  onCreateWorkspace: () => void;
  pageTitle: string;
  areaTitle?: string;
  panelCollapsed: boolean;
  onExpandPanel: () => void;
  onOpenMobileNav: () => void;
};

export function TopBar({
  workspace,
  workspaces,
  switching,
  onSwitchWorkspace,
  onCreateWorkspace,
  pageTitle,
  areaTitle,
  panelCollapsed,
  onExpandPanel,
  onOpenMobileNav,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-10 flex h-[52px] shrink-0 items-center gap-2.5 border-border border-b bg-background/85 px-4 backdrop-blur-sm backdrop-saturate-150 md:px-7">
      <button
        type="button"
        aria-label="Open navigation"
        onClick={onOpenMobileNav}
        className={cn(iconButton, focusRing, "-ml-1.5 md:hidden")}
      >
        <Menu className="size-4" strokeWidth={1.6} aria-hidden />
      </button>

      {panelCollapsed ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label="Open panel"
                aria-keyshortcuts="Meta+B Control+B"
                onClick={onExpandPanel}
              />
            }
            className={cn(iconButton, focusRing, "-ml-1.5 hidden md:grid")}
          >
            <PanelLeft className="size-4" strokeWidth={1.6} aria-hidden />
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Open panel
            <Kbd>⌘B</Kbd>
          </TooltipContent>
        </Tooltip>
      ) : null}

      {panelCollapsed ? (
        <WorkspaceSwitcher
          variant="compact"
          workspace={workspace}
          workspaces={workspaces}
          pending={switching}
          onSwitch={onSwitchWorkspace}
          onCreate={onCreateWorkspace}
          className="-ml-1 hidden md:grid"
        />
      ) : null}

      <p className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="hidden min-w-0 shrink truncate text-muted-foreground sm:inline">
          {workspace.name}
        </span>
        <span aria-hidden className="hidden text-ink-tertiary sm:inline">
          /
        </span>
        {areaTitle ? (
          <>
            <span className="hidden shrink-0 text-muted-foreground sm:inline">
              {areaTitle}
            </span>
            <span aria-hidden className="hidden text-ink-tertiary sm:inline">
              /
            </span>
          </>
        ) : null}
        <span className="min-w-0 truncate font-medium text-foreground">
          {pageTitle}
        </span>
      </p>

      <Link
        href={appHref("contacts/import")}
        aria-label="Import contacts"
        className={cn(
          "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-2 font-medium text-[13px] text-foreground shadow-xs transition-colors hover:bg-muted sm:px-3 [&_svg]:size-4",
          buttonFocusRing,
        )}
      >
        <Upload strokeWidth={1.6} aria-hidden />
        <span className="hidden sm:inline">Import contacts</span>
      </Link>
    </header>
  );
}
