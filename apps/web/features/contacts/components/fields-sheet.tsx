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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
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
import { cn } from "@workspace/ui/lib/utils";
import { Ellipsis, Pencil, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState, useTransition } from "react";
import { toast } from "sonner";
import { buttonFocusRing } from "@/components/app-shell/page-header";
import { LoadFailed } from "@/components/product/load-failed";
import {
  dangerButtonClass,
  dialogActionsClass,
  dialogContentClass,
  dialogTitleClass,
  inputClass,
  menuItemClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import { TokenInput } from "@/components/token-input";
import { OptionCombobox } from "@/features/contacts/components/option-combobox";
import {
  type ContactField,
  type FieldType,
  fieldKeyFromLabel,
  fieldTypes,
  isFieldKey,
  maxFieldKeyLength,
  maxFieldLabelLength,
  maxFieldOptions,
  maxFields,
} from "@/features/contacts/lib/contacts";
import {
  copy,
  describeError,
  fieldTypeLabels,
} from "@/features/contacts/lib/copy";
import {
  createContactField,
  deleteContactField,
  fetchContactFields,
  updateContactField,
} from "@/features/contacts/queries/client";

const text = copy.fieldsSheet;

const labelClass = "text-[13px]";
const errorClass = "text-[13px] text-danger";
const formClass =
  "flex flex-col gap-4 rounded-lg border border-border bg-muted/50 p-3.5";

const typeOptions = fieldTypes.map((type) => ({
  value: type,
  label: fieldTypeLabels[type],
}));

type Mode = { kind: "list" } | { kind: "add" } | { kind: "edit"; id: string };

type FieldsSheetProps = {
  open: boolean;
  fields: ContactField[] | null;
  onOpenChange: (open: boolean) => void;
  onChange: (fields: ContactField[]) => void;
};

export function FieldsSheet({
  open,
  fields,
  onOpenChange,
  onChange,
}: FieldsSheetProps) {
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<ContactField | null>(null);
  const [retrying, startRetry] = useTransition();

  const full = fields !== null && fields.length >= maxFields;

  function retry() {
    startRetry(async () => {
      const result = await fetchContactFields();
      if (result.ok) {
        onChange(result.data);
      }
    });
  }

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (next || !busy) {
            onOpenChange(next);
            if (!next) {
              setMode({ kind: "list" });
            }
          }
        }}
      >
        <SheetContent className="w-full gap-0 text-[13px] data-[side=right]:w-full data-[side=right]:sm:max-w-[480px]">
          <SheetHeader className="gap-1 border-b border-border-subtle px-5 py-4 pr-12">
            <SheetTitle className="text-[15px] font-semibold tracking-[-0.01em]">
              {text.title}
            </SheetTitle>
            <SheetDescription className="text-[13px] leading-normal">
              {text.description}
            </SheetDescription>
          </SheetHeader>

          {fields === null ? (
            <LoadFailed
              title={text.loadFailed.title}
              body={text.loadFailed.body}
              retryLabel={text.loadFailed.retry}
              pending={retrying}
              onRetry={retry}
            />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <p
                  aria-live="polite"
                  className="text-[12.5px] text-ink-tertiary tabular-nums"
                >
                  {text.counter(fields.length, maxFields)}
                </p>
                {mode.kind === "list" ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={full}
                    onClick={() => setMode({ kind: "add" })}
                    className={secondaryButtonClass}
                  >
                    <Plus aria-hidden strokeWidth={1.8} />
                    {text.add}
                  </Button>
                ) : null}
              </div>

              {full ? (
                <p className="rounded-lg bg-warning-surface px-3 py-2.5 text-[13px] text-warning">
                  {text.limitReached}
                </p>
              ) : null}

              {mode.kind === "add" ? (
                <AddFieldForm
                  onBusyChange={setBusy}
                  onCancel={() => setMode({ kind: "list" })}
                  onCreated={(field) => {
                    onChange([...fields, field]);
                    setMode({ kind: "list" });
                  }}
                />
              ) : null}

              {fields.length === 0 ? (
                mode.kind === "add" ? null : (
                  <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-[13px] text-muted-foreground">
                    {text.empty}
                  </p>
                )
              ) : (
                <ul className="divide-y divide-border-subtle rounded-lg border border-border">
                  {fields.map((field) =>
                    mode.kind === "edit" && mode.id === field.id ? (
                      <li key={field.id} className="p-2">
                        <EditFieldForm
                          field={field}
                          onBusyChange={setBusy}
                          onCancel={() => setMode({ kind: "list" })}
                          onSaved={(saved) => {
                            onChange(
                              fields.map((item) =>
                                item.id === saved.id ? saved : item,
                              ),
                            );
                            setMode({ kind: "list" });
                          }}
                        />
                      </li>
                    ) : (
                      <li
                        key={field.id}
                        className="flex items-center gap-3 px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-foreground">
                            {field.label}
                          </p>
                          <p className="flex min-w-0 items-center gap-1.5 text-xs text-ink-tertiary">
                            <span className="shrink-0">
                              {fieldTypeLabels[field.type]}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="truncate font-mono">
                              {field.key}
                            </span>
                          </p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            aria-label={text.actionsFor(field.label)}
                            disabled={busy}
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className={cn(
                                  "-mr-1 text-muted-foreground hover:bg-accent",
                                  buttonFocusRing,
                                )}
                              />
                            }
                          >
                            <Ellipsis aria-hidden strokeWidth={1.6} />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="w-40 p-1 text-[13px]"
                          >
                            <DropdownMenuItem
                              className={menuItemClass}
                              onClick={() =>
                                setMode({ kind: "edit", id: field.id })
                              }
                            >
                              <Pencil aria-hidden strokeWidth={1.6} />
                              {text.rename}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              className={menuItemClass}
                              onClick={() => setTarget(field)}
                            >
                              <Trash2 aria-hidden strokeWidth={1.6} />
                              {text.delete}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </li>
                    ),
                  )}
                </ul>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
      <DeleteFieldDialog
        field={target}
        onClose={() => setTarget(null)}
        onDeleted={(deleted) => {
          onChange((fields ?? []).filter((item) => item.id !== deleted.id));
          setMode({ kind: "list" });
        }}
      />
    </>
  );
}

