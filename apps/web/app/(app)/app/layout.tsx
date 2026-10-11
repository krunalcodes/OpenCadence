import { AppShell } from "@/components/app-shell/app-shell";
import { FirstWorkspace } from "@/components/app-shell/first-workspace";
import { initialsOf } from "@/lib/initials";
import {
  getActiveWorkspace,
  getWorkspaces,
  requireSession,
} from "@/lib/session";
import { getWarmupSummary } from "@/lib/warmup-summary";

type AppLayoutProps = {
  children: React.ReactNode;
};

export default async function AppLayout({ children }: AppLayoutProps) {
  const session = await requireSession();
  const [workspaces, workspace, warmup] = await Promise.all([
    getWorkspaces(),
    getActiveWorkspace(),
    getWarmupSummary(),
  ]);
  const user = {
    name: session.user.name || session.user.email,
    email: session.user.email,
    initials: initialsOf(session.user.name, session.user.email),
  };

  if (!workspace) {
    return <FirstWorkspace user={user} />;
  }

  return (
    <AppShell
      user={user}
      workspace={workspace}
      workspaces={workspaces}
      activeWorkspaceId={session.session.activeOrganizationId ?? null}
      viewCounts={{ "warming-up": warmup?.warming }}
      warmup={warmup}
    >
      {children}
    </AppShell>
  );
}
