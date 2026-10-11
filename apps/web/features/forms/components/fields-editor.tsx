"use client";

import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Switch } from "@workspace/ui/components/switch";
import { cn } from "@workspace/ui/lib/utils";
import { ArrowDown, ArrowUp, Lock, X } from "lucide-react";
import { useState } from "react";
import { buttonFocusRing } from "@/components/app-shell/page-header";
import { OptionCombobox } from "@/components/product/option-combobox";
import { inputClass } from "@/components/product/styles";
import { copy, fieldNames } from "@/features/forms/lib/copy";
import {
  customFieldPrefix,
  emailFieldKey,
  type FieldChoice,
  type FormField,
  maxFields,
  maxLabelLength,
  moveField,
} from "@/features/forms/lib/forms";

const text = copy.editor.fields;

const iconButtonClass = cn(
  "text-muted-foreground hover:bg-accent hover:text-foreground",
  buttonFocusRing,
);

type FieldsEditorProps = {
  fields: FormField[];
  catalog: FieldChoice[];
  disabled: boolean;
  error?: string;
  onChange: (fields: FormField[]) => void;
};

function domKey(key: string) {
  return key.replace(/[^a-z0-9_-]/gi, "-");
}

function controlId(key: string, part: "label" | "required" | "up" | "down") {
  return `form-field-${domKey(key)}-${part}`;
}

function focusSoon(id: string) {
  window.requestAnimationFrame(() => {
    document.getElementById(id)?.focus();
  });
}

