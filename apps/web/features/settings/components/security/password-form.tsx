"use client";

import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field";
import { cn } from "@workspace/ui/lib/utils";
import { MailCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/spinner";
import {
  errorClass,
  PasswordInput,
  PasswordRequirement,
  validateNewPassword,
} from "@/features/auth/components/form-parts";
import {
  fieldWidth,
  primaryButton,
} from "@/features/settings/components/settings-parts";
import { SettingsSection } from "@/features/settings/components/settings-section";
import {
  attempt,
  authClient,
  breachedPasswordCode,
  breachedPasswordMessage,
  describeAuthError,
} from "@/lib/auth-client";

type Errors = { current?: string; next?: string };

function ChangePassword() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);

  function fail(field: keyof Errors, message: string) {
    setErrors({ [field]: message });
    document
      .getElementById(field === "current" ? "password-current" : "password-new")
      ?.focus();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    const found: Errors = {
      current: current === "" ? "Enter your current password." : undefined,
      next:
        validateNewPassword(next) ??
        (next === current && next !== ""
          ? "Choose a password that is different from your current one."
          : undefined),
    };
    setErrors(found);
    if (found.current) {
      document.getElementById("password-current")?.focus();
      return;
    }
    if (found.next) {
      document.getElementById("password-new")?.focus();
      return;
    }

    setPending(true);
    const { error } = await attempt(() =>
      authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: signOutOthers,
      }),
    );
    setPending(false);
    if (!error) {
      setCurrent("");
      setNext("");
      toast.success("Password updated", {
        description: signOutOthers
          ? "Your other devices have been signed out."
          : "Your other devices stay signed in.",
      });
      router.refresh();
      return;
    }
    switch (error.code) {
      case "INVALID_PASSWORD":
        fail(
          "current",
          "That is not your current password. Check it and try again.",
        );
        return;
      case breachedPasswordCode:
        fail("next", breachedPasswordMessage);
        return;
      case "PASSWORD_TOO_SHORT":
        fail("next", "That password is too short. Add more characters.");
        return;
      case "PASSWORD_TOO_LONG":
        fail("next", "That password is too long. Use a shorter one.");
        return;
      default:
        toast.error("Could not update your password", {
          description: describeAuthError(error, "Try again in a moment."),
        });
    }
  }

  return (
    <SettingsSection
      title="Password"
      description="Use a long password that you do not use anywhere else."
      footer={
        <>
          <span>New passwords are checked against known data breaches.</span>
          <Button
            type="submit"
            form="password-form"
            disabled={pending}
            aria-busy={pending || undefined}
            className={primaryButton}
          >
            {pending ? <Spinner /> : null}
            Update password
          </Button>
        </>
      }
    >
      <form id="password-form" noValidate onSubmit={handleSubmit}>
        <FieldGroup className={cn("gap-4", fieldWidth)}>
          <Field data-invalid={errors.current ? true : undefined}>
            <FieldLabel htmlFor="password-current" className="text-[13px]">
              Current password
            </FieldLabel>
            <PasswordInput
              id="password-current"
              name="current-password"
              autoComplete="current-password"
              value={current}
              onValueChange={(value) => {
                setCurrent(value);
                if (errors.current) {
                  setErrors((state) => ({ ...state, current: undefined }));
                }
              }}
              invalid={Boolean(errors.current)}
              describedBy={
                errors.current ? "password-current-error" : undefined
              }
            />
            {errors.current ? (
              <FieldError id="password-current-error" className={errorClass}>
                {errors.current}
              </FieldError>
            ) : null}
          </Field>

          <Field data-invalid={errors.next ? true : undefined}>
            <FieldLabel htmlFor="password-new" className="text-[13px]">
              New password
            </FieldLabel>
            <PasswordInput
              id="password-new"
              name="new-password"
              autoComplete="new-password"
              value={next}
              onValueChange={(value) => {
                setNext(value);
                if (errors.next) {
                  setErrors((state) => ({
                    ...state,
                    next: validateNewPassword(value),
                  }));
                }
              }}
              invalid={Boolean(errors.next)}
              describedBy={
                errors.next ? "password-new-error" : "password-new-hint"
              }
            />
            {errors.next ? (
              <FieldError id="password-new-error" className={errorClass}>
                {errors.next}
              </FieldError>
            ) : (
              <PasswordRequirement id="password-new-hint" value={next} />
            )}
          </Field>

          <div className="flex items-start gap-2.5">
            <Checkbox
              id="password-sign-out-others"
              name="sign-out-others"
              checked={signOutOthers}
              onCheckedChange={(checked) => setSignOutOthers(checked)}
              aria-describedby="password-sign-out-others-hint"
              className="mt-0.5 bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            />
            <div className="leading-normal">
              <label
                htmlFor="password-sign-out-others"
                className="font-medium text-foreground"
              >
                Sign out of other devices
              </label>
              <p
                id="password-sign-out-others-hint"
                className="text-muted-foreground text-xs"
              >
                This device stays signed in. Every other device has to sign in
                again with the new password.
              </p>
            </div>
          </div>
        </FieldGroup>
      </form>
    </SettingsSection>
  );
}

function SetPassword({ email }: { email: string }) {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function send() {
    if (pending) {
      return;
    }
    setPending(true);
    const { error } = await attempt(() =>
      authClient.requestPasswordReset({
        email,
        redirectTo: "/reset-password",
      }),
    );
    setPending(false);
    if (error) {
      toast.error("Could not send the link", {
        description: describeAuthError(error, "Try again in a moment."),
      });
      return;
    }
    setSent(true);
  }

  return (
    <SettingsSection
      title="Password"
      description="A password lets you sign in without Google, and is needed to turn on two-factor authentication."
      footer={
        <>
          <span>
            {sent
              ? "The link works once and for a limited time."
              : "We email you a link to choose a password."}
          </span>
          <Button
            type="button"
            variant={sent ? "outline" : "default"}
            disabled={pending}
            aria-busy={pending || undefined}
            onClick={send}
            className={
              sent
                ? "bg-card px-3 text-[13px] shadow-xs hover:bg-muted"
                : primaryButton
            }
          >
            {pending ? <Spinner /> : null}
            {sent ? "Send the link again" : "Email me a link to set a password"}
          </Button>
        </>
      }
    >
      {sent ? (
        <div
          role="status"
          className="flex gap-2.5 rounded-lg bg-info-surface px-3 py-2.5 leading-normal"
        >
          <MailCheck
            aria-hidden
            strokeWidth={1.6}
            className="mt-0.5 size-4 shrink-0 text-info"
          />
          <p className="min-w-0 text-foreground">
            <span className="font-medium text-info">Check your inbox.</span> We
            sent a link to{" "}
            <span className="break-all font-medium">{email}</span>. Open it to
            choose your password.
          </p>
        </div>
      ) : (
        <p className="text-foreground leading-normal">
          Your account has no password because you signed up with Google. To add
          one, we send a link to{" "}
          <span className="break-all font-medium">{email}</span> where you
          choose it.
        </p>
      )}
    </SettingsSection>
  );
}

export function PasswordForm({
  hasPassword,
  email,
}: {
  hasPassword: boolean;
  email: string;
}) {
  return hasPassword ? <ChangePassword /> : <SetPassword email={email} />;
}
