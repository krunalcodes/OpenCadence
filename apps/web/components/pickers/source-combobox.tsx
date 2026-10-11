"use client";

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@workspace/ui/components/combobox";
import { cn } from "@workspace/ui/lib/utils";
import Link from "next/link";
import { useId } from "react";
import { focusRing } from "@/components/app-shell/page-header";
import { copy } from "@/components/pickers/copy";
import { SourceMark } from "@/components/product/source-mark";
import { StatusBadge } from "@/components/status-badge";
import { appHref } from "@/lib/navigation";
import { canSendFrom, type SourceChoice, sourceLabel } from "@/lib/sources";

const text = copy.source;

type SourceItem = { value: string; label: string; source: SourceChoice };

type SharedProps = {
  sources: SourceChoice[];
  disabled?: boolean;
  error?: string | null;
  label?: string;
  placeholder?: string;
  describedBy?: string;
  className?: string;
};

export type SourceComboboxProps = SharedProps & {
  id?: string;
  value: string | null;
  clearable?: boolean;
  onChange: (value: string | null) => void;
};

export type SourceMultiSelectProps = SharedProps & {
  id?: string;
  value: string[];
  onChange: (value: string[]) => void;
};

function toItems(sources: SourceChoice[]): SourceItem[] {
  return sources.map((source) => ({
    value: source.id,
    label: sourceLabel(source),
    source,
  }));
}

function sameItem(a: SourceItem, b: SourceItem) {
  return a.value === b.value;
}

function matches(item: SourceItem, query: string) {
  const term = query.trim().toLowerCase();
  if (term === "") {
    return true;
  }
  const { source } = item;
  return [
    source.name,
    source.email ?? "",
    text.provider(source.integrationType),
  ]
    .join(" ")
    .toLowerCase()
    .includes(term);
}

function unavailableStatus(source: SourceChoice) {
  return source.status === "active" ? null : source.status;
}

function describedByIds(...ids: (string | undefined | null | false)[]) {
  const present = ids.filter(Boolean);
  return present.length > 0 ? present.join(" ") : undefined;
}

function SourceRow({ item }: { item: SourceItem }) {
  const { source } = item;
  const status = unavailableStatus(source);
  return (
    <ComboboxItem
      value={item}
      disabled={status !== null}
      className="items-start gap-2.5 py-1.5 text-[13px] data-disabled:opacity-100"
    >
      <SourceMark
        integration={{ id: source.integrationType, mark: null }}
        className={cn("mt-px size-6 rounded-[6px]", status && "opacity-60")}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              "truncate font-medium",
              status ? "text-ink-tertiary" : "text-foreground",
            )}
          >
            {source.name}
          </span>
          {source.isDefault ? (
            <span className="shrink-0 text-xs text-ink-tertiary">
              {text.defaultMark}
            </span>
          ) : null}
        </span>
        <span className="truncate text-xs text-ink-tertiary">
          {text.detail(
            source.email !== source.name ? source.email : null,
            source.integrationType,
          )}
        </span>
        {status ? (
          <span className="mt-1 text-xs leading-snug text-muted-foreground">
            {text.unavailableDetail(status)}
          </span>
        ) : null}
      </span>
      {status ? (
        <StatusBadge
          tone={status === "paused" ? "neutral" : "danger"}
          className="mt-px"
        >
          {text.unavailable(status)}
        </StatusBadge>
      ) : null}
    </ComboboxItem>
  );
}

function NoSources() {
  return (
    <p className="rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-[13px] text-muted-foreground">
      {text.none}{" "}
      <Link
        href={appHref("integrations")}
        className={cn(
          "rounded-[4px] font-medium text-primary underline-offset-2 hover:underline",
          focusRing,
        )}
      >
        {text.connect}
      </Link>
    </p>
  );
}

function Notes({
  errorId,
  error,
  noteId,
  unavailable,
}: {
  errorId: string;
  error?: string | null;
  noteId: string;
  unavailable: SourceChoice[];
}) {
  return (
    <>
      {error ? (
        <p id={errorId} role="alert" className="text-[12.5px] text-danger">
          {error}
        </p>
      ) : null}
      {unavailable.length > 0 ? (
        <ul id={noteId} className="flex flex-col gap-1">
          {unavailable.map((source) => {
            const status = unavailableStatus(source);
            return status ? (
              <li key={source.id} className="text-[12.5px] text-warning">
                {text.unavailableChosen(source.name, status)}{" "}
                <Link
                  href={appHref("integrations")}
                  className={cn(
                    "rounded-[4px] font-medium underline underline-offset-2",
                    focusRing,
                  )}
                >
                  {text.manage}
                </Link>
              </li>
            ) : null;
          })}
        </ul>
      ) : null}
    </>
  );
}

