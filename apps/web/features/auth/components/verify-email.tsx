"use client";

import { Button } from "@workspace/ui/components/button";
import { Field, FieldError, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
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
import {
  type AuthError,
  attempt,
  authClient,
  describeAuthError,
} from "@/lib/auth-client";
import { takePendingRedirect } from "@/lib/redirect";

const verifications = new Map<string, Promise<AuthError | null>>();

function verifyOnce(token: string) {
  const running = verifications.get(token);
  if (running) {
    return running;
  }
  const started = attempt(() =>
    authClient.verifyEmail({ query: { token } }),
  ).then((result) => result.error);
  verifications.set(token, started);
  return started;
}

function validateEmail(value: string) {
  if (value.trim() === "") {
    return "Enter the email address you signed up with.";
  }
  if (!isEmail(value)) {
    return "Enter an email address in the format name@company.com.";
  }
  return undefined;
}

function RequestNewLink({ unreachable }: { unreachable: boolean }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    const invalid = validateEmail(email);
    setError(invalid);
    if (invalid) {
      document.getElementById("verify-email-address")?.focus();
      return;
    }

    const address = email.trim();
    setPending(true);
    const result = await attempt(() =>
      authClient.sendVerificationEmail({ email: address }),
    );
    setPending(false);
    if (result.error) {
      toast.error("Could not send the verification email", {
        description: describeAuthError(result.error, "Try again in a moment."),
      });
      return;
    }
    toast.success("Verification email sent", {
      description: `If ${address} still needs verifying, a new link is on its way.`,
    });
  }

  return (
    <form noValidate onSubmit={handleSubmit}>
      <AuthHeader
        title={
          unreachable
            ? "We could not verify your email"
            : "This verification link has expired"
        }
        description={
          unreachable
            ? "The server did not respond. Reload this page to try the link again, or send yourself a new one."
            : "Verification links work once and for a limited time. Enter your email and we will send a new one."
        }
      />
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor="verify-email-address" className={labelClass}>
          Email
        </FieldLabel>
        <Input
          id="verify-email-address"
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
          aria-describedby={error ? "verify-email-address-error" : undefined}
          className={inputClass}
        />
        {error ? (
          <FieldError id="verify-email-address-error" className={errorClass}>
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
        Send a new link
      </Button>

      <p className="mt-6 text-[13px] text-muted-foreground">
        Already verified?{" "}
        <Link href="/sign-in" className={linkClass}>
          Sign in
        </Link>
      </p>
    </form>
  );
}

type Status = "verifying" | "invalid" | "unreachable";

function VerifyEmail({
  token,
  redirect,
}: {
  token: string | null;
  redirect: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(token ? "verifying" : "invalid");

  useEffect(() => {
    if (!token) {
      return;
    }
    let active = true;
    verifyOnce(token).then((error) => {
      if (!active) {
        return;
      }
      if (!error) {
        router.replace(redirect ?? takePendingRedirect() ?? "/app");
        router.refresh();
        return;
      }
      setStatus(
        error.status === 0 || error.status >= 500 ? "unreachable" : "invalid",
      );
    });
    return () => {
      active = false;
    };
  }, [token, redirect, router]);

  if (status === "verifying") {
    return (
      <div role="status" aria-live="polite">
        <Spinner className="mb-5 size-6 text-primary" />
        <AuthHeader
          title="Verifying your email"
          description="This takes a moment. You will be taken to your workspace next."
        />
      </div>
    );
  }

  return <RequestNewLink unreachable={status === "unreachable"} />;
}

export { VerifyEmail };
