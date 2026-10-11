"use client";

import { Switch } from "@workspace/ui/components/switch";
import type { Ref } from "react";
import { MultiCombobox } from "@/features/imports/components/multi-combobox";
import { Notice, StepHeading } from "@/features/imports/components/parts";
import { copy } from "@/features/imports/lib/copy";
import { formatFileSize } from "@/features/imports/lib/file";
import type { Catalog, Option } from "@/features/imports/lib/imports";
import { matchedCount, skippedIndexes } from "@/features/imports/lib/mapping";

const text = copy.options;

const shownSkipped = 6;

export type StartErrors = {
  mapping?: string;
  listIds?: string;
  tagIds?: string;
  form?: string;
};

type OptionsStepProps = {
  headingRef: Ref<HTMLHeadingElement>;
  fileName: string;
  fileSize: number;
  columns: string[];
  targets: string[];
  catalog: Catalog;
  updateExisting: boolean;
  lists: Option[];
  tags: Option[];
  errors: StartErrors;
  pending: boolean;
  onUpdateExistingChange: (value: boolean) => void;
  onListsChange: (value: Option[]) => void;
  onTagsChange: (value: Option[]) => void;
};

function skippedText(columns: string[], targets: string[]) {
  const names = skippedIndexes(targets).map(
    (index) => columns[index] || copy.mapping.unnamed(index + 1),
  );
  if (names.length === 0) {
    return text.skippedNone;
  }
  const shown = names.slice(0, shownSkipped).join(", ");
  return names.length > shownSkipped
    ? text.skippedMore(shown, names.length - shownSkipped)
    : shown;
}

export function OptionsStep({
  headingRef,
  fileName,
  fileSize,
  columns,
  targets,
  catalog,
  updateExisting,
  lists,
  tags,
  errors,
  pending,
  onUpdateExistingChange,
  onListsChange,
  onTagsChange,
}: OptionsStepProps) {
  return (
    <div className="grid gap-x-10 gap-y-5 @4xl:grid-cols-[minmax(0,560px)_minmax(0,360px)]">
      <div className="flex min-w-0 flex-col gap-4">
        <StepHeading ref={headingRef}>{text.heading}</StepHeading>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div
              id="import-update-label"
              className="font-medium text-foreground"
            >
              {text.update}
            </div>
            <p
              id="import-update-hint"
              aria-live="polite"
              className="text-muted-foreground"
            >
              {updateExisting ? text.updateHints.on : text.updateHints.off}
            </p>
          </div>
          <Switch
            id="import-update"
            checked={updateExisting}
            disabled={pending}
            aria-labelledby="import-update-label"
            aria-describedby="import-update-hint"
            onCheckedChange={onUpdateExistingChange}
            className="mt-0.5"
          />
        </div>

        <MultiCombobox
          id="import-lists"
          label={text.lists}
          optional={text.optional}
          hint={text.listsHint}
          placeholder={text.listsPlaceholder}
          emptyText={text.listsEmpty}
          noOptions={text.noLists}
          options={catalog.lists}
          value={lists}
          error={errors.listIds}
          disabled={pending}
          onChange={onListsChange}
        />
        <MultiCombobox
          id="import-tags"
          label={text.tags}
          optional={text.optional}
          hint={text.tagsHint}
          placeholder={text.tagsPlaceholder}
          emptyText={text.tagsEmpty}
          noOptions={text.noTags}
          options={catalog.tags}
          value={tags}
          error={errors.tagIds}
          disabled={pending}
          onChange={onTagsChange}
        />
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <h3 className="text-[13px] font-semibold text-foreground">
          {text.summary}
        </h3>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
          <dt className="text-ink-tertiary">{text.summaryFile}</dt>
          <dd className="break-words text-foreground tabular-nums">
            {text.fileValue(fileName, formatFileSize(fileSize))}
          </dd>
          <dt className="text-ink-tertiary">{text.summaryMatched}</dt>
          <dd className="text-foreground tabular-nums">
            {text.matchedValue(matchedCount(targets), columns.length)}
          </dd>
          <dt className="text-ink-tertiary">{text.summarySkipped}</dt>
          <dd className="break-words text-foreground">
            {skippedText(columns, targets)}
          </dd>
        </dl>
        <p className="text-muted-foreground">{text.suppression}</p>
        {errors.form ? (
          <Notice tone="danger" role="alert">
            <span className="font-medium">{text.startFailed}</span>{" "}
            {errors.form}
          </Notice>
        ) : null}
      </div>
    </div>
  );
}
