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
import { Switch } from "@workspace/ui/components/switch";
import { cn } from "@workspace/ui/lib/utils";
import { type FormEvent, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  dangerButtonClass,
  dialogActionsClass,
  dialogContentClass,
  dialogTitleClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import {
  copy,
  describeError,
  maxSourceNameLength,
} from "@/features/integrations/lib/copy";
import {
  type SendingSource,
  verifiedIdentities,
} from "@/features/integrations/lib/sources";
import {
  disconnectSource,
  sendTestEmail,
  updateSource,
} from "@/features/integrations/queries/mutations";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const countFormat = new Intl.NumberFormat("en-US");

const labelClass = "text-[13px]";
const errorClass = "text-[13px] text-danger";

function useLast<T>(value: T | null) {
  const [last, setLast] = useState(value);
  if (value !== null && value !== last) {
    setLast(value);
  }
  return value ?? last;
}

type SourceDialogProps = {
  source: SendingSource | null;
  onClose: () => void;
  onChanged: (source?: SendingSource) => void;
};

type SourceFormProps = {
  source: SendingSource;
  onClose: () => void;
  onChanged: (source?: SendingSource) => void;
};

type DialogShellProps = {
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
  children: React.ReactNode;
};

function DialogShell({
  open,
  title,
  description,
  onClose,
  children,
}: DialogShellProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <DialogContent className={dialogContentClass}>
        <DialogHeader>
          <DialogTitle className={dialogTitleClass}>{title}</DialogTitle>
          <DialogDescription className="text-[13px]">
            {description}
          </DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

type FormActionsProps = {
  pending: boolean;
  submitLabel: string;
  cancelLabel: string;
  onCancel: () => void;
};

function FormActions({
  pending,
  submitLabel,
  cancelLabel,
  onCancel,
}: FormActionsProps) {
  return (
    <div className={dialogActionsClass}>
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={onCancel}
        className={secondaryButtonClass}
      >
        {cancelLabel}
      </Button>
      <Button
        type="submit"
        disabled={pending}
        aria-busy={pending || undefined}
        className={primaryButtonClass}
      >
        {pending ? <Spinner /> : null}
        {submitLabel}
      </Button>
    </div>
  );
}

function validateName(value: string) {
  const name = value.trim();
  if (name === "") {
    return copy.renameDialog.missing;
  }
  if (name.length > maxSourceNameLength) {
    return copy.renameDialog.tooLong;
  }
  return undefined;
}

export function RenameSourceDialog({
  source,
  onClose,
  onChanged,
}: SourceDialogProps) {
  return (
    <DialogShell
      open={source !== null}
      title={copy.renameDialog.title}
      description={copy.renameDialog.body}
      onClose={onClose}
    >
      {source ? (
        <RenameForm
          key={source.id}
          source={source}
          onClose={onClose}
          onChanged={onChanged}
        />
      ) : null}
    </DialogShell>
  );
}

function RenameForm({ source, onClose, onChanged }: SourceFormProps) {
  const [name, setName] = useState(source.name);
  const [error, setError] = useState<string>();
  const [pending, startRename] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    const invalid = validateName(name);
    setError(invalid);
    if (invalid) {
      document.getElementById("rename-source-name")?.focus();
      return;
    }
    const next = name.trim();
    if (next === source.name) {
      onClose();
      return;
    }

    startRename(async () => {
      const result = await updateSource(source.id, { name: next });
      if (!result.ok) {
        const message = describeError(result.error);
        if (
          result.error.field === "name" ||
          result.error.code === "name_taken"
        ) {
          setError(message);
          document.getElementById("rename-source-name")?.focus();
          return;
        }
        toast.error(copy.toasts.renameFailed, { description: message });
        return;
      }
      toast.success(copy.toasts.renamed(result.data.name));
      onChanged(result.data);
      onClose();
    });
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor="rename-source-name" className={labelClass}>
          {copy.renameDialog.label}
        </FieldLabel>
        <Input
          id="rename-source-name"
          name="name"
          type="text"
          autoComplete="off"
          required
          disabled={pending}
          maxLength={maxSourceNameLength}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (error) {
              setError(validateName(event.target.value));
            }
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "rename-source-name-error" : undefined}
          className={inputClass}
        />
        {error ? (
          <FieldError id="rename-source-name-error" className={errorClass}>
            {error}
          </FieldError>
        ) : null}
      </Field>
      <FormActions
        pending={pending}
        submitLabel={copy.renameDialog.save}
        cancelLabel={copy.renameDialog.cancel}
        onCancel={onClose}
      />
    </form>
  );
}

function parseLimit(value: string) {
  const limit = Number(value.trim());
  return value.trim() !== "" && Number.isInteger(limit) && limit >= 1
    ? limit
    : null;
}

