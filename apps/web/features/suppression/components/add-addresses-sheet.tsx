"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@workspace/ui/components/field";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet";
import { Textarea } from "@workspace/ui/components/textarea";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group";
import { cn } from "@workspace/ui/lib/utils";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import {
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
  segmentedGroupClass,
  segmentedItemClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import { TokenInput } from "@/components/token-input";
import { copy, describeError } from "@/features/suppression/lib/copy";
import {
  type AddReason,
  type AddResult,
  isEmail,
  maxAddresses,
  maxNoteLength,
  normalizeEmail,
} from "@/features/suppression/lib/suppressions";
import { addSuppressions } from "@/features/suppression/queries/mutations";

const text = copy.addSheet;

const reasonIds: AddReason[] = ["manual", "unsubscribed"];

const labelClass = "text-[13px]";
const errorClass = "text-[13px] text-danger";

function invalidReason(token: string) {
  return isEmail(token) ? null : text.invalidAddress;
}

function emailsProblem(emails: string[]) {
  if (emails.length === 0) {
    return text.missing;
  }
  const invalid = emails.filter((email) => !isEmail(email));
  if (invalid.length === 1 && invalid[0]) {
    return text.invalidOne(invalid[0]);
  }
  return invalid.length > 1 ? text.invalidMany(invalid.length) : undefined;
}

type AddAddressesSheetProps = {
  open: boolean;
  formKey: number;
  onOpenChange: (open: boolean) => void;
  onAdded: (result: AddResult) => void;
};

export function AddAddressesSheet({
  open,
  formKey,
  onOpenChange,
  onAdded,
}: AddAddressesSheetProps) {
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
        <AddForm
          key={formKey}
          pending={pending}
          onPendingChange={setPending}
          onCancel={() => onOpenChange(false)}
          onAdded={onAdded}
        />
      </SheetContent>
    </Sheet>
  );
}

type AddFormProps = {
  pending: boolean;
  onPendingChange: (pending: boolean) => void;
  onCancel: () => void;
  onAdded: (result: AddResult) => void;
};

type Errors = { emails?: string; reason?: string; note?: string };

