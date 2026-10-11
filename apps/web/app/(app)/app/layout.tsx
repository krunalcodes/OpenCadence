import { AppShell } from "@/components/app-shell/app-shell";
import { getActiveWorkspace } from "@/lib/active-workspace";
import { sampleWorkspaces } from "@/lib/sample-data";

type AppLayoutProps = {
  children: React.ReactNode;
};

export default async function AppLayout({ children }: AppLayoutProps) {
  const workspace = await getActiveWorkspace();

  return (
    <AppShell workspace={workspace} workspaces={sampleWorkspaces}>
      {children}
    </AppShell>
  );
}
