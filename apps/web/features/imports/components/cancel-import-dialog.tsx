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
import { copy, describeError } from "@/features/imports/lib/copy";
import type { Import } from "@/features/imports/lib/imports";
import { cancelImport } from "@/features/imports/queries/client";

const text = copy.cancelDialog;

type CancelImportDialogProps = {
  item: Import | null;
  onClose: () => void;
  onCancelled: (item: Import) => void;
};

export function CancelImportDialog({
  item,
  onClose,
  onCancelled,
}: CancelImportDialogProps) {
  const [last, setLast] = useState(item);
  const [pending, startCancel] = useTransition();

  if (item !== null && item !== last) {
    setLast(item);
  }

  const name = (item ?? last)?.fileName || copy.recent.unnamed;

  function confirm() {
    if (!item || pending) {
      return;
    }
    startCancel(async () => {
      const result = await cancelImport(item.id);
      if (!result.ok) {
        toast.error(text.failed, { description: describeError(result.error) });
        return;
      }
      toast.success(text.done(name));
      onCancelled(result.data);
      onClose();
    });
  }

  return (
    <Dialog
      open={item !== null}
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
            {text.keep}
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
