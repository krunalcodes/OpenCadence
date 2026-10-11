"use client";

import { Button } from "@workspace/ui/components/button";
import { Kbd } from "@workspace/ui/components/kbd";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@workspace/ui/components/popover";
import { Keyboard } from "lucide-react";
import { secondaryButtonClass } from "@/components/product/styles";
import { copy } from "@/features/inbox/lib/copy";

const text = copy.shortcuts;

const rows: { keys: string[]; label: string }[] = [
  { keys: ["J"], label: text.next },
  { keys: ["K"], label: text.previous },
  { keys: ["↑", "↓"], label: text.arrows },
  { keys: ["E"], label: text.close },
  { keys: ["U"], label: text.unread },
  { keys: ["R"], label: text.reply },
  { keys: [text.sendKeys], label: text.send },
];

const keyClass =
  "h-[20px] min-w-[20px] rounded-[5px] border border-border bg-muted px-[5px] text-[11px] text-muted-foreground";

export function ShortcutsPopover() {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className={secondaryButtonClass}
          />
        }
      >
        <Keyboard aria-hidden strokeWidth={1.6} />
        {text.button}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-3 p-3.5 text-[13px]">
        <PopoverHeader>
          <PopoverTitle className="text-sm font-semibold tracking-[-0.005em]">
            {text.title}
          </PopoverTitle>
          <PopoverDescription className="text-xs">
            {text.note}
          </PopoverDescription>
        </PopoverHeader>
        <dl className="flex flex-col gap-2">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between gap-3"
            >
              <dt className="min-w-0 text-muted-foreground">{row.label}</dt>
              <dd className="flex shrink-0 items-center gap-1">
                {row.keys.map((key) => (
                  <Kbd key={key} className={keyClass}>
                    {key}
                  </Kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  );
}
