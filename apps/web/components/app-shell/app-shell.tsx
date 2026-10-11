"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { AreaPanel } from "@/components/app-shell/area-panel";
import { CommandPalette } from "@/components/app-shell/command-palette";
import { CreateWorkspaceDialog } from "@/components/app-shell/create-workspace-dialog";
import { MobileNav } from "@/components/app-shell/mobile-nav";
import { Rail, type ShellUser } from "@/components/app-shell/rail";
import { TopBar } from "@/components/app-shell/top-bar";
import { attempt, authClient, describeAuthError } from "@/lib/auth-client";
import {
  appPathFromPathname,
  defaultPagePath,
  findActivePage,
  findPage,
  isNestedPage,
} from "@/lib/navigation";
import type { Workspace } from "@/lib/session";

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
  user: ShellUser;
  workspace: Workspace;
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  children: React.ReactNode;
};

export function AppShell({
  user,
  workspace,
  workspaces,
  activeWorkspaceId,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [switching, startSwitch] = useTransition();
  const [signingOut, setSigningOut] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const syncedWorkspaceId = useRef<string | null>(null);
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
        const { error } = await attempt(() =>
          authClient.organization.setActive({ organizationId: id }),
        );
        if (error) {
          toast.error("That workspace could not be opened", {
            description: describeAuthError(
              error,
              "It may have been removed, or you may no longer be a member. Choose another workspace.",
            ),
          });
          return;
        }
        startSwitch(() => router.refresh());
      });
    },
    [router, workspace.id],
  );

  const signOut = useCallback(async () => {
    setSigningOut(true);
    const { error } = await attempt(() => authClient.signOut());
    if (error) {
      setSigningOut(false);
      toast.error("Could not sign you out", {
        description: describeAuthError(error, "Try again in a moment."),
      });
      return;
    }
    router.push("/sign-in");
    router.refresh();
  }, [router]);

  const openCreateWorkspace = useCallback(() => setCreateOpen(true), []);

  useEffect(() => {
    if (
      activeWorkspaceId === workspace.id ||
      syncedWorkspaceId.current === workspace.id
    ) {
      return;
    }
    syncedWorkspaceId.current = workspace.id;
    attempt(() =>
      authClient.organization.setActive({ organizationId: workspace.id }),
    );
  }, [activeWorkspaceId, workspace.id]);

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
    findActivePage(appPathFromPathname(pathname)) ?? findPage(defaultPagePath);

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

      <Rail
        activeAreaId={area.id}
        user={user}
        signingOut={signingOut}
        onSignOut={signOut}
      />

      {panelCollapsed ? null : (
        <AreaPanel
          workspace={workspace}
          workspaces={workspaces}
          switching={switching}
          onSwitchWorkspace={switchWorkspace}
          onCreateWorkspace={openCreateWorkspace}
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
          onCreateWorkspace={openCreateWorkspace}
          pageTitle={page.title}
          areaTitle={isNestedPage(page) ? area.title : undefined}
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
        onCreateWorkspace={openCreateWorkspace}
        user={user}
        signingOut={signingOut}
        onSignOut={signOut}
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
      <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
