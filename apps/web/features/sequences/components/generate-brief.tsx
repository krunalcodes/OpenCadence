"use client";

import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group";
import { cn } from "@workspace/ui/lib/utils";
import type { FormEvent } from "react";
import type { Option } from "@/components/product/option";
import { OptionCombobox } from "@/components/product/option-combobox";
import {
  inputClass,
  segmentedGroupClass,
  segmentedItemClass,
} from "@/components/product/styles";
import {
  type Brief,
  customChoice,
  goalPresets,
  maxAudienceLength,
  maxGoalLength,
  maxPromptLength,
  maxToneLength,
  stepCounts,
  tonePresets,
} from "@/features/sequences/lib/ai";
import { copy } from "@/features/sequences/lib/copy";

const text = copy.ai.brief;

export const briefFormId = "sequence-ai-brief";

export const briefFieldIds = {
  prompt: "sequence-ai-prompt",
  goal: "sequence-ai-goal-custom",
  tone: "sequence-ai-tone-custom",
};

export type BriefErrors = { prompt?: string; goal?: string; tone?: string };

const goalOptions: Option[] = [
  ...goalPresets.map((goal) => ({ value: goal, label: text.goals[goal] })),
  { value: customChoice, label: text.goals.custom },
];

const toneOptions: Option[] = [
  ...tonePresets.map((tone) => ({ value: tone, label: text.tones[tone] })),
  { value: customChoice, label: text.tones.custom },
];

type GenerateBriefProps = {
  brief: Brief;
  errors: BriefErrors;
  onChange: (patch: Partial<Brief>) => void;
  onSubmit: () => void;
};

export function GenerateBrief({
  brief,
  errors,
  onChange,
  onSubmit,
}: GenerateBriefProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form
      id={briefFormId}
      noValidate
      onSubmit={handleSubmit}
      className="flex flex-col gap-5"
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={briefFieldIds.prompt} className="font-medium">
            {text.prompt}
          </label>
          <span className="text-[12px] text-ink-tertiary tabular-nums">
            {text.promptCounter(brief.prompt.length, maxPromptLength)}
          </span>
        </div>
        <Textarea
          id={briefFieldIds.prompt}
          rows={5}
          autoFocus
          maxLength={maxPromptLength}
          placeholder={text.promptPlaceholder}
          value={brief.prompt}
          onChange={(event) => onChange({ prompt: event.target.value })}
          aria-invalid={errors.prompt ? true : undefined}
          aria-describedby={
            errors.prompt ? "sequence-ai-prompt-error" : undefined
          }
          className={cn(inputClass, "min-h-[112px] md:text-[13px]")}
        />
        {errors.prompt ? (
          <p id="sequence-ai-prompt-error" className="text-[13px] text-danger">
            {errors.prompt}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="sequence-ai-audience" className="font-medium">
          {text.audience}
        </label>
        <Input
          id="sequence-ai-audience"
          type="text"
          autoComplete="off"
          maxLength={maxAudienceLength}
          placeholder={text.audiencePlaceholder}
          value={brief.audience}
          onChange={(event) => onChange({ audience: event.target.value })}
          aria-describedby="sequence-ai-audience-hint"
          className={cn(inputClass, "md:text-[13px]")}
        />
        <p
          id="sequence-ai-audience-hint"
          className="text-[12.5px] text-ink-tertiary"
        >
          {text.audienceHint}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="sequence-ai-goal" className="font-medium">
          {text.goal}
        </label>
        <OptionCombobox
          id="sequence-ai-goal"
          options={goalOptions}
          value={brief.goal}
          label={text.goal}
          placeholder={text.goalPlaceholder}
          empty={text.goalEmpty}
          clearable={false}
          onChange={(next) => {
            if (next) {
              onChange({ goal: next });
            }
          }}
          className="w-full"
        />
        {brief.goal === customChoice ? (
          <>
            <Input
              id={briefFieldIds.goal}
              type="text"
              autoComplete="off"
              maxLength={maxGoalLength}
              aria-label={text.customGoal}
              placeholder={text.customGoalPlaceholder}
              value={brief.customGoal}
              onChange={(event) => onChange({ customGoal: event.target.value })}
              aria-invalid={errors.goal ? true : undefined}
              aria-describedby={
                errors.goal ? "sequence-ai-goal-error" : undefined
              }
              className={cn(inputClass, "md:text-[13px]")}
            />
            {errors.goal ? (
              <p
                id="sequence-ai-goal-error"
                className="text-[13px] text-danger"
              >
                {errors.goal}
              </p>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="grid gap-x-4 gap-y-5 sm:grid-cols-[auto_minmax(0,1fr)]">
        <div className="flex flex-col gap-1.5">
          <div id="sequence-ai-steps-label" className="font-medium">
            {text.steps}
          </div>
          <ToggleGroup
            aria-labelledby="sequence-ai-steps-label"
            value={[String(brief.steps)]}
            onValueChange={(next) => {
              const picked = stepCounts.find(
                (count) => String(count) === next[0],
              );
              if (picked) {
                onChange({ steps: picked });
              }
            }}
            className={segmentedGroupClass}
          >
            {stepCounts.map((count) => (
              <ToggleGroupItem
                key={count}
                value={String(count)}
                aria-label={text.stepsOption(count)}
                className={cn(segmentedItemClass, "w-9 tabular-nums")}
              >
                {count}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="sequence-ai-tone" className="font-medium">
            {text.tone}
          </label>
          <OptionCombobox
            id="sequence-ai-tone"
            options={toneOptions}
            value={brief.tone}
            label={text.tone}
            placeholder={text.tonePlaceholder}
            empty={text.toneEmpty}
            clearable={false}
            onChange={(next) => {
              if (next) {
                onChange({ tone: next });
              }
            }}
            className="w-full"
          />
          {brief.tone === customChoice ? (
            <>
              <Input
                id={briefFieldIds.tone}
                type="text"
                autoComplete="off"
                maxLength={maxToneLength}
                aria-label={text.customTone}
                placeholder={text.customTonePlaceholder}
                value={brief.customTone}
                onChange={(event) =>
                  onChange({ customTone: event.target.value })
                }
                aria-invalid={errors.tone ? true : undefined}
                aria-describedby={
                  errors.tone ? "sequence-ai-tone-error" : undefined
                }
                className={cn(inputClass, "md:text-[13px]")}
              />
              {errors.tone ? (
                <p
                  id="sequence-ai-tone-error"
                  className="text-[13px] text-danger"
                >
                  {errors.tone}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </form>
  );
}
