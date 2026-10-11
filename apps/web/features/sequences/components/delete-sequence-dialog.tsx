"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  dangerButtonClass,
  dialogActionsClass,
  dialogContentClass,
  dialogTitleClass,
  secondaryButtonClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import { copy, describeError } from "@/features/sequences/lib/copy";
import type { SequenceSummary } from "@/features/sequences/lib/sequences";
import { deleteSequence } from "@/features/sequences/queries/client";

type DeleteSequenceDialogProps = {
  sequence: SequenceSummary | null;
  onClose: () => void;
  onDeleted: (sequence: SequenceSummary) => void;
};

export function DeleteSequenceDialog({
  sequence,
  onClose,
  onDeleted,
}: DeleteSequenceDialogProps) {
  const [last, setLast] = useState(sequence);
  const [pending, startDelete] = useTransition();
  const text = copy.deleteDialog;

  if (sequence !== null && sequence !== last) {
    setLast(sequence);
  }

  const shown = sequence ?? last;
  const active = shown?.status === "active";

  function confirm() {
    if (!sequence || pending) {
      return;
    }
    startDelete(async () => {
      const result = await deleteSequence(sequence.id);
      if (!result.ok && result.error.code !== "not_found") {
        toast.error(copy.toasts.deleteFailed(sequence.name), {
          description: describeError(result.error),
        });
        return;
      }
      toast.success(copy.toasts.deleted(sequence.name));
      onDeleted(sequence);
      onClose();
    });
  }

  return (
    <Dialog
      open={sequence !== null}
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
          <DialogDescription className="text-[13px]">
            {active ? text.activeBody : text.body}
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
            {active ? text.close : text.cancel}
          </Button>
          {active ? null : (
            <Button
              type="button"
              disabled={pending}
              aria-busy={pending || undefined}
              onClick={confirm}
              className={dangerButtonClass}
            >
              {pending ? <Spinner /> : null}
              {text.confirm}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
