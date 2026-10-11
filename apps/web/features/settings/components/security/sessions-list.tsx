"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { CircleHelp, Monitor, Smartphone, Tablet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/spinner";
import {
  dangerButton,
  dialogActions,
  dialogContent,
  dialogTitle,
  SettingsBadge,
  secondaryButton,
} from "@/features/settings/components/settings-parts";
import { attempt, authClient, describeAuthError } from "@/lib/auth-client";
import type { DeviceKind } from "@/lib/user-agent";

export type SessionRow = {
  id: string;
  token: string;
  device: string;
  kind: DeviceKind;
  ipAddress: string | null;
  lastActive: string | null;
  signedIn: string | null;
  current: boolean;
};

const deviceIcons = {
  desktop: Monitor,
  phone: Smartphone,
  tablet: Tablet,
  unknown: CircleHelp,
};

const headClass =
  "h-9 bg-muted/40 px-5 font-medium text-muted-foreground text-xs";
const cellClass = "px-5 py-2.5 align-middle";

export function SessionsList({ sessions }: { sessions: SessionRow[] }) {
  const router = useRouter();
  const [revoking, setRevoking] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [revokingAll, startRevokeAll] = useTransition();
  const [, startRefresh] = useTransition();
  const others = sessions.filter((session) => !session.current);

  async function revoke(session: SessionRow) {
    if (revoking) {
      return;
    }
    setRevoking(session.id);
    const { error } = await attempt(() =>
      authClient.revokeSession({ token: session.token }),
    );
    if (error) {
      setRevoking(null);
      toast.error(`Could not sign out ${session.device}`, {
        description: describeAuthError(error, "Try again in a moment."),
      });
      return;
    }
    toast.success(`Signed out ${session.device}`);
    startRefresh(() => {
      router.refresh();
      setRevoking(null);
    });
  }

  function revokeOthers() {
    if (revokingAll) {
      return;
    }
    startRevokeAll(async () => {
      const { error } = await attempt(() => authClient.revokeOtherSessions());
      if (error) {
        toast.error("Could not sign out your other devices", {
          description: describeAuthError(error, "Try again in a moment."),
        });
        return;
      }
      toast.success("Signed out of all other devices");
      startRevokeAll(() => {
        router.refresh();
        setConfirmOpen(false);
      });
    });
  }

  return (
    <>
      <Table className="text-[13px]">
        <TableHeader className="[&_tr]:border-border-subtle">
          <TableRow className="hover:bg-transparent">
            <TableHead className={headClass}>Device</TableHead>
            <TableHead className={`${headClass} hidden sm:table-cell`}>
              IP address
            </TableHead>
            <TableHead className={`${headClass} hidden sm:table-cell`}>
              Last active
            </TableHead>
            <TableHead className={`${headClass} text-right`}>
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.map((session) => {
            const Icon = deviceIcons[session.kind];
            const busy = revoking === session.id;
            return (
              <TableRow
                key={session.id}
                className="border-border-subtle hover:bg-muted/50"
              >
                <TableCell className={cellClass}>
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-card text-muted-foreground shadow-xs"
                    >
                      <Icon className="size-4" strokeWidth={1.6} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-foreground">
                        {session.device}
                        {session.current ? (
                          <SettingsBadge tone="success">
                            This device
                          </SettingsBadge>
                        ) : null}
                      </div>
                      <div className="mt-0.5 text-ink-tertiary text-xs">
                        {session.signedIn
                          ? `Signed in ${session.signedIn}`
                          : "Sign-in date unknown"}
                        <span className="sm:hidden">
                          {session.lastActive
                            ? `, active ${session.lastActive.toLowerCase()}`
                            : ""}
                          {session.ipAddress ? `, ${session.ipAddress}` : ""}
                        </span>
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell
                  className={`${cellClass} hidden font-mono text-[12.5px] text-muted-foreground tabular-nums sm:table-cell`}
                >
                  {session.ipAddress ?? (
                    <span className="font-sans text-ink-tertiary">
                      Not recorded
                    </span>
                  )}
                </TableCell>
                <TableCell
                  className={`${cellClass} hidden text-muted-foreground tabular-nums sm:table-cell`}
                >
                  {session.lastActive ?? "Unknown"}
                </TableCell>
                <TableCell className={`${cellClass} text-right`}>
                  {session.current ? null : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={revoking !== null}
                      aria-busy={busy || undefined}
                      aria-label={`Sign out ${session.device}`}
                      onClick={() => revoke(session)}
                      className={secondaryButton}
                    >
                      {busy ? <Spinner className="size-3.5" /> : null}
                      Sign out
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div className="flex flex-wrap items-center justify-between gap-3 border-border-subtle border-t bg-muted/40 px-5 py-3 text-muted-foreground">
        <span>
          {others.length === 0
            ? "You are only signed in on this device."
            : `You are signed in on ${others.length} other ${
                others.length === 1 ? "device" : "devices"
              }.`}
        </span>
        <Button
          type="button"
          variant="outline"
          disabled={others.length === 0}
          onClick={() => setConfirmOpen(true)}
          className={secondaryButton}
        >
          Sign out of all other devices
        </Button>
      </div>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!revokingAll) {
            setConfirmOpen(open);
          }
        }}
      >
        <DialogContent className={dialogContent}>
          <DialogHeader>
            <DialogTitle className={dialogTitle}>
              Sign out of all other devices?
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-normal">
              {`This signs out ${others.length} other ${
                others.length === 1 ? "device" : "devices"
              }. They need your password to sign in again. This device stays signed in.`}
            </DialogDescription>
          </DialogHeader>
          <div className={dialogActions}>
            <Button
              type="button"
              variant="outline"
              disabled={revokingAll}
              onClick={() => setConfirmOpen(false)}
              className={secondaryButton}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={revokingAll}
              aria-busy={revokingAll || undefined}
              onClick={revokeOthers}
              className={dangerButton}
            >
              {revokingAll ? <Spinner /> : null}
              Sign out other devices
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
