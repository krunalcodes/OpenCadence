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
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import { copy, describeError } from "@/features/forms/lib/copy";
import { deleteForm, runFormAction } from "@/features/forms/queries/client";

export type FormTarget = {
  kind: "delete" | "archive";
  id: string;
  name: string;
};

type ConfirmFormDialogProps = {
  target: FormTarget | null;
  onClose: () => void;
  onDone: (target: FormTarget) => void;
};

export function ConfirmFormDialog({
  target,
  onClose,
  onDone,
}: ConfirmFormDialogProps) {
  const [last, setLast] = useState(target);
  const [pending, startAction] = useTransition();

  if (target !== null && target !== last) {
    setLast(target);
  }

  const shown = target ?? last;
  const removing = shown?.kind !== "archive";
  const text = removing ? copy.deleteDialog : copy.archiveDialog;
  const name = shown?.name || copy.untitled;

  function confirm() {
    if (!target || pending) {
      return;
    }
    startAction(async () => {
      const result =
        target.kind === "delete"
          ? await deleteForm(target.id)
          : await runFormAction(target.id, "archive");
      const gone =
        target.kind === "delete" &&
        !result.ok &&
        (result.error.code === "not_found" || result.error.status === 404);
      if (!result.ok && !gone) {
        toast.error(
          target.kind === "delete"
            ? copy.toasts.deleteFailed(name)
            : copy.toasts.archiveFailed(name),
          { description: describeError(result.error) },
        );
        return;
      }
      toast.success(
        target.kind === "delete"
          ? copy.toasts.deleted(name)
          : copy.toasts.archived(name),
      );
      onDone(target);
      onClose();
    });
  }

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(next) => {
        if (!next && !pending) {
          onClose();
        }
      }}
    >
      <DialogContent className={dialogContentClass}>
        <DialogHeader>
          <DialogTitle className={`${dialogTitleClass} break-words`}>
            {text.title(name)}
          </DialogTitle>
          <DialogDescription className="text-[13px]">
            {text.body}
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
            {text.cancel}
          </Button>
          <Button
            type="button"
            disabled={pending}
            aria-busy={pending || undefined}
            onClick={confirm}
            className={removing ? dangerButtonClass : primaryButtonClass}
          >
            {pending ? <Spinner /> : null}
            {text.confirm}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
