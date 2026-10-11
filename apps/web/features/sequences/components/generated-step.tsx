"use client";

import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import { cn } from "@workspace/ui/lib/utils";
import { Pencil, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { buttonFocusRing } from "@/components/app-shell/page-header";
import { inputClass, secondaryButtonClass } from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import { WaitField } from "@/features/sequences/components/builder/wait-field";
import { EmailBody } from "@/features/sequences/components/email-body";
import {
  type DraftStep,
  stepNodes,
  stepPlainText,
} from "@/features/sequences/lib/ai";
import { copy } from "@/features/sequences/lib/copy";
import { maxSubjectLength } from "@/features/sequences/lib/sequences";

const text = copy.ai.result;

const iconButtonClass = cn(
  "text-muted-foreground hover:bg-accent hover:text-foreground",
  buttonFocusRing,
);

export type StepPatch = Partial<
  Pick<DraftStep, "waitMinutes" | "subject" | "text">
>;

type GeneratedStepProps = {
  step: DraftStep;
  index: number;
  writing: boolean;
  locked: boolean;
  editing: boolean;
  error: string | null;
  onEdit: () => void;
  onDone: () => void;
  onChange: (patch: StepPatch) => void;
  onRemove: () => void;
};

export function GeneratedStep({
  step,
  index,
  writing,
  locked,
  editing,
  error,
  onEdit,
  onDone,
  onChange,
  onRemove,
}: GeneratedStepProps) {
  const position = index + 1;
  const first = index === 0;
  const nodes = useMemo(() => stepNodes(step), [step]);
  const id = `generated-${step.key}`;
  const errorId = `${id}-error`;
  const subject = step.subject.trim();

  return (
    <li
      aria-busy={writing || undefined}
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-xl border bg-card px-4 py-3.5 shadow-xs",
        error ? "border-danger/50" : "border-border",
      )}
    >
      <div className="flex min-h-7 flex-wrap items-center gap-x-2.5 gap-y-1">
        <h3 className="text-[13px] font-semibold text-foreground">
          {text.emailNumber(position)}
        </h3>
        <span className="text-[12.5px] text-ink-tertiary tabular-nums">
          {copy.builder.wait(step.waitMinutes, first)}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {writing ? (
            <span className="flex items-center gap-1.5 text-[12.5px] text-ink-tertiary">
              <Spinner className="size-3.5" />
              {text.writing}
            </span>
          ) : locked ? null : editing ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onDone}
              className={cn(secondaryButtonClass, "h-7 px-2.5 text-[12.5px]")}
            >
              {text.doneEditing}
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={text.editLabel(position)}
                title={text.edit}
                onClick={onEdit}
                className={iconButtonClass}
              >
                <Pencil aria-hidden strokeWidth={1.6} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={text.removeLabel(position)}
                title={text.remove}
                onClick={onRemove}
                className={iconButtonClass}
              >
                <Trash2 aria-hidden strokeWidth={1.6} />
              </Button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <div className="flex flex-col gap-3.5">
          {first ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-subject`} className="font-medium">
                {text.subject}
              </label>
              <Input
                id={`${id}-subject`}
                type="text"
                autoComplete="off"
                maxLength={maxSubjectLength}
                placeholder={text.subjectPlaceholder}
                value={step.subject}
                onChange={(event) => onChange({ subject: event.target.value })}
                aria-invalid={error && subject === "" ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                className={cn(inputClass, "md:text-[13px]")}
              />
            </div>
          ) : (
            <p className="text-[12.5px] text-ink-tertiary">{text.replyNote}</p>
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-wait`} className="font-medium">
              {text.wait}
            </label>
            <WaitField
              id={`${id}-wait`}
              minutes={step.waitMinutes}
              index={index}
              onChange={(waitMinutes) => onChange({ waitMinutes })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-body`} className="font-medium">
              {text.body}
            </label>
            <Textarea
              id={`${id}-body`}
              rows={8}
              value={stepPlainText(step)}
              onChange={(event) => onChange({ text: event.target.value })}
              aria-describedby={error ? errorId : `${id}-body-hint`}
              className={cn(
                inputClass,
                "min-h-[168px] leading-relaxed md:text-[13px]",
              )}
            />
            <p
              id={`${id}-body-hint`}
              className="text-[12.5px] text-ink-tertiary"
            >
              {text.bodyHint}
            </p>
          </div>
        </div>
      ) : (
        <>
          {first ? (
            <p className="min-w-0">
              <span className="text-[12.5px] text-ink-tertiary">
                {text.subject}:{" "}
              </span>
              <span
                className={cn(
                  "font-medium break-words",
                  subject === "" && "font-normal text-ink-tertiary",
                )}
              >
                {subject === "" ? text.noSubject : subject}
              </span>
            </p>
          ) : (
            <p className="text-[12.5px] text-ink-tertiary">{text.replyNote}</p>
          )}
          {nodes.length > 0 ? (
            <EmailBody
              nodes={nodes}
              className="border-t border-border-subtle pt-3"
            />
          ) : null}
        </>
      )}

      {error ? (
        <p id={errorId} role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : null}
    </li>
  );
}
