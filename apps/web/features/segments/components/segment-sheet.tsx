"use client";

import { Button } from "@workspace/ui/components/button";
import { Field, FieldError, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet";
import { Textarea } from "@workspace/ui/components/textarea";
import { cn } from "@workspace/ui/lib/utils";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  countConditions,
  emptyCondition,
  isFilterComplete,
  toFilterGroup,
} from "@/components/filter-builder/filter";
import { FilterBuilder } from "@/components/filter-builder/filter-builder";
import type { FilterGroup } from "@/components/filter-builder/types";
import {
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import {
  type PreviewState,
  SegmentPreviewPanel,
} from "@/features/segments/components/segment-preview";
import { copy, describeError } from "@/features/segments/lib/copy";
import {
  previewDelay,
  type Segment,
  type SegmentInput,
  type SegmentOptions,
} from "@/features/segments/lib/segments";
import {
  createSegment,
  previewSegment,
  updateSegment,
} from "@/features/segments/queries/client";

const text = copy.sheet;

const labelClass = "text-[13px]";
const errorClass = "text-[13px] text-danger";

export type SegmentEditorTarget =
  | { mode: "create" }
  | { mode: "edit"; segment: Segment }
  | { mode: "duplicate"; segment: Segment };

type SegmentSheetProps = {
  open: boolean;
  formKey: number;
  target: SegmentEditorTarget;
  options: SegmentOptions;
  onOpenChange: (open: boolean) => void;
  onSaved: (segment: Segment, created: boolean) => void;
};

export function SegmentSheet({
  open,
  formKey,
  target,
  options,
  onOpenChange,
  onSaved,
}: SegmentSheetProps) {
  const [pending, setPending] = useState(false);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next || !pending) {
          onOpenChange(next);
        }
      }}
    >
      <SheetContent className="w-full gap-0 text-[13px] data-[side=right]:w-full data-[side=right]:sm:max-w-[720px]">
        <SegmentForm
          key={formKey}
          target={target}
          options={options}
          pending={pending}
          onPendingChange={setPending}
          onCancel={() => onOpenChange(false)}
          onSaved={onSaved}
        />
      </SheetContent>
    </Sheet>
  );
}

type SegmentFormProps = {
  target: SegmentEditorTarget;
  options: SegmentOptions;
  pending: boolean;
  onPendingChange: (pending: boolean) => void;
  onCancel: () => void;
  onSaved: (segment: Segment, created: boolean) => void;
};

type Errors = { name?: string; description?: string; rules?: string };

type LoadedPreview = { key: string; state: PreviewState };

function initialName(target: SegmentEditorTarget) {
  if (target.mode === "create") {
    return "";
  }
  return target.mode === "duplicate"
    ? copy.duplicateName(target.segment.name)
    : target.segment.name;
}

function initialRules(target: SegmentEditorTarget): FilterGroup {
  return target.mode === "create"
    ? { match: "all", conditions: [emptyCondition()] }
    : target.segment.rules;
}

