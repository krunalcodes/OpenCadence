"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { Field, FieldError, FieldLabel } from "@workspace/ui/components/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@workspace/ui/components/input-group";
import { Check, Copy, LifeBuoy, Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { type FormEvent, type ReactNode, useState } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/spinner";
import { CodeInput, codeLength } from "@/features/auth/components/code-input";
import {
  errorClass,
  PasswordInput,
} from "@/features/auth/components/form-parts";
import {
  BackupCodes,
  useCopy,
} from "@/features/settings/components/security/backup-codes";
import {
  dangerButton,
  dangerOutlineButton,
  dialogActions,
  dialogContent,
  dialogTitle,
  primaryButton,
  SettingsBadge,
  SettingsRow,
  secondaryButton,
} from "@/features/settings/components/settings-parts";
import {
  type AuthError,
  attempt,
  authClient,
  describeAuthError,
} from "@/lib/auth-client";

type PasswordStepProps = {
  id: string;
  submitLabel: string;
  destructive?: boolean;
  failureTitle: string;
  run: (password: string) => Promise<AuthError | null>;
  onCancel: () => void;
  onBusyChange: (busy: boolean) => void;
};

function PasswordStep({
  id,
  submitLabel,
  destructive,
  failureTitle,
  run,
  onCancel,
  onBusyChange,
}: PasswordStepProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    if (password === "") {
      setError("Enter your password to continue.");
      document.getElementById(id)?.focus();
      return;
    }
    setPending(true);
    onBusyChange(true);
    const failure = await run(password);
    setPending(false);
    onBusyChange(false);
    if (!failure) {
      return;
    }
    if (failure.code === "INVALID_PASSWORD") {
      setError("That is not your password. Check it and try again.");
      document.getElementById(id)?.focus();
      return;
    }
    toast.error(failureTitle, {
      description: describeAuthError(failure, "Try again in a moment."),
    });
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor={id} className="text-[13px]">
          Your password
        </FieldLabel>
        <PasswordInput
          id={id}
          name="password"
          autoComplete="current-password"
          value={password}
          onValueChange={(value) => {
            setPassword(value);
            setError(undefined);
          }}
          invalid={Boolean(error)}
          describedBy={error ? `${id}-error` : undefined}
        />
        {error ? (
          <FieldError id={`${id}-error`} className={errorClass}>
            {error}
          </FieldError>
        ) : null}
      </Field>
      <div className={dialogActions}>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onCancel}
          className={secondaryButton}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={pending}
          aria-busy={pending || undefined}
          className={destructive ? dangerButton : primaryButton}
        >
          {pending ? <Spinner /> : null}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function secretFromUri(uri: string) {
  try {
    return new URL(uri).searchParams.get("secret") ?? "";
  } catch {
    return "";
  }
}

function SetupKey({ secret }: { secret: string }) {
  const { copied, copy } = useCopy();

  return (
    <Field>
      <FieldLabel htmlFor="two-factor-setup-key" className="text-[13px]">
        Setup key
      </FieldLabel>
      <InputGroup className="bg-muted/40 shadow-xs">
        <InputGroupInput
          id="two-factor-setup-key"
          readOnly
          value={secret}
          onFocus={(event) => event.target.select()}
          className="font-mono text-[12.5px]"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            aria-label={copied ? "Setup key copied" : "Copy setup key"}
            onClick={() =>
              copy(secret, "Select the setup key and copy it yourself.")
            }
          >
            {copied ? (
              <Check aria-hidden strokeWidth={1.6} />
            ) : (
              <Copy aria-hidden strokeWidth={1.6} />
            )}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <span role="status" className="sr-only">
        {copied ? "Setup key copied" : ""}
      </span>
    </Field>
  );
}

type VerifyStepProps = {
  uri: string;
  onVerified: () => void;
  onCancel: () => void;
  onBusyChange: (busy: boolean) => void;
};

function VerifyStep({
  uri,
  onVerified,
  onCancel,
  onBusyChange,
}: VerifyStepProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const secret = secretFromUri(uri);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    if (code.length !== codeLength) {
      setError(
        `Enter the ${codeLength}-digit code from your authenticator app.`,
      );
      document.getElementById("two-factor-setup-code")?.focus();
      return;
    }
    setPending(true);
    onBusyChange(true);
    const result = await attempt(() =>
      authClient.twoFactor.verifyTotp({ code }),
    );
    setPending(false);
    onBusyChange(false);
    if (!result.error) {
      onVerified();
      return;
    }
    if (result.error.code === "INVALID_CODE" || result.error.status === 401) {
      setError(
        "That code did not match. Wait for a new code in the app and enter it.",
      );
      setCode("");
      document.getElementById("two-factor-setup-code")?.focus();
      return;
    }
    toast.error("Could not check the code", {
      description: describeAuthError(result.error, "Try again in a moment."),
    });
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="rounded-lg border border-border bg-white p-2.5 shadow-xs">
          <QRCodeSVG
            value={uri}
            size={148}
            marginSize={0}
            level="M"
            title="QR code for your authenticator app"
          />
        </div>
        <ol className="flex min-w-0 flex-1 basis-40 list-decimal flex-col gap-1.5 pl-4 text-muted-foreground leading-normal">
          <li>Open your authenticator app.</li>
          <li>Scan this QR code, or enter the setup key by hand.</li>
          <li>Enter the 6-digit code the app shows.</li>
        </ol>
      </div>

      {secret ? <SetupKey secret={secret} /> : null}

      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor="two-factor-setup-code" className="text-[13px]">
          Code from the app
        </FieldLabel>
        <CodeInput
          id="two-factor-setup-code"
          value={code}
          onValueChange={(value) => {
            setCode(value);
            setError(undefined);
          }}
          invalid={Boolean(error)}
          describedBy={error ? "two-factor-setup-code-error" : undefined}
        />
        {error ? (
          <FieldError id="two-factor-setup-code-error" className={errorClass}>
            {error}
          </FieldError>
        ) : null}
      </Field>

      <div className={dialogActions}>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onCancel}
          className={secondaryButton}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={pending}
          aria-busy={pending || undefined}
          className={primaryButton}
        >
          {pending ? <Spinner /> : null}
          Verify and turn on
        </Button>
      </div>
    </form>
  );
}

