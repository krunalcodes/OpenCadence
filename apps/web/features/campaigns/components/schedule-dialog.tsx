"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { cn } from "@workspace/ui/lib/utils";
import { useState } from "react";
import { DateTimePicker } from "@/components/pickers/date-time-picker";
import {
  dialogActionsClass,
  dialogTitleClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import {
  type SendSummary,
  SummaryList,
  WarningList,
} from "@/features/campaigns/components/send-dialog";
import { copy } from "@/features/campaigns/lib/copy";
import {
  exactMoment,
  isSchedulable,
  minimumLeadMinutes,
  presetDate,
  schedulePresets,
} from "@/features/campaigns/lib/schedule";

const text = copy.scheduleDialog;

type ScheduleDialogProps = {
  open: boolean;
  formKey: number;
  summary: SendSummary | null;
  pending: boolean;
  error: string | null;
  onConfirm: (date: Date) => void;
  onOpenChange: (open: boolean) => void;
};

export function ScheduleDialog({
  open,
  formKey,
  summary,
  pending,
  error,
  onConfirm,
  onOpenChange,
}: ScheduleDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next || !pending) {
          onOpenChange(next);
        }
      }}
    >
      <DialogContent className="gap-5 p-5 text-[13px] sm:max-w-[480px]">
        {summary ? (
          <ScheduleForm
            key={formKey}
            summary={summary}
            pending={pending}
            error={error}
            onConfirm={onConfirm}
            onCancel={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

type ScheduleFormProps = {
  summary: SendSummary;
  pending: boolean;
  error: string | null;
  onConfirm: (date: Date) => void;
  onCancel: () => void;
};

function ScheduleForm({
  summary,
  pending,
  error,
  onConfirm,
  onCancel,
}: ScheduleFormProps) {
  const [floor] = useState(() => new Date().toISOString());
  const [value, setValue] = useState<string | null>(() =>
    presetDate("tomorrow", new Date()).toISOString(),
  );
  const [problem, setProblem] = useState<string | null>(null);

  const chosen = value ? new Date(value) : null;
  const moment = chosen ? exactMoment(chosen, "local") : null;

  function pick(next: Date) {
    setValue(next.toISOString());
    setProblem(null);
  }

  function confirm() {
    if (pending) {
      return;
    }
    if (!chosen) {
      setProblem(text.missing);
      return;
    }
    if (!isSchedulable(chosen, new Date())) {
      setProblem(text.past(minimumLeadMinutes));
      return;
    }
    setProblem(null);
    onConfirm(chosen);
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        confirm();
      }}
      className="flex flex-col gap-5"
    >
      <DialogHeader>
        <DialogTitle className={dialogTitleClass}>{text.title}</DialogTitle>
        <DialogDescription className="text-[13px]">
          {text.description}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-3">
        <fieldset className="flex flex-wrap gap-1.5">
          <legend className="sr-only">{text.presetsLabel}</legend>
          {schedulePresets.map((preset) => (
            <Button
              key={preset}
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => pick(presetDate(preset, new Date()))}
              className={cn(secondaryButtonClass, "h-7 px-2.5 text-[12.5px]")}
            >
              {text.presets[preset]}
            </Button>
          ))}
        </fieldset>
        <DateTimePicker
          id="campaign-schedule"
          value={value}
          min={floor}
          disabled={pending}
          error={problem}
          dateLabel={text.date}
          timeLabel={text.time}
          onChange={(next) => {
            setValue(next);
            setProblem(null);
          }}
        />

        {moment ? (
          <p
            aria-live="polite"
            className="rounded-lg border border-border bg-card px-3 py-2.5 text-[13px] font-medium text-foreground tabular-nums shadow-xs"
          >
            {text.summary(summary.count, moment.day, moment.time, moment.zone)}{" "}
            <span className="font-normal text-muted-foreground">
              {text.from(summary.from)}
            </span>
          </p>
        ) : null}
        <SummaryList summary={summary} />
        <WarningList warnings={summary.warnings} />
        {error ? (
          <p role="alert" className="text-[13px] text-danger">
            <span className="font-medium">{text.failed}.</span> {error}
          </p>
        ) : null}
      </div>

      <div className={dialogActionsClass}>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onCancel}
          className={secondaryButtonClass}
        >
          {text.cancel}
        </Button>
        <Button
          type="submit"
          disabled={pending}
          aria-busy={pending || undefined}
          className={primaryButtonClass}
        >
          {pending ? <Spinner /> : null}
          {text.confirm}
        </Button>
      </div>
    </form>
  );
}
