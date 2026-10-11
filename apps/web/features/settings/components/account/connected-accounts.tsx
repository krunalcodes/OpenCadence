"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { KeyRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/spinner";
import { GoogleIcon, linkClass } from "@/features/auth/components/form-parts";
import {
  dangerButton,
  dialogActions,
  dialogContent,
  dialogTitle,
  SettingsBadge,
  SettingsRow,
  secondaryButton,
  sessionExpiredCodes,
} from "@/features/settings/components/settings-parts";
import { attempt, authClient, describeAuthError } from "@/lib/auth-client";
import { appHref } from "@/lib/navigation";

export type GoogleConnection = {
  id: string;
  connectedOn: string | null;
};

type ConnectedAccountsProps = {
  google: GoogleConnection | null;
  hasPassword: boolean;
  canDisconnect: boolean;
};

export function ConnectedAccounts({
  google,
  hasPassword,
  canDisconnect,
}: ConnectedAccountsProps) {
  const router = useRouter();
  const [connecting, setConnecting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [disconnecting, startDisconnect] = useTransition();

  async function connect() {
    setConnecting(true);
    const { error } = await attempt(() =>
      authClient.linkSocial({
        provider: "google",
        callbackURL: "/app/settings/account",
      }),
    );
    if (error) {
      setConnecting(false);
      toast.error("Could not connect Google", {
        description: describeAuthError(
          error,
          error.code === "PROVIDER_NOT_FOUND" || error.status === 404
            ? "Google sign-in is not set up on this server."
            : "Try again in a moment.",
        ),
      });
    }
  }

  function disconnect() {
    if (!google || disconnecting) {
      return;
    }
    startDisconnect(async () => {
      const { error } = await attempt(() =>
        authClient.unlinkAccount({ accountId: google.id }),
      );
      if (error) {
        toast.error("Could not disconnect Google", {
          description: describeAuthError(
            error,
            sessionExpiredCodes.has(error.code ?? "")
              ? "For your security, sign out and sign in again, then disconnect Google."
              : error.code === "FAILED_TO_UNLINK_LAST_ACCOUNT"
                ? "Google is your only way to sign in. Set a password first."
                : "Try again in a moment.",
          ),
        });
        return;
      }
      toast.success("Google disconnected", {
        description: "You can no longer sign in with Google.",
      });
      startDisconnect(() => {
        router.refresh();
        setConfirmOpen(false);
      });
    });
  }

  return (
    <>
      <SettingsRow
        icon={<GoogleIcon />}
        title={
          <>
            Google
            {google ? (
              <SettingsBadge tone="success">Connected</SettingsBadge>
            ) : null}
          </>
        }
        detail={
          google ? (
            canDisconnect ? (
              google.connectedOn ? (
                `Connected on ${google.connectedOn}. You can sign in with Google.`
              ) : (
                "You can sign in with Google."
              )
            ) : (
              <>
                Google is your only way to sign in.{" "}
                <Link href={appHref("settings/security")} className={linkClass}>
                  Set a password
                </Link>{" "}
                before you disconnect it.
              </>
            )
          ) : (
            "Connect Google to sign in without your password."
          )
        }
        action={
          google ? (
            <Button
              type="button"
              variant="outline"
              disabled={!canDisconnect}
              onClick={() => setConfirmOpen(true)}
              className={secondaryButton}
            >
              Disconnect
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={connecting}
              aria-busy={connecting || undefined}
              onClick={connect}
              className={secondaryButton}
            >
              {connecting ? <Spinner /> : null}
              Connect Google
            </Button>
          )
        }
      />
      <SettingsRow
        icon={<KeyRound className="size-4" strokeWidth={1.6} />}
        title={
          <>
            Email and password
            {hasPassword ? (
              <SettingsBadge tone="success">Password set</SettingsBadge>
            ) : (
              <SettingsBadge tone="neutral">No password</SettingsBadge>
            )}
          </>
        }
        detail={
          hasPassword
            ? "You can sign in with your email address and password."
            : "Set a password to sign in without Google."
        }
        action={
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={appHref("settings/security")} />}
            className={secondaryButton}
          >
            {hasPassword ? "Change password" : "Set a password"}
          </Button>
        }
      />

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!disconnecting) {
            setConfirmOpen(open);
          }
        }}
      >
        <DialogContent className={dialogContent}>
          <DialogHeader>
            <DialogTitle className={dialogTitle}>
              Disconnect Google?
            </DialogTitle>
            <DialogDescription className="text-[13px]">
              You will no longer be able to sign in with Google. You can still
              sign in with your email address and password, and you can connect
              Google again later.
            </DialogDescription>
          </DialogHeader>
          <div className={dialogActions}>
            <Button
              type="button"
              variant="outline"
              disabled={disconnecting}
              onClick={() => setConfirmOpen(false)}
              className={secondaryButton}
            >
              Keep connected
            </Button>
            <Button
              type="button"
              disabled={disconnecting}
              aria-busy={disconnecting || undefined}
              onClick={disconnect}
              className={dangerButton}
            >
              {disconnecting ? <Spinner /> : null}
              Disconnect Google
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
