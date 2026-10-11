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
import { Switch } from "@workspace/ui/components/switch";
import { Textarea } from "@workspace/ui/components/textarea";
import { cn } from "@workspace/ui/lib/utils";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import {
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import { copy, describeError } from "@/features/lists/lib/copy";
import {
  type List,
  type ListInput,
  maxPublicDescriptionLength,
  maxPublicNameLength,
} from "@/features/lists/lib/lists";
import { createList, updateList } from "@/features/lists/queries/mutations";

const text = copy.sheet;

const labelClass = "text-[13px]";
const errorClass = "text-[13px] text-danger";

type ListSheetProps = {
  open: boolean;
  formKey: number;
  list: List | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (list: List, created: boolean) => void;
};

export function ListSheet({
  open,
  formKey,
  list,
  onOpenChange,
  onSaved,
}: ListSheetProps) {
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
      <SheetContent className="w-full gap-0 text-[13px] data-[side=right]:w-full data-[side=right]:sm:max-w-[460px]">
        <ListForm
          key={formKey}
          list={list}
          pending={pending}
          onPendingChange={setPending}
          onCancel={() => onOpenChange(false)}
          onSaved={onSaved}
        />
      </SheetContent>
    </Sheet>
  );
}

type ListFormProps = {
  list: List | null;
  pending: boolean;
  onPendingChange: (pending: boolean) => void;
  onCancel: () => void;
  onSaved: (list: List, created: boolean) => void;
};

type Errors = {
  name?: string;
  description?: string;
  publicName?: string;
  publicDescription?: string;
};

const errorFields = [
  "name",
  "description",
  "publicName",
  "publicDescription",
] as const;

const fieldIds: Record<(typeof errorFields)[number], string> = {
  name: "list-name",
  description: "list-description",
  publicName: "list-public-name",
  publicDescription: "list-public-description",
};

