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
import { copy, describeError } from "@/features/domains/lib/copy";
import type { Domain } from "@/features/domains/lib/domains";
import { deleteDomain } from "@/features/domains/queries/mutations";

type DeleteDomainDialogProps = {
  domain: Domain | null;
  onClose: () => void;
  onDeleted: (domain: Domain) => void;
};

export function DeleteDomainDialog({
  domain,
  onClose,
  onDeleted,
}: DeleteDomainDialogProps) {
  const [last, setLast] = useState(domain);
  const [pending, startDelete] = useTransition();
  const text = copy.deleteDialog;

  if (domain !== null && domain !== last) {
    setLast(domain);
  }

  const shown = domain ?? last;

  function confirm() {
    if (!domain || pending) {
      return;
    }
    startDelete(async () => {
      const result = await deleteDomain(domain.id);
      if (!result.ok && result.error.code !== "not_found") {
        toast.error(copy.toasts.deleteFailed(domain.domain), {
          description: describeError(result.error),
        });
        return;
      }
      toast.success(copy.toasts.deleted(domain.domain));
      onDeleted(domain);
      onClose();
    });
  }

  return (
    <Dialog
      open={domain !== null}
      onOpenChange={(next) => {
        if (!next && !pending) {
          onClose();
        }
      }}
    >
      <DialogContent className={dialogContentClass}>
        <DialogHeader>
          <DialogTitle className={`${dialogTitleClass} break-words`}>
            {text.title(shown?.domain ?? "")}
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
