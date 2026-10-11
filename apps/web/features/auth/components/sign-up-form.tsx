"use client";

import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { cn } from "@workspace/ui/lib/utils";
import { Check, Circle } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useRef, useState } from "react";
import {
  errorClass,
  FormNotice,
  inputClass,
  isEmail,
  labelClass,
  linkClass,
  PasswordInput,
  primaryButtonClass,
} from "@/features/auth/components/form-parts";

const minPasswordLength = 12;

type Values = {
  name: string;
  email: string;
  password: string;
  workspace: string;
  terms: boolean;
};

type FieldName = keyof Values;

type Errors = Partial<Record<FieldName, string>>;

const fieldOrder: FieldName[] = [
  "name",
  "email",
  "password",
  "workspace",
  "terms",
];

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
      if (values.password === "") {
        return `Enter a password of at least ${minPasswordLength} characters.`;
      }
      return values.password.length < minPasswordLength
        ? `Add ${minPasswordLength - values.password.length} more ${
            minPasswordLength - values.password.length === 1
              ? "character"
              : "characters"
          }. Passwords need at least ${minPasswordLength}.`
        : undefined;
    case "workspace":
      return values.workspace.trim() === ""
        ? "Enter a workspace name, such as your company or team name."
        : undefined;
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
    workspace: "",
    terms: false,
  });
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);
  const termsRef = useRef<HTMLElement>(null);

  function update<K extends FieldName>(field: K, value: Values[K]) {
    const next = { ...values, [field]: value };
    setValues(next);
    setSubmitted(false);
    if (errors[field]) {
      setErrors((current) => ({ ...current, [field]: validate(field, next) }));
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: Errors = {};
    for (const field of fieldOrder) {
      next[field] = validate(field, values);
    }
    setErrors(next);
    const firstInvalid = fieldOrder.find((field) => next[field]);
    if (!firstInvalid) {
      setSubmitted(true);
      return;
    }
    setSubmitted(false);
    if (firstInvalid === "terms") {
      termsRef.current?.focus();
      return;
    }
    document.getElementById(`sign-up-${firstInvalid}`)?.focus();
  }

  const passwordMet = values.password.length >= minPasswordLength;

  return (
    <form noValidate onSubmit={handleSubmit}>
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
            <FieldDescription
              id="sign-up-password-hint"
              className={cn(
                "flex items-center gap-1.5 text-[13px]",
                passwordMet && "text-success",
              )}
            >
              {passwordMet ? (
                <Check
                  aria-hidden="true"
                  strokeWidth={2}
                  className="size-3.5 shrink-0"
                />
              ) : (
                <Circle
                  aria-hidden="true"
                  strokeWidth={1.6}
                  className="size-3.5 shrink-0"
                />
              )}
              <span>
                Use at least {minPasswordLength} characters.
                {passwordMet ? (
                  <span className="sr-only"> Requirement met.</span>
                ) : null}
              </span>
            </FieldDescription>
          )}
        </Field>

        <Field data-invalid={errors.workspace ? true : undefined}>
          <FieldLabel htmlFor="sign-up-workspace" className={labelClass}>
            Workspace name
          </FieldLabel>
          <Input
            id="sign-up-workspace"
            name="workspace"
            type="text"
            autoComplete="organization"
            required
            value={values.workspace}
            onChange={(event) => update("workspace", event.target.value)}
            aria-invalid={errors.workspace ? true : undefined}
            aria-describedby={
              errors.workspace
                ? "sign-up-workspace-error"
                : "sign-up-workspace-hint"
            }
            className={inputClass}
          />
          {errors.workspace ? (
            <FieldError id="sign-up-workspace-error" className={errorClass}>
              {errors.workspace}
            </FieldError>
          ) : (
            <FieldDescription
              id="sign-up-workspace-hint"
              className="text-[13px]"
            >
              Usually your company or team name.
            </FieldDescription>
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

      <FormNotice
        title={submitted ? "Sign-up is not connected yet." : null}
        detail="No account was created and nothing was saved."
      />

      <Button type="submit" className={cn("mt-5", primaryButtonClass)}>
        Create account
      </Button>

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
