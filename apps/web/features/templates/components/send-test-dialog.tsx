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
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { focusRing } from "@/components/app-shell/page-header";
import { SourceCombobox } from "@/components/pickers/source-combobox";
import {
  dialogActionsClass,
  dialogTitleClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import { copy, describeError } from "@/features/templates/lib/copy";
import type { ExportedEmail } from "@/features/templates/lib/editor";
import { isEmail } from "@/features/templates/lib/templates";
import { sendTestEmail } from "@/features/templates/queries/client";
import { appHref } from "@/lib/navigation";
import type { SourceChoice } from "@/lib/sources";

const text = copy.testDialog;

type SendTestDialogProps = {
  open: boolean;
  defaultTo: string;
  subject: string;
  sources: SourceChoice[];
  exportEmail: () => Promise<ExportedEmail | null>;
  onOpenChange: (open: boolean) => void;
};

export function SendTestDialog({
  open,
  defaultTo,
  subject,
  sources,
  exportEmail,
  onOpenChange,
}: SendTestDialogProps) {
  const [pending, setPending] = useState(false);
  const [to, setTo] = useState(defaultTo);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [needFrom, setNeedFrom] = useState(false);
  const [fromError, setFromError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  function fail(message: string) {
    setError(message);
    document.getElementById("test-to")?.focus();
  }

  async function send(address: string) {
    const email = await exportEmail();
    if (!email) {
      setPending(false);
      setFormError(copy.editor.exportFailed);
      return;
    }
    const result = await sendTestEmail({
      to: address,
      from: needFrom ? from.trim() : "",
      subject: subject.trim(),
      html: email.html,
      text: email.text,
      sourceId,
    });
    setPending(false);
    if (result.ok) {
      if (result.data.suppressed) {
        fail(text.suppressed);
        return;
      }
      toast.success(text.sent(address));
      onOpenChange(false);
      return;
    }
    if (result.error.field === "to") {
      fail(describeError(result.error));
      return;
    }
    if (result.error.field === "from") {
      setNeedFrom(true);
      setFromError(needFrom ? text.fromInvalid : null);
      window.requestAnimationFrame(() => {
        document.getElementById("test-from")?.focus();
      });
      return;
    }
    setFormError(describeError(result.error));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    const address = to.trim();
    setFormError(null);
    if (address === "") {
      fail(text.toMissing);
      return;
    }
    if (!isEmail(address)) {
      fail(text.toInvalid);
      return;
    }
    if (subject.trim() === "") {
      setFormError(text.subjectMissing);
      return;
    }
    if (needFrom && !isEmail(from.trim())) {
      setFromError(text.fromInvalid);
      document.getElementById("test-from")?.focus();
      return;
    }
    setError(null);
    setFromError(null);
    setPending(true);
    void send(address);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next || !pending) {
          if (next) {
            setError(null);
            setFormError(null);
          }
          onOpenChange(next);
        }
      }}
    >
      <DialogContent className="gap-5 p-5 text-[13px] sm:max-w-[460px]">
        <form
          noValidate
          onSubmit={handleSubmit}
          className="flex flex-col gap-5"
        >
          <DialogHeader>
            <DialogTitle className={dialogTitleClass}>{text.title}</DialogTitle>
            <DialogDescription className="text-[13px]">
              {text.description}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <Field data-invalid={error ? true : undefined}>
              <FieldLabel htmlFor="test-to" className="text-[13px]">
                {text.to}
              </FieldLabel>
              <Input
                id="test-to"
                name="to"
                type="email"
                inputMode="email"
                autoComplete="email"
                spellCheck={false}
                required
                disabled={pending}
                placeholder={text.toPlaceholder}
                value={to}
                onChange={(event) => {
                  setTo(event.target.value);
                  if (error) {
                    setError(null);
                  }
                }}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "test-to-error" : undefined}
                className={cn(inputClass, "md:text-[13px]")}
              />
              {error ? (
                <FieldError
                  id="test-to-error"
                  className="text-[13px] text-danger"
                >
                  {error}
                </FieldError>
              ) : null}
            </Field>

            {sources.length === 0 ? (
              <p className="rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-muted-foreground">
                {text.noSources}{" "}
                <Link
                  href={appHref("integrations")}
                  className={cn(
                    "rounded-[4px] font-medium text-primary underline-offset-2 hover:underline",
                    focusRing,
                  )}
                >
                  {text.connect}
                </Link>
              </p>
            ) : (
              <Field>
                <FieldLabel htmlFor="test-source" className="text-[13px]">
                  {text.source}
                </FieldLabel>
                <SourceCombobox
                  id="test-source"
                  sources={sources}
                  value={sourceId}
                  label={text.source}
                  placeholder={text.sourcePlaceholder}
                  disabled={pending}
                  describedBy="test-source-hint"
                  onChange={(next) => {
                    setSourceId(next);
                    setNeedFrom(false);
                    setFromError(null);
                  }}
                />
                <p
                  id="test-source-hint"
                  className="text-[12.5px] text-ink-tertiary"
                >
                  {text.sourceHint}
                </p>
              </Field>
            )}

            {needFrom ? (
              <Field data-invalid={fromError ? true : undefined}>
                <FieldLabel htmlFor="test-from" className="text-[13px]">
                  {text.from}
                </FieldLabel>
                <Input
                  id="test-from"
                  name="from"
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={pending}
                  placeholder={text.fromPlaceholder}
                  value={from}
                  onChange={(event) => {
                    setFrom(event.target.value);
                    if (fromError) {
                      setFromError(null);
                    }
                  }}
                  aria-invalid={fromError ? true : undefined}
                  aria-describedby="test-from-hint"
                  className={cn(inputClass, "md:text-[13px]")}
                />
                <p
                  id="test-from-hint"
                  className={cn(
                    "text-[12.5px]",
                    fromError ? "text-danger" : "text-ink-tertiary",
                  )}
                >
                  {fromError ?? text.fromHint}
                </p>
              </Field>
            ) : null}

            {formError ? (
              <p role="alert" className="text-[13px] text-danger">
                <span className="font-medium">{text.failed}.</span> {formError}
              </p>
            ) : null}
          </div>

          <div className={dialogActionsClass}>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onOpenChange(false)}
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
              {text.send}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
