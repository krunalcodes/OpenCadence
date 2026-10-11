"use client";

import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Field, FieldError, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/spinner";
import { CodeInput, codeLength } from "@/features/auth/components/code-input";
import {
  AuthHeader,
  errorClass,
  inputClass,
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
import { withRedirect } from "@/lib/redirect";

const trustDeviceDays = 30;

type Method = "totp" | "backup";

const expiredCodes = new Set(["INVALID_TWO_FACTOR_COOKIE"]);

const lockedCodes = new Set([
  "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE",
  "ACCOUNT_TEMPORARILY_LOCKED",
]);

const wrongCodes = new Set(["INVALID_CODE", "INVALID_BACKUP_CODE"]);

function TwoFactorForm({ redirect }: { redirect: string | null }) {
  const router = useRouter();
  const [method, setMethod] = useState<Method>("totp");
  const [code, setCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [expired, setExpired] = useState(false);
  const signInHref = withRedirect("/sign-in", redirect);

  function switchMethod(next: Method) {
    setMethod(next);
    setCode("");
    setError(undefined);
  }

  function showError(message: string) {
    setError(message);
    document.getElementById("two-factor-code")?.focus();
  }

  function handleFailure(failure: AuthError) {
    const failureCode = failure.code ?? "";
    if (expiredCodes.has(failureCode)) {
      setExpired(true);
      return;
    }
    if (lockedCodes.has(failureCode) || failure.status === 429) {
      showError(
        "Too many incorrect codes. Wait a few minutes, then sign in again.",
      );
      return;
    }
    if (wrongCodes.has(failureCode) || failure.status === 401) {
      setCode("");
      showError(
        method === "totp"
          ? "That code did not match. Wait for a new code in the app and enter it."
          : "That backup code did not match, or it has already been used. Try another one.",
      );
      return;
    }
    toast.error("Could not check the code", {
      description: describeAuthError(failure, "Try again in a moment."),
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    const value = code.trim();
    if (method === "totp" && value.length !== codeLength) {
      showError(
        `Enter the ${codeLength}-digit code from your authenticator app.`,
      );
      return;
    }
    if (method === "backup" && value === "") {
      showError("Enter one of your backup codes.");
      return;
    }

    setPending(true);
    const { error: failure } = await attempt(() =>
      method === "totp"
        ? authClient.twoFactor.verifyTotp({ code: value, trustDevice })
        : authClient.twoFactor.verifyBackupCode({ code: value, trustDevice }),
    );
    if (!failure) {
      router.push(redirect ?? "/app");
      router.refresh();
      return;
    }
    setPending(false);
    handleFailure(failure);
  }

  if (expired) {
    return (
      <div>
        <AuthHeader
          title="This sign-in step has expired"
          description="For your security the second step has to be finished within a few minutes. Sign in again to get a new one."
        />
        <Button
          className={primaryButtonClass}
          nativeButton={false}
          render={<Link href={signInHref} />}
        >
          Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={handleSubmit}>
      <AuthHeader
        title="Two-factor authentication"
        description={
          method === "totp"
            ? "Enter the 6-digit code from your authenticator app to finish signing in."
            : "Enter one of the backup codes you saved when you turned on two-factor authentication. Each code works once."
        }
      />
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor="two-factor-code" className={labelClass}>
          {method === "totp" ? "Authentication code" : "Backup code"}
        </FieldLabel>
        {method === "totp" ? (
          <CodeInput
            id="two-factor-code"
            value={code}
            onValueChange={(value) => {
              setCode(value);
              setError(undefined);
            }}
            invalid={Boolean(error)}
            describedBy={error ? "two-factor-code-error" : undefined}
            autoFocus
          />
        ) : (
          <Input
            id="two-factor-code"
            name="backup-code"
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            autoFocus
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
              setError(undefined);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "two-factor-code-error" : undefined}
            className={`${inputClass} h-10 font-mono text-[15px]`}
          />
        )}
        {error ? (
          <FieldError id="two-factor-code-error" className={errorClass}>
            {error}
          </FieldError>
        ) : null}
      </Field>

      <div className="mt-4 flex items-start gap-2.5">
        <Checkbox
          id="two-factor-trust"
          name="trust-device"
          checked={trustDevice}
          onCheckedChange={(checked) => setTrustDevice(checked)}
          aria-describedby="two-factor-trust-hint"
          className="mt-0.5 bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        />
        <div className="text-[13px] leading-normal">
          <label htmlFor="two-factor-trust" className="text-foreground">
            {`Trust this device for ${trustDeviceDays} days`}
          </label>
          <p
            id="two-factor-trust-hint"
            className="text-muted-foreground text-xs"
          >
            You will not be asked for a code on this browser during that time.
            Only use this on a device that is yours.
          </p>
        </div>
      </div>

      <Button
        type="submit"
        className={`mt-5 ${primaryButtonClass}`}
        disabled={pending}
        aria-busy={pending || undefined}
      >
        {pending ? <Spinner /> : null}
        Verify and sign in
      </Button>

      <p className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
        <button
          type="button"
          onClick={() => switchMethod(method === "totp" ? "backup" : "totp")}
          className={linkClass}
        >
          {method === "totp"
            ? "Use a backup code instead"
            : "Use your authenticator app instead"}
        </button>
        <Link href={signInHref} className={linkClass}>
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

export { TwoFactorForm };
