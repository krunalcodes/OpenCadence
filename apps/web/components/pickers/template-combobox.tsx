"use client";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@workspace/ui/components/combobox";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { cn } from "@workspace/ui/lib/utils";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { focusRing } from "@/components/app-shell/page-header";
import { copy } from "@/components/pickers/copy";
import { appHref } from "@/lib/navigation";
import {
  searchTemplates,
  type TemplateChoice,
  toSearchFilter,
} from "@/lib/templates";

const text = copy.template;
const searchDelay = 250;
const skeletonRows = ["first", "second", "third"];

export type TemplateComboboxProps = {
  id?: string;
  value: TemplateChoice | null;
  disabled?: boolean;
  error?: string | null;
  label?: string;
  placeholder?: string;
  clearable?: boolean;
  describedBy?: string;
  className?: string;
  onChange: (value: TemplateChoice | null) => void;
};

type Loaded = {
  key: string;
  search: string;
  templates: TemplateChoice[];
  failed: boolean;
};

function sameTemplate(a: TemplateChoice, b: TemplateChoice) {
  return a.id === b.id;
}

function templateName(template: TemplateChoice) {
  return template.name;
}

export function TemplateCombobox({
  id,
  value,
  disabled,
  error,
  label = text.label,
  placeholder = text.placeholder,
  clearable = true,
  describedBy,
  className,
  onChange,
}: TemplateComboboxProps) {
  const base = useId();
  const errorId = `${base}-error`;
  const [opened, setOpened] = useState(false);
  const [query, setQuery] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const hasLoaded = useRef(false);

  const search = toSearchFilter(query);
  const key = `${attempt}:${search}`;
  const loading = opened && loaded?.key !== key;
  const templates = loaded?.templates ?? [];
  const none =
    loaded !== null &&
    !loaded.failed &&
    loaded.search === "" &&
    loaded.templates.length === 0;

  useEffect(() => {
    if (!opened) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(
      async () => {
        const result = await searchTemplates(search);
        if (cancelled) {
          return;
        }
        hasLoaded.current = true;
        setLoaded({
          key,
          search,
          templates: result.ok ? result.data : [],
          failed: !result.ok,
        });
      },
      hasLoaded.current ? searchDelay : 0,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [opened, key, search]);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Combobox
        items={templates}
        value={value}
        disabled={disabled}
        filter={null}
        itemToStringLabel={templateName}
        isItemEqualToValue={sameTemplate}
        onOpenChange={(open: boolean) => {
          if (open) {
            setOpened(true);
          }
        }}
        onInputValueChange={(next: string, details: { reason: string }) => {
          if (details.reason === "input-change") {
            setQuery(next);
          } else if (query !== "") {
            setQuery("");
          }
        }}
        onValueChange={(next: TemplateChoice | null) => {
          if (next || clearable) {
            onChange(next);
          }
        }}
      >
        <ComboboxInput
          id={id}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            [describedBy, error ? errorId : null].filter(Boolean).join(" ") ||
            undefined
          }
          aria-busy={loading || undefined}
          placeholder={placeholder}
          disabled={disabled}
          showClear={clearable && value !== null}
          className="h-8 w-full bg-card text-[13px] shadow-xs"
        />
        <ComboboxContent>
          <ComboboxEmpty className="block px-1 py-1 text-left text-[13px]">
            {loading || loaded === null ? (
              <span className="flex flex-col gap-1">
                <span className="sr-only">{text.loading}</span>
                {skeletonRows.map((row) => (
                  <span
                    key={row}
                    aria-hidden="true"
                    className="flex flex-col gap-1.5 px-1.5 py-1.5"
                  >
                    <Skeleton className="h-3.5 w-2/5" />
                    <Skeleton className="h-3 w-3/5" />
                  </span>
                ))}
              </span>
            ) : loaded.failed ? (
              <span className="flex items-center justify-between gap-3 px-2 py-1.5">
                <span className="text-danger">{text.failed}</span>
                <button
                  type="button"
                  onClick={() => setAttempt((current) => current + 1)}
                  className={cn(
                    "rounded-[4px] font-medium text-primary underline-offset-2 hover:underline",
                    focusRing,
                  )}
                >
                  {text.retry}
                </button>
              </span>
            ) : (
              <span className="block px-2 py-1.5 text-muted-foreground">
                {loaded.search === "" ? text.none : text.noMatch(loaded.search)}
              </span>
            )}
          </ComboboxEmpty>
          <ComboboxList className={cn(loading && "opacity-60")}>
            {(item: TemplateChoice) => (
              <ComboboxItem
                key={item.id}
                value={item}
                className="items-start py-1.5 text-[13px]"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium text-foreground">
                    {item.name}
                  </span>
                  <span className="truncate text-xs text-ink-tertiary">
                    {item.subject || text.noSubject}
                  </span>
                </span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {error ? (
        <p id={errorId} role="alert" className="text-[12.5px] text-danger">
          {error}
        </p>
      ) : null}
      {none ? (
        <p className="text-[12.5px] text-muted-foreground">
          {text.none}{" "}
          <Link
            href={appHref("templates")}
            className={cn(
              "rounded-[4px] font-medium text-primary underline-offset-2 hover:underline",
              focusRing,
            )}
          >
            {text.create}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