type Flow = "enable" | "regenerate" | "disable";

type Step =
  | { name: "password" }
  | { name: "verify"; uri: string; codes: string[] }
  | { name: "codes"; codes: string[] };

const headings: Record<Flow, Record<Step["name"], [string, ReactNode]>> = {
  enable: {
    password: [
      "Set up two-factor authentication",
      "Confirm your password to start. You will need an authenticator app on your phone.",
    ],
    verify: [
      "Connect your authenticator app",
      "Two-factor authentication turns on once the app's code is verified.",
    ],
    codes: [
      "Save your backup codes",
      "Two-factor authentication is on. Each code below signs you in once if you cannot use your authenticator app. This is the only time they are shown.",
    ],
  },
  regenerate: {
    password: [
      "Create new backup codes",
      "Your current backup codes stop working as soon as new ones are created. Confirm your password to continue.",
    ],
    verify: ["", ""],
    codes: [
      "Save your new backup codes",
      "Your old codes no longer work. Each code below signs you in once. This is the only time they are shown.",
    ],
  },
  disable: {
    password: [
      "Turn off two-factor authentication?",
      "Signing in will only need your password, your authenticator app will stop working for this account, and your backup codes will be deleted. Confirm your password to turn it off.",
    ],
    verify: ["", ""],
    codes: ["", ""],
  },
};

type TwoFactorDialogProps = {
  flow: Flow | null;
  email: string;
  onClose: () => void;
};

