import { ActionEmailLayout } from "../components/layout";

const roleLabels: Record<string, string> = {
  owner: "an owner",
  admin: "an admin",
  member: "a member",
};

function describeRole(role: string) {
  const roles = role
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const known = ["owner", "admin", "member"].find((value) =>
    roles.includes(value),
  );
  return roleLabels[known ?? "member"];
}

function singleLine(value: string) {
  return Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? " " : character;
  })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

export const workspaceInvitationCopy = {
  lang: "en",
  wordmark: "OpenCadence",
  subject: (workspaceName: string) =>
    `Join ${singleLine(workspaceName) || "a workspace"} on OpenCadence`,
  preview: (inviterName: string, workspaceName: string) =>
    `${singleLine(inviterName) || "Someone"} invited you to ${singleLine(workspaceName) || "a workspace"}.`,
  heading: "You have been invited to a workspace",
  greeting: "Hi,",
  intro: (inviterName: string, workspaceName: string, role: string) =>
    `${singleLine(inviterName) || "Someone"} invited you to join the ${singleLine(workspaceName) || "OpenCadence"} workspace on OpenCadence as ${describeRole(role)}.`,
  actionLabel: "Accept invitation",
  fallbackLabel:
    "If the button does not work, copy this link into your browser:",
  expiryNote: (expiresIn: string) => `This invitation expires in ${expiresIn}.`,
  ignoreNote:
    "If you do not know the person who invited you, you can ignore this email and nothing will change.",
  footer:
    "OpenCadence sent this email because someone invited this address to a workspace.",
  defaultExpiresIn: "7 days",
};

export type WorkspaceInvitationProps = {
  inviterName: string;
  workspaceName: string;
  role: string;
  url: string;
  expiresIn?: string;
};

export function WorkspaceInvitation({
  inviterName,
  workspaceName,
  role,
  url,
  expiresIn = workspaceInvitationCopy.defaultExpiresIn,
}: WorkspaceInvitationProps) {
  return (
    <ActionEmailLayout
      lang={workspaceInvitationCopy.lang}
      wordmark={workspaceInvitationCopy.wordmark}
      preview={workspaceInvitationCopy.preview(inviterName, workspaceName)}
      heading={workspaceInvitationCopy.heading}
      greeting={workspaceInvitationCopy.greeting}
      intro={workspaceInvitationCopy.intro(inviterName, workspaceName, role)}
      actionLabel={workspaceInvitationCopy.actionLabel}
      actionUrl={url}
      fallbackLabel={workspaceInvitationCopy.fallbackLabel}
      expiryNote={workspaceInvitationCopy.expiryNote(expiresIn)}
      ignoreNote={workspaceInvitationCopy.ignoreNote}
      footer={workspaceInvitationCopy.footer}
    />
  );
}

WorkspaceInvitation.PreviewProps = {
  inviterName: "Maya Okafor",
  workspaceName: "Northwind",
  role: "admin",
  url: "http://localhost:3000/accept-invitation/00000000-0000-4000-8000-000000000000",
} satisfies WorkspaceInvitationProps;

export default WorkspaceInvitation;
