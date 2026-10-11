import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell/page-header";
import { WorkspaceSettings } from "@/features/settings/components/workspace/workspace-settings";
import { WorkspaceUnavailable } from "@/features/settings/components/workspace-unavailable";
import {
  getActiveWorkspace,
  getWorkspaceRole,
  getWorkspaces,
  requireSession,
} from "@/lib/session";

export const metadata: Metadata = {
  title: "Workspace settings · OpenCadence",
};

export default async function WorkspaceSettingsPage() {
  await requireSession();
  const [workspace, workspaces] = await Promise.all([
    getActiveWorkspace(),
    getWorkspaces(),
  ]);
  const role = workspace ? await getWorkspaceRole(workspace.id) : null;

  return (
    <>
      <PageHeader
        title="Workspace"
        description="The name and identifier of the workspace you are working in."
      />
      {workspace && role ? (
        <WorkspaceSettings
          workspace={workspace}
          role={role}
          otherWorkspaces={workspaces.filter(
            (item) => item.id !== workspace.id,
          )}
        />
      ) : (
        <WorkspaceUnavailable />
      )}
    </>
  );
}
