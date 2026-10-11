"use client";

import { Button } from "@workspace/ui/components/button";
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
  InputGroupInput,
} from "@workspace/ui/components/input-group";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet";
import { Switch } from "@workspace/ui/components/switch";
import { cn } from "@workspace/ui/lib/utils";
import { Check, Copy } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { buttonFocusRing } from "@/components/app-shell/page-header";
import {
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import { copy, describeError } from "@/features/warmup/lib/copy";
import {
  type NumberSetting,
  numberSettings,
  parseSetting,
  rampDay,
  type WarmupMailbox,
} from "@/features/warmup/lib/warmup";
import { updateWarmup } from "@/features/warmup/queries/mutations";

const text = copy.sheet;

type Values = Record<NumberSetting, string>;
type Errors = Partial<Record<NumberSetting, string>>;

function fieldDomId(id: string) {
  return `warmup-${id}`;
}

function isNumberSetting(value: string | null): value is NumberSetting {
  return numberSettings.some((id) => id === value);
}

function problemOf(id: NumberSetting, values: Values) {
  const value = parseSetting(id, values[id]);
  if (value === null) {
    return text.invalid[id];
  }
  if (id === "maxPerDay") {
    const start = parseSetting("startPerDay", values.startPerDay);
    if (start !== null && value < start) {
      return text.maxBelowStart;
    }
  }
  return undefined;
}

function previewOf(values: Values) {
  const start = parseSetting("startPerDay", values.startPerDay);
  const increment = parseSetting("incrementPerDay", values.incrementPerDay);
  const max = parseSetting("maxPerDay", values.maxPerDay);
  if (start === null || increment === null || max === null || max < start) {
    return text.previewInvalid;
  }
  return max === start
    ? text.previewFlat(max)
    : text.previewReaches(max, rampDay(start, increment, max));
}

type SettingsSheetProps = {
  mailbox: WarmupMailbox | null;
  formKey: number;
  onClose: () => void;
  onSaved: (mailbox: WarmupMailbox) => void;
  onMissing: () => void;
};

export function SettingsSheet({
  mailbox,
  formKey,
  onClose,
  onSaved,
  onMissing,
}: SettingsSheetProps) {
  const [last, setLast] = useState(mailbox);
  const [pending, setPending] = useState(false);

  if (mailbox !== null && mailbox !== last) {
    setLast(mailbox);
  }

  const shown = mailbox ?? last;

  return (
    <Sheet
      open={mailbox !== null}
      onOpenChange={(next) => {
        if (!next && !pending) {
          onClose();
        }
      }}
    >
      <SheetContent className="w-full gap-0 text-[13px] data-[side=right]:w-full data-[side=right]:sm:max-w-[460px]">
        {shown ? (
          <SettingsForm
            key={formKey}
            mailbox={shown}
            pending={pending}
            onPendingChange={setPending}
            onCancel={onClose}
            onSaved={onSaved}
            onMissing={onMissing}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

type SettingsFormProps = {
  mailbox: WarmupMailbox;
  pending: boolean;
  onPendingChange: (pending: boolean) => void;
  onCancel: () => void;
  onSaved: (mailbox: WarmupMailbox) => void;
  onMissing: () => void;
};

function SettingsForm({
  mailbox,
  pending,
  onPendingChange,
  onCancel,
  onSaved,
  onMissing,
}: SettingsFormProps) {
  const [values, setValues] = useState<Values>(() => ({
    startPerDay: String(mailbox.settings.startPerDay),
    incrementPerDay: String(mailbox.settings.incrementPerDay),
    maxPerDay: String(mailbox.settings.maxPerDay),
    replyRate: String(mailbox.settings.replyRate),
  }));
  const [randomize, setRandomize] = useState(mailbox.settings.randomize);
  const [weekdaysOnly, setWeekdaysOnly] = useState(
    mailbox.settings.weekdaysOnly,
  );
  const [errors, setErrors] = useState<Errors>({});

  function update(id: NumberSetting, value: string) {
    const next = { ...values, [id]: value };
    setValues(next);
    if (errors[id] || errors.maxPerDay) {
      setErrors((current) => ({
        ...current,
        [id]: current[id] ? problemOf(id, next) : undefined,
        ...(current.maxPerDay
          ? { maxPerDay: problemOf("maxPerDay", next) }
          : {}),
      }));
    }
  }

  function focusField(id: NumberSetting) {
    window.requestAnimationFrame(() => {
      document.getElementById(fieldDomId(id))?.focus();
    });
  }

  async function save() {
    const result = await updateWarmup(mailbox.sourceId, {
      startPerDay: Number(values.startPerDay),
      incrementPerDay: Number(values.incrementPerDay),
      maxPerDay: Number(values.maxPerDay),
      replyRate: Number(values.replyRate),
      randomize,
      weekdaysOnly,
    });
    onPendingChange(false);
    if (result.ok) {
      onSaved(result.data);
      return;
    }
    const message = describeError(result.error);
    const { field } = result.error;
    if (isNumberSetting(field)) {
      setErrors({ [field]: message });
      focusField(field);
      return;
    }
    toast.error(copy.toasts.saveFailed, { description: message });
    if (result.error.code === "not_found") {
      onMissing();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    const next: Errors = {};
    for (const id of numberSettings) {
      next[id] = problemOf(id, values);
    }
    setErrors(next);
    const firstInvalid = numberSettings.find((id) => next[id]);
    if (firstInvalid) {
      focusField(firstInvalid);
      return;
    }
    onPendingChange(true);
    void save();
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className="flex min-h-0 flex-1 flex-col"
    >
      <SheetHeader className="gap-1 border-b border-border-subtle px-5 py-4 pr-12">
        <SheetTitle className="text-[15px] font-semibold tracking-[-0.01em]">
          {text.title}
        </SheetTitle>
        <SheetDescription className="truncate text-[13px] leading-normal">
          {mailbox.name}
        </SheetDescription>
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
        <div className="grid grid-cols-2 gap-x-3 gap-y-4">
          {numberSettings.map((id) => {
            const domId = fieldDomId(id);
            const error = errors[id];
            return (
              <Field key={id} data-invalid={error ? true : undefined}>
                <FieldLabel htmlFor={domId} className="text-[13px]">
                  {text.fields[id]}
                </FieldLabel>
                <Input
                  id={domId}
                  name={id}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  required
                  disabled={pending}
                  value={values[id]}
                  onChange={(event) => update(id, event.target.value)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${domId}-error` : `${domId}-hint`}
                  className={cn(inputClass, "tabular-nums")}
                />
                {error ? (
                  <FieldError
                    id={`${domId}-error`}
                    className="text-[13px] text-danger"
                  >
                    {error}
                  </FieldError>
                ) : (
                  <FieldDescription
                    id={`${domId}-hint`}
                    className="text-[13px]"
                  >
                    {text.hints[id]}
                  </FieldDescription>
                )}
              </Field>
            );
          })}
        </div>

        <p className="flex flex-wrap items-baseline gap-x-2 rounded-lg bg-muted px-3 py-2.5">
          <span className="text-xs font-medium text-ink-tertiary">
            {text.preview}
          </span>
          <span aria-live="polite" className="text-foreground tabular-nums">
            {previewOf(values)}
          </span>
        </p>

        <div className="flex flex-col gap-3.5">
          <SwitchRow
            id="warmup-randomize"
            label={text.randomize}
            hint={text.randomizeHint}
            checked={randomize}
            disabled={pending}
            onChange={setRandomize}
          />
          <SwitchRow
            id="warmup-weekdays"
            label={text.weekdaysOnly}
            hint={text.weekdaysOnlyHint}
            checked={weekdaysOnly}
            disabled={pending}
            onChange={setWeekdaysOnly}
          />
        </div>

        <Field className="border-t border-border-subtle pt-4">
          <FieldLabel htmlFor="warmup-identifier" className="text-[13px]">
            {text.identifier}
          </FieldLabel>
          {mailbox.identifier ? (
            <>
              <IdentifierField identifier={mailbox.identifier} />
              <FieldDescription
                id="warmup-identifier-hint"
                className="text-[13px]"
              >
                {text.identifierHint}
              </FieldDescription>
            </>
          ) : (
            <p id="warmup-identifier" className="text-muted-foreground">
              {text.identifierMissing}
            </p>
          )}
        </Field>
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-border-subtle px-5 py-4 sm:flex-row sm:justify-end">
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
          {text.save}
        </Button>
      </div>
    </form>
  );
}

type SwitchRowProps = {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
};

function SwitchRow({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: SwitchRowProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div id={`${id}-label`} className="font-medium text-foreground">
          {label}
        </div>
        <p id={`${id}-hint`} className="text-muted-foreground">
          {hint}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-hint`}
        onCheckedChange={onChange}
        className="mt-0.5"
      />
    </div>
  );
}

function IdentifierField({ identifier }: { identifier: string }) {
  const [copied, setCopied] = useState(false);

  async function copyIdentifier() {
    try {
      await navigator.clipboard.writeText(identifier);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(copy.clipboard.failed, {
        description: copy.clipboard.failedBody,
      });
    }
  }

  return (
    <InputGroup className="h-8 bg-card shadow-xs">
      <InputGroupInput
        id="warmup-identifier"
        readOnly
        value={identifier}
        aria-describedby="warmup-identifier-hint"
        onFocus={(event) => event.target.select()}
        className="font-mono text-[12.5px]"
      />
      <InputGroupAddon align="inline-end" className="pr-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={copied ? text.copiedIdentifier : text.copyIdentifier}
          onClick={copyIdentifier}
          className={cn(
            "size-6 text-muted-foreground hover:bg-accent",
            buttonFocusRing,
          )}
        >
          {copied ? (
            <Check aria-hidden strokeWidth={1.8} className="text-success" />
          ) : (
            <Copy aria-hidden strokeWidth={1.6} />
          )}
        </Button>
      </InputGroupAddon>
      <span aria-live="polite" className="sr-only">
        {copied ? text.copiedIdentifier : ""}
      </span>
    </InputGroup>
  );
}
