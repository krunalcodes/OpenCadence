"use client";

import { Button } from "@workspace/ui/components/button";
import { Field, FieldError, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { MailCheck } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/spinner";
import {
  errorClass,
  inputClass,
  isEmail,
  linkClass,
} from "@/features/auth/components/form-parts";
import {
  fieldWidth,
  primaryButton,
  SettingsBadge,
  secondaryButton,
} from "@/features/settings/components/settings-parts";
import { SettingsSection } from "@/features/settings/components/settings-section";
import { attempt, authClient, describeAuthError } from "@/lib/auth-client";

function validate(value: string, current: string) {
  const address = value.trim();
  if (address === "") {
    return "Enter the new email address.";
  }
  if (!isEmail(address)) {
    return "Enter an email address in the format name@company.com.";
  }
  if (address.toLowerCase() === current.toLowerCase()) {
    return "That is already your email address. Enter a different one.";
  }
  return undefined;
}

export function EmailForm({
  email,
  verified,
}: {
  email: string;
  verified: boolean;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function send(address: string) {
    setPending(true);
    const result = await attempt(() =>
      authClient.changeEmail({
        newEmail: address,
        callbackURL: "/app/settings/account",
      }),
    );
    setPending(false);
    if (result.error) {
      toast.error("Could not send the confirmation link", {
        description: describeAuthError(
          result.error,
          "Check the address and try again.",
        ),
      });
      return false;
    }
    return true;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    const invalid = validate(value, email);
    setError(invalid);
    if (invalid) {
      document.getElementById("account-new-email")?.focus();
      return;
    }
    const address = value.trim();
    if (await send(address)) {
      setSentTo(address);
      setValue("");
    }
  }

  async function resend() {
    if (!sentTo || pending) {
      return;
    }
    if (await send(sentTo)) {
      toast.success("Confirmation link sent again", {
        description: `Check the inbox for ${sentTo}.`,
      });
    }
  }

  return (
    <SettingsSection
      title="Email address"
      description="You sign in with this address, and account notices are sent to it."
      footer={
        sentTo ? (
          <>
            <span>The link works once and for a limited time.</span>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              aria-busy={pending || undefined}
              onClick={resend}
              className={secondaryButton}
            >
              {pending ? <Spinner /> : null}
              Send the link again
            </Button>
          </>
        ) : (
          <>
            <span>
              We email a confirmation link to the new address. Nothing changes
              until you open it.
            </span>
            <Button
              type="submit"
              form="account-email-form"
              disabled={pending}
              aria-busy={pending || undefined}
              className={primaryButton}
            >
              {pending ? <Spinner /> : null}
              Send confirmation link
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <div className="text-muted-foreground text-xs">Current address</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="min-w-0 break-all font-medium text-foreground">
              {email}
            </span>
            <SettingsBadge tone={verified ? "success" : "warning"}>
              {verified ? "Verified" : "Not verified"}
            </SettingsBadge>
          </div>
        </div>

        {sentTo ? (
          <div
            role="status"
            className="flex gap-2.5 rounded-lg bg-info-surface px-3 py-2.5 leading-normal"
          >
            <MailCheck
              aria-hidden
              strokeWidth={1.6}
              className="mt-0.5 size-4 shrink-0 text-info"
            />
            <div className="min-w-0">
              <p className="font-medium text-info">
                Waiting for you to confirm the new address
              </p>
              <p className="mt-0.5 text-foreground">
                We sent a confirmation link to{" "}
                <span className="break-all font-medium">{sentTo}</span>. Open it
                to finish the change. Until then you keep signing in with{" "}
                <span className="break-all font-medium">{email}</span>.
              </p>
              <p className="mt-1.5">
                <button
                  type="button"
                  onClick={() => setSentTo(null)}
                  className={linkClass}
                >
                  Use a different address
                </button>
              </p>
            </div>
          </div>
        ) : (
          <form id="account-email-form" noValidate onSubmit={handleSubmit}>
            <Field
              data-invalid={error ? true : undefined}
              className={fieldWidth}
            >
              <FieldLabel htmlFor="account-new-email" className="text-[13px]">
                New email address
              </FieldLabel>
              <Input
                id="account-new-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={value}
                onChange={(event) => {
                  setValue(event.target.value);
                  if (error) {
                    setError(validate(event.target.value, email));
                  }
                }}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "account-new-email-error" : undefined}
                className={inputClass}
              />
              {error ? (
                <FieldError id="account-new-email-error" className={errorClass}>
                  {error}
                </FieldError>
              ) : null}
            </Field>
          </form>
        )}
      </div>
    </SettingsSection>
  );
}
