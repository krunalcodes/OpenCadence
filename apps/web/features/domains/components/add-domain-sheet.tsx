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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet";
import { cn } from "@workspace/ui/lib/utils";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { focusRing } from "@/components/app-shell/page-header";
import {
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import { TokenInput } from "@/components/token-input";
import { copy, describeError } from "@/features/domains/lib/copy";
import {
  type Domain,
  isSelector,
  maxSelectors,
  normalizeSelector,
} from "@/features/domains/lib/domains";
import { createDomain } from "@/features/domains/queries/mutations";

const text = copy.sheet;

const labelClass = "text-[13px]";
const hintClass = "text-[12.5px] text-ink-tertiary";
const errorClass = "text-[13px] text-danger";

type AddDomainSheetProps = {
  open: boolean;
  formKey: number;
  initialDomain: string;
  suggestions: string[];
  onOpenChange: (open: boolean) => void;
  onCreated: (domain: Domain) => void;
};

export function AddDomainSheet({
  open,
  formKey,
  initialDomain,
  suggestions,
  onOpenChange,
  onCreated,
}: AddDomainSheetProps) {
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
        <AddDomainForm
          key={formKey}
          initialDomain={initialDomain}
          suggestions={suggestions}
          pending={pending}
          onPendingChange={setPending}
          onCancel={() => onOpenChange(false)}
          onCreated={onCreated}
        />
      </SheetContent>
    </Sheet>
  );
}

type AddDomainFormProps = {
  initialDomain: string;
  suggestions: string[];
  pending: boolean;
  onPendingChange: (pending: boolean) => void;
  onCancel: () => void;
  onCreated: (domain: Domain) => void;
};

type Errors = { domain?: string; dkimSelectors?: string };

function AddDomainForm({
  initialDomain,
  suggestions,
  pending,
  onPendingChange,
  onCancel,
  onCreated,
}: AddDomainFormProps) {
  const [domain, setDomain] = useState(initialDomain);
  const [selectors, setSelectors] = useState<string[]>([]);
  const [errors, setErrors] = useState<Errors>({});

  function focusFirst(next: Errors) {
    const id = next.domain
      ? "domain-name"
      : next.dkimSelectors
        ? "domain-selectors"
        : null;
    if (id) {
      document.getElementById(id)?.focus();
    }
  }

  async function submit(input: { domain: string; dkimSelectors: string[] }) {
    const result = await createDomain(input);
    onPendingChange(false);
    if (result.ok) {
      onCreated(result.data);
      return;
    }
    const message = describeError(result.error);
    const { field } = result.error;
    if (field === "domain" || field === "dkimSelectors") {
      const failed: Errors = { [field]: message };
      setErrors(failed);
      focusFirst(failed);
      return;
    }
    toast.error(copy.toasts.createFailed, { description: message });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    const failed: Errors = {};
    if (domain.trim() === "") {
      failed.domain = text.domainMissing;
    }
    if (selectors.some((selector) => !isSelector(selector))) {
      failed.dkimSelectors = text.selectorsInvalid;
    }
    if (failed.domain || failed.dkimSelectors) {
      setErrors(failed);
      focusFirst(failed);
      return;
    }
    setErrors({});
    onPendingChange(true);
    void submit({ domain: domain.trim(), dkimSelectors: selectors });
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
        <SheetDescription className="text-[13px] leading-normal">
          {text.description}
        </SheetDescription>
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
        <Field data-invalid={errors.domain ? true : undefined}>
          <FieldLabel htmlFor="domain-name" className={labelClass}>
            {text.domain}
          </FieldLabel>
          <Input
            id="domain-name"
            name="domain"
            type="text"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            required
            disabled={pending}
            placeholder={text.domainPlaceholder}
            value={domain}
            onChange={(event) => {
              setDomain(event.target.value);
              if (errors.domain) {
                setErrors((current) => ({ ...current, domain: undefined }));
              }
            }}
            aria-invalid={errors.domain ? true : undefined}
            aria-describedby={
              errors.domain ? "domain-name-error" : "domain-name-hint"
            }
            className={cn(inputClass, "md:text-[13px]")}
          />
          {errors.domain ? (
            <FieldError id="domain-name-error" className={errorClass}>
              {errors.domain}
            </FieldError>
          ) : (
            <FieldDescription id="domain-name-hint" className={hintClass}>
              {text.domainHint}
            </FieldDescription>
          )}
          {suggestions.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12.5px] text-muted-foreground">
                {text.suggestions}
              </span>
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  disabled={pending}
                  aria-pressed={domain.trim().toLowerCase() === suggestion}
                  onClick={() => {
                    setDomain(suggestion);
                    setErrors((current) => ({ ...current, domain: undefined }));
                  }}
                  className={cn(
                    "inline-flex h-[22px] max-w-full items-center rounded-[6px] border border-border bg-card px-2 font-mono text-xs text-foreground hover:bg-muted aria-pressed:border-primary aria-pressed:bg-muted",
                    focusRing,
                  )}
                >
                  <span className="truncate">{suggestion}</span>
                </button>
              ))}
            </div>
          ) : null}
        </Field>

        <Field data-invalid={errors.dkimSelectors ? true : undefined}>
          <FieldLabel htmlFor="domain-selectors" className={labelClass}>
            {text.selectors}
            <span className="font-normal text-ink-tertiary">
              {text.optional}
            </span>
          </FieldLabel>
          <TokenInput
            id="domain-selectors"
            tokens={selectors}
            max={maxSelectors}
            listLabel={text.selectorList}
            removeLabel={text.removeSelector}
            normalize={normalizeSelector}
            invalidReason={(token) =>
              isSelector(token) ? null : text.selectorsInvalid
            }
            placeholder={text.selectorsPlaceholder}
            disabled={pending}
            invalid={errors.dkimSelectors !== undefined}
            describedBy={
              errors.dkimSelectors
                ? "domain-selectors-error"
                : "domain-selectors-hint"
            }
            onChange={(next) => {
              setSelectors(next);
              if (errors.dkimSelectors) {
                setErrors((current) => ({
                  ...current,
                  dkimSelectors: undefined,
                }));
              }
            }}
          />
          {errors.dkimSelectors ? (
            <FieldError id="domain-selectors-error" className={errorClass}>
              {errors.dkimSelectors}
            </FieldError>
          ) : (
            <FieldDescription id="domain-selectors-hint" className={hintClass}>
              {text.selectorsHint}
            </FieldDescription>
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
          {text.create}
        </Button>
      </div>
    </form>
  );
}
