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
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@workspace/ui/components/field";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { OptionMultiSelect } from "@/components/product/option-multi-select";
import {
  dangerButtonClass,
  dialogActionsClass,
  dialogContentClass,
  dialogTitleClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import type { BulkAction, Option } from "@/features/contacts/lib/contacts";
import {
  type BulkPickAction,
  copy,
  describeError,
} from "@/features/contacts/lib/copy";
import { bulkContacts } from "@/features/contacts/queries/client";

const text = copy.bulk;

function isListAction(action: BulkPickAction) {
  return action === "add_to_lists" || action === "remove_from_lists";
}

type BulkDialogProps = {
  action: BulkAction | null;
  ids: string[];
  lists: Option[];
  tags: Option[];
  onClose: () => void;
  onDone: (action: BulkAction, ids: string[]) => void;
};

export function BulkDialog({
  action,
  ids,
  lists,
  tags,
  onClose,
  onDone,
}: BulkDialogProps) {
  const [last, setLast] = useState<BulkAction>("add_tags");
  const [count, setCount] = useState(ids.length);
  const [pending, setPending] = useState(false);

  if (action !== null && (action !== last || ids.length !== count)) {
    setLast(action);
    setCount(ids.length);
  }

  const shown = action ?? last;

  return (
    <Dialog
      open={action !== null}
      onOpenChange={(next) => {
        if (!next && !pending) {
          onClose();
        }
      }}
    >
      <DialogContent className={dialogContentClass}>
        {shown === "delete" ? (
          <DeleteBody
            ids={ids}
            count={count}
            pending={pending}
            onPendingChange={setPending}
            onClose={onClose}
            onDone={onDone}
          />
        ) : (
          <PickBody
            key={shown}
            action={shown}
            ids={ids}
            count={count}
            options={isListAction(shown) ? lists : tags}
            pending={pending}
            onPendingChange={setPending}
            onClose={onClose}
            onDone={onDone}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type BodyProps = {
  ids: string[];
  count: number;
  pending: boolean;
  onPendingChange: (pending: boolean) => void;
  onClose: () => void;
  onDone: (action: BulkAction, ids: string[]) => void;
};

function PickBody({
  action,
  ids,
  count,
  options,
  pending,
  onPendingChange,
  onClose,
  onDone,
}: BodyProps & { action: BulkPickAction; options: Option[] }) {
  const [picked, setPicked] = useState<Option[]>([]);
  const [error, setError] = useState<string | null>(null);
  const forLists = isListAction(action);

  async function submit() {
    const chosen = picked.map((option) => option.value);
    const result = await bulkContacts({
      ids,
      action,
      ...(forLists ? { listIds: chosen } : { tagIds: chosen }),
    });
    onPendingChange(false);
    if (!result.ok) {
      toast.error(text.failed, { description: describeError(result.error) });
      return;
    }
    toast.success(text.done[action](result.data));
    onDone(action, ids);
    onClose();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || ids.length === 0) {
      return;
    }
    if (picked.length === 0) {
      setError(text.missing[action]);
      document.getElementById("contacts-bulk-pick")?.focus();
      return;
    }
    onPendingChange(true);
    void submit();
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="grid gap-5">
      <DialogHeader>
        <DialogTitle className={dialogTitleClass}>
          {text.titles[action](count)}
        </DialogTitle>
        <DialogDescription className="text-[13px]">
          {text.bodies[action]}
        </DialogDescription>
      </DialogHeader>
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor="contacts-bulk-pick" className="text-[13px]">
          {text.pickLabels[action]}
        </FieldLabel>
        <OptionMultiSelect
          id="contacts-bulk-pick"
          options={options}
          value={picked}
          label={text.pickLabels[action]}
          placeholder={
            forLists
              ? copy.picker.listsPlaceholder
              : copy.picker.tagsPlaceholder
          }
          empty={forLists ? copy.picker.listsEmpty : copy.picker.tagsEmpty}
          disabled={pending}
          invalid={error !== null}
          describedBy={error ? "contacts-bulk-pick-error" : undefined}
          onChange={(next) => {
            setPicked(next);
            setError(null);
          }}
        />
        {error ? (
          <FieldError
            id="contacts-bulk-pick-error"
            className="text-[13px] text-danger"
          >
            {error}
          </FieldError>
        ) : options.length === 0 ? (
          <FieldDescription className="text-[13px]">
            {forLists ? text.noLists : text.noTags}
          </FieldDescription>
        ) : null}
      </Field>
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
          type="submit"
          disabled={pending}
          aria-busy={pending || undefined}
          className={primaryButtonClass}
        >
          {pending ? <Spinner /> : null}
          {text.confirms[action]}
        </Button>
      </div>
    </form>
  );
}

function DeleteBody({
  ids,
  count,
  pending,
  onPendingChange,
  onClose,
  onDone,
}: BodyProps) {
  async function confirm() {
    if (pending || ids.length === 0) {
      return;
    }
    onPendingChange(true);
    const result = await bulkContacts({ ids, action: "delete" });
    onPendingChange(false);
    if (!result.ok) {
      toast.error(text.deleteFailed, {
        description: describeError(result.error),
      });
      return;
    }
    toast.success(text.deleted(result.data));
    onDone("delete", ids);
    onClose();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className={dialogTitleClass}>
          {text.deleteTitle(count)}
        </DialogTitle>
        <DialogDescription className="text-[13px]">
          {text.deleteBody(count)}
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
          onClick={() => void confirm()}
          className={dangerButtonClass}
        >
          {pending ? <Spinner /> : null}
          {text.deleteConfirm(count)}
        </Button>
      </div>
    </>
  );
}
