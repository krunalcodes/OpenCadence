"use client";

import { Button } from "@workspace/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { cn } from "@workspace/ui/lib/utils";
import { ChevronDown, LogOut } from "lucide-react";
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
  dangerOutlineButtonClass,
  headClass,
  LoadFailed,
  roleLabels,
  roleSummaries,
  rowClass,
} from "@/features/settings/components/workspace-parts";
import { attempt, authClient, describeAuthError } from "@/lib/auth-client";
import { initialsOf } from "@/lib/initials";
import type { Workspace, WorkspaceMember, WorkspaceRole } from "@/lib/session";

const roleOrder: WorkspaceRole[] = ["owner", "admin", "member"];

function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return roleOrder.some((role) => role === value);
}

type MembersSectionProps = {
  workspace: Workspace;
  viewer: { userId: string; role: WorkspaceRole };
  members: WorkspaceMember[] | null;
  otherWorkspaces: Workspace[];
};

export function MembersSection({
  workspace,
  viewer,
  members,
  otherWorkspaces,
}: MembersSectionProps) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<WorkspaceMember | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [pending, startAction] = useTransition();

  const canManage = viewer.role === "owner" || viewer.role === "admin";
  const ownerCount =
    members?.filter((member) => member.role === "owner").length ?? 0;
  const soleOwner = viewer.role === "owner" && ownerCount <= 1;
  const assignable: WorkspaceRole[] =
    viewer.role === "owner" ? roleOrder : ["admin", "member"];

  function canChangeRole(member: WorkspaceMember) {
    if (viewer.role === "owner") {
      return !(member.userId === viewer.userId && soleOwner);
    }
    return viewer.role === "admin" && member.role !== "owner";
  }

  function canRemove(member: WorkspaceMember) {
    if (member.userId === viewer.userId) {
      return false;
    }
    return (
      viewer.role === "owner" ||
      (viewer.role === "admin" && member.role !== "owner")
    );
  }

  function changeRole(member: WorkspaceMember, role: WorkspaceRole) {
    if (role === member.role || pending) {
      return;
    }
    const label = member.name || member.email;
    setBusyId(member.id);
    startAction(async () => {
      const { error } = await attempt(() =>
        authClient.organization.updateMemberRole({
          memberId: member.id,
          role,
          organizationId: workspace.id,
        }),
      );
      if (error) {
        setBusyId(null);
        toast.error(`Could not change the role of ${label}`, {
          description: describeAuthError(
            error,
            error.code === "YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER"
              ? "A workspace needs at least one owner. Make someone else an owner first."
              : error.status === 403
                ? "Your role does not allow this change."
                : "Try again in a moment.",
          ),
        });
        return;
      }
      toast.success(`${label} is now ${roleLabels[role].toLowerCase()}`);
      startAction(() => {
        router.refresh();
        setBusyId(null);
      });
    });
  }

  function confirmRemove() {
    const member = removing;
    if (!member) {
      return;
    }
    const label = member.name || member.email;
    startAction(async () => {
      const { error } = await attempt(() =>
        authClient.organization.removeMember({
          memberIdOrEmail: member.id,
          organizationId: workspace.id,
        }),
      );
      if (error) {
        toast.error(`Could not remove ${label}`, {
          description: describeAuthError(
            error,
            error.code === "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER"
              ? "A workspace needs at least one owner."
              : error.status === 401 || error.status === 403
                ? "Your role does not allow removing this member."
                : "Try again in a moment.",
          ),
        });
        return;
      }
      toast.success(`${label} was removed from ${workspace.name}`);
      startAction(() => {
        router.refresh();
        setRemoving(null);
      });
    });
  }

  function confirmLeave() {
    startAction(async () => {
      const { error } = await attempt(() =>
        authClient.organization.leave({ organizationId: workspace.id }),
      );
      if (error) {
        toast.error(`Could not leave ${workspace.name}`, {
          description: describeAuthError(
            error,
            error.code === "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER"
              ? "You are the only owner. Make someone else an owner first."
              : "Try again in a moment.",
          ),
        });
        return;
      }
      const next = otherWorkspaces[0];
      if (next) {
        await attempt(() =>
          authClient.organization.setActive({ organizationId: next.id }),
        );
      }
      toast.success(`You left ${workspace.name}`);
      startAction(() => {
        router.push("/app/dashboard");
        router.refresh();
      });
    });
  }

  const leaveNote = soleOwner
    ? "You are the only owner, so you cannot leave. Make another member an owner first, or delete the workspace from Workspace settings."
    : `Leaving removes your access to ${workspace.name}. You need a new invitation to come back.`;

  return (
    <SettingsSection
      flush
      title="Members"
      description={
        canManage
          ? "Everyone with access to this workspace. Owners can change any role. Admins can manage admins and members."
          : "Everyone with access to this workspace. Owners and admins manage roles and invitations."
      }
      footer={
        <>
          <span id="leave-workspace-note" className="min-w-0 flex-1 basis-64">
            {leaveNote}
          </span>
          <Button
            type="button"
            variant="outline"
            disabled={soleOwner || members === null}
            aria-describedby="leave-workspace-note"
            onClick={() => setLeaveOpen(true)}
            className={dangerOutlineButtonClass}
          >
            <LogOut aria-hidden strokeWidth={1.6} />
            Leave workspace
          </Button>
        </>
      }
    >
      {members === null ? (
        <div className="p-5">
          <LoadFailed
            title="Could not load the members."
            pending={pending}
            onRetry={() => startAction(() => router.refresh())}
          />
        </div>
      ) : (
        <Table className="min-w-[640px] text-[13px]">
          <TableHeader className="[&_tr]:border-border-subtle">
            <TableRow className="hover:bg-transparent">
              <TableHead className={headClass}>Name</TableHead>
              <TableHead className={headClass}>Email</TableHead>
              <TableHead className={headClass}>Role</TableHead>
              <TableHead className={headClass}>Joined</TableHead>
              {canManage ? (
                <TableHead className={headClass}>
                  <span className="sr-only">Actions</span>
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => {
              const isSelf = member.userId === viewer.userId;
              const busy = busyId === member.id;
              const label = member.name || member.email;
              return (
                <TableRow key={member.id} className={rowClass}>
                  <TableCell className={cn(cellClass, "max-w-60")}>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        aria-hidden
                        className="grid size-7 shrink-0 place-items-center rounded-full border border-border bg-muted font-semibold text-[10.5px] text-muted-foreground"
                      >
                        {initialsOf(member.name, member.email)}
                      </span>
                      <span className="min-w-0 truncate font-medium text-foreground">
                        {label}
                      </span>
                      {isSelf ? (
                        <span className="shrink-0 text-ink-tertiary text-xs">
                          You
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell
                    className={cn(
                      cellClass,
                      "max-w-64 truncate text-muted-foreground",
                    )}
                  >
                    {member.email}
                  </TableCell>
                  <TableCell className={cellClass}>
                    {canChangeRole(member) ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          disabled={pending}
                          aria-label={`Role of ${label}: ${roleLabels[member.role]}. Change role`}
                          aria-busy={busy || undefined}
                          render={
                            <Button
                              variant="outline"
                              size="sm"
                              className={cn(
                                "-ml-2.5 h-7 gap-1.5 bg-card px-2.5 text-[13px] shadow-xs hover:bg-muted",
                                buttonFocusRing,
                              )}
                            />
                          }
                        >
                          {roleLabels[member.role]}
                          {busy ? (
                            <Spinner className="size-3.5 text-ink-tertiary" />
                          ) : (
                            <ChevronDown
                              aria-hidden
                              strokeWidth={1.6}
                              className="size-3.5 text-ink-tertiary"
                            />
                          )}
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="start"
                          className="w-72 p-1 text-[13px]"
                        >
                          <DropdownMenuRadioGroup
                            value={member.role}
                            onValueChange={(value) => {
                              if (isWorkspaceRole(value)) {
                                changeRole(member, value);
                              }
                            }}
                          >
                            {assignable.map((role) => (
                              <DropdownMenuRadioItem
                                key={role}
                                value={role}
                                className="items-start rounded-lg py-1.5 pl-2"
                              >
                                <span className="flex min-w-0 flex-col">
                                  <span className="font-medium text-[13px]">
                                    {roleLabels[role]}
                                  </span>
                                  <span className="text-muted-foreground text-xs leading-snug">
                                    {roleSummaries[role]}
                                  </span>
                                </span>
                              </DropdownMenuRadioItem>
                            ))}
                          </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <span className="text-foreground">
                        {roleLabels[member.role]}
                        {canManage && isSelf && soleOwner ? (
                          <span className="ml-2 text-ink-tertiary text-xs">
                            Only owner
                          </span>
                        ) : null}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className={cn(cellClass, "text-muted-foreground")}>
                    <DateText value={member.createdAt} fallback="Unknown" />
                  </TableCell>
                  {canManage ? (
                    <TableCell className={cn(cellClass, "text-right")}>
                      {canRemove(member) ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          aria-label={`Remove ${label}`}
                          onClick={() => setRemoving(member)}
                          className={cn(
                            "-mr-2 h-7 px-2 text-[13px] text-muted-foreground hover:bg-danger-surface hover:text-danger",
                            buttonFocusRing,
                          )}
                        >
                          Remove
                        </Button>
                      ) : null}
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRemoving(null);
          }
        }}
        title={`Remove ${removing?.name || removing?.email || "this member"}?`}
        description={
          <>
            <span className="font-medium text-foreground">
              {removing?.email}
            </span>{" "}
            loses access to {workspace.name} immediately. You can invite them
            again later.
          </>
        }
        confirmLabel="Remove member"
        pending={pending && removing !== null}
        onConfirm={confirmRemove}
      />

      <ConfirmDialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        title={`Leave ${workspace.name}?`}
        description={
          otherWorkspaces[0]
            ? `You lose access to this workspace immediately and will be moved to ${otherWorkspaces[0].name}. An owner or admin has to invite you again if you want to come back.`
            : "You lose access to this workspace immediately. It is your only workspace, so you will be asked to create a new one. An owner or admin has to invite you again if you want to come back."
        }
        confirmLabel="Leave workspace"
        pending={pending && leaveOpen}
        onConfirm={confirmLeave}
      />
    </SettingsSection>
  );
}
