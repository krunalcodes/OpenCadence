"use client";

import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import Link from "next/link";
import { type FormEvent, useRef, useState } from "react";
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
  PasswordRequirement,
  primaryButtonClass,
  validateNewPassword,
} from "@/features/auth/components/form-parts";
import { VerifyEmailPanel } from "@/features/auth/components/verify-email-panel";
import { attempt, authClient, describeAuthError } from "@/lib/auth-client";

type Values = {
  name: string;
  email: string;
  password: string;
  terms: boolean;
};

type FieldName = keyof Values;

type Errors = Partial<Record<FieldName, string>>;

const fieldOrder: FieldName[] = ["name", "email", "password", "terms"];

function validate(field: FieldName, values: Values) {
  switch (field) {
    case "name":
      return values.name.trim() === "" ? "Enter your full name." : undefined;
    case "email":
      if (values.email.trim() === "") {
        return "Enter your work email address.";
      }
      return isEmail(values.email)
        ? undefined
        : "Enter an email address in the format name@company.com.";
    case "password":
      return validateNewPassword(values.password);
    case "terms":
      return values.terms
        ? undefined
        : "Tick the box to agree to the terms and privacy policy.";
  }
}

function SignUpForm() {
  const [values, setValues] = useState<Values>({
    name: "",
    email: "",
    password: "",
    terms: false,
  });
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const termsRef = useRef<HTMLElement>(null);

  function update<K extends FieldName>(field: K, value: Values[K]) {
    const next = { ...values, [field]: value };
    setValues(next);
    if (errors[field]) {
      setErrors((current) => ({ ...current, [field]: validate(field, next) }));
    }
  }

  function focusField(field: FieldName) {
    if (field === "terms") {
      termsRef.current?.focus();
      return;
    }
    document.getElementById(`sign-up-${field}`)?.focus();
  }

  function showFieldError(field: FieldName, message: string) {
    setErrors({ [field]: message });
    focusField(field);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    const next: Errors = {};
    for (const field of fieldOrder) {
      next[field] = validate(field, values);
    }
    setErrors(next);
    const firstInvalid = fieldOrder.find((field) => next[field]);
    if (firstInvalid) {
      focusField(firstInvalid);
      return;
    }

    const email = values.email.trim();
    setPending(true);
    const { error } = await attempt(() =>
      authClient.signUp.email({
        name: values.name.trim(),
        email,
        password: values.password,
      }),
    );
    setPending(false);
    if (!error) {
      setSentTo(email);
      return;
    }
    switch (error.code) {
      case "USER_ALREADY_EXISTS":
      case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
        showFieldError(
          "email",
          "An account with this email already exists. Sign in, or use another address.",
        );
        return;
      case "INVALID_EMAIL":
        showFieldError(
          "email",
          "Enter an email address in the format name@company.com.",
        );
        return;
      case "PASSWORD_TOO_SHORT":
        showFieldError(
          "password",
          "That password is too short. Add more characters.",
        );
        return;
      case "PASSWORD_TOO_LONG":
        showFieldError(
          "password",
          "That password is too long. Use a shorter one.",
        );
        return;
      default:
        toast.error("Could not create your account", {
          description: describeAuthError(error, "Try again in a moment."),
        });
    }
  }

  if (sentTo) {
    return (
      <VerifyEmailPanel
        email={sentTo}
        title="Check your inbox"
        description={
          <>
            We sent a verification link to{" "}
            <span className="font-medium text-foreground">{sentTo}</span>. Open
            it to finish setting up your account.
          </>
        }
        onBack={() => setSentTo(null)}
      />
    );
  }

  return (
    <form noValidate onSubmit={handleSubmit}>
      <AuthHeader
        title="Create your account"
        description="Add your details to get started. Your first workspace is created for you."
      />
      <FieldGroup className="gap-4">
        <Field data-invalid={errors.name ? true : undefined}>
          <FieldLabel htmlFor="sign-up-name" className={labelClass}>
            Full name
          </FieldLabel>
          <Input
            id="sign-up-name"
            name="name"
            type="text"
            autoComplete="name"
            required
            value={values.name}
            onChange={(event) => update("name", event.target.value)}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? "sign-up-name-error" : undefined}
            className={inputClass}
          />
          {errors.name ? (
            <FieldError id="sign-up-name-error" className={errorClass}>
              {errors.name}
            </FieldError>
          ) : null}
        </Field>

        <Field data-invalid={errors.email ? true : undefined}>
          <FieldLabel htmlFor="sign-up-email" className={labelClass}>
            Work email
          </FieldLabel>
          <Input
            id="sign-up-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={values.email}
            onChange={(event) => update("email", event.target.value)}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? "sign-up-email-error" : undefined}
            className={inputClass}
          />
          {errors.email ? (
            <FieldError id="sign-up-email-error" className={errorClass}>
              {errors.email}
            </FieldError>
          ) : null}
        </Field>

        <Field data-invalid={errors.password ? true : undefined}>
          <FieldLabel htmlFor="sign-up-password" className={labelClass}>
            Password
          </FieldLabel>
          <PasswordInput
            id="sign-up-password"
            name="password"
            autoComplete="new-password"
            value={values.password}
            onValueChange={(value) => update("password", value)}
            invalid={Boolean(errors.password)}
            describedBy={
              errors.password
                ? "sign-up-password-error"
                : "sign-up-password-hint"
            }
          />
          {errors.password ? (
            <FieldError id="sign-up-password-error" className={errorClass}>
              {errors.password}
            </FieldError>
          ) : (
            <PasswordRequirement
              id="sign-up-password-hint"
              value={values.password}
            />
          )}
        </Field>

        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-2.5">
            <Checkbox
              ref={termsRef}
              id="sign-up-terms"
              name="terms"
              required
              checked={values.terms}
              onCheckedChange={(checked) => update("terms", checked)}
              aria-invalid={errors.terms ? true : undefined}
              aria-describedby={
                errors.terms ? "sign-up-terms-error" : undefined
              }
              className="mt-0.5 bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            />
            <label
              htmlFor="sign-up-terms"
              className="text-[13px] text-foreground leading-normal"
            >
              I agree to the{" "}
              <Link href="/terms" className={linkClass}>
                terms of service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className={linkClass}>
                privacy policy
              </Link>
              .
            </label>
          </div>
          {errors.terms ? (
            <FieldError id="sign-up-terms-error" className={errorClass}>
              {errors.terms}
            </FieldError>
          ) : null}
        </div>
      </FieldGroup>

      <div className="mt-5 flex flex-col gap-4">
        <Button
          type="submit"
          className={primaryButtonClass}
          disabled={pending}
          aria-busy={pending || undefined}
        >
          {pending ? <Spinner /> : null}
          Create account
        </Button>
        <FieldSeparator className="my-0 text-[13px]">or</FieldSeparator>
        <GoogleButton disabled={pending} />
      </div>

      <p className="mt-6 text-[13px] text-muted-foreground">
        Already have an account?{" "}
        <Link href="/sign-in" className={linkClass}>
          Sign in
        </Link>
      </p>
    </form>
  );
}

export { SignUpForm };
