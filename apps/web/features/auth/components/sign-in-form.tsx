"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/spinner";
import {
  AuthHeader,
  errorClass,
  GoogleButton,
  inputClass,
  isEmail,
  labelClass,
  linkClass,
  PasswordInput,
  primaryButtonClass,
} from "@/features/auth/components/form-parts";
import { VerifyEmailPanel } from "@/features/auth/components/verify-email-panel";
import { attempt, authClient, describeAuthError } from "@/lib/auth-client";

type Errors = { email?: string; password?: string };

function validateEmail(value: string) {
  if (value.trim() === "") {
    return "Enter your email address.";
  }
  if (!isEmail(value)) {
    return "Enter an email address in the format name@company.com.";
  }
  return undefined;
}

function validatePassword(value: string) {
  if (value === "") {
    return "Enter your password.";
  }
  return undefined;
}

function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);
  const [unverified, setUnverified] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    const next: Errors = {
      email: validateEmail(email),
      password: validatePassword(password),
    };
    setErrors(next);
    if (next.email) {
      document.getElementById("sign-in-email")?.focus();
      return;
    }
    if (next.password) {
      document.getElementById("sign-in-password")?.focus();
      return;
    }

    setPending(true);
    const { error } = await attempt(() =>
      authClient.signIn.email({ email: email.trim(), password }),
    );
    if (!error) {
      router.push("/app");
      router.refresh();
      return;
    }
    setPending(false);
    if (error.status === 403 || error.code === "EMAIL_NOT_VERIFIED") {
      setUnverified(true);
      return;
    }
    if (error.status === 401 || error.code === "INVALID_EMAIL_OR_PASSWORD") {
      setErrors({
        password:
          "That email and password do not match. Check both and try again.",
      });
      document.getElementById("sign-in-password")?.focus();
      return;
    }
    toast.error("Could not sign you in", {
      description: describeAuthError(error, "Try again in a moment."),
    });
  }

  if (unverified) {
    return (
      <VerifyEmailPanel
        email={email.trim()}
        title="Verify your email to sign in"
        description={
          <>
            <span className="font-medium text-foreground">{email.trim()}</span>{" "}
            has not been verified yet. Open the link we emailed you, or send a
            new one.
          </>
        }
        onBack={() => setUnverified(false)}
      />
    );
  }

  return (
    <form noValidate onSubmit={handleSubmit}>
      <AuthHeader
        title="Sign in"
        description="Use the email address for your OpenCadence account."
      />
      <FieldGroup className="gap-4">
        <Field data-invalid={errors.email ? true : undefined}>
          <FieldLabel htmlFor="sign-in-email" className={labelClass}>
            Email
          </FieldLabel>
          <Input
            id="sign-in-email"
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
              if (errors.email) {
                setErrors((current) => ({
                  ...current,
                  email: validateEmail(event.target.value),
                }));
              }
            }}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? "sign-in-email-error" : undefined}
            className={inputClass}
          />
          {errors.email ? (
            <FieldError id="sign-in-email-error" className={errorClass}>
              {errors.email}
            </FieldError>
          ) : null}
        </Field>

        <Field data-invalid={errors.password ? true : undefined}>
          <FieldLabel htmlFor="sign-in-password" className={labelClass}>
            Password
          </FieldLabel>
          <PasswordInput
            id="sign-in-password"
            name="password"
            autoComplete="current-password"
            value={password}
            onValueChange={(value) => {
              setPassword(value);
              if (errors.password) {
                setErrors((current) => ({
                  ...current,
                  password: validatePassword(value),
                }));
              }
            }}
            invalid={Boolean(errors.password)}
            describedBy={errors.password ? "sign-in-password-error" : undefined}
          />
          {errors.password ? (
            <FieldError id="sign-in-password-error" className={errorClass}>
              {errors.password}
            </FieldError>
          ) : null}
          <p className="text-[13px]">
            <Link href="/forgot-password" className={linkClass}>
              Forgot password?
            </Link>
          </p>
        </Field>
      </FieldGroup>

      <div className="mt-5 flex flex-col gap-4">
        <Button
          type="submit"
          className={primaryButtonClass}
          disabled={pending}
          aria-busy={pending || undefined}
        >
          {pending ? <Spinner /> : null}
          Sign in
        </Button>
        <FieldSeparator className="my-0 text-[13px]">or</FieldSeparator>
        <GoogleButton disabled={pending} />
      </div>

      <p className="mt-6 text-[13px] text-muted-foreground">
        New to OpenCadence?{" "}
        <Link href="/sign-up" className={linkClass}>
          Create an account
        </Link>
      </p>
    </form>
  );
}

export { SignInForm };
