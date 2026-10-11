"use client";

import { Button } from "@workspace/ui/components/button";
import { Field, FieldError, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/spinner";
import {
  AuthHeader,
  errorClass,
  inputClass,
  isEmail,
  labelClass,
  linkClass,
  primaryButtonClass,
} from "@/features/auth/components/form-parts";
import { InboxPanel } from "@/features/auth/components/verify-email-panel";
import { attempt, authClient, describeAuthError } from "@/lib/auth-client";

function validateEmail(value: string) {
  if (value.trim() === "") {
    return "Enter the email address for your account.";
  }
  if (!isEmail(value)) {
    return "Enter an email address in the format name@company.com.";
  }
  return undefined;
}

function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    const invalid = validateEmail(email);
    setError(invalid);
    if (invalid) {
      document.getElementById("forgot-password-email")?.focus();
      return;
    }

    const address = email.trim();
    setPending(true);
    const result = await attempt(() =>
      authClient.requestPasswordReset({
        email: address,
        redirectTo: "/reset-password",
      }),
    );
    setPending(false);
    if (
      result.error &&
      (result.error.status === 0 ||
        result.error.status === 429 ||
        result.error.status >= 500)
    ) {
      toast.error("Could not send the reset link", {
        description: describeAuthError(result.error, "Try again in a moment."),
      });
      return;
    }
    setSentTo(address);
  }

  if (sentTo) {
    return (
      <InboxPanel
        title="Check your inbox"
        description={
          <>
            If an account exists for{" "}
            <span className="font-medium text-foreground">{sentTo}</span>, we
            sent a link to reset its password. The link works for a limited
            time.
          </>
        }
      >
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
          <button
            type="button"
            onClick={() => setSentTo(null)}
            className={linkClass}
          >
            Use a different email
          </button>
          <Link href="/sign-in" className={linkClass}>
            Back to sign in
          </Link>
        </p>
      </InboxPanel>
    );
  }

  return (
    <form noValidate onSubmit={handleSubmit}>
      <AuthHeader
        title="Reset your password"
        description="Enter your account email and we will send a link to set a new password."
      />
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor="forgot-password-email" className={labelClass}>
          Email
        </FieldLabel>
        <Input
          id="forgot-password-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (error) {
              setError(validateEmail(event.target.value));
            }
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "forgot-password-email-error" : undefined}
          className={inputClass}
        />
        {error ? (
          <FieldError id="forgot-password-email-error" className={errorClass}>
            {error}
          </FieldError>
        ) : null}
      </Field>

      <Button
        type="submit"
        className={`mt-5 ${primaryButtonClass}`}
        disabled={pending}
        aria-busy={pending || undefined}
      >
        {pending ? <Spinner /> : null}
        Send reset link
      </Button>

      <p className="mt-6 text-[13px] text-muted-foreground">
        Remembered it?{" "}
        <Link href="/sign-in" className={linkClass}>
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

export { ForgotPasswordForm };