function SegmentForm({
  target,
  options,
  pending,
  onPendingChange,
  onCancel,
  onSaved,
}: SegmentFormProps) {
  const editing = target.mode === "edit" ? target.segment : null;
  const [name, setName] = useState(() => initialName(target));
  const [description, setDescription] = useState(
    target.mode === "create" ? "" : (target.segment.description ?? ""),
  );
  const [rules, setRules] = useState(() => initialRules(target));
  const [errors, setErrors] = useState<Errors>({});
  const [loaded, setLoaded] = useState<LoadedPreview | null>(null);

  const hasConditions = countConditions(rules) > 0;
  const complete = hasConditions && isFilterComplete(rules, options);
  const serialized = JSON.stringify(rules);

  useEffect(() => {
    if (!complete) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const current = toFilterGroup(JSON.parse(serialized));
      if (!current) {
        return;
      }
      const result = await previewSegment(current);
      if (cancelled) {
        return;
      }
      if (result.ok) {
        setLoaded({
          key: serialized,
          state: { state: "ready", preview: result.data },
        });
        return;
      }
      const message = describeError(result.error);
      setLoaded({
        key: serialized,
        state:
          result.error.field === "rules"
            ? { state: "rejected", message }
            : { state: "failed", message },
      });
    }, previewDelay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [complete, serialized]);

  const preview: PreviewState = !complete
    ? { state: "idle" }
    : loaded?.key === serialized
      ? loaded.state
      : { state: "loading" };

  function focusFirst(next: Errors) {
    const id = next.name
      ? "segment-name"
      : next.description
        ? "segment-description"
        : null;
    if (id) {
      document.getElementById(id)?.focus();
    }
  }

  async function submit(input: SegmentInput) {
    const result = editing
      ? await updateSegment(editing.id, input)
      : await createSegment(input);
    onPendingChange(false);
    if (result.ok) {
      onSaved(result.data, editing === null);
      return;
    }
    const message = describeError(result.error);
    const { field } = result.error;
    if (field === "name" || field === "description" || field === "rules") {
      const failed: Errors = { [field]: message };
      setErrors(failed);
      focusFirst(failed);
      return;
    }
    toast.error(editing ? copy.toasts.saveFailed : copy.toasts.createFailed, {
      description: message,
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !complete) {
      return;
    }
    const trimmed = name.trim();
    if (trimmed === "") {
      const failed: Errors = { name: text.nameMissing };
      setErrors(failed);
      focusFirst(failed);
      return;
    }
    setErrors({});
    onPendingChange(true);
    void submit({ name: trimmed, description: description.trim(), rules });
  }

  const title =
    target.mode === "edit"
      ? text.editTitle
      : target.mode === "duplicate"
        ? text.duplicateTitle
        : text.createTitle;

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className="flex min-h-0 flex-1 flex-col"
    >
      <SheetHeader className="gap-1 border-b border-border-subtle px-5 py-4 pr-12">
        <SheetTitle className="text-[15px] font-semibold tracking-[-0.01em]">
          {title}
        </SheetTitle>
        <SheetDescription className="text-[13px] leading-normal">
          {text.description}
        </SheetDescription>
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        <Field data-invalid={errors.name ? true : undefined}>
          <FieldLabel htmlFor="segment-name" className={labelClass}>
            {text.name}
          </FieldLabel>
          <Input
            id="segment-name"
            name="name"
            type="text"
            autoComplete="off"
            required
            disabled={pending}
            placeholder={text.namePlaceholder}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (errors.name) {
                setErrors((current) => ({ ...current, name: undefined }));
              }
            }}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? "segment-name-error" : undefined}
            className={cn(inputClass, "md:text-[13px]")}
          />
          {errors.name ? (
            <FieldError id="segment-name-error" className={errorClass}>
              {errors.name}
            </FieldError>
          ) : null}
        </Field>

        <Field data-invalid={errors.description ? true : undefined}>
          <FieldLabel htmlFor="segment-description" className={labelClass}>
            {text.descriptionLabel}
            <span className="font-normal text-ink-tertiary">
              {text.optional}
            </span>
          </FieldLabel>
          <Textarea
            id="segment-description"
            name="description"
            rows={2}
            disabled={pending}
            placeholder={text.descriptionPlaceholder}
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
              if (errors.description) {
                setErrors((current) => ({
                  ...current,
                  description: undefined,
                }));
              }
            }}
            aria-invalid={errors.description ? true : undefined}
            aria-describedby={
              errors.description ? "segment-description-error" : undefined
            }
            className={cn(inputClass, "min-h-[56px] md:text-[13px]")}
          />
          {errors.description ? (
            <FieldError id="segment-description-error" className={errorClass}>
              {errors.description}
            </FieldError>
          ) : null}
        </Field>

        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-2 text-[13px] font-medium">{text.rules}</legend>
          <FilterBuilder
            value={rules}
            onChange={(next) => {
              setRules(next);
              if (errors.rules) {
                setErrors((current) => ({ ...current, rules: undefined }));
              }
            }}
            fields={options.fields}
            lists={options.lists}
            tags={options.tags}
            errors={errors.rules ? [errors.rules] : undefined}
            disabled={pending}
          />
          {complete ? null : (
            <p className="text-ink-tertiary">
              {hasConditions ? text.rulesIncomplete : text.rulesEmpty}
            </p>
          )}
        </fieldset>

        <SegmentPreviewPanel preview={preview} />
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
          disabled={pending || !complete || name.trim() === ""}
          aria-busy={pending || undefined}
          className={primaryButtonClass}
        >
          {pending ? <Spinner /> : null}
          {editing ? text.save : text.create}
        </Button>
      </div>
    </form>
  );
}
