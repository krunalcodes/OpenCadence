"use client";

import { InvitationsSection } from "@/features/settings/components/members/invitations-section";
import { InviteSection } from "@/features/settings/components/members/invite-section";
import { MembersSection } from "@/features/settings/components/members/members-section";
import { SettingsStack } from "@/features/settings/components/settings-section";
import type {
  Workspace,
  WorkspaceInvitation,
  WorkspaceMember,
  WorkspaceRole,
} from "@/lib/session";

type MembersSettingsProps = {
  workspace: Workspace;
  viewer: { userId: string; role: WorkspaceRole };
  members: WorkspaceMember[] | null;
  invitations: WorkspaceInvitation[] | null;
  otherWorkspaces: Workspace[];
};

export function MembersSettings({
  workspace,
  viewer,
  members,
  invitations,
  otherWorkspaces,
}: MembersSettingsProps) {
  const canManage = viewer.role === "owner" || viewer.role === "admin";
  const pending =
    invitations?.filter((invitation) => invitation.status === "pending") ??
    null;

  return (
    <SettingsStack>
      {canManage ? (
        <InviteSection
          workspace={workspace}
          viewerRole={viewer.role}
          members={members ?? []}
          invitations={pending ?? []}
        />
      ) : null}
      <MembersSection
        workspace={workspace}
        viewer={viewer}
        members={members}
        otherWorkspaces={otherWorkspaces}
      />
      <InvitationsSection
        workspace={workspace}
        canManage={canManage}
        members={members ?? []}
        invitations={pending}
      />
    </SettingsStack>
  );
}
