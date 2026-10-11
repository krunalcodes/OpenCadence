"use client";

import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@workspace/ui/components/popover";
import { cn } from "@workspace/ui/lib/utils";
import {
  type FormEvent,
  type ReactElement,
  type Ref,
  useId,
  useState,
} from "react";
import type { Option } from "@/components/product/option";
import { OptionCombobox } from "@/components/product/option-combobox";
import { inputClass, primaryButtonClass } from "@/components/product/styles";
import { copy } from "@/features/templates/lib/copy";
import {
  formatMergeTag,
  maxFallbackLength,
} from "@/features/templates/lib/merge-tags";

const text = copy.mergeTags;

type MergeTagPickerProps = {
  options: Option[];
  trigger: ReactElement;
  align?: "start" | "end";
  contentRef?: Ref<HTMLDivElement>;
  onOpen?: () => void;
  onInsert: (tag: string) => void;
};

export function MergeTagPicker({
  options,
  trigger,
  align = "start",
  contentRef,
  onOpen,
  onInsert,
}: MergeTagPickerProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const [fallback, setFallback] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!key) {
      return;
    }
    setOpen(false);
    onInsert(formatMergeTag(key, fallback));
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setKey(null);
          setFallback("");
          onOpen?.();
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger render={trigger} />
      <PopoverContent
        ref={contentRef}
        align={align}
        className="w-80 gap-3 p-3.5 text-[13px]"
      >
        <PopoverHeader>
          <PopoverTitle className="text-[13px] font-semibold">
            {text.title}
          </PopoverTitle>
          <PopoverDescription className="text-[12.5px] text-muted-foreground">
            {text.description}
          </PopoverDescription>
        </PopoverHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <OptionCombobox
            id={`${id}-tag`}
            options={options}
            value={key}
            label={text.tag}
            placeholder={text.tagPlaceholder}
            empty={text.tagEmpty}
            onChange={setKey}
            className="w-full"
          />
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${id}-fallback`}
              className="flex items-center gap-1.5 text-[12.5px] font-medium"
            >
              {text.fallback}
              <span className="font-normal text-ink-tertiary">
                {text.optional}
              </span>
            </label>
            <Input
              id={`${id}-fallback`}
              type="text"
              autoComplete="off"
              maxLength={maxFallbackLength}
              placeholder={text.fallbackPlaceholder}
              value={fallback}
              onChange={(event) => setFallback(event.target.value)}
              className={cn(inputClass, "h-8 md:text-[13px]")}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <code className="min-w-0 truncate font-mono text-[12px] text-ink-tertiary">
              {key ? formatMergeTag(key, fallback) : ""}
            </code>
            <Button
              type="submit"
              size="sm"
              disabled={!key}
              className={cn(primaryButtonClass, "shrink-0")}
            >
              {text.insert}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
