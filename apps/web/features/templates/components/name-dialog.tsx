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
import { copy, describeError } from "@/features/templates/lib/copy";
import {
  maxNameLength,
  type Template,
  type TemplateSummary,
} from "@/features/templates/lib/templates";
import {
  createTemplate,
  renameTemplate,
} from "@/features/templates/queries/client";

const text = copy.nameDialog;

type NameDialogProps = {
  open: boolean;
  formKey: number;
  template: TemplateSummary | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (template: Template, created: boolean) => void;
};

export function NameDialog({
  open,
  formKey,
  template,
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
          template={template}
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
  template: TemplateSummary | null;
  pending: boolean;
  onPendingChange: (pending: boolean) => void;
  onCancel: () => void;
  onSaved: (template: Template, created: boolean) => void;
};

function NameForm({
  template,
  pending,
  onPendingChange,
  onCancel,
  onSaved,
}: NameFormProps) {
  const [name, setName] = useState(template?.name ?? "");
  const [error, setError] = useState<string | null>(null);

  function fail(message: string) {
    setError(message);
    document.getElementById("template-name")?.focus();
  }

  async function submit(value: string) {
    const result = template
      ? await renameTemplate(template.id, value)
      : await createTemplate(value);
    if (result.ok) {
      onSaved(result.data, template === null);
      if (template) {
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
      template ? copy.toasts.renameFailed : copy.toasts.createFailed,
      { description: describeError(result.error) },
    );
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
    if (template && value === template.name) {
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
          {template ? text.renameTitle : text.createTitle}
        </DialogTitle>
        <DialogDescription className="break-words text-[13px]">
          {template
            ? text.renameDescription(template.name)
            : text.createDescription}
        </DialogDescription>
      </DialogHeader>
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor="template-name" className="text-[13px]">
          {text.name}
        </FieldLabel>
        <Input
          id="template-name"
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
          aria-describedby={error ? "template-name-error" : undefined}
          className={cn(inputClass, "md:text-[13px]")}
        />
        {error ? (
          <FieldError
            id="template-name-error"
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
          {template ? text.save : text.create}
        </Button>
      </div>
    </form>
  );
}
