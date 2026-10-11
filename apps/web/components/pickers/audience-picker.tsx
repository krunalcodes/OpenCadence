"use client";

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@workspace/ui/components/combobox";
import { Skeleton } from "@workspace/ui/components/skeleton";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group";
import { cn } from "@workspace/ui/lib/utils";
import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { focusRing } from "@/components/app-shell/page-header";
import { copy } from "@/components/pickers/copy";
import { OptionCombobox } from "@/components/product/option-combobox";
import {
  segmentedGroupClass,
  segmentedItemClass,
} from "@/components/product/styles";
import {
  type Audience,
  type AudienceList,
  type AudienceSegment,
  type AudienceSelection,
  type AudienceType,
  audienceKey,
  audienceTypes,
  fetchAudienceCount,
  maxAudienceLists,
  toAudience,
} from "@/lib/audience";
import { appHref } from "@/lib/navigation";

const text = copy.audience;
const countDelay = 350;

export type AudienceCount =
  | { state: "incomplete" }
  | { state: "loading" }
  | { state: "ready"; count: number }
  | { state: "failed"; message: string | null };

export type AudiencePickerProps = {
  id?: string;
  value: AudienceSelection;
  lists: AudienceList[];
  segments: AudienceSegment[];
  disabled?: boolean;
  error?: string | null;
  label?: string;
  className?: string;
  onChange: (value: AudienceSelection) => void;
  onCountChange?: (count: AudienceCount) => void;
};

type ListItem = { value: string; label: string; count: number };

type Counted = { key: string; count: AudienceCount };

const linkClass = cn(
  "rounded-[4px] font-medium text-primary underline-offset-2 hover:underline",
  focusRing,
);

function sameList(a: ListItem, b: ListItem) {
  return a.value === b.value;
}

const incompleteCount: AudienceCount = { state: "incomplete" };
const loadingCount: AudienceCount = { state: "loading" };

function useAudienceCount(audience: Audience | null) {
  const [attempt, setAttempt] = useState(0);
  const [counted, setCounted] = useState<Counted | null>(null);
  const payload = audience ? JSON.stringify(audience) : null;
  const key = audience ? `${attempt}:${audienceKey(audience)}` : null;

  useEffect(() => {
    if (key === null || payload === null) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const result = await fetchAudienceCount(JSON.parse(payload) as Audience);
      if (cancelled) {
        return;
      }
      setCounted({
        key,
        count: result.ok
          ? { state: "ready", count: result.data }
          : {
              state: "failed",
              message:
                result.error.status === 404 || result.error.status === 409
                  ? result.error.message
                  : null,
            },
      });
    }, countDelay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [key, payload]);

  const count =
    key === null
      ? incompleteCount
      : counted?.key === key
        ? counted.count
        : loadingCount;

  return { count, retry: () => setAttempt((current) => current + 1) };
}

function RecipientCount({
  type,
  count,
  disabled,
  onRetry,
}: {
  type: AudienceType;
  count: AudienceCount;
  disabled?: boolean;
  onRetry: () => void;
}) {
  if (count.state === "incomplete") {
    return (
      <p className="text-[12.5px] text-ink-tertiary">
        {type === "segment" ? text.count.chooseSegment : text.count.chooseLists}
      </p>
    );
  }
  if (count.state === "loading") {
    return (
      <div className="flex h-5 items-center">
        <Skeleton className="h-3.5 w-52" />
        <span className="sr-only">{text.count.loading}</span>
      </div>
    );
  }
  if (count.state === "failed") {
    return (
      <p className="text-[13px] text-danger">
        {count.message ?? text.count.failed}{" "}
        <button
          type="button"
          disabled={disabled}
          onClick={onRetry}
          className={cn(linkClass, "disabled:opacity-50")}
        >
          {text.count.retry}
        </button>
      </p>
    );
  }
  if (count.count === 0) {
    return (
      <div className="flex items-start gap-2 rounded-lg bg-warning-surface px-3 py-2.5 text-warning">
        <TriangleAlert
          aria-hidden="true"
          strokeWidth={1.6}
          className="mt-0.5 size-4 shrink-0"
        />
        <p className="text-[13px]">
          <span className="font-medium">{text.count.zero}.</span>{" "}
          {text.count.zeroDetail[type]}
        </p>
      </div>
    );
  }
  return (
    <p className="text-[13px] text-muted-foreground">
      <span className="font-semibold text-foreground tabular-nums">
        {text.count.number(count.count)}
      </span>{" "}
      {text.count.noun(count.count)}
      <span className="text-ink-tertiary">
        {". "}
        {type === "lists" ? text.count.listsNote : text.count.note}
      </span>
    </p>
  );
}

