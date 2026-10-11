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
import { copy, describeError } from "@/features/sequences/lib/copy";
import { browserTimezone } from "@/features/sequences/lib/schedule";
import {
  cleanName,
  maxNameLength,
  type Sequence,
  type SequenceSummary,
} from "@/features/sequences/lib/sequences";
import {
  createSequence,
  updateSequence,
} from "@/features/sequences/queries/client";

const text = copy.nameDialog;

type NameDialogProps = {
  open: boolean;
  formKey: number;
  sequence: SequenceSummary | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (sequence: Sequence, created: boolean) => void;
};

export function NameDialog({
  open,
  formKey,
  sequence,
  onOpenChange,
  onSaved,
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
          sequence={sequence}
          pending={pending}
          onPendingChange={setPending}
          onCancel={() => onOpenChange(false)}
          onSaved={onSaved}
        />
      </DialogContent>
    </Dialog>
  );
}

type NameFormProps = {
  sequence: SequenceSummary | null;
  pending: boolean;
  onPendingChange: (pending: boolean) => void;
  onCancel: () => void;
  onSaved: (sequence: Sequence, created: boolean) => void;
};

function NameForm({
  sequence,
  pending,
  onPendingChange,
  onCancel,
  onSaved,
}: NameFormProps) {
  const [name, setName] = useState(sequence?.name ?? "");
  const [error, setError] = useState<string | null>(null);

  function fail(message: string) {
    setError(message);
    document.getElementById("sequence-name")?.focus();
  }

  async function submit(value: string) {
    const result = sequence
      ? await updateSequence(sequence.id, { name: value })
      : await createSequence(value, browserTimezone());
    if (result.ok) {
      onSaved(result.data, sequence === null);
      if (sequence) {
        onPendingChange(false);
      }
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
    toast.error(
      sequence ? copy.toasts.renameFailed : copy.toasts.createFailed,
      { description: describeError(result.error) },
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    const value = cleanName(name);
    if (value === "") {
      fail(text.nameMissing);
      return;
    }
    if (value.length > maxNameLength) {
      fail(text.nameTooLong(maxNameLength));
      return;
    }
    if (sequence && value === sequence.name) {
      onCancel();
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
          {sequence ? text.renameTitle : text.createTitle}
        </DialogTitle>
        <DialogDescription className="break-words text-[13px]">
          {sequence
            ? text.renameDescription(sequence.name)
            : text.createDescription}
        </DialogDescription>
      </DialogHeader>
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor="sequence-name" className="text-[13px]">
          {text.name}
        </FieldLabel>
        <Input
          id="sequence-name"
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
          aria-describedby={error ? "sequence-name-error" : undefined}
          className={cn(inputClass, "md:text-[13px]")}
        />
        {error ? (
          <FieldError
            id="sequence-name-error"
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
          {sequence ? text.save : text.create}
        </Button>
      </div>
    </form>
  );
}
