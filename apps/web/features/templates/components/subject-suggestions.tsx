"use client";

import { Button } from "@workspace/ui/components/button";
import { InputGroupButton } from "@workspace/ui/components/input-group";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@workspace/ui/components/popover";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { cn } from "@workspace/ui/lib/utils";
import { Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { focusRing } from "@/components/app-shell/page-header";
import { secondaryButtonClass } from "@/components/product/styles";
import { maxAiHtmlLength, type Suggestion } from "@/features/templates/lib/ai";
import { copy, describeAiError } from "@/features/templates/lib/copy";
import type { ExportedEmail } from "@/features/templates/lib/editor";
import { suggestSubjects } from "@/features/templates/queries/client";

const text = copy.ai.subjects;

const placeholders = ["one", "two", "three", "four"];

type State =
  | { status: "loading" }
  | { status: "ready"; suggestions: Suggestion[] }
  | { status: "failed"; message: string };

type SubjectSuggestionsProps = {
  current: string;
  exportEmail: () => Promise<ExportedEmail | null>;
  onPick: (suggestion: Suggestion) => void;
};

export function SubjectSuggestions({
  current,
  exportEmail,
  onPick,
}: SubjectSuggestionsProps) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ status: "loading" });
  const run = useRef(0);

  async function load() {
    run.current += 1;
    const id = run.current;
    setState({ status: "loading" });
    const email = await exportEmail();
    if (run.current !== id) {
      return;
    }
    if (!email) {
      setState({ status: "failed", message: copy.editor.exportFailed });
      return;
    }
    const result = await suggestSubjects({
      html: email.html.slice(0, maxAiHtmlLength),
      text: email.text.slice(0, maxAiHtmlLength),
      current: current.trim(),
      count: 5,
    });
    if (run.current !== id) {
      return;
    }
    setState(
      result.ok
        ? { status: "ready", suggestions: result.data }
        : { status: "failed", message: describeAiError(result.error) },
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          void load();
        } else {
          run.current += 1;
        }
      }}
    >
      <PopoverTrigger
        render={
          <InputGroupButton
            size="icon-xs"
            variant="ghost"
            aria-label={text.trigger}
            title={text.trigger}
          >
            <Sparkles aria-hidden strokeWidth={1.6} />
          </InputGroupButton>
        }
      />
      <PopoverContent align="end" className="w-[380px] gap-3 p-3.5 text-[13px]">
        <PopoverHeader>
          <PopoverTitle className="text-[13px] font-semibold">
            {text.title}
          </PopoverTitle>
          <PopoverDescription className="text-[12.5px] text-muted-foreground">
            {text.description}
          </PopoverDescription>
        </PopoverHeader>

        {state.status === "loading" ? (
          <div aria-busy="true" className="flex flex-col gap-1">
            <span className="sr-only">{text.loading}</span>
            {placeholders.map((item) => (
              <div key={item} className="flex flex-col gap-1.5 px-2 py-2">
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-3.5 w-3/5" />
              </div>
            ))}
          </div>
        ) : state.status === "failed" ? (
          <p role="alert" className="text-[13px] text-danger">
            {state.message}
          </p>
        ) : state.suggestions.length === 0 ? (
          <p className="text-muted-foreground">{text.empty}</p>
        ) : (
          <ul className="-mx-1 flex max-h-80 flex-col overflow-y-auto">
            {state.suggestions.map((suggestion) => (
              <li key={`${suggestion.subject}:${suggestion.previewText}`}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onPick(suggestion);
                  }}
                  className={cn(
                    "flex w-full flex-col gap-0.5 rounded-lg px-2 py-2 text-left hover:bg-muted",
                    focusRing,
                  )}
                >
                  <span className="font-medium text-foreground">
                    {suggestion.subject}
                  </span>
                  {suggestion.previewText ? (
                    <span className="text-[12.5px] text-muted-foreground">
                      {suggestion.previewText}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}

        {state.status === "loading" ? null : (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void load()}
              className={secondaryButtonClass}
            >
              {state.status === "ready" && state.suggestions.length > 0
                ? text.more
                : text.retry}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
