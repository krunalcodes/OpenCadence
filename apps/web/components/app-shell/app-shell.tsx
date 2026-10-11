"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { AreaPanel } from "@/components/app-shell/area-panel";
import { CommandPalette } from "@/components/app-shell/command-palette";
import { MobileNav } from "@/components/app-shell/mobile-nav";
import { Rail } from "@/components/app-shell/rail";
import { TopBar } from "@/components/app-shell/top-bar";
import { setActiveWorkspace } from "@/lib/active-workspace-actions";
import {
  appPathFromPathname,
  defaultPagePath,
  findPage,
} from "@/lib/navigation";
import type { SampleWorkspace } from "@/lib/sample-data";

const PANEL_STORAGE_KEY = "opencadence:panel-collapsed";

function readPanelCollapsed() {
  try {
    return window.localStorage.getItem(PANEL_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writePanelCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(PANEL_STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    return;
  }
}

type AppShellProps = {
  workspace: SampleWorkspace;
  workspaces: SampleWorkspace[];
  children: React.ReactNode;
};

export function AppShell({ workspace, workspaces, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [switching, startSwitch] = useTransition();
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const setPanel = useCallback((collapsed: boolean) => {
    setPanelCollapsed(collapsed);
    writePanelCollapsed(collapsed);
  }, []);

  const togglePanel = useCallback(() => {
    setPanelCollapsed((collapsed) => {
      writePanelCollapsed(!collapsed);
      return !collapsed;
    });
  }, []);

  const switchWorkspace = useCallback(
    (id: string) => {
      if (id === workspace.id) {
        return;
      }
      startSwitch(async () => {
        const result = await setActiveWorkspace(id);
        if (!result.ok) {
          toast("That workspace could not be opened", {
            description: "It may have been removed. Choose another workspace.",
          });
          return;
        }
        router.refresh();
      });
    },
    [router, workspace.id],
  );

  useEffect(() => {
    setPanelCollapsed(readPanelCollapsed());
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (key === "b") {
        const target = event.target;
        if (target instanceof HTMLElement && target.isContentEditable) {
          return;
        }
        event.preventDefault();
        togglePanel();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [togglePanel]);

  const current =
    findPage(appPathFromPathname(pathname)) ?? findPage(defaultPagePath);

  if (!current) {
    return <>{children}</>;
  }

  const { area, page } = current;

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-[13px] text-foreground leading-normal">
      <a
        href="#main-content"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-2 focus-visible:left-2 focus-visible:z-50 focus-visible:rounded-lg focus-visible:bg-card focus-visible:px-3 focus-visible:py-2 focus-visible:font-medium focus-visible:text-foreground focus-visible:shadow-md focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
      >
        Skip to main content
      </a>

      <Rail activeAreaId={area.id} />

      {panelCollapsed ? null : (
        <AreaPanel
          workspace={workspace}
          workspaces={workspaces}
          switching={switching}
          onSwitchWorkspace={switchWorkspace}
          area={area}
          activePath={page.path}
          onCollapse={() => setPanel(true)}
          onSearch={() => setPaletteOpen(true)}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        <TopBar
          workspace={workspace}
          workspaces={workspaces}
          switching={switching}
          onSwitchWorkspace={switchWorkspace}
          pageTitle={page.title}
          panelCollapsed={panelCollapsed}
          onExpandPanel={() => setPanel(false)}
          onOpenMobileNav={() => setMobileNavOpen(true)}
        />
        <main
          id="main-content"
          tabIndex={-1}
          className="flex w-full flex-1 flex-col px-4 pt-[26px] pb-10 outline-hidden md:px-7"
        >
          {children}
        </main>
      </div>

      <MobileNav
        workspace={workspace}
        workspaces={workspaces}
        switching={switching}
        onSwitchWorkspace={switchWorkspace}
        area={area}
        activePath={page.path}
        open={mobileNavOpen}
        onOpenChange={setMobileNavOpen}
        onSearch={() => setPaletteOpen(true)}
      />
      <CommandPalette
        workspace={workspace}
        workspaces={workspaces}
        onSwitchWorkspace={switchWorkspace}
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
      />
    </div>
  );
}
