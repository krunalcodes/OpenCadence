"use client";

import { cn } from "@workspace/ui/lib/utils";
import { X } from "lucide-react";
import {
  type ClipboardEvent,
  type KeyboardEvent,
  useRef,
  useState,
} from "react";
import { focusRing } from "@/components/app-shell/page-header";

const separators = /[\s,;]+/;
const commitKeys = new Set(["Enter", "Tab", ",", ";", " "]);

type TokenInputProps = {
  id: string;
  tokens: string[];
  max: number;
  listLabel: string;
  removeLabel: (token: string) => string;
  onChange: (tokens: string[]) => void;
  onOverflow?: (dropped: number) => void;
  normalize?: (raw: string) => string;
  invalidReason?: (token: string) => string | null;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  inputMode?: "text" | "email" | "url";
};

export function TokenInput({
  id,
  tokens,
  max,
  listLabel,
  removeLabel,
  onChange,
  onOverflow,
  normalize,
  invalidReason,
  placeholder,
  disabled,
  invalid,
  describedBy,
  inputMode = "text",
}: TokenInputProps) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function commit(raw: string) {
    const seen = new Set(tokens);
    const next = [...tokens];
    let dropped = 0;
    for (const part of raw.split(separators)) {
      const token = normalize ? normalize(part) : part.trim();
      if (token === "" || seen.has(token)) {
        continue;
      }
      if (next.length >= max) {
        dropped += 1;
        continue;
      }
      seen.add(token);
      next.push(token);
    }
    setDraft("");
    if (next.length !== tokens.length) {
      onChange(next);
    }
    if (dropped > 0) {
      onOverflow?.(dropped);
    }
  }

  function remove(token: string) {
    onChange(tokens.filter((item) => item !== token));
    inputRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) {
      return;
    }
    if (commitKeys.has(event.key)) {
      if (draft.trim() !== "") {
        if (event.key !== "Tab") {
          event.preventDefault();
        }
        commit(draft);
      } else if (event.key !== "Enter" && event.key !== "Tab") {
        event.preventDefault();
      }
      return;
    }
    if (event.key === "Backspace" && draft === "" && tokens.length > 0) {
      event.preventDefault();
      onChange(tokens.slice(0, -1));
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData("text");
    if (!separators.test(pasted.trim())) {
      return;
    }
    event.preventDefault();
    commit(`${draft}${pasted}`);
  }

  return (
    <div
      data-invalid={invalid || undefined}
      data-disabled={disabled || undefined}
      className="flex max-h-44 min-h-8 w-full flex-wrap items-center gap-1 overflow-y-auto rounded-lg border border-input bg-card px-1.5 py-1 text-[13px] shadow-xs focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background data-disabled:opacity-50 data-invalid:border-danger"
    >
      {tokens.length > 0 ? (
        <ul aria-label={listLabel} className="contents">
          {tokens.map((token) => {
            const reason = invalidReason?.(token) ?? null;
            return (
              <li
                key={token}
                title={reason ?? undefined}
                className={cn(
                  "inline-flex h-[22px] max-w-full items-center gap-0.5 rounded-[6px] pr-0.5 pl-2 text-xs font-medium",
                  reason
                    ? "bg-danger-surface text-danger"
                    : "bg-border-subtle text-foreground",
                )}
              >
                <span className="truncate">{token}</span>
                {reason ? <span className="sr-only">{reason}</span> : null}
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={removeLabel(token)}
                  onClick={() => remove(token)}
                  className={cn(
                    "grid size-[18px] shrink-0 place-items-center rounded-[4px] opacity-70 hover:bg-accent hover:opacity-100",
                    focusRing,
                  )}
                >
                  <X aria-hidden className="size-3" strokeWidth={1.8} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode={inputMode}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        disabled={disabled}
        value={draft}
        placeholder={tokens.length === 0 ? placeholder : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(event) => {
          const { value } = event.target;
          if (separators.test(value)) {
            commit(value);
          } else {
            setDraft(value);
          }
        }}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onBlur={() => {
          if (draft.trim() !== "") {
            commit(draft);
          }
        }}
        className="h-[22px] min-w-32 flex-1 bg-transparent px-1 text-[13px] text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
      />
    </div>
  );
}