function AddForm({
  pending,
  onPendingChange,
  onCancel,
  onAdded,
}: AddFormProps) {
  const [emails, setEmails] = useState<string[]>([]);
  const [reason, setReason] = useState<AddReason>("manual");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [overflow, setOverflow] = useState(0);

  function focusFirst(next: Errors) {
    const id = next.emails
      ? "suppression-emails"
      : next.note
        ? "suppression-note"
        : null;
    if (id) {
      document.getElementById(id)?.focus();
    }
  }

  async function submit(list: string[], trimmedNote: string) {
    const result = await addSuppressions({
      emails: list,
      reason,
      ...(trimmedNote === "" ? {} : { note: trimmedNote }),
    });
    onPendingChange(false);
    if (result.ok) {
      onAdded(result.data);
      return;
    }
    const message = describeError(result.error);
    const { field } = result.error;
    if (field === "emails" || field === "reason" || field === "note") {
      const failed: Errors = { [field]: message };
      setErrors(failed);
      focusFirst(failed);
      return;
    }
    toast.error(copy.toasts.addFailed, { description: message });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    const trimmedNote = note.trim();
    const next: Errors = {
      emails: emailsProblem(emails),
      note:
        trimmedNote.length > maxNoteLength
          ? text.noteTooLong(maxNoteLength)
          : undefined,
    };
    setErrors(next);
    if (next.emails || next.note) {
      focusFirst(next);
      return;
    }
    onPendingChange(true);
    void submit(emails, trimmedNote);
  }

  const emailsDescribedBy = errors.emails
    ? "suppression-emails-error"
    : "suppression-emails-hint";

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
        <SheetDescription className="text-[13px] leading-normal">
          {text.description}
        </SheetDescription>
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        <Field data-invalid={errors.emails ? true : undefined}>
          <div className="flex items-baseline justify-between gap-2">
            <FieldLabel htmlFor="suppression-emails" className={labelClass}>
              {text.emails}
            </FieldLabel>
            <span
              aria-live="polite"
              className="text-xs text-ink-tertiary tabular-nums"
            >
              {text.counter(emails.length, maxAddresses)}
            </span>
          </div>
          <TokenInput
            id="suppression-emails"
            tokens={emails}
            max={maxAddresses}
            inputMode="email"
            disabled={pending}
            invalid={errors.emails !== undefined}
            describedBy={emailsDescribedBy}
            placeholder={text.emailsPlaceholder}
            listLabel={text.emailsList}
            removeLabel={text.removeAddress}
            normalize={normalizeEmail}
            invalidReason={invalidReason}
            onOverflow={setOverflow}
            onChange={(next) => {
              setEmails(next);
              if (next.length < maxAddresses) {
                setOverflow(0);
              }
              if (errors.emails) {
                setErrors((current) => ({
                  ...current,
                  emails: emailsProblem(next),
                }));
              }
            }}
          />
          {errors.emails ? (
            <FieldError id="suppression-emails-error" className={errorClass}>
              {errors.emails}
            </FieldError>
          ) : (
            <FieldDescription
              id="suppression-emails-hint"
              className="text-[13px]"
            >
              {text.emailsHint}
            </FieldDescription>
          )}
          {overflow > 0 ? (
            <p role="status" className="text-[13px] text-warning">
              {text.overflow(maxAddresses, overflow)}
            </p>
          ) : null}
        </Field>

        <Field data-invalid={errors.reason ? true : undefined}>
          <span
            id="suppression-reason-label"
            className="text-[13px] font-medium"
          >
            {text.reason}
          </span>
          <ToggleGroup
            aria-labelledby="suppression-reason-label"
            aria-describedby="suppression-reason-hint"
            disabled={pending}
            value={[reason]}
            onValueChange={(next) => {
              const id = reasonIds.find((item) => item === next[0]);
              if (id) {
                setReason(id);
                setErrors((current) => ({ ...current, reason: undefined }));
              }
            }}
            className={segmentedGroupClass}
          >
            {reasonIds.map((id) => (
              <ToggleGroupItem
                key={id}
                value={id}
                className={segmentedItemClass}
              >
                {text.reasons[id]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <FieldDescription
            id="suppression-reason-hint"
            aria-live="polite"
            className="text-[13px]"
          >
            {text.reasonHints[reason]}
          </FieldDescription>
          {errors.reason ? (
            <FieldError className={errorClass}>{errors.reason}</FieldError>
          ) : null}
        </Field>

        <Field data-invalid={errors.note ? true : undefined}>
          <div className="flex items-baseline justify-between gap-2">
            <FieldLabel htmlFor="suppression-note" className={labelClass}>
              {text.note}
              <span className="font-normal text-ink-tertiary">
                {text.noteOptional}
              </span>
            </FieldLabel>
            <span className="text-xs text-ink-tertiary tabular-nums">
              {text.noteCounter(note.trim().length, maxNoteLength)}
            </span>
          </div>
          <Textarea
            id="suppression-note"
            name="note"
            rows={3}
            disabled={pending}
            maxLength={maxNoteLength}
            placeholder={text.notePlaceholder}
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
              if (errors.note) {
                setErrors((current) => ({ ...current, note: undefined }));
              }
            }}
            aria-invalid={errors.note ? true : undefined}
            aria-describedby={
              errors.note ? "suppression-note-error" : undefined
            }
            className={cn(inputClass, "min-h-[72px] md:text-[13px]")}
          />
          {errors.note ? (
            <FieldError id="suppression-note-error" className={errorClass}>
              {errors.note}
            </FieldError>
          ) : null}
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
          {text.submit}
        </Button>
      </div>
    </form>
  );
}
