"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@workspace/ui/components/popover";
import { cn } from "@workspace/ui/lib/utils";
import { Check, CircleAlert, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { focusRing } from "@/components/app-shell/page-header";
import { secondaryButtonClass } from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import { copy, problemText } from "@/features/sequences/lib/copy";
import type {
  Problem,
  Check as SequenceCheck,
  Step,
} from "@/features/sequences/lib/sequences";
import { appHref } from "@/lib/navigation";

const text = copy.check;

const settingsFields = ["sources", "window"];

export type CheckState =
  | { state: "loading" }
  | { state: "failed" }
  | { state: "ready"; check: SequenceCheck };

type CheckPopoverProps = {
  check: CheckState;
  steps: Step[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRetry: () => void;
  onShowStep: (stepId: string) => void;
  onOpenSettings: () => void;
};

const actionClass = cn(
  "rounded-[4px] text-[12.5px] font-medium text-primary underline-offset-2 hover:underline",
  focusRing,
);

export function CheckPopover({
  check,
  steps,
  open,
  onOpenChange,
  onRetry,
  onShowStep,
  onOpenSettings,
}: CheckPopoverProps) {
  if (check.state === "loading") {
    return (
      <p
        aria-live="polite"
        className="flex h-8 items-center gap-1.5 px-1 text-[12.5px] text-ink-tertiary"
      >
        <Spinner className="size-3.5" />
        {text.checking}
      </p>
    );
  }

  if (check.state === "failed") {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={onRetry}
        title={text.failed}
        className={secondaryButtonClass}
      >
        <CircleAlert aria-hidden strokeWidth={1.6} className="text-danger" />
        {text.retry}
      </Button>
    );
  }

  const problems = check.check.problems;
  const errors = problems.filter((problem) => problem.severity === "error");
  const warnings = problems.filter((problem) => problem.severity === "warning");

  if (problems.length === 0) {
    return (
      <p className="flex h-8 items-center gap-1.5 px-1 text-[12.5px] text-ink-tertiary">
        <Check
          aria-hidden
          strokeWidth={1.8}
          className="size-3.5 text-success"
        />
        {text.ready}
      </p>
    );
  }

  const blocking = errors.length > 0;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className={cn(
              secondaryButtonClass,
              "tabular-nums",
              blocking ? "text-danger" : "text-warning",
            )}
          />
        }
      >
        {blocking ? (
          <CircleAlert aria-hidden strokeWidth={1.6} />
        ) : (
          <TriangleAlert aria-hidden strokeWidth={1.6} />
        )}
        {text.trigger(errors.length, warnings.length)}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[380px] max-w-[calc(100vw-32px)] gap-3.5 p-4 text-[13px]"
      >
        <PopoverHeader>
          <PopoverTitle className="text-sm font-semibold tracking-[-0.005em]">
            {blocking ? text.title : text.titleWarnings}
          </PopoverTitle>
          {blocking ? null : (
            <PopoverDescription className="text-[13px]">
              {text.warningsNote}
            </PopoverDescription>
          )}
        </PopoverHeader>
        <ProblemList
          label={text.errorsLabel}
          problems={errors}
          steps={steps}
          tone="error"
          onShowStep={onShowStep}
          onOpenSettings={onOpenSettings}
        />
        <ProblemList
          label={text.warningsLabel}
          problems={warnings}
          steps={steps}
          tone="warning"
          onShowStep={onShowStep}
          onOpenSettings={onOpenSettings}
        />
        {blocking && warnings.length > 0 ? (
          <p className="text-[12.5px] text-ink-tertiary">{text.warningsNote}</p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

type ProblemListProps = {
  label: string;
  problems: Problem[];
  steps: Step[];
  tone: "error" | "warning";
  onShowStep: (stepId: string) => void;
  onOpenSettings: () => void;
};

function ProblemList({
  label,
  problems,
  steps,
  tone,
  onShowStep,
  onOpenSettings,
}: ProblemListProps) {
  if (problems.length === 0) {
    return null;
  }
  const Icon = tone === "error" ? CircleAlert : TriangleAlert;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-medium text-ink-tertiary">{label}</h3>
      <ul className="flex flex-col gap-2.5">
        {problems.map((problem, index) => {
          const stepIndex = problem.stepId
            ? steps.findIndex((step) => step.id === problem.stepId)
            : -1;
          const stepId = stepIndex === -1 ? null : problem.stepId;
          return (
            <li
              key={`${problem.code}:${problem.stepId ?? ""}:${index}`}
              className="flex items-start gap-2"
            >
              <Icon
                aria-hidden
                strokeWidth={1.7}
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  tone === "error" ? "text-danger" : "text-warning",
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="text-foreground">
                  {stepId && problem.message === "" ? (
                    <span className="font-medium">
                      {text.stepLabel(stepIndex + 1)}:{" "}
                    </span>
                  ) : null}
                  {problemText(problem)}
                </p>
                {stepId ? (
                  <button
                    type="button"
                    onClick={() => onShowStep(stepId)}
                    className={actionClass}
                  >
                    {text.showStep}
                  </button>
                ) : settingsFields.includes(problem.field) ? (
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className={actionClass}
                  >
                    {text.openSettings}
                  </button>
                ) : problem.field === "brand" ? (
                  <Link
                    href={appHref("settings/brand")}
                    className={actionClass}
                  >
                    {text.openBrand}
                  </Link>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
