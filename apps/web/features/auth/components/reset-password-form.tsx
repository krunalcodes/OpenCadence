"use client";

import { Button } from "@workspace/ui/components/button";
import { Field, FieldError, FieldLabel } from "@workspace/ui/components/field";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/spinner";
import {
  AuthHeader,
  errorClass,
  labelClass,
  linkClass,
  PasswordInput,
  PasswordRequirement,
  primaryButtonClass,
  validateNewPassword,
} from "@/features/auth/components/form-parts";
import {
  attempt,
  authClient,
  breachedPasswordCode,
  breachedPasswordMessage,
  describeAuthError,
} from "@/lib/auth-client";

function ResetPasswordForm({
  token,
  linkInvalid,
  signedIn = false,
}: {
  token: string | null;
  linkInvalid: boolean;
  signedIn?: boolean;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [expired, setExpired] = useState(linkInvalid || !token);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !token) {
      return;
    }
    const invalid = validateNewPassword(password);
    setError(invalid);
    if (invalid) {
      document.getElementById("reset-password-new")?.focus();
      return;
    }

    setPending(true);
    const result = await attempt(() =>
      authClient.resetPassword({ newPassword: password, token }),
    );
    if (!result.error) {
      toast.success("Password updated", {
        description: signedIn
          ? "Use it the next time you sign in."
          : "Sign in with your new password.",
      });
      router.push(signedIn ? "/app/settings/security" : "/sign-in");
      router.refresh();
      return;
    }
    setPending(false);
    switch (result.error.code) {
      case "INVALID_TOKEN":
        setExpired(true);
        return;
      case breachedPasswordCode:
        setError(breachedPasswordMessage);
        document.getElementById("reset-password-new")?.focus();
        return;
      case "PASSWORD_TOO_SHORT":
        setError("That password is too short. Add more characters.");
        return;
      case "PASSWORD_TOO_LONG":
        setError("That password is too long. Use a shorter one.");
        return;
      default:
        toast.error("Could not update your password", {
          description: describeAuthError(
            result.error,
            "Try again in a moment.",
          ),
        });
    }
  }

  if (expired) {
    return (
      <div>
        <AuthHeader
          title="This reset link has expired"
          description="Reset links work once and for a limited time. Request a new one and use it straight away."
        />
        <Button
          className={primaryButtonClass}
          nativeButton={false}
          render={<Link href="/forgot-password" />}
        >
          Request a new link
        </Button>
        <p className="mt-6 text-[13px]">
          <Link href="/sign-in" className={linkClass}>
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={handleSubmit}>
      <AuthHeader
        title="Set a new password"
        description="Choose a password you do not use anywhere else."
      />
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor="reset-password-new" className={labelClass}>
          New password
        </FieldLabel>
        <PasswordInput
          id="reset-password-new"
          name="password"
          autoComplete="new-password"
          value={password}
          onValueChange={(value) => {
            setPassword(value);
            if (error) {
              setError(validateNewPassword(value));
            }
          }}
          invalid={Boolean(error)}
          describedBy={
            error ? "reset-password-new-error" : "reset-password-new-hint"
          }
        />
        {error ? (
          <FieldError id="reset-password-new-error" className={errorClass}>
            {error}
          </FieldError>
        ) : (
          <PasswordRequirement id="reset-password-new-hint" value={password} />
        )}
      </Field>

      <Button
        type="submit"
        className={`mt-5 ${primaryButtonClass}`}
        disabled={pending}
        aria-busy={pending || undefined}
      >
        {pending ? <Spinner /> : null}
        Update password
      </Button>

      <p className="mt-6 text-[13px]">
        <Link href="/sign-in" className={linkClass}>
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

export { ResetPasswordForm };
