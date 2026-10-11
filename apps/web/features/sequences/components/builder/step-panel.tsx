"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group";
import { cn } from "@workspace/ui/lib/utils";
import { ArrowDown, ArrowUp, Trash2, X } from "lucide-react";
import type { Ref } from "react";
import { buttonFocusRing } from "@/components/app-shell/page-header";
import { TemplateCombobox } from "@/components/pickers/template-combobox";
import {
  inputClass,
  secondaryButtonClass,
  segmentedGroupClass,
  segmentedItemClass,
} from "@/components/product/styles";
import { TemplatePreview } from "@/features/sequences/components/builder/template-preview";
import { WaitField } from "@/features/sequences/components/builder/wait-field";
import { copy } from "@/features/sequences/lib/copy";
import {
  maxSubjectLength,
  type ThreadMode,
} from "@/features/sequences/lib/sequences";
import type { DraftStep, StepPatch } from "@/features/sequences/lib/steps";

const text = copy.builder.panel;
const threadModes: ThreadMode[] = ["reply", "new"];

type StepPanelProps = {
  step: DraftStep;
  index: number;
  count: number;
  panelRef: Ref<HTMLElement>;
  onChange: (patch: StepPatch) => void;
  onMove: (by: -1 | 1) => void;
  onDelete: () => void;
  onClose: () => void;
};

export function StepPanel({
  step,
  index,
  count,
  panelRef,
  onChange,
  onMove,
  onDelete,
  onClose,
}: StepPanelProps) {
  const first = index === 0;
  const reply = !first && step.threadMode === "reply";

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      aria-label={text.label}
      className="flex min-h-0 flex-col border-t border-border-subtle bg-card outline-hidden lg:border-t-0 lg:border-l"
    >
      <div className="flex items-center gap-2 border-b border-border-subtle py-2.5 pr-2.5 pl-4">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-[-0.005em]">
          {text.title(index + 1)}
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={first}
          aria-label={text.moveUp}
          title={text.moveUp}
          onClick={() => onMove(-1)}
          className={cn(
            "text-muted-foreground hover:bg-accent",
            buttonFocusRing,
          )}
        >
          <ArrowUp aria-hidden strokeWidth={1.6} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={index >= count - 1}
          aria-label={text.moveDown}
          title={text.moveDown}
          onClick={() => onMove(1)}
          className={cn(
            "text-muted-foreground hover:bg-accent",
            buttonFocusRing,
          )}
        >
          <ArrowDown aria-hidden strokeWidth={1.6} />
        </Button>
        <span aria-hidden className="h-4 w-px bg-border" />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={text.close}
          title={text.close}
          onClick={onClose}
          className={cn(
            "text-muted-foreground hover:bg-accent",
            buttonFocusRing,
          )}
        >
          <X aria-hidden strokeWidth={1.6} />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-4">
        <Field>
          <FieldLabel htmlFor="step-template" className="text-[13px]">
            {text.template}
          </FieldLabel>
          <TemplateCombobox
            id="step-template"
            label={text.template}
            value={
              step.template
                ? {
                    id: step.template.id,
                    name: step.template.name,
                    subject: "",
                  }
                : null
            }
            describedBy="step-template-hint"
            onChange={(choice) =>
              onChange({
                template: choice ? { id: choice.id, name: choice.name } : null,
                ...(choice && !reply && step.subject.trim() === ""
                  ? { subject: choice.subject.slice(0, maxSubjectLength) }
                  : {}),
              })
            }
          />
          <FieldDescription id="step-template-hint" className="text-[13px]">
            {text.templateHint}
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="step-subject" className="text-[13px]">
            {text.subject}
          </FieldLabel>
          <Input
            id="step-subject"
            type="text"
            autoComplete="off"
            disabled={reply}
            maxLength={maxSubjectLength}
            placeholder={reply ? undefined : text.subjectPlaceholder}
            value={reply ? "" : step.subject}
            onChange={(event) => onChange({ subject: event.target.value })}
            aria-describedby="step-subject-hint"
            className={cn(inputClass, "md:text-[13px]")}
          />
          <FieldDescription id="step-subject-hint" className="text-[13px]">
            {reply ? text.subjectReply : text.subjectHint}
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="step-wait" className="text-[13px]">
            {text.wait}
          </FieldLabel>
          <WaitField
            id="step-wait"
            minutes={step.delayMinutes}
            index={index}
            describedBy="step-wait-hint"
            onChange={(delayMinutes) => onChange({ delayMinutes })}
          />
          <FieldDescription id="step-wait-hint" className="text-[13px]">
            {first ? text.waitFirstHint : text.waitHint}
          </FieldDescription>
        </Field>

        <Field>
          <div id="step-thread-label" className="text-[13px] font-medium">
            {text.thread}
          </div>
          <ToggleGroup
            aria-labelledby="step-thread-label"
            aria-describedby="step-thread-hint"
            disabled={first}
            value={[first ? "new" : step.threadMode]}
            onValueChange={(next) => {
              const mode = threadModes.find((item) => item === next[0]);
              if (mode) {
                onChange({ threadMode: mode });
              }
            }}
            className={segmentedGroupClass}
          >
            {threadModes.map((mode) => (
              <ToggleGroupItem
                key={mode}
                value={mode}
                className={segmentedItemClass}
              >
                {copy.builder.thread[mode]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <FieldDescription id="step-thread-hint" className="text-[13px]">
            {first ? text.threadFirst : text.threadHint}
          </FieldDescription>
        </Field>

        <div className="flex flex-col gap-2">
          <div className="text-[13px] font-medium">{text.preview}</div>
          <TemplatePreview templateId={step.template?.id ?? null} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
          <p className="min-w-0 text-[12.5px] text-ink-tertiary tabular-nums">
            {step.stats.sent > 0 ? text.sentBefore(step.stats.sent) : null}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={onDelete}
            className={cn(
              secondaryButtonClass,
              "text-danger hover:bg-danger-surface hover:text-danger",
            )}
          >
            <Trash2 aria-hidden strokeWidth={1.6} />
            {text.remove}
          </Button>
        </div>
      </div>
    </aside>
  );
}