export function DailyLimitDialog({
  source,
  onClose,
  onChanged,
}: SourceDialogProps) {
  const shown = useLast(source);
  return (
    <DialogShell
      open={source !== null}
      title={copy.limitDialog.title(shown?.name ?? "")}
      description={copy.limitDialog.body}
      onClose={onClose}
    >
      {source ? (
        <DailyLimitForm
          key={source.id}
          source={source}
          onClose={onClose}
          onChanged={onChanged}
        />
      ) : null}
    </DialogShell>
  );
}

function DailyLimitForm({ source, onClose, onChanged }: SourceFormProps) {
  const [noLimit, setNoLimit] = useState(source.dailySendLimit === null);
  const [value, setValue] = useState(
    source.dailySendLimit === null ? "" : String(source.dailySendLimit),
  );
  const [error, setError] = useState<string>();
  const [pending, startSave] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    const limit = noLimit ? null : parseLimit(value);
    if (!noLimit && limit === null) {
      setError(copy.limitDialog.invalid);
      document.getElementById("source-daily-limit")?.focus();
      return;
    }
    setError(undefined);
    if (limit === source.dailySendLimit) {
      onClose();
      return;
    }

    startSave(async () => {
      const result = await updateSource(source.id, { dailySendLimit: limit });
      if (!result.ok) {
        const message = describeError(result.error);
        if (result.error.field === "dailySendLimit" && !noLimit) {
          setError(message);
          document.getElementById("source-daily-limit")?.focus();
          return;
        }
        toast.error(copy.toasts.limitFailed, { description: message });
        return;
      }
      const saved = result.data;
      toast.success(
        saved.dailySendLimit === null
          ? copy.toasts.limitRemoved(saved.name)
          : copy.toasts.limitSet(
              saved.name,
              countFormat.format(saved.dailySendLimit),
            ),
      );
      onChanged(saved);
      onClose();
    });
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor="source-daily-limit" className={labelClass}>
          {copy.limitDialog.label}
        </FieldLabel>
        <Input
          id="source-daily-limit"
          name="dailySendLimit"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          disabled={pending || noLimit}
          value={noLimit ? "" : value}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) {
              setError(
                parseLimit(event.target.value) === null
                  ? copy.limitDialog.invalid
                  : undefined,
              );
            }
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "source-daily-limit-error" : undefined}
          className={cn(inputClass, "max-w-40 tabular-nums")}
        />
        {error ? (
          <FieldError id="source-daily-limit-error" className={errorClass}>
            {error}
          </FieldError>
        ) : null}
      </Field>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <label
            htmlFor="source-no-limit"
            className="block text-[13px] font-medium text-foreground"
          >
            {copy.limitDialog.noLimit}
          </label>
          <p id="source-no-limit-hint" className="text-xs text-ink-tertiary">
            {copy.limitDialog.noLimitHint}
          </p>
        </div>
        <Switch
          id="source-no-limit"
          checked={noLimit}
          disabled={pending}
          aria-describedby="source-no-limit-hint"
          onCheckedChange={(checked) => {
            setNoLimit(checked);
            setError(undefined);
          }}
        />
      </div>
      <FormActions
        pending={pending}
        submitLabel={copy.limitDialog.save}
        cancelLabel={copy.limitDialog.cancel}
        onCancel={onClose}
      />
    </form>
  );
}

export function TestEmailDialog({
  source,
  onClose,
  onChanged,
}: SourceDialogProps) {
  const shown = useLast(source);
  return (
    <DialogShell
      open={source !== null}
      title={copy.testEmailDialog.title}
      description={copy.testEmailDialog.body(shown?.name ?? "")}
      onClose={onClose}
    >
      {source ? (
        <TestEmailForm
          key={source.id}
          source={source}
          onClose={onClose}
          onChanged={onChanged}
        />
      ) : null}
    </DialogShell>
  );
}

type TestEmailErrors = { to?: string; from?: string };

function validateAddress(value: string, missing: string) {
  const address = value.trim();
  if (address === "") {
    return missing;
  }
  return emailPattern.test(address)
    ? undefined
    : copy.testEmailDialog.invalidEmail;
}

