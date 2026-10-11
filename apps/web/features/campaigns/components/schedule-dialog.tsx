"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { Field, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { cn } from "@workspace/ui/lib/utils";
import { useState } from "react";
import {
  dialogActionsClass,
  dialogTitleClass,
  inputClass,
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
  fromLocalInputs,
  isSchedulable,
  localInputs,
  minimumLeadMinutes,
  presetDate,
  schedulePresets,
  zoneId,
  zoneName,
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
  const [initial] = useState(() =>
    localInputs(presetDate("tomorrow", new Date())),
  );
  const [today] = useState(() => localInputs(new Date()).date);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [problem, setProblem] = useState<string | null>(null);

  const chosen = fromLocalInputs(date, time);
  const moment = chosen ? exactMoment(chosen, "local") : null;
  const zone = zoneName(chosen ?? new Date(), "local");

  function pick(next: Date) {
    const values = localInputs(next);
    setDate(values.date);
    setTime(values.time);
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
        <div className="grid grid-cols-2 gap-3">
          <Field data-invalid={problem ? true : undefined}>
            <FieldLabel
              htmlFor="campaign-schedule-date"
              className="text-[13px]"
            >
              {text.date}
            </FieldLabel>
            <Input
              id="campaign-schedule-date"
              type="date"
              required
              min={today}
              disabled={pending}
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                setProblem(null);
              }}
              aria-invalid={problem ? true : undefined}
              aria-describedby="campaign-schedule-note"
              className={cn(inputClass, "tabular-nums md:text-[13px]")}
            />
          </Field>
          <Field data-invalid={problem ? true : undefined}>
            <FieldLabel
              htmlFor="campaign-schedule-time"
              className="text-[13px]"
            >
              {text.time}
            </FieldLabel>
            <Input
              id="campaign-schedule-time"
              type="time"
              required
              step={300}
              disabled={pending}
              value={time}
              onChange={(event) => {
                setTime(event.target.value);
                setProblem(null);
              }}
              aria-invalid={problem ? true : undefined}
              aria-describedby="campaign-schedule-note"
              className={cn(inputClass, "tabular-nums md:text-[13px]")}
            />
          </Field>
        </div>
        <p
          id="campaign-schedule-note"
          className={cn(
            "text-[12.5px]",
            problem ? "text-danger" : "text-ink-tertiary",
          )}
          role={problem ? "alert" : undefined}
        >
          {problem ?? text.zone(zone, zoneId())}
        </p>

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
