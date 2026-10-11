"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/spinner";
import { SettingsSection } from "@/features/settings/components/settings-section";
import {
  errorClass,
  hintClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  roleLabels,
  roleSummaries,
  SegmentedControl,
} from "@/features/settings/components/workspace-parts";
import { attempt, authClient, describeAuthError } from "@/lib/auth-client";
import type {
  Workspace,
  WorkspaceInvitation,
  WorkspaceMember,
  WorkspaceRole,
} from "@/lib/session";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type InviteSectionProps = {
  workspace: Workspace;
  viewerRole: WorkspaceRole;
  members: WorkspaceMember[];
  invitations: WorkspaceInvitation[];
};

export function InviteSection({
  workspace,
  viewerRole,
  members,
  invitations,
}: InviteSectionProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("member");
  const [error, setError] = useState<string>();
  const [pending, startInvite] = useTransition();

  const roles: WorkspaceRole[] =
    viewerRole === "owner" ? ["member", "admin", "owner"] : ["member", "admin"];

  function validate(value: string) {
    const address = value.trim().toLowerCase();
    if (address === "") {
      return "Enter the email address of the person to invite.";
    }
    if (!emailPattern.test(address)) {
      return "Enter an email address in the format name@company.com.";
    }
    if (members.some((member) => member.email.toLowerCase() === address)) {
      return `${address} is already a member of ${workspace.name}.`;
    }
    if (
      invitations.some(
        (invitation) => invitation.email.toLowerCase() === address,
      )
    ) {
      return `${address} already has a pending invitation. Resend it from the list below.`;
    }
    return undefined;
  }

  function fail(message: string) {
    setError(message);
    document.getElementById("invite-email")?.focus();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    const invalid = validate(email);
    if (invalid) {
      fail(invalid);
      return;
    }
    setError(undefined);
    const address = email.trim().toLowerCase();

    startInvite(async () => {
      const { error: failure } = await attempt(() =>
        authClient.organization.inviteMember({
          email: address,
          role,
          organizationId: workspace.id,
        }),
      );
      if (failure) {
        switch (failure.code) {
          case "USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION":
            fail(`${address} is already a member of ${workspace.name}.`);
            return;
          case "USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION":
            fail(
              `${address} already has a pending invitation. Resend it from the list below.`,
            );
            return;
          case "INVALID_EMAIL":
            fail("Enter an email address in the format name@company.com.");
            return;
          case "INVITATION_LIMIT_REACHED":
            fail(
              "This workspace has reached its limit of pending invitations. Cancel one you no longer need, then try again.",
            );
            return;
          case "YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE":
            fail(
              "Only an owner can invite another owner. Choose a different role.",
            );
            return;
          default:
            toast.error("Could not send the invitation", {
              description: describeAuthError(
                failure,
                failure.status === 403
                  ? "Your role no longer allows inviting people to this workspace."
                  : "Try again in a moment.",
              ),
            });
            return;
        }
      }
      setEmail("");
      toast.success(`Invitation sent to ${address}`, {
        description: `They can join ${workspace.name} as ${roleLabels[role].toLowerCase()} from the link in the email.`,
      });
      startInvite(() => router.refresh());
    });
  }

  return (
    <SettingsSection
      title="Invite people"
      description="Send an email invitation to join this workspace. The person accepts it with an account that uses the same email address."
    >
      <form
        noValidate
        onSubmit={handleSubmit}
        className="flex flex-wrap items-end gap-x-3 gap-y-3"
      >
        <Field
          data-invalid={error ? true : undefined}
          className="min-w-0 flex-1 basis-64"
        >
          <FieldLabel htmlFor="invite-email" className={labelClass}>
            Email address
          </FieldLabel>
          <Input
            id="invite-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            required
            placeholder="name@company.com"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (error) {
                setError(undefined);
              }
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "invite-email-error" : undefined}
            className={inputClass}
          />
        </Field>

        <Field className="w-auto shrink-0">
          <span className={`${labelClass} font-medium leading-snug`}>Role</span>
          <SegmentedControl
            label="Role"
            value={role}
            onValueChange={setRole}
            disabled={pending}
            options={roles.map((value) => ({
              value,
              label: roleLabels[value],
            }))}
          />
        </Field>

        <Button
          type="submit"
          disabled={pending}
          aria-busy={pending || undefined}
          className={primaryButtonClass}
        >
          {pending ? <Spinner /> : <Send aria-hidden strokeWidth={1.6} />}
          Send invitation
        </Button>

        {error ? (
          <FieldError
            id="invite-email-error"
            className={`${errorClass} basis-full`}
          >
            {error}
          </FieldError>
        ) : null}

        <FieldDescription className={`${hintClass} basis-full`}>
          <span className="font-medium text-foreground">
            {roleLabels[role]}:
          </span>{" "}
          {roleSummaries[role]}
        </FieldDescription>
      </form>
    </SettingsSection>
  );
}
