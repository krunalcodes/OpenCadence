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
import type { CampaignSummary } from "@/features/campaigns/lib/campaigns";
import { copy, describeError } from "@/features/campaigns/lib/copy";
import { deleteCampaign } from "@/features/campaigns/queries/client";

type DeleteCampaignDialogProps = {
  campaign: CampaignSummary | null;
  onClose: () => void;
  onDeleted: (campaign: CampaignSummary) => void;
};

export function DeleteCampaignDialog({
  campaign,
  onClose,
  onDeleted,
}: DeleteCampaignDialogProps) {
  const [last, setLast] = useState(campaign);
  const [pending, startDelete] = useTransition();
  const text = copy.deleteDialog;

  if (campaign !== null && campaign !== last) {
    setLast(campaign);
  }

  const shown = campaign ?? last;
  const name = shown?.name || copy.untitled;

  function confirm() {
    if (!campaign || pending) {
      return;
    }
    startDelete(async () => {
      const result = await deleteCampaign(campaign.id);
      if (
        !result.ok &&
        result.error.code !== "not_found" &&
        result.error.status !== 404
      ) {
        toast.error(copy.toasts.deleteFailed(name), {
          description: describeError(result.error),
        });
        return;
      }
      toast.success(copy.toasts.deleted(name));
      onDeleted(campaign);
      onClose();
    });
  }

  return (
    <Dialog
      open={campaign !== null}
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
            {shown?.status === "draft"
              ? text.draftBody
              : shown?.status === "scheduled"
                ? text.scheduledBody
                : text.sentBody}
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
