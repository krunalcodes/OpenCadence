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
import { copy, describeError } from "@/features/segments/lib/copy";
import type { Segment } from "@/features/segments/lib/segments";
import { deleteSegment } from "@/features/segments/queries/client";

type DeleteSegmentDialogProps = {
  segment: Segment | null;
  onClose: () => void;
  onDeleted: (segment: Segment) => void;
};

export function DeleteSegmentDialog({
  segment,
  onClose,
  onDeleted,
}: DeleteSegmentDialogProps) {
  const [last, setLast] = useState(segment);
  const [pending, startDelete] = useTransition();
  const text = copy.deleteDialog;

  if (segment !== null && segment !== last) {
    setLast(segment);
  }

  const shown = segment ?? last;

  function confirm() {
    if (!segment || pending) {
      return;
    }
    startDelete(async () => {
      const result = await deleteSegment(segment.id);
      if (!result.ok && result.error.code !== "not_found") {
        toast.error(copy.toasts.deleteFailed(segment.name), {
          description: describeError(result.error),
        });
        return;
      }
      toast.success(copy.toasts.deleted(segment.name));
      onDeleted(segment);
      onClose();
    });
  }

  return (
    <Dialog
      open={segment !== null}
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
