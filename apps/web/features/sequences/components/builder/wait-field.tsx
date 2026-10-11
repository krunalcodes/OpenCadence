"use client";

import { Input } from "@workspace/ui/components/input";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group";
import { cn } from "@workspace/ui/lib/utils";
import { useState } from "react";
import {
  inputClass,
  segmentedGroupClass,
  segmentedItemClass,
} from "@/components/product/styles";
import { copy } from "@/features/sequences/lib/copy";
import {
  fromWait,
  maxDelayMinutes,
  minDelay,
  parseAmount,
  toWait,
  type WaitUnit,
  waitUnits,
} from "@/features/sequences/lib/steps";

const text = copy.builder.panel;

type Draft = {
  minutes: number;
  amount: string;
  unit: WaitUnit;
  error: string | null;
};

function draftOf(minutes: number): Draft {
  const wait = toWait(minutes);
  return {
    minutes,
    amount: String(wait.amount),
    unit: wait.unit,
    error: null,
  };
}

type WaitFieldProps = {
  id: string;
  minutes: number;
  index: number;
  autoFocus?: boolean;
  describedBy?: string;
  onChange: (minutes: number) => void;
};

export function WaitField({
  id,
  minutes,
  index,
  autoFocus,
  describedBy,
  onChange,
}: WaitFieldProps) {
  const [draft, setDraft] = useState(() => draftOf(minutes));

  if (draft.minutes !== minutes) {
    setDraft(draftOf(minutes));
  }

  function apply(amount: string, unit: WaitUnit) {
    const parsed = parseAmount(amount);
    if (parsed === null) {
      setDraft({ ...draft, amount, unit, error: text.waitInvalid });
      return;
    }
    const next = fromWait({ amount: parsed, unit });
    if (next < minDelay(index)) {
      setDraft({ ...draft, amount, unit, error: text.waitTooShort });
      return;
    }
    if (next > maxDelayMinutes) {
      setDraft({ ...draft, amount, unit, error: text.waitTooLong });
      return;
    }
    setDraft({ minutes: next, amount, unit, error: null });
    if (next !== minutes) {
      onChange(next);
    }
  }

  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          autoFocus={autoFocus}
          maxLength={6}
          aria-label={text.waitAmount}
          aria-invalid={draft.error ? true : undefined}
          aria-describedby={draft.error ? errorId : describedBy}
          value={draft.amount}
          onChange={(event) => apply(event.target.value, draft.unit)}
          onFocus={(event) => event.target.select()}
          className={cn(inputClass, "h-8 w-[72px] tabular-nums md:text-[13px]")}
        />
        <ToggleGroup
          aria-label={text.waitUnit}
          value={[draft.unit]}
          onValueChange={(next) => {
            const unit = waitUnits.find((item) => item === next[0]);
            if (unit) {
              apply(draft.amount, unit);
            }
          }}
          className={segmentedGroupClass}
        >
          {waitUnits.map((unit) => (
            <ToggleGroupItem
              key={unit}
              value={unit}
              className={segmentedItemClass}
            >
              {text.units[unit]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {draft.error ? (
        <p id={errorId} role="alert" className="text-[13px] text-danger">
          {draft.error}
        </p>
      ) : null}
    </div>
  );
}
