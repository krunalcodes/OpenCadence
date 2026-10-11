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
import type { Contact } from "@/features/contacts/lib/contacts";
import { copy, describeError } from "@/features/contacts/lib/copy";
import { deleteContact } from "@/features/contacts/queries/client";

const text = copy.deleteDialog;

type DeleteContactDialogProps = {
  contact: Contact | null;
  onClose: () => void;
  onDeleted: (contact: Contact) => void;
};

export function DeleteContactDialog({
  contact,
  onClose,
  onDeleted,
}: DeleteContactDialogProps) {
  const [last, setLast] = useState(contact);
  const [pending, startDelete] = useTransition();

  if (contact !== null && contact !== last) {
    setLast(contact);
  }

  const shown = contact ?? last;

  function confirm() {
    if (!contact || pending) {
      return;
    }
    startDelete(async () => {
      const result = await deleteContact(contact.id);
      if (!result.ok && result.error.code !== "not_found") {
        toast.error(copy.toasts.deleteFailed(contact.email), {
          description: describeError(result.error),
        });
        return;
      }
      toast.success(copy.toasts.deleted(contact.email));
      onDeleted(contact);
      onClose();
    });
  }

  return (
    <Dialog
      open={contact !== null}
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
