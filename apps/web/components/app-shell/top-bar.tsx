"use client";

import { Button } from "@workspace/ui/components/button";
import { Kbd } from "@workspace/ui/components/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import { Menu, PanelLeft, Plus, Upload } from "lucide-react";
import { buttonFocusRing, focusRing } from "@/components/app-shell/page-header";
import { notBuilt } from "@/components/app-shell/rail";
import { WorkspaceSwitcher } from "@/components/app-shell/workspace-switcher";
import type { SampleWorkspace } from "@/lib/sample-data";

const iconButton =
  "grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

type TopBarProps = {
  workspace: SampleWorkspace;
  workspaces: SampleWorkspace[];
  switching: boolean;
  onSwitchWorkspace: (id: string) => void;
  pageTitle: string;
  panelCollapsed: boolean;
  onExpandPanel: () => void;
  onOpenMobileNav: () => void;
};

export function TopBar({
  workspace,
  workspaces,
  switching,
  onSwitchWorkspace,
  pageTitle,
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
        <span className="min-w-0 truncate font-medium text-foreground">
          {pageTitle}
        </span>
      </p>

      <Button
        variant="outline"
        aria-label="Import contacts"
        onClick={() => notBuilt("Import contacts")}
        className={cn(
          "bg-card px-2 text-[13px] shadow-xs hover:bg-muted sm:px-3",
          buttonFocusRing,
        )}
      >
        <Upload strokeWidth={1.6} aria-hidden />
        <span className="hidden sm:inline">Import contacts</span>
      </Button>
      <Button
        onClick={() => notBuilt("New campaign")}
        className={cn("px-3 text-[13px] hover:bg-brand-hover", buttonFocusRing)}
      >
        <Plus strokeWidth={1.6} aria-hidden />
        New campaign
      </Button>
    </header>
  );
}