function ListForm({
  list,
  pending,
  onPendingChange,
  onCancel,
  onSaved,
}: ListFormProps) {
  const [name, setName] = useState(list?.name ?? "");
  const [description, setDescription] = useState(list?.description ?? "");
  const [isPublic, setIsPublic] = useState(list?.isPublic ?? false);
  const [publicName, setPublicName] = useState(list?.publicName ?? "");
  const [publicDescription, setPublicDescription] = useState(
    list?.publicDescription ?? "",
  );
  const [errors, setErrors] = useState<Errors>({});

  function focusFirst(next: Errors) {
    const field = errorFields.find((item) => next[item]);
    if (field) {
      document.getElementById(fieldIds[field])?.focus();
    }
  }

  async function submit(input: ListInput) {
    const result = list
      ? await updateList(list.id, input)
      : await createList(input);
    onPendingChange(false);
    if (result.ok) {
      onSaved(result.data, list === null);
      return;
    }
    const message = describeError(result.error);
    const field = errorFields.find((item) => item === result.error.field);
    if (field && (isPublic || field === "name" || field === "description")) {
      const failed: Errors = { [field]: message };
      setErrors(failed);
      focusFirst(failed);
      return;
    }
    toast.error(list ? copy.toasts.saveFailed : copy.toasts.createFailed, {
      description: message,
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    const input: ListInput = {
      name: name.trim(),
      description: description.trim(),
      isPublic,
      publicName: publicName.trim(),
      publicDescription: publicDescription.trim(),
    };
    if (input.name === "") {
      const failed: Errors = { name: text.nameMissing };
      setErrors(failed);
      focusFirst(failed);
      return;
    }
    setErrors({});
    onPendingChange(true);
    void submit(input);
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className="flex min-h-0 flex-1 flex-col"
    >
      <SheetHeader className="gap-1 border-b border-border-subtle px-5 py-4 pr-12">
        <SheetTitle className="text-[15px] font-semibold tracking-[-0.01em]">
          {list ? text.editTitle : text.createTitle}
        </SheetTitle>
        <SheetDescription className="text-[13px] leading-normal">
          {list ? text.editDescription(list.name) : text.createDescription}
        </SheetDescription>
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        <Field data-invalid={errors.name ? true : undefined}>
          <FieldLabel htmlFor="list-name" className={labelClass}>
            {text.name}
          </FieldLabel>
          <Input
            id="list-name"
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
            aria-describedby={errors.name ? "list-name-error" : undefined}
            className={cn(inputClass, "md:text-[13px]")}
          />
          {errors.name ? (
            <FieldError id="list-name-error" className={errorClass}>
              {errors.name}
            </FieldError>
          ) : null}
        </Field>

        <Field data-invalid={errors.description ? true : undefined}>
          <FieldLabel htmlFor="list-description" className={labelClass}>
            {text.description}
            <span className="font-normal text-ink-tertiary">
              {text.optional}
            </span>
          </FieldLabel>
          <Textarea
            id="list-description"
            name="description"
            rows={3}
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
              errors.description ? "list-description-error" : undefined
            }
            className={cn(inputClass, "min-h-[72px] md:text-[13px]")}
          />
          {errors.description ? (
            <FieldError id="list-description-error" className={errorClass}>
              {errors.description}
            </FieldError>
          ) : null}
        </Field>

        <div className="flex flex-col gap-4 border-t border-border-subtle pt-4">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <div
                id="list-public-label"
                className="font-medium text-foreground"
              >
                {text.isPublic}
              </div>
              <p id="list-public-hint" className="text-muted-foreground">
                {text.isPublicHint}
              </p>
            </div>
            <Switch
              id="list-public"
              checked={isPublic}
              disabled={pending}
              aria-labelledby="list-public-label"
              aria-describedby="list-public-hint"
              onCheckedChange={setIsPublic}
              className="mt-0.5"
            />
          </div>

          {isPublic ? (
            <>
              <Field data-invalid={errors.publicName ? true : undefined}>
                <FieldLabel htmlFor="list-public-name" className={labelClass}>
                  {text.publicName}
                  <span className="font-normal text-ink-tertiary">
                    {text.optional}
                  </span>
                </FieldLabel>
                <Input
                  id="list-public-name"
                  name="publicName"
                  type="text"
                  autoComplete="off"
                  disabled={pending}
                  maxLength={maxPublicNameLength}
                  placeholder={name.trim() || text.namePlaceholder}
                  value={publicName}
                  onChange={(event) => {
                    setPublicName(event.target.value);
                    if (errors.publicName) {
                      setErrors((current) => ({
                        ...current,
                        publicName: undefined,
                      }));
                    }
                  }}
                  aria-invalid={errors.publicName ? true : undefined}
                  aria-describedby="list-public-name-note"
                  className={cn(inputClass, "md:text-[13px]")}
                />
                {errors.publicName ? (
                  <FieldError id="list-public-name-note" className={errorClass}>
                    {errors.publicName}
                  </FieldError>
                ) : (
                  <p
                    id="list-public-name-note"
                    className="text-[12.5px] text-ink-tertiary"
                  >
                    {text.publicNameHint}
                  </p>
                )}
              </Field>

              <Field data-invalid={errors.publicDescription ? true : undefined}>
                <FieldLabel
                  htmlFor="list-public-description"
                  className={labelClass}
                >
                  {text.publicDescription}
                  <span className="font-normal text-ink-tertiary">
                    {text.optional}
                  </span>
                </FieldLabel>
                <Textarea
                  id="list-public-description"
                  name="publicDescription"
                  rows={2}
                  disabled={pending}
                  maxLength={maxPublicDescriptionLength}
                  placeholder={text.publicDescriptionPlaceholder}
                  value={publicDescription}
                  onChange={(event) => {
                    setPublicDescription(event.target.value);
                    if (errors.publicDescription) {
                      setErrors((current) => ({
                        ...current,
                        publicDescription: undefined,
                      }));
                    }
                  }}
                  aria-invalid={errors.publicDescription ? true : undefined}
                  aria-describedby="list-public-description-note"
                  className={cn(inputClass, "min-h-[56px] md:text-[13px]")}
                />
                {errors.publicDescription ? (
                  <FieldError
                    id="list-public-description-note"
                    className={errorClass}
                  >
                    {errors.publicDescription}
                  </FieldError>
                ) : (
                  <p
                    id="list-public-description-note"
                    className="text-[12.5px] text-ink-tertiary"
                  >
                    {text.publicDescriptionHint}
                  </p>
                )}
              </Field>
            </>
          ) : null}
        </div>
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
          {list ? text.save : text.create}
        </Button>
      </div>
    </form>
  );
}
