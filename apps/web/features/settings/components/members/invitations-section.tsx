"use client";

import { Button } from "@workspace/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { cn } from "@workspace/ui/lib/utils";
import { Ellipsis, Link2, MailPlus, RotateCw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { buttonFocusRing } from "@/components/app-shell/page-header";
import { Spinner } from "@/components/spinner";
import { SettingsSection } from "@/features/settings/components/settings-section";
import {
  ConfirmDialog,
  cellClass,
  DateText,
  headClass,
  isPast,
  LoadFailed,
  Pill,
  roleLabels,
  rowClass,
} from "@/features/settings/components/workspace-parts";
import { attempt, authClient, describeAuthError } from "@/lib/auth-client";
import type {
  Workspace,
  WorkspaceInvitation,
  WorkspaceMember,
} from "@/lib/session";

type InvitationsSectionProps = {
  workspace: Workspace;
  canManage: boolean;
  members: WorkspaceMember[];
  invitations: WorkspaceInvitation[] | null;
};

export function InvitationsSection({
  workspace,
  canManage,
  members,
  invitations,
}: InvitationsSectionProps) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<WorkspaceInvitation | null>(
    null,
  );
  const [pending, startAction] = useTransition();

  function inviterName(inviterId: string) {
    const inviter = members.find((member) => member.userId === inviterId);
    return inviter ? inviter.name || inviter.email : "Former member";
  }

  async function copyLink(invitation: WorkspaceInvitation) {
    const link = `${window.location.origin}/accept-invitation/${invitation.id}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Invitation link copied", {
        description: `Only ${invitation.email} can accept it.`,
      });
    } catch {
      toast.error("Could not copy the link", {
        description: "Your browser blocked access to the clipboard.",
      });
    }
  }

  function resend(invitation: WorkspaceInvitation) {
    if (pending) {
      return;
    }
    setBusyId(invitation.id);
    startAction(async () => {
      const { error } = await attempt(() =>
        authClient.organization.inviteMember({
          email: invitation.email,
          role: invitation.role,
          organizationId: workspace.id,
          resend: true,
        }),
      );
      if (error) {
        setBusyId(null);
        toast.error(`Could not resend the invitation to ${invitation.email}`, {
          description: describeAuthError(
            error,
            error.status === 403
              ? "Your role does not allow sending invitations."
              : "Try again in a moment.",
          ),
        });
        return;
      }
      toast.success(`Invitation sent again to ${invitation.email}`, {
        description: "Its expiry date was extended.",
      });
      startAction(() => {
        router.refresh();
        setBusyId(null);
      });
    });
  }

  function confirmCancel() {
    const invitation = cancelling;
    if (!invitation) {
      return;
    }
    startAction(async () => {
      const { error } = await attempt(() =>
        authClient.organization.cancelInvitation({
          invitationId: invitation.id,
        }),
      );
      if (error) {
        toast.error(`Could not cancel the invitation to ${invitation.email}`, {
          description: describeAuthError(
            error,
            error.status === 403
              ? "Your role does not allow cancelling invitations."
              : "It may already have been accepted or cancelled. Reload the page to check.",
          ),
        });
        return;
      }
      toast.success(`Invitation to ${invitation.email} cancelled`);
      startAction(() => {
        router.refresh();
        setCancelling(null);
      });
    });
  }

  return (
    <SettingsSection
      flush
      title="Pending invitations"
      description="People who have been invited and have not joined yet. An invitation stops working once it expires or is cancelled."
    >
      {invitations === null ? (
        <div className="p-5">
          <LoadFailed
            title="Could not load the invitations."
            pending={pending}
            onRetry={() => startAction(() => router.refresh())}
          />
        </div>
      ) : invitations.length === 0 ? (
        <Empty className="px-6 py-10">
          <EmptyHeader>
            <EmptyMedia
              variant="icon"
              className="size-9 border border-border bg-card text-primary shadow-xs"
            >
              <MailPlus strokeWidth={1.6} aria-hidden />
            </EmptyMedia>
            <EmptyTitle className="font-semibold text-foreground text-sm">
              No pending invitations
            </EmptyTitle>
            <EmptyDescription className="text-[13px]">
              {canManage
                ? "Enter an email address under Invite people to add someone to this workspace."
                : "An owner or admin can invite people to this workspace."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table className="min-w-[640px] text-[13px]">
          <TableHeader className="[&_tr]:border-border-subtle">
            <TableRow className="hover:bg-transparent">
              <TableHead className={headClass}>Email</TableHead>
              <TableHead className={headClass}>Role</TableHead>
              <TableHead className={headClass}>Invited by</TableHead>
              <TableHead className={headClass}>Expires</TableHead>
              {canManage ? (
                <TableHead className={headClass}>
                  <span className="sr-only">Actions</span>
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {invitations.map((invitation) => {
              const expired = isPast(invitation.expiresAt);
              const busy = busyId === invitation.id;
              return (
                <TableRow key={invitation.id} className={rowClass}>
                  <TableCell
                    className={cn(
                      cellClass,
                      "max-w-64 truncate font-medium text-foreground",
                    )}
                  >
                    {invitation.email}
                  </TableCell>
                  <TableCell className={cellClass}>
                    {roleLabels[invitation.role]}
                  </TableCell>
                  <TableCell
                    className={cn(
                      cellClass,
                      "max-w-48 truncate text-muted-foreground",
                    )}
                  >
                    {inviterName(invitation.inviterId)}
                  </TableCell>
                  <TableCell className={cn(cellClass, "text-muted-foreground")}>
                    {expired ? (
                      <Pill tone="danger">Expired</Pill>
                    ) : (
                      <DateText
                        value={invitation.expiresAt}
                        fallback="Unknown"
                      />
                    )}
                  </TableCell>
                  {canManage ? (
                    <TableCell className={cn(cellClass, "text-right")}>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          disabled={pending}
                          aria-label={`Actions for the invitation to ${invitation.email}`}
                          aria-busy={busy || undefined}
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className={cn(
                                "-mr-1.5 text-muted-foreground hover:bg-accent",
                                buttonFocusRing,
                              )}
                            />
                          }
                        >
                          {busy ? (
                            <Spinner />
                          ) : (
                            <Ellipsis aria-hidden strokeWidth={1.6} />
                          )}
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="w-52 p-1 text-[13px]"
                        >
                          <DropdownMenuItem
                            className="rounded-lg px-2 py-1.5 text-[13px]"
                            onClick={() => resend(invitation)}
                          >
                            <RotateCw aria-hidden strokeWidth={1.6} />
                            Resend invitation
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="rounded-lg px-2 py-1.5 text-[13px]"
                            onClick={() => copyLink(invitation)}
                          >
                            <Link2 aria-hidden strokeWidth={1.6} />
                            Copy invitation link
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            className="rounded-lg px-2 py-1.5 text-[13px]"
                            onClick={() => setCancelling(invitation)}
                          >
                            <X aria-hidden strokeWidth={1.6} />
                            Cancel invitation
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <ConfirmDialog
        open={cancelling !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCancelling(null);
          }
        }}
        title="Cancel this invitation?"
        description={
          <>
            The link sent to{" "}
            <span className="font-medium text-foreground">
              {cancelling?.email}
            </span>{" "}
            stops working. You can invite them again later.
          </>
        }
        confirmLabel="Cancel invitation"
        pending={pending && cancelling !== null}
        onConfirm={confirmCancel}
      />
    </SettingsSection>
  );
}
