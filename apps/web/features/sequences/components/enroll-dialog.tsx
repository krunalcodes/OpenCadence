"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { Info } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import {
  type AudienceCount,
  AudiencePicker,
} from "@/components/pickers/audience-picker";
import {
  dialogActionsClass,
  dialogTitleClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import { copy, describeError } from "@/features/sequences/lib/copy";
import type { EnrollResult } from "@/features/sequences/lib/enrollments";
import type { Sequence } from "@/features/sequences/lib/sequences";
import { enrollAudience } from "@/features/sequences/queries/client";
import {
  type AudienceList,
  type AudienceSegment,
  type AudienceSelection,
  toAudience,
} from "@/lib/audience";

const text = copy.enroll;

const initialSelection: AudienceSelection = {
  type: "lists",
  listIds: [],
  segmentId: null,
};

type EnrollDialogProps = {
  open: boolean;
  formKey: number;
  sequence: Sequence;
  lists: AudienceList[];
  segments: AudienceSegment[];
  onOpenChange: (open: boolean) => void;
  onEnrolled: (result: EnrollResult) => void;
};

export function EnrollDialog({
  open,
  formKey,
  sequence,
  lists,
  segments,
  onOpenChange,
  onEnrolled,
}: EnrollDialogProps) {
  const [pending, setPending] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next || !pending) {
          onOpenChange(next);
        }
      }}
    >
      <DialogContent className="gap-5 p-5 text-[13px] sm:max-w-[520px]">
        <EnrollForm
          key={formKey}
          sequence={sequence}
          lists={lists}
          segments={segments}
          pending={pending}
          onPendingChange={setPending}
          onCancel={() => onOpenChange(false)}
          onEnrolled={onEnrolled}
        />
      </DialogContent>
    </Dialog>
  );
}

type EnrollFormProps = {
  sequence: Sequence;
  lists: AudienceList[];
  segments: AudienceSegment[];
  pending: boolean;
  onPendingChange: (pending: boolean) => void;
  onCancel: () => void;
  onEnrolled: (result: EnrollResult) => void;
};

function EnrollForm({
  sequence,
  lists,
  segments,
  pending,
  onPendingChange,
  onCancel,
  onEnrolled,
}: EnrollFormProps) {
  const [selection, setSelection] = useState(initialSelection);
  const [count, setCount] = useState<AudienceCount>({ state: "incomplete" });
  const [error, setError] = useState<string | null>(null);

  const audience = toAudience(selection);
  const empty = count.state === "ready" && count.count === 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    if (!audience) {
      setError(text.incomplete);
      return;
    }
    if (empty) {
      setError(text.empty);
      return;
    }
    setError(null);
    onPendingChange(true);
    const result = await enrollAudience(sequence.id, audience);
    onPendingChange(false);
    if (!result.ok) {
      const message = describeError(result.error);
      if (result.error.field === "audience" || result.error.status === 404) {
        setError(message);
      } else {
        toast.error(text.failed, { description: message });
      }
      return;
    }
    onEnrolled(result.data);
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle className={dialogTitleClass}>{text.title}</DialogTitle>
        <DialogDescription className="text-[13px]">
          {text.description}
        </DialogDescription>
      </DialogHeader>
      <AudiencePicker
        value={selection}
        lists={lists}
        segments={segments}
        disabled={pending}
        error={error}
        onChange={(next) => {
          setSelection(next);
          setError(null);
        }}
        onCountChange={setCount}
      />
      {sequence.status === "active" ? null : (
        <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-muted-foreground">
          <Info
            aria-hidden
            strokeWidth={1.6}
            className="mt-0.5 size-4 shrink-0"
          />
          {text.draftNote}
        </p>
      )}
      <div className={dialogActionsClass}>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onCancel}
          className={secondaryButtonClass}
        >
          {text.cancel}
        </Button>
        <Button
          type="submit"
          disabled={pending || !audience || empty}
          aria-busy={pending || undefined}
          className={`${primaryButtonClass} tabular-nums`}
        >
          {pending ? <Spinner /> : null}
          {count.state === "ready" && count.count > 0
            ? text.submitCount(count.count)
            : text.submit}
        </Button>
      </div>
    </form>
  );
}
