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
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import {
  dialogActionsClass,
  dialogTitleClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import { isEmail } from "@/features/campaigns/lib/campaigns";
import { copy, describeError } from "@/features/campaigns/lib/copy";
import { sendCampaignTest } from "@/features/campaigns/queries/client";

const text = copy.testDialog;

type SendTestDialogProps = {
  open: boolean;
  campaignId: string;
  defaultTo: string;
  onOpenChange: (open: boolean) => void;
};

export function SendTestDialog({
  open,
  campaignId,
  defaultTo,
  onOpenChange,
}: SendTestDialogProps) {
  const [pending, setPending] = useState(false);
  const [to, setTo] = useState(defaultTo);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  function fail(message: string) {
    setError(message);
    document.getElementById("campaign-test-to")?.focus();
  }

  async function send(address: string) {
    const result = await sendCampaignTest(campaignId, address);
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
    setError(null);
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
      <DialogContent className="gap-5 p-5 text-[13px] sm:max-w-[440px]">
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
              <FieldLabel htmlFor="campaign-test-to" className="text-[13px]">
                {text.to}
              </FieldLabel>
              <Input
                id="campaign-test-to"
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
                aria-describedby={error ? "campaign-test-to-error" : undefined}
                className={cn(inputClass, "md:text-[13px]")}
              />
              {error ? (
                <FieldError
                  id="campaign-test-to-error"
                  className="text-[13px] text-danger"
                >
                  {error}
                </FieldError>
              ) : null}
            </Field>
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
