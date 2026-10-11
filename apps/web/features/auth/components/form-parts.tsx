"use client";

import { Button } from "@workspace/ui/components/button";
import { FieldDescription } from "@workspace/ui/components/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@workspace/ui/components/input-group";
import { cn } from "@workspace/ui/lib/utils";
import { Check, Circle, Eye, EyeOff, Info } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/spinner";
import { attempt, authClient, describeAuthError } from "@/lib/auth-client";

const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const inputClass = cn("bg-card shadow-xs", focusRing);

const inputGroupClass =
  "bg-card shadow-xs has-[[data-slot=input-group-control]:focus-visible]:ring-2 has-[[data-slot=input-group-control]:focus-visible]:ring-ring has-[[data-slot=input-group-control]:focus-visible]:ring-offset-2 has-[[data-slot=input-group-control]:focus-visible]:ring-offset-background";

const primaryButtonClass = cn("w-full hover:bg-brand-hover", focusRing);

const secondaryButtonClass = cn(
  "w-full bg-card shadow-xs hover:bg-muted",
  focusRing,
);

const linkClass = cn(
  "rounded-sm font-medium text-primary underline-offset-4 hover:underline",
  focusRing,
);

const labelClass = "text-[13px]";

const errorClass = "text-[13px] text-danger";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isEmail(value: string) {
  return emailPattern.test(value.trim());
}

const minPasswordLength = 12;

function validateNewPassword(value: string) {
  if (value === "") {
    return `Enter a password of at least ${minPasswordLength} characters.`;
  }
  const missing = minPasswordLength - value.length;
  if (missing > 0) {
    return `Add ${missing} more ${
      missing === 1 ? "character" : "characters"
    }. Passwords need at least ${minPasswordLength}.`;
  }
  return undefined;
}

function AuthHeader({
  title,
  description,
}: {
  title: string;
  description: ReactNode;
}) {
  return (
    <>
      <h1 className="font-semibold text-2xl text-foreground leading-[1.2] tracking-[-0.025em]">
        {title}
      </h1>
      <p className="mt-2 mb-7 text-[13px] text-muted-foreground leading-normal">
        {description}
      </p>
    </>
  );
}

function PasswordRequirement({ id, value }: { id: string; value: string }) {
  const met = value.length >= minPasswordLength;

  return (
    <FieldDescription
      id={id}
      className={cn(
        "flex items-center gap-1.5 text-[13px]",
        met && "text-success",
      )}
    >
      {met ? (
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
        {met ? <span className="sr-only"> Requirement met.</span> : null}
      </span>
    </FieldDescription>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18" className="size-4 shrink-0">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.96 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

function GoogleButton({ disabled }: { disabled?: boolean }) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    const { error } = await attempt(() =>
      authClient.signIn.social({ provider: "google", callbackURL: "/app" }),
    );
    if (error) {
      setPending(false);
      toast.error("Could not continue with Google", {
        description: describeAuthError(
          error,
          "Google sign-in may not be set up on this server. Use your email and password instead.",
        ),
      });
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className={secondaryButtonClass}
      disabled={pending || disabled}
      aria-busy={pending || undefined}
      onClick={handleClick}
    >
      {pending ? <Spinner /> : <GoogleIcon />}
      Continue with Google
    </Button>
  );
}

function PasswordInput({
  id,
  name,
  value,
  onValueChange,
  autoComplete,
  invalid,
  describedBy,
}: {
  id: string;
  name: string;
  value: string;
  onValueChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  invalid: boolean;
  describedBy?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <InputGroup className={inputGroupClass}>
      <InputGroupInput
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        autoComplete={autoComplete}
        autoCapitalize="none"
        spellCheck={false}
        required
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-xs"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          aria-controls={id}
          onClick={() => setVisible((current) => !current)}
          className={focusRing}
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}

function FormNotice({
  title,
  detail,
}: {
  title: string | null;
  detail?: string;
}) {
  return (
    <div role="status" aria-live="polite">
      {title ? (
        <div className="mt-5 flex gap-2 rounded-lg bg-info-surface px-3 py-2.5 text-[13px] leading-normal">
          <Info
            aria-hidden="true"
            strokeWidth={1.6}
            className="mt-0.5 size-4 shrink-0 text-info"
          />
          <p className="min-w-0">
            <span className="font-medium text-info">{title}</span>
            {detail ? <span className="text-foreground"> {detail}</span> : null}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export {
  AuthHeader,
  errorClass,
  FormNotice,
  GoogleButton,
  inputClass,
  isEmail,
  labelClass,
  linkClass,
  minPasswordLength,
  PasswordInput,
  PasswordRequirement,
  primaryButtonClass,
  secondaryButtonClass,
  validateNewPassword,
};