export function FieldsEditor({
  fields,
  catalog,
  disabled,
  error,
  onChange,
}: FieldsEditorProps) {
  const [announcement, setAnnouncement] = useState("");
  const [addKey, setAddKey] = useState(0);

  const known = new Map(catalog.map((choice) => [choice.key, choice]));
  const used = new Set(fields.map((field) => field.key));
  const remaining = catalog.filter((choice) => !used.has(choice.key));
  const full = fields.length >= maxFields;

  function nameOf(key: string) {
    return (
      fieldNames[key] ??
      known.get(key)?.label ??
      key.replace(customFieldPrefix, "")
    );
  }

  function patch(key: string, change: Partial<FormField>) {
    onChange(
      fields.map((field) =>
        field.key === key ? { ...field, ...change } : field,
      ),
    );
  }

  function move(key: string, direction: -1 | 1) {
    const next = moveField(fields, key, direction);
    if (next === fields) {
      return;
    }
    onChange(next);
    const index = next.findIndex((field) => field.key === key);
    setAnnouncement(text.moved(nameOf(key), index + 1, next.length));
    const atEdge = direction === -1 ? index === 1 : index === next.length - 1;
    const part = (direction === -1) === atEdge ? "down" : "up";
    focusSoon(controlId(key, part));
  }

  function remove(key: string) {
    onChange(fields.filter((field) => field.key !== key));
    setAnnouncement(text.removed(nameOf(key)));
    focusSoon("form-field-add");
  }

  function add(key: string | null) {
    const choice = key ? known.get(key) : null;
    if (!choice || used.has(choice.key) || full) {
      return;
    }
    onChange([
      ...fields,
      {
        key: choice.key,
        label: choice.label,
        required: false,
        type: choice.type,
        options: choice.options,
      },
    ]);
    setAnnouncement(text.added(choice.label));
    setAddKey((current) => current + 1);
    focusSoon(controlId(choice.key, "label"));
  }

  return (
    <div className="flex flex-col">
      <ol aria-label={text.listLabel} className="divide-y divide-border-subtle">
        {fields.map((field, index) => {
          const name = nameOf(field.key);
          const locked = field.key === emailFieldKey;
          const missing = !locked && !known.has(field.key);
          const custom = field.key.startsWith(customFieldPrefix);
          return (
            <li
              key={field.key}
              className="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3"
            >
              <div className="w-32 shrink-0 pt-1.5">
                <div title={name} className="truncate font-medium">
                  {name}
                </div>
                {locked ? (
                  <div className="flex items-start gap-1 text-[12.5px] text-ink-tertiary">
                    <Lock
                      aria-hidden
                      strokeWidth={1.6}
                      className="mt-0.5 size-3 shrink-0"
                    />
                    {text.emailLocked}
                  </div>
                ) : custom ? (
                  <div className="text-[12.5px] text-ink-tertiary">
                    {text.custom}
                  </div>
                ) : null}
              </div>
              <div className="flex min-w-0 flex-1 basis-44 flex-col gap-1.5">
                <Input
                  id={controlId(field.key, "label")}
                  type="text"
                  autoComplete="off"
                  maxLength={maxLabelLength}
                  disabled={disabled}
                  aria-label={text.label(name)}
                  aria-describedby={
                    missing
                      ? `form-field-${domKey(field.key)}-missing`
                      : undefined
                  }
                  placeholder={text.labelPlaceholder}
                  value={field.label}
                  onChange={(event) =>
                    patch(field.key, { label: event.target.value })
                  }
                  className={cn(inputClass, "md:text-[13px]")}
                />
                {missing ? (
                  <p
                    id={`form-field-${domKey(field.key)}-missing`}
                    className="text-[12.5px] text-danger"
                  >
                    {text.unknown}
                  </p>
                ) : null}
              </div>
              <div className="flex h-8 items-center gap-2">
                <Switch
                  id={controlId(field.key, "required")}
                  checked={field.required}
                  disabled={disabled || locked}
                  aria-label={text.requiredFor(name)}
                  onCheckedChange={(required) => patch(field.key, { required })}
                />
                <span
                  aria-hidden
                  className="text-[12.5px] text-muted-foreground"
                >
                  {text.required}
                </span>
              </div>
              <div className="flex h-8 w-[88px] shrink-0 items-center justify-end gap-0.5">
                {locked ? null : (
                  <>
                    <Button
                      id={controlId(field.key, "up")}
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={disabled || index <= 1}
                      aria-label={text.moveUp(name)}
                      onClick={() => move(field.key, -1)}
                      className={iconButtonClass}
                    >
                      <ArrowUp aria-hidden strokeWidth={1.6} />
                    </Button>
                    <Button
                      id={controlId(field.key, "down")}
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={disabled || index === fields.length - 1}
                      aria-label={text.moveDown(name)}
                      onClick={() => move(field.key, 1)}
                      className={iconButtonClass}
                    >
                      <ArrowDown aria-hidden strokeWidth={1.6} />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={disabled}
                      aria-label={text.remove(name)}
                      onClick={() => remove(field.key)}
                      className={iconButtonClass}
                    >
                      <X aria-hidden strokeWidth={1.6} />
                    </Button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <div className="flex flex-col gap-1.5 border-t border-border-subtle px-4 py-3.5">
        <label
          htmlFor="form-field-add"
          className="text-[13px] font-medium text-foreground"
        >
          {text.add}
        </label>
        <OptionCombobox
          key={addKey}
          id="form-field-add"
          options={remaining.map((choice) => ({
            value: choice.key,
            label: choice.label,
          }))}
          value={null}
          label={text.add}
          placeholder={text.addPlaceholder}
          empty={text.addEmpty}
          disabled={disabled || full || remaining.length === 0}
          invalid={error ? true : undefined}
          describedBy="form-field-add-note"
          className="max-w-[360px]"
          onChange={add}
        />
        <p
          id="form-field-add-note"
          role={error ? "alert" : undefined}
          className={cn(
            "text-[12.5px]",
            error ? "text-danger" : "text-ink-tertiary",
          )}
        >
          {error ??
            (full
              ? text.limit(maxFields)
              : remaining.length === 0
                ? text.allAdded
                : text.hint)}
        </p>
      </div>
    </div>
  );
}