function TwoFactorDialog({ flow, email, onClose }: TwoFactorDialogProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ name: "password" });
  const [busy, setBusy] = useState(false);
  const [shownFlow] = useState<Flow>(flow ?? "enable");

  const locked = busy || step.name === "codes";
  const [title, description] = headings[shownFlow][step.name];

  function close() {
    onClose();
    router.refresh();
  }

  async function run(password: string) {
    if (shownFlow === "enable") {
      const result = await attempt(() =>
        authClient.twoFactor.enable({ password }),
      );
      if (result.error || !result.data || !("totpURI" in result.data)) {
        return result.error ?? { status: 500 };
      }
      setStep({
        name: "verify",
        uri: result.data.totpURI,
        codes: result.data.backupCodes,
      });
      return null;
    }
    if (shownFlow === "regenerate") {
      const result = await attempt(() =>
        authClient.twoFactor.generateBackupCodes({ password }),
      );
      if (result.error || !result.data) {
        return result.error ?? { status: 500 };
      }
      setStep({ name: "codes", codes: result.data.backupCodes });
      return null;
    }
    const result = await attempt(() =>
      authClient.twoFactor.disable({ password }),
    );
    if (result.error) {
      return result.error;
    }
    toast.success("Two-factor authentication turned off", {
      description: "Signing in now only needs your password.",
    });
    close();
    return null;
  }

  return (
    <Dialog
      open={flow !== null}
      onOpenChange={(open) => {
        if (!open && !locked) {
          close();
        }
      }}
    >
      <DialogContent
        showCloseButton={!locked}
        className={`${dialogContent} sm:max-w-[460px]`}
      >
        <DialogHeader>
          <DialogTitle className={dialogTitle}>{title}</DialogTitle>
          <DialogDescription className="text-[13px] leading-normal">
            {description}
          </DialogDescription>
        </DialogHeader>
        {step.name === "password" ? (
          <PasswordStep
            key={shownFlow}
            id={`two-factor-${shownFlow}-password`}
            submitLabel={
              shownFlow === "enable"
                ? "Continue"
                : shownFlow === "regenerate"
                  ? "Create new codes"
                  : "Turn off two-factor"
            }
            destructive={shownFlow === "disable"}
            failureTitle={
              shownFlow === "enable"
                ? "Could not start the setup"
                : shownFlow === "regenerate"
                  ? "Could not create new backup codes"
                  : "Could not turn off two-factor authentication"
            }
            run={run}
            onCancel={close}
            onBusyChange={setBusy}
          />
        ) : null}
        {step.name === "verify" ? (
          <VerifyStep
            uri={step.uri}
            onVerified={() => setStep({ name: "codes", codes: step.codes })}
            onCancel={close}
            onBusyChange={setBusy}
          />
        ) : null}
        {step.name === "codes" ? (
          <BackupCodes codes={step.codes} email={email} onDone={close} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

type TwoFactorProps = {
  enabled: boolean;
  hasPassword: boolean;
  email: string;
};

export function TwoFactor({ enabled, hasPassword, email }: TwoFactorProps) {
  const [flow, setFlow] = useState<Flow | null>(null);
  const [opened, setOpened] = useState(0);

  function open(next: Flow) {
    setOpened((count) => count + 1);
    setFlow(next);
  }

  return (
    <>
      <SettingsRow
        icon={<Smartphone className="size-4" strokeWidth={1.6} />}
        title={
          <>
            Authenticator app
            <SettingsBadge tone={enabled ? "success" : "neutral"}>
              {enabled ? "On" : "Off"}
            </SettingsBadge>
          </>
        }
        detail={
          enabled
            ? "After your password, you enter a 6-digit code from your authenticator app."
            : hasPassword
              ? "Add a second step when you sign in: a 6-digit code from an app on your phone."
              : "Two-factor authentication protects password sign-in. Set a password above first."
        }
        action={
          enabled ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => open("disable")}
              className={dangerOutlineButton}
            >
              Turn off
            </Button>
          ) : (
            <Button
              type="button"
              disabled={!hasPassword}
              onClick={() => open("enable")}
              className={primaryButton}
            >
              Set up two-factor
            </Button>
          )
        }
      />
      {enabled ? (
        <SettingsRow
          icon={<LifeBuoy className="size-4" strokeWidth={1.6} />}
          title="Backup codes"
          detail="One-time codes for when you cannot use your authenticator app. Creating new codes replaces the old ones."
          action={
            <Button
              type="button"
              variant="outline"
              onClick={() => open("regenerate")}
              className={secondaryButton}
            >
              Create new codes
            </Button>
          }
        />
      ) : null}
      <TwoFactorDialog
        key={opened}
        flow={flow}
        email={email}
        onClose={() => setFlow(null)}
      />
    </>
  );
}