type AddErrors = { label?: string; key?: string; options?: string };

type AddFieldFormProps = {
  onBusyChange: (busy: boolean) => void;
  onCancel: () => void;
  onCreated: (field: ContactField) => void;
};

function AddFieldForm({
  onBusyChange,
  onCancel,
  onCreated,
}: AddFieldFormProps) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [options, setOptions] = useState<string[]>([]);
  const [customKey, setCustomKey] = useState<string | null>(null);
  const [errors, setErrors] = useState<AddErrors>({});
  const [limit, setLimit] = useState(false);
  const [pending, setPending] = useState(false);

  const key = customKey ?? fieldKeyFromLabel(label);

  function focusFirst(next: AddErrors) {
    const id = next.label
      ? "field-label"
      : next.options
        ? "field-options"
        : next.key
          ? "field-key"
          : null;
    if (id) {
      document.getElementById(id)?.focus();
    }
  }

  async function submit(name: string) {
    const result = await createContactField({
      label: name,
      type,
      key,
      ...(type === "select" ? { options } : {}),
    });
    setPending(false);
    onBusyChange(false);
    if (result.ok) {
      toast.success(copy.toasts.fieldCreated(result.data.label));
      onCreated(result.data);
      return;
    }
    const { code, field } = result.error;
    if (code === "limit_reached") {
      setLimit(true);
      return;
    }
    if (code === "key_taken" || field === "key") {
      const next = {
        key: code === "key_taken" ? text.keyTaken : describeError(result.error),
      };
      setErrors(next);
      focusFirst(next);
      return;
    }
    if (field === "label" || field === "options") {
      const next = { [field]: describeError(result.error) };
      setErrors(next);
      focusFirst(next);
      return;
    }
    toast.error(copy.toasts.fieldFailed, {
      description: describeError(result.error),
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (pending) {
      return;
    }
    const name = label.trim();
    const next: AddErrors = {
      label: name === "" ? text.labelMissing : undefined,
      options:
        type === "select" && options.length === 0
          ? text.optionsMissing
          : undefined,
      key: isFieldKey(key) ? undefined : text.keyInvalid,
    };
    setErrors(next);
    setLimit(false);
    if (next.label || next.options || next.key) {
      focusFirst(next);
      return;
    }
    setPending(true);
    onBusyChange(true);
    void submit(name);
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      aria-labelledby="field-add-title"
      className={formClass}
    >
      <h3
        id="field-add-title"
        className="text-sm leading-[1.4] font-semibold tracking-[-0.005em] text-foreground"
      >
        {text.addTitle}
      </h3>
      <Field data-invalid={errors.label ? true : undefined}>
        <FieldLabel htmlFor="field-label" className={labelClass}>
          {text.label}
        </FieldLabel>
        <Input
          id="field-label"
          autoComplete="off"
          autoFocus
          maxLength={maxFieldLabelLength}
          disabled={pending}
          placeholder={text.labelPlaceholder}
          value={label}
          onChange={(event) => {
            setLabel(event.target.value);
            setErrors((current) => ({
              ...current,
              label: undefined,
              key: customKey === null ? undefined : current.key,
            }));
          }}
          aria-invalid={errors.label ? true : undefined}
          aria-describedby={errors.label ? "field-label-error" : undefined}
          className={cn(inputClass, "md:text-[13px]")}
        />
        {errors.label ? (
          <FieldError id="field-label-error" className={errorClass}>
            {errors.label}
          </FieldError>
        ) : null}
      </Field>

      <Field>
        <FieldLabel htmlFor="field-type" className={labelClass}>
          {text.type}
        </FieldLabel>
        <OptionCombobox
          id="field-type"
          options={typeOptions}
          value={type}
          label={text.type}
          placeholder={text.typePlaceholder}
          empty={text.typeEmpty}
          disabled={pending}
          clearable={false}
          describedBy="field-type-hint"
          className="w-full"
          onChange={(next) => {
            const picked = fieldTypes.find((item) => item === next);
            if (picked) {
              setType(picked);
              setErrors((current) => ({ ...current, options: undefined }));
            }
          }}
        />
        <FieldDescription id="field-type-hint" className="text-[13px]">
          {text.typeFixed}
        </FieldDescription>
      </Field>

      {type === "select" ? (
        <OptionsField
          id="field-options"
          options={options}
          error={errors.options}
          disabled={pending}
          hint={text.optionsHint}
          onChange={(next) => {
            setOptions(next);
            setErrors((current) => ({ ...current, options: undefined }));
          }}
        />
      ) : null}

      <Field data-invalid={errors.key ? true : undefined}>
        <FieldLabel htmlFor="field-key" className={labelClass}>
          {text.key}
        </FieldLabel>
        <Input
          id="field-key"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={maxFieldKeyLength}
          disabled={pending}
          value={key}
          onChange={(event) => {
            setCustomKey(event.target.value);
            setErrors((current) => ({ ...current, key: undefined }));
          }}
          aria-invalid={errors.key ? true : undefined}
          aria-describedby={errors.key ? "field-key-error" : "field-key-hint"}
          className={cn(inputClass, "font-mono md:text-[12.5px]")}
        />
        {errors.key ? (
          <FieldError id="field-key-error" className={errorClass}>
            {errors.key}
          </FieldError>
        ) : (
          <FieldDescription id="field-key-hint" className="text-[13px]">
            {text.keyHint}
          </FieldDescription>
        )}
      </Field>

      {limit ? (
        <p role="alert" className={errorClass}>
          {text.limitReached}
        </p>
      ) : null}

      <FormActions
        pending={pending}
        submitLabel={text.create}
        onCancel={onCancel}
      />
    </form>
  );
}

type EditFieldFormProps = {
  field: ContactField;
  onBusyChange: (busy: boolean) => void;
  onCancel: () => void;
  onSaved: (field: ContactField) => void;
};

function EditFieldForm({
  field,
  onBusyChange,
  onCancel,
  onSaved,
}: EditFieldFormProps) {
  const [label, setLabel] = useState(field.label);
  const [options, setOptions] = useState(field.options ?? []);
  const [errors, setErrors] = useState<AddErrors>({});
  const [pending, setPending] = useState(false);
  const isSelect = field.type === "select";

  async function submit(name: string) {
    const result = await updateContactField(field.id, {
      label: name,
      ...(isSelect ? { options } : {}),
    });
    setPending(false);
    onBusyChange(false);
    if (result.ok) {
      toast.success(copy.toasts.fieldSaved(result.data.label));
      onSaved(result.data);
      return;
    }
    const target = result.error.field;
    if (target === "label" || target === "options") {
      setErrors({ [target]: describeError(result.error) });
      return;
    }
    toast.error(copy.toasts.fieldFailed, {
      description: describeError(result.error),
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (pending) {
      return;
    }
    const name = label.trim();
    const next: AddErrors = {
      label: name === "" ? text.labelMissing : undefined,
      options:
        isSelect && options.length === 0 ? text.optionsMissing : undefined,
    };
    setErrors(next);
    if (next.label || next.options) {
      document
        .getElementById(next.label ? "field-edit-label" : "field-edit-options")
        ?.focus();
      return;
    }
    setPending(true);
    onBusyChange(true);
    void submit(name);
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      aria-label={text.editTitle(field.label)}
      className={formClass}
    >
      <Field data-invalid={errors.label ? true : undefined}>
        <FieldLabel htmlFor="field-edit-label" className={labelClass}>
          {text.label}
        </FieldLabel>
        <Input
          id="field-edit-label"
          autoComplete="off"
          autoFocus
          maxLength={maxFieldLabelLength}
          disabled={pending}
          value={label}
          onChange={(event) => {
            setLabel(event.target.value);
            setErrors((current) => ({ ...current, label: undefined }));
          }}
          aria-invalid={errors.label ? true : undefined}
          aria-describedby={
            errors.label ? "field-edit-label-error" : "field-edit-meta"
          }
          className={cn(inputClass, "md:text-[13px]")}
        />
        {errors.label ? (
          <FieldError id="field-edit-label-error" className={errorClass}>
            {errors.label}
          </FieldError>
        ) : null}
        <p
          id="field-edit-meta"
          className="flex min-w-0 items-center gap-1.5 text-xs text-ink-tertiary"
        >
          <span className="shrink-0">{fieldTypeLabels[field.type]}</span>
          <span aria-hidden="true">·</span>
          <span className="truncate font-mono">{field.key}</span>
        </p>
      </Field>

      {isSelect ? (
        <OptionsField
          id="field-edit-options"
          options={options}
          error={errors.options}
          disabled={pending}
          hint={text.optionsRemovedHint}
          onChange={(next) => {
            setOptions(next);
            setErrors((current) => ({ ...current, options: undefined }));
          }}
        />
      ) : null}

      <FormActions
        pending={pending}
        submitLabel={text.save}
        onCancel={onCancel}
      />
    </form>
  );
}

type OptionsFieldProps = {
  id: string;
  options: string[];
  error?: string;
  hint: string;
  disabled: boolean;
  onChange: (options: string[]) => void;
};

function OptionsField({
  id,
  options,
  error,
  hint,
  disabled,
  onChange,
}: OptionsFieldProps) {
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id} className={labelClass}>
        {text.options}
      </FieldLabel>
      <TokenInput
        id={id}
        tokens={options}
        max={maxFieldOptions}
        allowSpaces
        disabled={disabled}
        invalid={error !== undefined}
        describedBy={error ? `${id}-error` : `${id}-hint`}
        placeholder={text.optionsPlaceholder}
        listLabel={text.optionsList}
        removeLabel={text.removeOption}
        onChange={onChange}
      />
      {error ? (
        <FieldError id={`${id}-error`} className={errorClass}>
          {error}
        </FieldError>
      ) : (
        <FieldDescription id={`${id}-hint`} className="text-[13px]">
          {hint}
        </FieldDescription>
      )}
    </Field>
  );
}

type FormActionsProps = {
  pending: boolean;
  submitLabel: string;
  onCancel: () => void;
};

function FormActions({ pending, submitLabel, onCancel }: FormActionsProps) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
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
        {submitLabel}
      </Button>
    </div>
  );
}

