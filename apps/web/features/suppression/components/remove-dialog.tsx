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
import { copy, describeError } from "@/features/suppression/lib/copy";
import type { Suppression } from "@/features/suppression/lib/suppressions";
import { removeSuppression } from "@/features/suppression/queries/mutations";

type RemoveDialogProps = {
  suppression: Suppression | null;
  onClose: () => void;
  onRemoved: (suppression: Suppression) => void;
};

export function RemoveDialog({
  suppression,
  onClose,
  onRemoved,
}: RemoveDialogProps) {
  const [last, setLast] = useState(suppression);
  const [pending, startRemove] = useTransition();
  const text = copy.removeDialog;

  if (suppression !== null && suppression !== last) {
    setLast(suppression);
  }

  const shown = suppression ?? last;
  const warning = shown ? text.warnings[shown.reason] : undefined;

  function confirm() {
    if (!suppression || pending) {
      return;
    }
    startRemove(async () => {
      const result = await removeSuppression(suppression.id);
      if (!result.ok && result.error.code !== "not_found") {
        toast.error(copy.toasts.removeFailed(suppression.email), {
          description: describeError(result.error),
        });
        return;
      }
      toast.success(copy.toasts.removed(suppression.email));
      onRemoved(suppression);
      onClose();
    });
  }

  return (
    <Dialog
      open={suppression !== null}
      onOpenChange={(next) => {
        if (!next && !pending) {
          onClose();
        }
      }}
    >
      <DialogContent className={dialogContentClass}>
        <DialogHeader>
          <DialogTitle className={`${dialogTitleClass} break-all`}>
            {text.title(shown?.email ?? "")}
          </DialogTitle>
          <DialogDescription className="text-[13px]">
            {text.body}
          </DialogDescription>
        </DialogHeader>
        {warning ? (
          <p className="flex items-start gap-2 rounded-lg bg-warning-surface px-3 py-2.5 text-[13px] text-warning">
            <TriangleAlert
              aria-hidden
              className="mt-0.5 size-4 shrink-0"
              strokeWidth={1.6}
            />
            <span>{warning}</span>
          </p>
        ) : null}
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
            onClick={confirm}
            className={dangerButtonClass}
          >
            {pending ? <Spinner /> : null}
            {text.confirm}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
