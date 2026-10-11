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
import { KeyRound } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import {
  errorClass,
  FormNotice,
  inputClass,
  isEmail,
  labelClass,
  linkClass,
  PasswordInput,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/features/auth/components/form-parts";

type Errors = { email?: string; password?: string };

type Notice = "sign-in" | "sso" | null;

const notices = {
  "sign-in": "Sign-in is not connected yet.",
  sso: "Single sign-on is not connected yet.",
} as const;

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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState<Notice>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: Errors = {
      email: validateEmail(email),
      password: validatePassword(password),
    };
    setErrors(next);
    if (next.email) {
      setNotice(null);
      document.getElementById("sign-in-email")?.focus();
      return;
    }
    if (next.password) {
      setNotice(null);
      document.getElementById("sign-in-password")?.focus();
      return;
    }
    setNotice("sign-in");
  }

  return (
    <form noValidate onSubmit={handleSubmit}>
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
              setNotice(null);
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
              setNotice(null);
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
            <Link href="#" className={linkClass}>
              Forgot password?
            </Link>
          </p>
        </Field>
      </FieldGroup>

      <FormNotice
        title={notice ? notices[notice] : null}
        detail="Nothing was sent or saved."
      />

      <div className="mt-5 flex flex-col gap-4">
        <Button type="submit" className={primaryButtonClass}>
          Sign in
        </Button>
        <FieldSeparator className="my-0 text-[13px]">or</FieldSeparator>
        <Button
          type="button"
          variant="outline"
          className={secondaryButtonClass}
          onClick={() => {
            setErrors({});
            setNotice("sso");
          }}
        >
          <KeyRound aria-hidden="true" strokeWidth={1.6} />
          Continue with single sign-on
        </Button>
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
