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
import { cn } from "@workspace/ui/lib/utils";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import {
  dialogActionsClass,
  dialogContentClass,
  dialogTitleClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import { copy, describeError } from "@/features/forms/lib/copy";
import { type Form, maxNameLength } from "@/features/forms/lib/forms";
import { createForm } from "@/features/forms/queries/client";

const text = copy.nameDialog;

type NameDialogProps = {
  open: boolean;
  formKey: number;
  onOpenChange: (open: boolean) => void;
  onCreated: (form: Form) => void;
};

export function NameDialog({
  open,
  formKey,
  onOpenChange,
  onCreated,
}: NameDialogProps) {
  const [pending, setPending] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next || !pending) {
          onOpenChange(next);
        }
      }}
    >
      <DialogContent className={dialogContentClass}>
        <NameForm
          key={formKey}
          pending={pending}
          onPendingChange={setPending}
          onCancel={() => onOpenChange(false)}
          onCreated={onCreated}
        />
      </DialogContent>
    </Dialog>
  );
}

type NameFormProps = {
  pending: boolean;
  onPendingChange: (pending: boolean) => void;
  onCancel: () => void;
  onCreated: (form: Form) => void;
};

function NameForm({
  pending,
  onPendingChange,
  onCancel,
  onCreated,
}: NameFormProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function fail(message: string) {
    setError(message);
    document.getElementById("form-new-name")?.focus();
  }

  async function submit(value: string) {
    const result = await createForm(value);
    if (result.ok) {
      onCreated(result.data);
      return;
    }
    onPendingChange(false);
    if (result.error.code === "name_taken") {
      fail(text.nameTaken);
      return;
    }
    if (result.error.field === "name") {
      fail(describeError(result.error));
      return;
    }
    toast.error(copy.toasts.createFailed, {
      description: describeError(result.error),
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    const value = name.trim().replace(/\s+/g, " ");
    if (value === "") {
      fail(text.nameMissing);
      return;
    }
    if (value.length > maxNameLength) {
      fail(text.nameTooLong(maxNameLength));
      return;
    }
    setError(null);
    onPendingChange(true);
    void submit(value);
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle className={dialogTitleClass}>
          {text.createTitle}
        </DialogTitle>
        <DialogDescription className="text-[13px]">
          {text.createDescription}
        </DialogDescription>
      </DialogHeader>
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor="form-new-name" className="text-[13px]">
          {text.name}
        </FieldLabel>
        <Input
          id="form-new-name"
          name="name"
          type="text"
          autoComplete="off"
          autoFocus
          required
          disabled={pending}
          maxLength={maxNameLength}
          placeholder={text.namePlaceholder}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (error) {
              setError(null);
            }
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "form-new-name-error" : undefined}
          className={cn(inputClass, "md:text-[13px]")}
        />
        {error ? (
          <FieldError
            id="form-new-name-error"
            className="text-[13px] text-danger"
          >
            {error}
          </FieldError>
        ) : null}
      </Field>
      <div className={dialogActionsClass}>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onCancel}
          className={secondaryButtonClass}
        >
          {text.cancel}
        </Button>
        <Button
          type="submit"
          disabled={pending}
          aria-busy={pending || undefined}
          className={primaryButtonClass}
        >
          {pending ? <Spinner /> : null}
          {text.create}
        </Button>
      </div>
    </form>
  );
}
