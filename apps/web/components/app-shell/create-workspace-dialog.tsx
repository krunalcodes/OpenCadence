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
import { cn } from "@workspace/ui/lib/utils";
import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { toast } from "sonner";
import { buttonFocusRing } from "@/components/app-shell/page-header";
import { Spinner } from "@/components/spinner";
import { attempt, authClient, describeAuthError } from "@/lib/auth-client";
import { slugify, slugSuffix } from "@/lib/slug";

const maxNameLength = 64;

const slugTakenCodes = new Set([
  "ORGANIZATION_ALREADY_EXISTS",
  "ORGANIZATION_SLUG_ALREADY_TAKEN",
]);

function validateName(value: string) {
  const name = value.trim();
  if (name === "") {
    return "Enter a workspace name, such as your company or team name.";
  }
  if (name.length > maxNameLength) {
    return `Shorten the name to ${maxNameLength} characters or fewer.`;
  }
  return undefined;
}

async function createWorkspace(name: string) {
  const base = slugify(name) || "workspace";
  const first = await attempt(() =>
    authClient.organization.create({ name, slug: base }),
  );
  if (!first.error || !slugTakenCodes.has(first.error.code ?? "")) {
    return first;
  }
  return attempt(() =>
    authClient.organization.create({
      name,
      slug: `${base}-${slugSuffix()}`,
    }),
  );
}

type CreateWorkspaceFormProps = {
  onCreated?: () => void;
  onCancel?: () => void;
};

export function CreateWorkspaceForm({
  onCreated,
  onCancel,
}: CreateWorkspaceFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startCreate] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    const invalid = validateName(name);
    setError(invalid);
    if (invalid) {
      document.getElementById("create-workspace-name")?.focus();
      return;
    }

    startCreate(async () => {
      const created = await createWorkspace(name.trim());
      if (created.error || !created.data) {
        toast.error("Could not create the workspace", {
          description: describeAuthError(
            created.error ?? { status: 500 },
            "Try again in a moment.",
          ),
        });
        return;
      }
      const organizationId = created.data.id;
      const switched = await attempt(() =>
        authClient.organization.setActive({ organizationId }),
      );
      if (switched.error) {
        toast.error("The workspace was created but could not be opened", {
          description: "Choose it from the workspace switcher.",
        });
      }
      startCreate(() => {
        router.refresh();
        onCreated?.();
      });
    });
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor="create-workspace-name" className="text-[13px]">
          Workspace name
        </FieldLabel>
        <Input
          id="create-workspace-name"
          name="name"
          type="text"
          autoComplete="organization"
          required
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (error) {
              setError(validateName(event.target.value));
            }
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            error ? "create-workspace-name-error" : "create-workspace-name-hint"
          }
          className="bg-card shadow-xs"
        />
        {error ? (
          <FieldError
            id="create-workspace-name-error"
            className="text-[13px] text-danger"
          >
            {error}
          </FieldError>
        ) : (
          <FieldDescription
            id="create-workspace-name-hint"
            className="text-[13px]"
          >
            Usually your company or team name. You can change it later.
          </FieldDescription>
        )}
      </Field>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onCancel}
            className={cn(
              "bg-card text-[13px] shadow-xs hover:bg-muted",
              buttonFocusRing,
            )}
          >
            Cancel
          </Button>
        ) : null}
        <Button
          type="submit"
          disabled={pending}
          aria-busy={pending || undefined}
          className={cn("text-[13px] hover:bg-brand-hover", buttonFocusRing)}
        >
          {pending ? <Spinner /> : null}
          Create workspace
        </Button>
      </div>
    </form>
  );
}

type CreateWorkspaceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CreateWorkspaceDialog({
  open,
  onOpenChange,
}: CreateWorkspaceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 p-5 text-[13px] sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="font-semibold text-[15px] tracking-[-0.01em]">
            Create workspace
          </DialogTitle>
          <DialogDescription className="text-[13px]">
            A workspace keeps its own contacts, mailboxes and sends. You will
            switch to it once it is created.
          </DialogDescription>
        </DialogHeader>
        <CreateWorkspaceForm
          onCreated={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
