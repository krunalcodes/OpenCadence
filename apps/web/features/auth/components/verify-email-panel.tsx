"use client";

import { Button } from "@workspace/ui/components/button";
import { MailCheck } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/spinner";
import {
  AuthHeader,
  linkClass,
  secondaryButtonClass,
} from "@/features/auth/components/form-parts";
import { attempt, authClient, describeAuthError } from "@/lib/auth-client";

function InboxPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <span
        aria-hidden="true"
        className="mb-5 grid size-10 place-items-center rounded-[10px] bg-info-surface text-info"
      >
        <MailCheck strokeWidth={1.6} className="size-5" />
      </span>
      <AuthHeader title={title} description={description} />
      {children}
    </div>
  );
}

function VerifyEmailPanel({
  email,
  title,
  description,
  onBack,
}: {
  email: string;
  title: string;
  description: ReactNode;
  onBack: () => void;
}) {
  const [pending, setPending] = useState(false);

  async function resend() {
    setPending(true);
    const { error } = await attempt(() =>
      authClient.sendVerificationEmail({ email }),
    );
    setPending(false);
    if (error) {
      toast.error("Could not send the verification email", {
        description: describeAuthError(error, "Try again in a moment."),
      });
      return;
    }
    toast.success("Verification email sent", {
      description: `Check the inbox for ${email}.`,
    });
  }

  return (
    <InboxPanel title={title} description={description}>
      <Button
        type="button"
        variant="outline"
        className={secondaryButtonClass}
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={resend}
      >
        {pending ? <Spinner /> : null}
        Resend verification email
      </Button>
      <p className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
        <button type="button" onClick={onBack} className={linkClass}>
          Use a different email
        </button>
        <Link href="/sign-in" className={linkClass}>
          Back to sign in
        </Link>
      </p>
    </InboxPanel>
  );
}

export { InboxPanel, VerifyEmailPanel };
