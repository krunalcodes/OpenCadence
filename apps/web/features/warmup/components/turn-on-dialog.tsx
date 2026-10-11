"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { TriangleAlert } from "lucide-react";
import { useState } from "react";
import {
  dialogActionsClass,
  dialogContentClass,
  dialogTitleClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import { copy } from "@/features/warmup/lib/copy";
import type { WarmupMailbox } from "@/features/warmup/lib/warmup";

type TurnOnDialogProps = {
  mailbox: WarmupMailbox | null;
  pending: boolean;
  onClose: () => void;
  onConfirm: (mailbox: WarmupMailbox) => void;
};

export function TurnOnDialog({
  mailbox,
  pending,
  onClose,
  onConfirm,
}: TurnOnDialogProps) {
  const [last, setLast] = useState(mailbox);
  const text = copy.turnOn;

  if (mailbox !== null && mailbox !== last) {
    setLast(mailbox);
  }

  const shown = mailbox ?? last;

  return (
    <Dialog
      open={mailbox !== null}
      onOpenChange={(next) => {
        if (!next && !pending) {
          onClose();
        }
      }}
    >
      <DialogContent className={dialogContentClass}>
        <DialogHeader>
          <DialogTitle className={`${dialogTitleClass} break-words`}>
            {text.title(shown?.name ?? "")}
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-normal">
            {text.what}
          </DialogDescription>
        </DialogHeader>
        <p className="flex items-start gap-2 rounded-lg bg-warning-surface px-3 py-2.5 text-[13px] leading-normal text-warning">
          <TriangleAlert
            aria-hidden
            className="mt-0.5 size-4 shrink-0"
            strokeWidth={1.6}
          />
          <span>{text.caution}</span>
        </p>
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
            onClick={() => {
              if (mailbox && !pending) {
                onConfirm(mailbox);
              }
            }}
            className={primaryButtonClass}
          >
            {pending ? <Spinner /> : null}
            {text.confirm}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
