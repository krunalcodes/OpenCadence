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
import { copy, describeError } from "@/features/lists/lib/copy";
import type { List } from "@/features/lists/lib/lists";
import { deleteList } from "@/features/lists/queries/mutations";

type DeleteListDialogProps = {
  list: List | null;
  onClose: () => void;
  onDeleted: (list: List) => void;
};

export function DeleteListDialog({
  list,
  onClose,
  onDeleted,
}: DeleteListDialogProps) {
  const [last, setLast] = useState(list);
  const [pending, startDelete] = useTransition();
  const text = copy.deleteDialog;

  if (list !== null && list !== last) {
    setLast(list);
  }

  const shown = list ?? last;

  function confirm() {
    if (!list || pending) {
      return;
    }
    startDelete(async () => {
      const result = await deleteList(list.id);
      if (!result.ok && result.error.code !== "not_found") {
        toast.error(copy.toasts.deleteFailed(list.name), {
          description: describeError(result.error),
        });
        return;
      }
      toast.success(copy.toasts.deleted(list.name));
      onDeleted(list);
      onClose();
    });
  }

  return (
    <Dialog
      open={list !== null}
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
