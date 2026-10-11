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
import {
  type Campaign,
  maxNameLength,
} from "@/features/campaigns/lib/campaigns";
import { copy, describeError } from "@/features/campaigns/lib/copy";
import { createCampaign } from "@/features/campaigns/queries/client";

const text = copy.nameDialog;

type NameDialogProps = {
  open: boolean;
  formKey: number;
  fromName: string;
  onOpenChange: (open: boolean) => void;
  onCreated: (campaign: Campaign) => void;
};

export function NameDialog({
  open,
  formKey,
  fromName,
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
          fromName={fromName}
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
  fromName: string;
  pending: boolean;
  onPendingChange: (pending: boolean) => void;
  onCancel: () => void;
  onCreated: (campaign: Campaign) => void;
};

function NameForm({
  fromName,
  pending,
  onPendingChange,
  onCancel,
  onCreated,
}: NameFormProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function fail(message: string) {
    setError(message);
    document.getElementById("campaign-name")?.focus();
  }

  async function submit(value: string) {
    const result = await createCampaign(value, fromName);
    if (result.ok) {
      onCreated(result.data);
      return;
    }
    onPendingChange(false);
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
        <DialogTitle className={dialogTitleClass}>{text.title}</DialogTitle>
        <DialogDescription className="text-[13px]">
          {text.description}
        </DialogDescription>
      </DialogHeader>
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor="campaign-name" className="text-[13px]">
          {text.name}
        </FieldLabel>
        <Input
          id="campaign-name"
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
          aria-describedby={error ? "campaign-name-error" : undefined}
          className={cn(inputClass, "md:text-[13px]")}
        />
        {error ? (
          <FieldError
            id="campaign-name-error"
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
