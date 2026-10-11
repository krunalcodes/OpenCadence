"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { useState } from "react";
import { toast } from "sonner";
import {
  dialogActionsClass,
  dialogContentClass,
  dialogTitleClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import { mailboxProviderOf } from "@/features/integrations/lib/catalog";
import {
  companyOf,
  copy,
  describeProviderError,
  providerNameOf,
} from "@/features/integrations/lib/copy";
import type { SendingSource } from "@/features/integrations/lib/sources";
import { startReplyDetection } from "@/features/integrations/queries/mutations";

type ReplyDetectionDialogProps = {
  source: SendingSource | null;
  onClose: () => void;
  onChanged: () => void;
};

export function ReplyDetectionDialog({
  source,
  onClose,
  onChanged,
}: ReplyDetectionDialogProps) {
  const [last, setLast] = useState(source);
  const [pending, setPending] = useState(false);
  if (source !== null && source !== last) {
    setLast(source);
  }
  const shown = source ?? last;
  const provider = shown ? mailboxProviderOf(shown.integrationType) : null;
  const text = copy.replyDialog;

  async function start() {
    if (!source || pending) {
      return;
    }
    setPending(true);
    const result = await startReplyDetection(source.id);
    if (result.ok) {
      window.location.href = result.data.url;
      return;
    }
    setPending(false);
    toast.error(copy.toasts.replyDetectionStartFailed(source.name), {
      description: describeProviderError(result.error),
    });
    if (
      result.error.code === "not_found" ||
      result.error.code === "reply_detection_disabled"
    ) {
      onChanged();
      onClose();
    }
  }

  const disabled = shown?.replyDetection === "not_enabled";

  return (
    <Dialog
      open={source !== null}
      onOpenChange={(next) => {
        if (!next && !pending) {
          onClose();
        }
      }}
    >
      <DialogContent className={dialogContentClass}>
        {shown && provider ? (
          <>
            <DialogHeader>
              <DialogTitle className={dialogTitleClass}>
                {disabled
                  ? text.disabledTitle(providerNameOf(provider))
                  : text.title(shown.name)}
              </DialogTitle>
              <DialogDescription className="text-[13px] leading-normal">
                {disabled ? text.disabledBody : text.why(companyOf(provider))}
              </DialogDescription>
            </DialogHeader>
            {disabled ? (
              <p className="text-[13px] leading-normal text-ink-tertiary">
                {text.disabledOperator[provider]}
              </p>
            ) : (
              <div className="flex flex-col gap-2.5 text-[13px] leading-normal text-muted-foreground">
                <p>{text.what}</p>
                <p>{text.how(companyOf(provider))}</p>
              </div>
            )}
            <div className={dialogActionsClass}>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={onClose}
                className={secondaryButtonClass}
              >
                {disabled ? text.close : text.cancel}
              </Button>
              {disabled ? null : (
                <Button
                  type="button"
                  disabled={pending}
                  aria-busy={pending || undefined}
                  onClick={start}
                  className={primaryButtonClass}
                >
                  {pending ? <Spinner /> : null}
                  {text.confirm(companyOf(provider))}
                </Button>
              )}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
