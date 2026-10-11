"use client";

import {
  InvitationPanel,
  LinkButton,
} from "@/features/auth/components/invitation-parts";
import { withRedirect } from "@/lib/redirect";

function InvitationSignedOut({ invitationId }: { invitationId: string }) {
  const path = `/accept-invitation/${invitationId}`;

  return (
    <InvitationPanel
      title="You have been invited to a workspace"
      description="Sign in to see who invited you and to accept. Use the email address the invitation was sent to. If you do not have an OpenCadence account yet, create one with that address."
    >
      <div className="flex flex-col gap-3">
        <LinkButton href={withRedirect("/sign-in", path)}>Sign in</LinkButton>
        <LinkButton href={withRedirect("/sign-up", path)} variant="secondary">
          Create an account
        </LinkButton>
      </div>
      <p className="mt-6 text-[13px] text-muted-foreground">
        You will come back to this invitation after you sign in.
      </p>
    </InvitationPanel>
  );
}

export { InvitationSignedOut };
