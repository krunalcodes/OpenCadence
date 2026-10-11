import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell/page-header";
import { MembersSettings } from "@/features/settings/components/members/members-settings";
import { WorkspaceUnavailable } from "@/features/settings/components/workspace-unavailable";
import {
  getActiveWorkspace,
  getWorkspaceInvitations,
  getWorkspaceMembers,
  getWorkspaceRole,
  getWorkspaces,
  requireSession,
} from "@/lib/session";

export const metadata: Metadata = {
  title: "Members · OpenCadence",
};

export default async function MembersSettingsPage() {
  const session = await requireSession();
  const [workspace, workspaces] = await Promise.all([
    getActiveWorkspace(),
    getWorkspaces(),
  ]);
  const [role, members, invitations] = workspace
    ? await Promise.all([
        getWorkspaceRole(workspace.id),
        getWorkspaceMembers(workspace.id),
        getWorkspaceInvitations(workspace.id),
      ])
    : [null, null, null];

  return (
    <>
      <PageHeader
        title="Members"
        description="Who has access to this workspace, and who has been invited."
      />
      {workspace && role ? (
        <MembersSettings
          workspace={workspace}
          viewer={{ userId: session.user.id, role }}
          members={members}
          invitations={invitations}
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
