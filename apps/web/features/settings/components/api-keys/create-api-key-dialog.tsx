"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@workspace/ui/components/input-group";
import { Check, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/spinner";
import {
  dialogActions,
  dialogContent,
  dialogTitle,
} from "@/features/settings/components/settings-parts";
import {
  errorClass,
  hintClass,
  inputClass,
  labelClass,
  Notice,
  primaryButtonClass,
  SegmentedControl,
  secondaryButtonClass,
  useCopy,
} from "@/features/settings/components/workspace-parts";
import { attempt, authClient, describeAuthError } from "@/lib/auth-client";
import type { Workspace } from "@/lib/session";

export const maxKeyNameLength = 32;

export function validateKeyName(value: string) {
  const name = value.trim();
  if (name === "") {
    return "Enter a name that says where the key is used, such as Billing sync.";
  }
  if (name.length > maxKeyNameLength) {
    return `Shorten the name to ${maxKeyNameLength} characters or fewer.`;
  }
  return undefined;
}

type ExpiryId = "never" | "30d" | "90d" | "1y";

const daySeconds = 60 * 60 * 24;

const expiryOptions: {
  value: ExpiryId;
  label: string;
  seconds: number | null;
}[] = [
  { value: "never", label: "Never", seconds: null },
  { value: "30d", label: "30 days", seconds: 30 * daySeconds },
  { value: "90d", label: "90 days", seconds: 90 * daySeconds },
  { value: "1y", label: "1 year", seconds: 365 * daySeconds },
];

const expiryDateFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

function expiryHint(seconds: number | null) {
  if (seconds === null) {
    return "The key works until someone revokes it.";
  }
  const date = new Date(Date.now() + seconds * 1000);
  return `The key stops working on ${expiryDateFormat.format(date)}.`;
}

type CreateApiKeyDialogProps = {
  workspace: Workspace;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CreateApiKeyDialog({
  workspace,
  open,
  onOpenChange,
}: CreateApiKeyDialogProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState<ExpiryId>("never");
  const [error, setError] = useState<string>();
  const [created, setCreated] = useState<{ name: string; key: string } | null>(
    null,
  );
  const [pending, startCreate] = useTransition();
  const { copied, copy } = useCopy();

  const seconds =
    expiryOptions.find((option) => option.value === expiry)?.seconds ?? null;

  function reset() {
    setName("");
    setExpiry("never");
    setError(undefined);
    setCreated(null);
  }

  function close() {
    onOpenChange(false);
    if (created) {
      router.refresh();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    const invalid = validateKeyName(name);
    setError(invalid);
    if (invalid) {
      document.getElementById("api-key-name")?.focus();
      return;
    }
    const keyName = name.trim();

    startCreate(async () => {
      const { data, error: failure } = await attempt(() =>
        authClient.apiKey.create({
          name: keyName,
          expiresIn: seconds,
          organizationId: workspace.id,
        }),
      );
      if (failure || !data?.key) {
        const problem = failure ?? { status: 500 };
        if (problem.code === "INVALID_NAME_LENGTH") {
          setError(`Use a name of ${maxKeyNameLength} characters or fewer.`);
          document.getElementById("api-key-name")?.focus();
          return;
        }
        toast.error("Could not create the API key", {
          description: describeAuthError(
            problem,
            problem.status === 403
              ? "Your role does not allow creating keys for this workspace."
              : problem.status === 404
                ? "API keys are not available on this server yet."
                : "No key was created. Try again in a moment.",
          ),
        });
        return;
      }
      setCreated({ name: keyName, key: data.key });
      startCreate(() => router.refresh());
    });
  }

  return (
    <Dialog
      open={open}
      disablePointerDismissal={created !== null}
      onOpenChange={(next) => {
        if (pending) {
          return;
        }
        if (next) {
          onOpenChange(true);
          return;
        }
        close();
      }}
      onOpenChangeComplete={(next) => {
        if (!next) {
          reset();
        }
      }}
    >
      <DialogContent
        className={
          created ? `${dialogContent} sm:max-w-[480px]` : dialogContent
        }
      >
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle className={dialogTitle}>
                Copy your new API key
              </DialogTitle>
              <DialogDescription className="text-[13px]">
                <span className="font-medium text-foreground">
                  {created.name}
                </span>{" "}
                is ready to use for {workspace.name}.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <Field>
                <FieldLabel htmlFor="api-key-value" className={labelClass}>
                  API key
                </FieldLabel>
                <InputGroup className="bg-card shadow-xs">
                  <InputGroupInput
                    id="api-key-value"
                    readOnly
                    value={created.key}
                    spellCheck={false}
                    autoComplete="off"
                    onFocus={(event) => event.target.select()}
                    aria-describedby="api-key-value-note"
                    className="font-mono text-[12.5px]"
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      size="xs"
                      onClick={() =>
                        copy(created.key, "Could not copy the key")
                      }
                    >
                      {copied ? (
                        <Check
                          aria-hidden
                          strokeWidth={1.8}
                          className="text-success"
                        />
                      ) : (
                        <Copy aria-hidden strokeWidth={1.6} />
                      )}
                      {copied ? "Copied" : "Copy"}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </Field>
              <div id="api-key-value-note">
                <Notice tone="warning" title="This key is shown only once.">
                  Copy it now and store it somewhere safe, such as a secrets
                  manager. If you lose it, revoke it and create a new one.
                </Notice>
              </div>
            </div>
            <div className={dialogActions}>
              <Button
                type="button"
                onClick={close}
                className={primaryButtonClass}
              >
                I have copied the key
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className={dialogTitle}>Create API key</DialogTitle>
              <DialogDescription className="text-[13px]">
                The key acts as {workspace.name}. Anyone who has it can call the
                API for this workspace.
              </DialogDescription>
            </DialogHeader>
            <form
              noValidate
              onSubmit={handleSubmit}
              className="flex flex-col gap-4"
            >
              <Field data-invalid={error ? true : undefined}>
                <FieldLabel htmlFor="api-key-name" className={labelClass}>
                  Name
                </FieldLabel>
                <Input
                  id="api-key-name"
                  name="name"
                  type="text"
                  autoComplete="off"
                  required
                  maxLength={maxKeyNameLength}
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    if (error) {
                      setError(validateKeyName(event.target.value));
                    }
                  }}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={
                    error ? "api-key-name-error" : "api-key-name-hint"
                  }
                  className={inputClass}
                />
                {error ? (
                  <FieldError id="api-key-name-error" className={errorClass}>
                    {error}
                  </FieldError>
                ) : (
                  <FieldDescription
                    id="api-key-name-hint"
                    className={hintClass}
                  >
                    Name it after the integration that will use it.
                  </FieldDescription>
                )}
              </Field>

              <Field>
                <span className={`${labelClass} font-medium leading-snug`}>
                  Expires
                </span>
                <SegmentedControl
                  label="Expires"
                  value={expiry}
                  onValueChange={setExpiry}
                  disabled={pending}
                  options={expiryOptions}
                />
                <FieldDescription
                  className={hintClass}
                  suppressHydrationWarning
                >
                  {expiryHint(seconds)}
                </FieldDescription>
              </Field>

              <div className={dialogActions}>
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={close}
                  className={secondaryButtonClass}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={pending}
                  aria-busy={pending || undefined}
                  className={primaryButtonClass}
                >
                  {pending ? <Spinner /> : null}
                  Create key
                </Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
