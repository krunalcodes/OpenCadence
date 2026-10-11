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
import { copy, describeError } from "@/features/templates/lib/copy";
import type { TemplateSummary } from "@/features/templates/lib/templates";
import { deleteTemplate } from "@/features/templates/queries/client";

type DeleteTemplateDialogProps = {
  template: TemplateSummary | null;
  onClose: () => void;
  onDeleted: (template: TemplateSummary) => void;
};

export function DeleteTemplateDialog({
  template,
  onClose,
  onDeleted,
}: DeleteTemplateDialogProps) {
  const [last, setLast] = useState(template);
  const [pending, startDelete] = useTransition();
  const text = copy.deleteDialog;

  if (template !== null && template !== last) {
    setLast(template);
  }

  const shown = template ?? last;

  function confirm() {
    if (!template || pending) {
      return;
    }
    startDelete(async () => {
      const result = await deleteTemplate(template.id);
      if (!result.ok && result.error.code !== "not_found") {
        toast.error(copy.toasts.deleteFailed(template.name), {
          description: describeError(result.error),
        });
        return;
      }
      toast.success(copy.toasts.deleted(template.name));
      onDeleted(template);
      onClose();
    });
  }

  return (
    <Dialog
      open={template !== null}
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
