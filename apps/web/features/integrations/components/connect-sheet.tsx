"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@workspace/ui/components/combobox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group";
import { cn } from "@workspace/ui/lib/utils";
import { ArrowLeft, ChevronRight, Info } from "lucide-react";
import { type FormEvent, Fragment, useRef, useState } from "react";
import { toast } from "sonner";
import { focusRing } from "@/components/app-shell/page-header";
import { SourceMark } from "@/components/product/source-mark";
import {
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
  segmentedGroupClass,
  segmentedItemClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import { comingSoonClass } from "@/features/integrations/components/integration-parts";
import {
  type ConnectField,
  findIntegration,
  formatFeatures,
  type Integration,
  type IntegrationId,
  integrations,
  type Option,
  securityOptions,
  sesRegions,
} from "@/features/integrations/lib/catalog";
import {
  copy,
  describeError,
  describeMailboxError,
} from "@/features/integrations/lib/copy";
import type { SendingSource } from "@/features/integrations/lib/sources";
import {
  type ApiError,
  authorizeGmail,
  connectMailbox,
  connectResend,
} from "@/features/integrations/queries/mutations";
import { useOrigin } from "@/hooks/use-hydrated";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fieldDomId(id: string) {
  return `connect-${id}`;
}

function initialValues(integration: Integration) {
  const values: Record<string, string> = {};
  for (const field of integration.fields) {
    if (field.kind === "security") {
      values[field.id] = securityOptions[0]?.value ?? "";
    } else if (field.kind === "preset") {
      values[field.id] = field.presets[0]?.value ?? "";
    } else if (field.kind === "region") {
      values[field.id] = "";
    } else {
      values[field.id] = field.defaultValue ?? "";
    }
  }
  return values;
}

function validateField(field: ConnectField, raw: string) {
  if (field.kind === "security" || field.kind === "preset") {
    return undefined;
  }
  const value = field.kind === "password" ? raw : raw.trim();
  if (value === "") {
    return "optional" in field && field.optional ? undefined : field.missing;
  }
  if (field.kind === "email" && !emailPattern.test(value)) {
    return copy.sheet.invalidEmail;
  }
  if (field.kind === "number") {
    const number = Number(value);
    if (
      !Number.isInteger(number) ||
      number < 1 ||
      number > (field.max ?? 65535)
    ) {
      return field.missing;
    }
  }
  return undefined;
}

const apiFieldIds: Record<string, string> = {
  dailySendLimit: "dailyLimit",
  email: "address",
};

const errorFieldIds: Record<string, string> = {
  name_taken: "name",
  invalid_credentials: "apiKey",
};

function fieldOfError(error: ApiError, integration: Integration) {
  const known = (id: string | null | undefined) =>
    id && integration.fields.some((field) => field.id === id) ? id : null;
  const named = error.field ? (apiFieldIds[error.field] ?? error.field) : null;
  const nameTaken = error.field === "name" || error.code === "name_taken";
  return (
    known(named) ??
    known(errorFieldIds[error.code]) ??
    (nameTaken ? known("address") : null)
  );
}

function isServerField(field: ConnectField) {
  return "server" in field && field.server === true;
}

function securityOf(value: string | undefined) {
  return value === "starttls" ? "starttls" : "tls";
}

type ConnectSheetProps = {
  open: boolean;
  integrationId: IntegrationId | null;
  gmailConnectable: boolean;
  onPick: (id: IntegrationId | null) => void;
  onOpenChange: (open: boolean) => void;
  onConnected: (source: SendingSource) => void;
};

export function ConnectSheet({
  open,
  integrationId,
  gmailConnectable,
  onPick,
  onOpenChange,
  onConnected,
}: ConnectSheetProps) {
  const [pending, setPending] = useState(false);
  const integration = integrationId ? findIntegration(integrationId) : null;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!pending) {
          onOpenChange(next);
        }
      }}
    >
      <SheetContent className="w-full gap-0 text-[13px] data-[side=right]:w-full data-[side=right]:sm:max-w-[460px]">
        {integration ? (
          <ConnectForm
            key={integration.id}
            integration={integration}
            blocked={integration.id === "gmail" && !gmailConnectable}
            pending={pending}
            onPendingChange={setPending}
            onBack={() => onPick(null)}
            onCancel={() => onOpenChange(false)}
            onConnected={onConnected}
          />
        ) : (
          <>
            <SheetHeader className="gap-0.5 border-b border-border-subtle px-5 py-4 pr-12">
              <SheetTitle className="text-[15px] font-semibold tracking-[-0.01em]">
                {copy.sheet.chooseTitle}
              </SheetTitle>
              <SheetDescription className="text-[13px]">
                {copy.sheet.chooseDescription}
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <ul>
                {integrations.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      disabled={!item.available}
                      onClick={() => onPick(item.id)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted disabled:hover:bg-transparent",
                        focusRing,
                      )}
                    >
                      <SourceMark
                        integration={item}
                        className={item.available ? undefined : "opacity-60"}
                      />
                      <span
                        className={cn(
                          "min-w-0 flex-1",
                          !item.available && "opacity-60",
                        )}
                      >
                        <span className="block truncate text-[13px] font-medium text-foreground">
                          {item.name}
                        </span>
                        <span className="block truncate text-xs text-ink-tertiary">
                          {formatFeatures(item.features)}
                        </span>
                      </span>
                      {item.available ? (
                        <ChevronRight
                          aria-hidden="true"
                          strokeWidth={1.6}
                          className="size-4 shrink-0 text-ink-tertiary"
                        />
                      ) : (
                        <span className={comingSoonClass}>
                          {copy.catalog.comingSoon}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

type ConnectFormProps = {
  integration: Integration;
  blocked: boolean;
  pending: boolean;
  onPendingChange: (pending: boolean) => void;
  onBack: () => void;
  onCancel: () => void;
  onConnected: (source: SendingSource) => void;
};

function ConnectForm({
  integration,
  blocked,
  pending,
  onPendingChange,
  onBack,
  onCancel,
  onConnected,
}: ConnectFormProps) {
  const [values, setValues] = useState(() => initialValues(integration));
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const typed = useRef(new Set<string>());

  const presetField = integration.fields.find(
    (field) => field.kind === "preset",
  );
  const preset =
    presetField?.presets.find(
      (item) => item.value === values[presetField.id],
    ) ?? null;
  const presetValues = preset?.values ?? null;
  const visibleFields = integration.fields.filter(
    (field) => presetValues === null || !isServerField(field),
  );

  function update(field: ConnectField, value: string) {
    if (field.kind !== "security" && field.kind !== "preset") {
      typed.current.add(field.id);
    }
    const port =
      field.kind === "security" && field.port ? field.port : undefined;
    const portValue =
      port && !typed.current.has(port.field) ? port.byValue[value] : undefined;
    setValues((current) => ({
      ...current,
      [field.id]: value,
      ...(port && portValue !== undefined ? { [port.field]: portValue } : {}),
    }));
    if (errors[field.id]) {
      setErrors((current) => ({
        ...current,
        [field.id]: validateField(field, value),
      }));
    }
  }

  function focusField(fieldId: string) {
    window.requestAnimationFrame(() => {
      document.getElementById(fieldDomId(fieldId))?.focus();
    });
  }

  function showFailure(error: ApiError) {
    const message =
      integration.id === "imap-smtp"
        ? describeMailboxError(error)
        : describeError(error);
    const fieldId = fieldOfError(error, integration);
    if (fieldId) {
      const target = integration.fields.find((field) => field.id === fieldId);
      const manual = presetField?.presets.find((item) => item.values === null);
      if (
        target &&
        presetField &&
        presetValues &&
        manual &&
        isServerField(target)
      ) {
        setValues((current) => ({
          ...current,
          ...presetValues,
          [presetField.id]: manual.value,
        }));
      }
      setErrors((current) => ({ ...current, [fieldId]: message }));
      focusField(fieldId);
      return;
    }
    toast.error(copy.sheet.connectFailed(integration.name), {
      description: message,
    });
  }

  async function connect() {
    if (integration.id === "gmail") {
      const limit = (values.dailyLimit ?? "").trim();
      const result = await authorizeGmail(
        limit === "" ? {} : { dailySendLimit: Number(limit) },
      );
      if (result.ok) {
        window.location.href = result.data.url;
        return;
      }
      onPendingChange(false);
      showFailure(result.error);
      return;
    }
    if (integration.id === "imap-smtp") {
      const sent = { ...values, ...presetValues };
      const limit = (sent.dailyLimit ?? "").trim();
      const result = await connectMailbox({
        email: (sent.address ?? "").trim(),
        password: sent.password ?? "",
        smtpHost: (sent.smtpHost ?? "").trim(),
        smtpPort: Number(sent.smtpPort),
        smtpSecurity: securityOf(sent.smtpSecurity),
        imapHost: (sent.imapHost ?? "").trim(),
        imapPort: Number(sent.imapPort),
        imapSecurity: securityOf(sent.imapSecurity),
        ...(limit === "" ? {} : { dailySendLimit: Number(limit) }),
      });
      onPendingChange(false);
      if (result.ok) {
        onConnected(result.data);
        return;
      }
      showFailure(result.error);
      return;
    }
    const result = await connectResend({
      name: (values.name ?? "").trim(),
      apiKey: (values.apiKey ?? "").trim(),
    });
    onPendingChange(false);
    if (result.ok) {
      onConnected(result.data);
      return;
    }
    showFailure(result.error);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || blocked || !integration.available) {
      return;
    }
    const next: Record<string, string | undefined> = {};
    for (const field of visibleFields) {
      next[field.id] = validateField(field, values[field.id] ?? "");
    }
    setErrors(next);
    const firstInvalid = visibleFields.find((field) => next[field.id]);
    if (firstInvalid) {
      document.getElementById(fieldDomId(firstInvalid.id))?.focus();
      return;
    }
    onPendingChange(true);
    void connect();
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className="flex min-h-0 flex-1 flex-col"
    >
      <SheetHeader className="gap-3 border-b border-border-subtle px-5 py-4 pr-12">
        <button
          type="button"
          disabled={pending}
          onClick={onBack}
          className={cn(
            "-ml-1 inline-flex w-fit items-center gap-1 rounded-[6px] px-1 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50",
            focusRing,
          )}
        >
          <ArrowLeft
            aria-hidden="true"
            strokeWidth={1.6}
            className="size-3.5"
          />
          {copy.sheet.back}
        </button>
        <div className="flex items-center gap-2.5">
          <SourceMark integration={integration} className="size-8" />
          <div className="min-w-0">
            <SheetTitle className="truncate text-[15px] font-semibold tracking-[-0.01em]">
              {copy.sheet.title(integration.name)}
            </SheetTitle>
            <p className="truncate text-xs text-ink-tertiary">
              {formatFeatures(integration.features)}
            </p>
          </div>
        </div>
      </SheetHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <SheetDescription className="text-[13px] leading-normal text-muted-foreground">
          {integration.intro}
        </SheetDescription>
        <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4">
          {visibleFields.map((field) => (
            <Fragment key={field.id}>
              <ConnectFieldControl
                field={field}
                value={values[field.id] ?? ""}
                error={errors[field.id]}
                disabled={pending}
                onChange={(value) => update(field, value)}
              />
              {presetField?.noticeAfter === field.id && preset?.notice ? (
                <p
                  role="note"
                  className="col-span-2 flex gap-2 rounded-lg bg-info-surface px-3 py-2.5 leading-normal text-foreground"
                >
                  <Info
                    aria-hidden="true"
                    strokeWidth={1.6}
                    className="mt-0.5 size-4 shrink-0 text-info"
                  />
                  <span className="min-w-0">{preset.notice}</span>
                </p>
              ) : null}
            </Fragment>
          ))}
        </div>
        {blocked ? <GmailSetupNotice /> : null}
      </div>

      <div className="flex flex-col gap-3 border-t border-border-subtle px-5 py-4">
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onCancel}
            className={secondaryButtonClass}
          >
            {copy.sheet.cancel}
          </Button>
          <Button
            type="submit"
            disabled={pending || blocked}
            aria-busy={pending || undefined}
            className={primaryButtonClass}
          >
            {pending ? <Spinner /> : null}
            {integration.submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}

function GmailSetupNotice() {
  const origin = useOrigin();
  return (
    <div className="mt-4 flex gap-2 rounded-lg bg-info-surface px-3 py-2.5 leading-normal text-foreground">
      <Info
        aria-hidden="true"
        strokeWidth={1.6}
        className="mt-0.5 size-4 shrink-0 text-info"
      />
      <div className="min-w-0">
        <p>
          <span className="font-medium text-info">
            {copy.sheet.gmailSetupTitle}
          </span>{" "}
          {copy.sheet.gmailSetupBody}
        </p>
        <p className="mt-1.5 font-mono text-[12.5px] break-all select-all">
          {origin}
          {copy.sheet.gmailCallbackPath}
        </p>
      </div>
    </div>
  );
}

type ConnectFieldControlProps = {
  field: ConnectField;
  value: string;
  error: string | undefined;
  disabled: boolean;
  onChange: (value: string) => void;
};

function ConnectFieldControl({
  field,
  value,
  error,
  disabled,
  onChange,
}: ConnectFieldControlProps) {
  const id = fieldDomId(field.id);
  const span = "half" in field && field.half ? "col-span-1" : "col-span-2";

  if (field.kind === "security" || field.kind === "preset") {
    const options = field.kind === "preset" ? field.presets : securityOptions;
    return (
      <Field data-invalid={error ? true : undefined} className={span}>
        <span
          id={`${id}-label`}
          className="text-[13px] leading-snug font-medium"
        >
          {field.label}
        </span>
        <ToggleGroup
          id={id}
          aria-labelledby={`${id}-label`}
          aria-describedby={error ? `${id}-error` : undefined}
          value={[value]}
          disabled={disabled}
          onValueChange={(next) => {
            if (next[0]) {
              onChange(next[0]);
            }
          }}
          className={segmentedGroupClass}
        >
          {options.map((option) => (
            <ToggleGroupItem
              key={option.value}
              value={option.value}
              className={segmentedItemClass}
            >
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {error ? (
          <FieldError id={`${id}-error`} className="text-[13px] text-danger">
            {error}
          </FieldError>
        ) : null}
      </Field>
    );
  }

  const hint = field.hint;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const message = error ? (
    <FieldError id={`${id}-error`} className="text-[13px] text-danger">
      {error}
    </FieldError>
  ) : hint ? (
    <FieldDescription id={`${id}-hint`} className="text-[13px]">
      {hint}
    </FieldDescription>
  ) : null;

  if (field.kind === "region") {
    const selected =
      sesRegions.find((option) => option.value === value) ?? null;
    return (
      <Field data-invalid={error ? true : undefined} className={span}>
        <FieldLabel htmlFor={id} className="text-[13px]">
          {field.label}
        </FieldLabel>
        <Combobox
          items={sesRegions}
          value={selected}
          onValueChange={(next: Option | null) => onChange(next?.value ?? "")}
          disabled={disabled}
        >
          <ComboboxInput
            id={id}
            placeholder={copy.sheet.regionPlaceholder}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className="w-full bg-card text-[13px] shadow-xs"
          />
          <ComboboxContent>
            <ComboboxEmpty>{copy.sheet.regionEmpty}</ComboboxEmpty>
            <ComboboxList>
              {(item: Option) => (
                <ComboboxItem
                  key={item.value}
                  value={item}
                  className="text-[13px]"
                >
                  {item.label}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        {message}
      </Field>
    );
  }

  return (
    <Field data-invalid={error ? true : undefined} className={span}>
      <FieldLabel htmlFor={id} className="text-[13px]">
        {field.label}
      </FieldLabel>
      <Input
        id={id}
        name={field.id}
        type={field.kind === "number" ? "text" : field.kind}
        inputMode={field.kind === "number" ? "numeric" : undefined}
        autoComplete="off"
        spellCheck={false}
        required={!field.optional}
        disabled={disabled}
        placeholder={field.placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          inputClass,
          field.mono && "font-mono text-[12.5px]",
          field.kind === "number" && "tabular-nums",
        )}
      />
      {message}
    </Field>
  );
}
