"use client";

import { Button } from "@workspace/ui/components/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/spinner";
import {
  primaryButtonClass,
  secondaryButtonClass,
} from "@/features/auth/components/form-parts";
import {
  InvitationPanel,
  LinkButton,
  linkClass,
  PanelLinks,
  Strong,
} from "@/features/auth/components/invitation-parts";
import { attempt, authClient, describeAuthError } from "@/lib/auth-client";
import { withRedirect } from "@/lib/redirect";
import type { InvitationLookup } from "@/lib/session";

const roleLabels = { owner: "Owner", admin: "Admin", member: "Member" };

const roleArticles = {
  owner: "an owner",
  admin: "an admin",
  member: "a member",
};

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "long" });

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : dateFormat.format(date);
}

type InvitationViewProps = {
  invitationId: string;
  email: string;
  lookup: InvitationLookup | { state: "not-found" };
};

type Outcome = "declined" | "gone" | null;

function InvitationView({ invitationId, email, lookup }: InvitationViewProps) {
  const router = useRouter();
  const [action, setAction] = useState<"accept" | "decline" | "switch" | null>(
    null,
  );
  const [outcome, setOutcome] = useState<Outcome>(null);
  const busy = action !== null;

  const dashboardLink = (
    <PanelLinks>
      <Link href="/app/dashboard" className={linkClass}>
        Go to your dashboard
      </Link>
    </PanelLinks>
  );

  async function switchAccount() {
    setAction("switch");
    const { error } = await attempt(() => authClient.signOut());
    if (error) {
      setAction(null);
      toast.error("Could not sign you out", {
        description: describeAuthError(error, "Try again in a moment."),
      });
      return;
    }
    router.push(withRedirect("/sign-in", `/accept-invitation/${invitationId}`));
    router.refresh();
  }

  async function openWorkspace(workspaceId: string) {
    setAction("accept");
    const { error } = await attempt(() =>
      authClient.organization.setActive({ organizationId: workspaceId }),
    );
    if (error) {
      setAction(null);
      toast.error("That workspace could not be opened", {
        description: describeAuthError(
          error,
          "Choose it from the workspace switcher on your dashboard.",
        ),
      });
      return;
    }
    router.push("/app/dashboard");
    router.refresh();
  }

  async function accept(workspaceId: string, workspaceName: string) {
    setAction("accept");
    const { error } = await attempt(() =>
      authClient.organization.acceptInvitation({ invitationId }),
    );
    if (error) {
      setAction(null);
      if (error.code === "INVITATION_NOT_FOUND") {
        setOutcome("gone");
        return;
      }
      toast.error(`Could not join ${workspaceName}`, {
        description: describeAuthError(
          error,
          error.code === "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED"
            ? "The workspace has reached its member limit. Ask the person who invited you to make room."
            : error.code === "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION"
              ? "This invitation was sent to a different email address."
              : "Try again in a moment.",
        ),
      });
      return;
    }
    await attempt(() =>
      authClient.organization.setActive({ organizationId: workspaceId }),
    );
    toast.success(`You joined ${workspaceName}`);
    router.push("/app/dashboard");
    router.refresh();
  }

  async function decline(workspaceName: string) {
    setAction("decline");
    const { error } = await attempt(() =>
      authClient.organization.rejectInvitation({ invitationId }),
    );
    setAction(null);
    if (error) {
      if (error.code === "INVITATION_NOT_FOUND") {
        setOutcome("gone");
        return;
      }
      toast.error(`Could not decline the invitation to ${workspaceName}`, {
        description: describeAuthError(error, "Try again in a moment."),
      });
      return;
    }
    setOutcome("declined");
  }

  if (outcome === "declined" || lookup.state === "declined") {
    return (
      <InvitationPanel
        tone="success"
        title="Invitation declined"
        description={
          <>
            You did not join
            {lookup.state === "pending" || lookup.state === "declined" ? (
              <>
                {" "}
                <Strong>
                  {lookup.state === "pending"
                    ? lookup.invitation.workspaceName
                    : lookup.workspaceName}
                </Strong>
              </>
            ) : (
              " the workspace"
            )}
            . If you change your mind, ask the person who invited you to send a
            new invitation.
          </>
        }
      >
        {dashboardLink}
      </InvitationPanel>
    );
  }

  if (outcome === "gone" || lookup.state === "unavailable") {
    return (
      <InvitationPanel
        tone="warning"
        title="This invitation is no longer available"
        description={
          <>
            It may have been cancelled, already used or declined, or the link
            may be incomplete. You are signed in as <Strong>{email}</Strong>.
            Ask the person who invited you to send a new invitation to that
            address.
          </>
        }
      >
        {dashboardLink}
      </InvitationPanel>
    );
  }

  switch (lookup.state) {
    case "pending": {
      const { invitation } = lookup;
      const expires = formatDate(invitation.expiresAt);
      return (
        <InvitationPanel
          title={`Join ${invitation.workspaceName}`}
          description={
            <>
              <Strong>{invitation.inviterEmail}</Strong> invited you to join
              this workspace as {roleArticles[invitation.role]}.
            </>
          }
        >
          <dl className="mb-6 divide-y divide-border-subtle rounded-[12px] border border-border bg-card text-[13px] shadow-xs">
            {[
              ["Workspace", invitation.workspaceName],
              ["Invited by", invitation.inviterEmail],
              ["Your role", roleLabels[invitation.role]],
              ["Signed in as", email],
              ...(expires ? [["Expires", expires]] : []),
            ].map(([term, detail]) => (
              <div key={term} className="flex gap-3 px-3.5 py-2.5">
                <dt className="w-24 shrink-0 text-muted-foreground">{term}</dt>
                <dd
                  className="min-w-0 flex-1 break-words font-medium text-foreground"
                  suppressHydrationWarning
                >
                  {detail}
                </dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-col gap-3">
            <Button
              type="button"
              className={primaryButtonClass}
              disabled={busy}
              aria-busy={action === "accept" || undefined}
              onClick={() =>
                accept(invitation.workspaceId, invitation.workspaceName)
              }
            >
              {action === "accept" ? <Spinner /> : null}
              Accept and join
            </Button>
            <Button
              type="button"
              variant="outline"
              className={secondaryButtonClass}
              disabled={busy}
              aria-busy={action === "decline" || undefined}
              onClick={() => decline(invitation.workspaceName)}
            >
              {action === "decline" ? <Spinner /> : null}
              Decline
            </Button>
          </div>
        </InvitationPanel>
      );
    }
    case "accepted":
      return (
        <InvitationPanel
          tone="success"
          title={`You are already in ${lookup.workspaceName}`}
          description="This invitation has been accepted, so there is nothing more to do here."
        >
          <Button
            type="button"
            className={primaryButtonClass}
            disabled={busy}
            aria-busy={busy || undefined}
            onClick={() => openWorkspace(lookup.workspaceId)}
          >
            {busy ? <Spinner /> : null}
            Open {lookup.workspaceName}
          </Button>
        </InvitationPanel>
      );
    case "expired":
      return (
        <InvitationPanel
          tone="warning"
          title="This invitation has expired"
          description={
            <>
              The invitation
              {lookup.workspaceName ? (
                <>
                  {" "}
                  to <Strong>{lookup.workspaceName}</Strong>
                </>
              ) : null}{" "}
              was not accepted in time. Ask an owner or admin of the workspace
              to send it again to <Strong>{email}</Strong>.
            </>
          }
        >
          {dashboardLink}
        </InvitationPanel>
      );
    case "cancelled":
      return (
        <InvitationPanel
          tone="warning"
          title="This invitation was cancelled"
          description={
            <>
              Someone at <Strong>{lookup.workspaceName}</Strong> cancelled this
              invitation, so the link no longer works.
            </>
          }
        >
          {dashboardLink}
        </InvitationPanel>
      );
    case "wrong-account":
      return (
        <InvitationPanel
          tone="warning"
          title="This invitation is for a different account"
          description={
            <>
              You are signed in as <Strong>{email}</Strong>, but the invitation
              was sent to another email address. Sign in with the address that
              received it.
            </>
          }
        >
          <Button
            type="button"
            className={primaryButtonClass}
            disabled={busy}
            aria-busy={busy || undefined}
            onClick={switchAccount}
          >
            {busy ? <Spinner /> : null}
            Sign out and use another account
          </Button>
          {dashboardLink}
        </InvitationPanel>
      );
    case "unverified":
      return (
        <InvitationPanel
          tone="warning"
          title="Verify your email to see this invitation"
          description={
            <>
              <Strong>{email}</Strong> has not been verified yet. Open the
              verification link we emailed you, then come back to this page.
            </>
          }
        >
          <Button
            type="button"
            variant="outline"
            className={secondaryButtonClass}
            onClick={() => router.refresh()}
          >
            I have verified my email
          </Button>
        </InvitationPanel>
      );
    case "not-found":
      return (
        <InvitationPanel
          tone="warning"
          title="We could not find this invitation"
          description="The link looks incomplete. Open the link from the invitation email again, or copy the whole address into your browser."
        >
          {dashboardLink}
        </InvitationPanel>
      );
    default:
      return (
        <InvitationPanel
          tone="warning"
          title="Could not load the invitation"
          description="The server did not answer. Check your connection and try again."
        >
          <LinkButton
            href={`/accept-invitation/${invitationId}`}
            variant="secondary"
          >
            Try again
          </LinkButton>
        </InvitationPanel>
      );
  }
}

export { InvitationView };
