"use client";

import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { CreateWorkspaceForm } from "@/components/app-shell/create-workspace-dialog";
import { buttonFocusRing } from "@/components/app-shell/page-header";
import type { ShellUser } from "@/components/app-shell/rail";
import { Spinner } from "@/components/spinner";
import { attempt, authClient, describeAuthError } from "@/lib/auth-client";

export function FirstWorkspace({ user }: { user: ShellUser }) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    const { error } = await attempt(() => authClient.signOut());
    if (error) {
      setSigningOut(false);
      toast.error("Could not sign you out", {
        description: describeAuthError(error, "Try again in a moment."),
      });
      return;
    }
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-10 text-[13px] text-foreground leading-normal">
      <div className="w-full max-w-[400px]">
        <div className="rounded-[12px] border border-border bg-card p-5 shadow-xs">
          <h1 className="font-semibold text-[15px] tracking-[-0.01em]">
            Create your first workspace
          </h1>
          <p className="mt-1 mb-5 text-muted-foreground">
            You are not a member of any workspace yet. A workspace keeps its own
            contacts, mailboxes and sends.
          </p>
          <CreateWorkspaceForm />
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 text-muted-foreground">
          <span className="min-w-0 truncate">Signed in as {user.email}</span>
          <Button
            type="button"
            variant="ghost"
            disabled={signingOut}
            aria-busy={signingOut || undefined}
            onClick={signOut}
            className={cn("shrink-0 text-[13px]", buttonFocusRing)}
          >
            {signingOut ? (
              <Spinner />
            ) : (
              <LogOut strokeWidth={1.6} aria-hidden />
            )}
            Sign out
          </Button>
        </div>
      </div>
    </main>
  );
}
