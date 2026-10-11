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
import { Input } from "@workspace/ui/components/input";
import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/spinner";
import {
  maxKeyNameLength,
  validateKeyName,
} from "@/features/settings/components/api-keys/create-api-key-dialog";
import {
  dialogActions,
  dialogContent,
  dialogTitle,
} from "@/features/settings/components/settings-parts";
import {
  errorClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/features/settings/components/workspace-parts";
import { attempt, authClient, describeAuthError } from "@/lib/auth-client";
import type { WorkspaceApiKey } from "@/lib/session";

type RenameApiKeyDialogProps = {
  apiKey: WorkspaceApiKey | null;
  onClose: () => void;
};

export function RenameApiKeyDialog({
  apiKey,
  onClose,
}: RenameApiKeyDialogProps) {
  return (
    <Dialog
      open={apiKey !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent className={dialogContent}>
        <DialogHeader>
          <DialogTitle className={dialogTitle}>Rename API key</DialogTitle>
          <DialogDescription className="text-[13px]">
            Renaming does not change the key itself, so anything using it keeps
            working.
          </DialogDescription>
        </DialogHeader>
        {apiKey ? (
          <RenameForm key={apiKey.id} apiKey={apiKey} onClose={onClose} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RenameForm({
  apiKey,
  onClose,
}: {
  apiKey: WorkspaceApiKey;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(apiKey.name ?? "");
  const [error, setError] = useState<string>();
  const [pending, startRename] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    const invalid = validateKeyName(name);
    setError(invalid);
    if (invalid) {
      document.getElementById("rename-api-key-name")?.focus();
      return;
    }
    const next = name.trim();
    if (next === apiKey.name) {
      onClose();
      return;
    }

    startRename(async () => {
      const { error: failure } = await attempt(() =>
        authClient.apiKey.update({ keyId: apiKey.id, name: next }),
      );
      if (failure) {
        toast.error("Could not rename the API key", {
          description: describeAuthError(
            failure,
            failure.status === 403
              ? "Your role does not allow renaming keys."
              : "The name was not changed. Try again in a moment.",
          ),
        });
        return;
      }
      toast.success(`Key renamed to ${next}`);
      startRename(() => {
        router.refresh();
        onClose();
      });
    });
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor="rename-api-key-name" className={labelClass}>
          Name
        </FieldLabel>
        <Input
          id="rename-api-key-name"
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
          aria-describedby={error ? "rename-api-key-name-error" : undefined}
          className={inputClass}
        />
        {error ? (
          <FieldError id="rename-api-key-name-error" className={errorClass}>
            {error}
          </FieldError>
        ) : null}
      </Field>
      <div className={dialogActions}>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onClose}
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
          Save name
        </Button>
      </div>
    </form>
  );
}