function TestEmailForm({ source, onClose, onChanged }: SourceFormProps) {
  const needsFrom = source.email === null;
  const text = copy.testEmailDialog;
  const identities = verifiedIdentities(source);
  const [to, setTo] = useState("");
  const [from, setFrom] = useState("");
  const [errors, setErrors] = useState<TestEmailErrors>({});
  const [pending, startSend] = useTransition();

  function focusFirst(next: TestEmailErrors) {
    const id = next.to ? "test-email-to" : next.from ? "test-email-from" : null;
    if (id) {
      document.getElementById(id)?.focus();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    const next: TestEmailErrors = {
      to: validateAddress(to, text.toMissing),
      from: needsFrom ? validateAddress(from, text.fromMissing) : undefined,
    };
    setErrors(next);
    if (next.to || next.from) {
      focusFirst(next);
      return;
    }
    const recipient = to.trim();

    startSend(async () => {
      const result = await sendTestEmail(
        source.id,
        needsFrom ? { to: recipient, from: from.trim() } : { to: recipient },
      );
      if (!result.ok) {
        const { code, field } = result.error;
        const message = describeError(result.error);
        const target =
          code === "domain_not_verified" || field === "from"
            ? "from"
            : field === "to"
              ? "to"
              : null;
        if (target === "to" || (target === "from" && needsFrom)) {
          const failed: TestEmailErrors = { [target]: message };
          setErrors(failed);
          focusFirst(failed);
          return;
        }
        toast.error(copy.toasts.testEmailFailed, { description: message });
        if (code === "auth_revoked" || code === "not_found") {
          onChanged();
        }
        return;
      }
      toast.success(copy.toasts.testEmailSent(recipient), {
        description: copy.toasts.testEmailSentBody,
      });
      onChanged();
      onClose();
    });
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      {needsFrom ? (
        <Field data-invalid={errors.from ? true : undefined}>
          <FieldLabel htmlFor="test-email-from" className={labelClass}>
            {text.from}
          </FieldLabel>
          <Input
            id="test-email-from"
            name="from"
            type="email"
            autoComplete="off"
            spellCheck={false}
            required
            disabled={pending}
            placeholder={text.fromPlaceholder}
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              if (errors.from) {
                setErrors((current) => ({
                  ...current,
                  from: validateAddress(event.target.value, text.fromMissing),
                }));
              }
            }}
            aria-invalid={errors.from ? true : undefined}
            aria-describedby={
              errors.from ? "test-email-from-error" : "test-email-from-hint"
            }
            className={inputClass}
          />
          {errors.from ? (
            <FieldError id="test-email-from-error" className={errorClass}>
              {errors.from}
            </FieldError>
          ) : (
            <FieldDescription id="test-email-from-hint" className="text-[13px]">
              {identities.length > 0
                ? text.fromHintIdentities(identities.slice(0, 6).join(", "))
                : text.fromHint}
            </FieldDescription>
          )}
        </Field>
      ) : null}
      <Field data-invalid={errors.to ? true : undefined}>
        <FieldLabel htmlFor="test-email-to" className={labelClass}>
          {text.to}
        </FieldLabel>
        <Input
          id="test-email-to"
          name="to"
          type="email"
          autoComplete="email"
          spellCheck={false}
          required
          disabled={pending}
          placeholder={text.toPlaceholder}
          value={to}
          onChange={(event) => {
            setTo(event.target.value);
            if (errors.to) {
              setErrors((current) => ({
                ...current,
                to: validateAddress(event.target.value, text.toMissing),
              }));
            }
          }}
          aria-invalid={errors.to ? true : undefined}
          aria-describedby={errors.to ? "test-email-to-error" : undefined}
          className={inputClass}
        />
        {errors.to ? (
          <FieldError id="test-email-to-error" className={errorClass}>
            {errors.to}
          </FieldError>
        ) : null}
      </Field>
      <FormActions
        pending={pending}
        submitLabel={text.send}
        cancelLabel={text.cancel}
        onCancel={onClose}
      />
    </form>
  );
}

export function DisconnectDialog({
  source,
  onClose,
  onChanged,
}: SourceDialogProps) {
  const shown = useLast(source);
  const [pending, startDisconnect] = useTransition();

  function confirm() {
    if (!source || pending) {
      return;
    }
    startDisconnect(async () => {
      const result = await disconnectSource(source.id);
      if (!result.ok && result.error.code !== "not_found") {
        toast.error(copy.toasts.disconnectFailed(source.name), {
          description: describeError(result.error),
        });
        return;
      }
      toast.success(copy.toasts.disconnected(source.name));
      onChanged();
      onClose();
    });
  }

  return (
    <DialogShell
      open={source !== null}
      title={copy.disconnectDialog.title(shown?.name ?? "")}
      description={copy.disconnectDialog.body}
      onClose={() => {
        if (!pending) {
          onClose();
        }
      }}
    >
      <div className={dialogActionsClass}>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onClose}
          className={secondaryButtonClass}
        >
          {copy.disconnectDialog.cancel}
        </Button>
        <Button
          type="button"
          disabled={pending}
          aria-busy={pending || undefined}
          onClick={confirm}
          className={dangerButtonClass}
        >
          {pending ? <Spinner /> : null}
          {copy.disconnectDialog.confirm}
        </Button>
      </div>
    </DialogShell>
  );
}
