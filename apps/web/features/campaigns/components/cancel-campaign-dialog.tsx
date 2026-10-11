"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import {
  dangerButtonClass,
  dialogActionsClass,
  dialogContentClass,
  dialogTitleClass,
  secondaryButtonClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import { type Campaign, progressOf } from "@/features/campaigns/lib/campaigns";
import { copy } from "@/features/campaigns/lib/copy";

const text = copy.results.cancelDialog;

type CancelCampaignDialogProps = {
  open: boolean;
  campaign: Campaign;
  pending: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
};

export function CancelCampaignDialog({
  open,
  campaign,
  pending,
  onConfirm,
  onOpenChange,
}: CancelCampaignDialogProps) {
  const progress = progressOf(campaign.stats);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next || !pending) {
          onOpenChange(next);
        }
      }}
    >
      <DialogContent className={dialogContentClass}>
        <DialogHeader>
          <DialogTitle className={`${dialogTitleClass} break-words`}>
            {text.title(campaign.name || copy.untitled)}
          </DialogTitle>
          <DialogDescription className="text-[13px] tabular-nums">
            {campaign.status === "scheduled"
              ? text.bodyScheduled
              : text.body(
                  progress.sent,
                  campaign.fanoutDone ? progress.total - progress.handled : 0,
                  campaign.fanoutDone,
                )}
          </DialogDescription>
        </DialogHeader>
        <div className={dialogActionsClass}>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
            className={secondaryButtonClass}
          >
            {text.keep}
          </Button>
          <Button
            type="button"
            disabled={pending}
            aria-busy={pending || undefined}
            onClick={onConfirm}
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