type DeleteFieldDialogProps = {
  field: ContactField | null;
  onClose: () => void;
  onDeleted: (field: ContactField) => void;
};

function DeleteFieldDialog({
  field,
  onClose,
  onDeleted,
}: DeleteFieldDialogProps) {
  const [last, setLast] = useState(field);
  const [pending, startDelete] = useTransition();

  if (field !== null && field !== last) {
    setLast(field);
  }

  const shown = field ?? last;

  function confirm() {
    if (!field || pending) {
      return;
    }
    startDelete(async () => {
      const result = await deleteContactField(field.id);
      if (!result.ok && result.error.code !== "not_found") {
        toast.error(copy.toasts.fieldDeleteFailed(field.label), {
          description: describeError(result.error),
        });
        return;
      }
      toast.success(copy.toasts.fieldDeleted(field.label));
      onDeleted(field);
      onClose();
    });
  }

  return (
    <Dialog
      open={field !== null}
      onOpenChange={(next) => {
        if (!next && !pending) {
          onClose();
        }
      }}
    >
      <DialogContent className={dialogContentClass}>
        <DialogHeader>
          <DialogTitle className={`${dialogTitleClass} break-words`}>
            {text.deleteTitle(shown?.label ?? "")}
          </DialogTitle>
          <DialogDescription className="text-[13px]">
            {text.deleteBody}
          </DialogDescription>
        </DialogHeader>
        <div className={dialogActionsClass}>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onClose}
            className={secondaryButtonClass}
          >
            {text.cancel}
          </Button>
          <Button
            type="button"
            disabled={pending}
            aria-busy={pending || undefined}
            onClick={confirm}
            className={dangerButtonClass}
          >
            {pending ? <Spinner /> : null}
            {text.deleteConfirm}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