function ListsField({
  id,
  lists,
  value,
  disabled,
  invalid,
  describedBy,
  onChange,
}: {
  id: string;
  lists: AudienceList[];
  value: string[];
  disabled?: boolean;
  invalid: boolean;
  describedBy?: string;
  onChange: (value: string[]) => void;
}) {
  const anchor = useComboboxAnchor();
  const items: ListItem[] = lists.map((list) => ({
    value: list.id,
    label: list.name,
    count: list.subscribedCount,
  }));
  const selected = items.filter((item) => value.includes(item.value));
  const full = selected.length >= maxAudienceLists;

  if (lists.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-[13px] text-muted-foreground">
        {text.lists.none}{" "}
        <Link href={appHref("lists")} className={linkClass}>
          {text.lists.create}
        </Link>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Combobox
        multiple
        autoHighlight
        items={items}
        value={selected}
        disabled={disabled}
        isItemEqualToValue={sameList}
        onValueChange={(next: ListItem[]) => {
          if (next.length <= maxAudienceLists) {
            onChange(next.map((item) => item.value));
          }
        }}
      >
        <ComboboxChips
          ref={anchor}
          className="min-h-8 bg-card py-[3px] text-[13px] shadow-xs focus-within:border-input focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background data-disabled:opacity-50"
        >
          <ComboboxValue>
            {(chosen: ListItem[]) => (
              <>
                {chosen.map((item) => (
                  <ComboboxChip
                    key={item.value}
                    aria-label={item.label}
                    className="h-[22px] max-w-full rounded-[6px] bg-border-subtle pl-2 text-xs"
                  >
                    <span className="truncate">{item.label}</span>
                  </ComboboxChip>
                ))}
                <ComboboxChipsInput
                  id={id}
                  aria-label={text.lists.label}
                  aria-invalid={invalid || undefined}
                  aria-describedby={describedBy}
                  disabled={disabled}
                  placeholder={
                    chosen.length === 0 ? text.lists.placeholder : undefined
                  }
                  className="h-[22px] min-w-24 px-1 text-[13px] placeholder:text-muted-foreground"
                />
              </>
            )}
          </ComboboxValue>
        </ComboboxChips>
        <ComboboxContent anchor={anchor}>
          <ComboboxEmpty className="px-3 text-[13px]">
            {text.lists.noMatch}
          </ComboboxEmpty>
          <ComboboxList>
            {(item: ListItem) => (
              <ComboboxItem
                key={item.value}
                value={item}
                disabled={full && !value.includes(item.value)}
                className="text-[13px]"
              >
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                <span className="shrink-0 text-xs text-ink-tertiary tabular-nums">
                  {text.lists.subscribed(item.count)}
                </span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {full ? (
        <p className="text-[12.5px] text-ink-tertiary">
          {text.lists.tooMany(maxAudienceLists)}
        </p>
      ) : null}
    </div>
  );
}

export function AudiencePicker({
  id,
  value,
  lists,
  segments,
  disabled,
  error,
  label = text.label,
  className,
  onChange,
  onCountChange,
}: AudiencePickerProps) {
  const base = useId();
  const fieldId = id ?? `${base}-field`;
  const errorId = `${base}-error`;
  const audience = toAudience(value);
  const { count, retry } = useAudienceCount(audience);

  const notify = useRef(onCountChange);
  useEffect(() => {
    notify.current = onCountChange;
  }, [onCountChange]);
  useEffect(() => {
    notify.current?.(count);
  }, [count]);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <ToggleGroup
        aria-label={label}
        value={[value.type]}
        disabled={disabled}
        onValueChange={(next) => {
          const type = audienceTypes.find((item) => item === next[0]);
          if (type && type !== value.type) {
            onChange({ ...value, type });
          }
        }}
        className={segmentedGroupClass}
      >
        {audienceTypes.map((type) => (
          <ToggleGroupItem
            key={type}
            value={type}
            className={segmentedItemClass}
          >
            {text.types[type]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {value.type === "lists" ? (
        <ListsField
          id={fieldId}
          lists={lists}
          value={value.listIds}
          disabled={disabled}
          invalid={Boolean(error)}
          describedBy={error ? errorId : undefined}
          onChange={(listIds) => onChange({ ...value, listIds })}
        />
      ) : null}

      {value.type === "segment" ? (
        segments.length === 0 ? (
          <p className="rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-[13px] text-muted-foreground">
            {text.segment.none}{" "}
            <Link href={appHref("segments")} className={linkClass}>
              {text.segment.create}
            </Link>
          </p>
        ) : (
          <OptionCombobox
            id={fieldId}
            options={segments.map((segment) => ({
              value: segment.id,
              label: segment.name,
            }))}
            value={value.segmentId}
            label={text.segment.label}
            placeholder={text.segment.placeholder}
            empty={text.segment.noMatch}
            disabled={disabled}
            invalid={Boolean(error)}
            describedBy={error ? errorId : undefined}
            onChange={(segmentId) => onChange({ ...value, segmentId })}
            className="w-full"
          />
        )
      ) : null}

      {error ? (
        <p id={errorId} role="alert" className="text-[12.5px] text-danger">
          {error}
        </p>
      ) : null}

      <div aria-live="polite">
        <RecipientCount
          type={value.type}
          count={count}
          disabled={disabled}
          onRetry={retry}
        />
      </div>
    </div>
  );
}