export function SourceCombobox({
  id,
  sources,
  value,
  disabled,
  error,
  label = text.label,
  placeholder = text.placeholder,
  clearable = true,
  describedBy,
  className,
  onChange,
}: SourceComboboxProps) {
  const base = useId();
  const errorId = `${base}-error`;
  const noteId = `${base}-note`;

  if (sources.length === 0) {
    return <NoSources />;
  }

  const items = toItems(sources);
  const selected = items.find((item) => item.value === value) ?? null;
  const unavailable =
    selected && !canSendFrom(selected.source) ? [selected.source] : [];

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Combobox
        items={items}
        value={selected}
        disabled={disabled}
        filter={matches}
        isItemEqualToValue={sameItem}
        onValueChange={(next: SourceItem | null) => {
          if (next || clearable) {
            onChange(next?.value ?? null);
          }
        }}
      >
        <ComboboxInput
          id={id}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedByIds(
            describedBy,
            error && errorId,
            unavailable.length > 0 && noteId,
          )}
          placeholder={placeholder}
          disabled={disabled}
          showClear={clearable && selected !== null}
          className="h-8 w-full bg-card text-[13px] shadow-xs"
        />
        <ComboboxContent>
          <ComboboxEmpty className="px-3 text-[13px]">
            {text.noMatch}
          </ComboboxEmpty>
          <ComboboxList>
            {(item: SourceItem) => <SourceRow key={item.value} item={item} />}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <Notes
        errorId={errorId}
        error={error}
        noteId={noteId}
        unavailable={unavailable}
      />
    </div>
  );
}

export function SourceMultiSelect({
  id,
  sources,
  value,
  disabled,
  error,
  label = text.labelMany,
  placeholder = text.placeholderMany,
  describedBy,
  className,
  onChange,
}: SourceMultiSelectProps) {
  const anchor = useComboboxAnchor();
  const base = useId();
  const errorId = `${base}-error`;
  const noteId = `${base}-note`;

  if (sources.length === 0) {
    return <NoSources />;
  }

  const items = toItems(sources);
  const selected = items.filter((item) => value.includes(item.value));
  const unavailable = selected
    .map((item) => item.source)
    .filter((source) => !canSendFrom(source));

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Combobox
        multiple
        autoHighlight
        items={items}
        value={selected}
        disabled={disabled}
        filter={matches}
        isItemEqualToValue={sameItem}
        onValueChange={(next: SourceItem[]) =>
          onChange(next.map((item) => item.value))
        }
      >
        <ComboboxChips
          ref={anchor}
          className="min-h-8 bg-card py-[3px] text-[13px] shadow-xs focus-within:border-input focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background data-disabled:opacity-50"
        >
          <ComboboxValue>
            {(chosen: SourceItem[]) => (
              <>
                {chosen.map((item) => (
                  <ComboboxChip
                    key={item.value}
                    aria-label={item.label}
                    className={cn(
                      "h-[22px] max-w-full rounded-[6px] pl-2 text-xs",
                      canSendFrom(item.source)
                        ? "bg-border-subtle"
                        : "bg-warning-surface text-warning",
                    )}
                  >
                    <span className="truncate">{item.source.name}</span>
                  </ComboboxChip>
                ))}
                <ComboboxChipsInput
                  id={id}
                  aria-label={label}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={describedByIds(
                    describedBy,
                    error && errorId,
                    unavailable.length > 0 && noteId,
                  )}
                  disabled={disabled}
                  placeholder={chosen.length === 0 ? placeholder : undefined}
                  className="h-[22px] min-w-24 px-1 text-[13px] placeholder:text-muted-foreground"
                />
              </>
            )}
          </ComboboxValue>
        </ComboboxChips>
        <ComboboxContent anchor={anchor}>
          <ComboboxEmpty className="px-3 text-[13px]">
            {text.noMatch}
          </ComboboxEmpty>
          <ComboboxList>
            {(item: SourceItem) => <SourceRow key={item.value} item={item} />}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <Notes
        errorId={errorId}
        error={error}
        noteId={noteId}
        unavailable={unavailable}
      />
    </div>
  );
}
