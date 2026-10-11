"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { Switch } from "@workspace/ui/components/switch";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group";
import { cn } from "@workspace/ui/lib/utils";
import { Info, TriangleAlert } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";
import { focusRing } from "@/components/app-shell/page-header";
import { SourceMultiSelect } from "@/components/pickers/source-combobox";
import { OptionCombobox } from "@/components/product/option-combobox";
import { SectionCard } from "@/components/product/section-card";
import { inputClass, primaryButtonClass } from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import { copy, describeError } from "@/features/sequences/lib/copy";
import {
  browserTimezone,
  minutesToTime,
  parseDailyLimit,
  timeToMinutes,
  timezoneLabel,
  timezoneOptions,
  weekdays,
} from "@/features/sequences/lib/schedule";
import {
  maxDailyLimit,
  maxFromNameLength,
  type Sequence,
  type SequenceSettings,
} from "@/features/sequences/lib/sequences";
import { updateSequence } from "@/features/sequences/queries/client";
import type { SourceChoice } from "@/lib/sources";

const text = copy.settings;

type SettingsTabProps = {
  sequence: Sequence;
  sources: SourceChoice[];
  onSaved: (sequence: Sequence) => void;
};

export function SettingsTab({ sequence, sources, onSaved }: SettingsTabProps) {
  const locked = sequence.status === "archived";

  return (
    <div className="grid min-w-0 gap-[18px] xl:grid-cols-2 xl:items-start">
      <SendingForm
        sequence={sequence}
        sources={sources}
        locked={locked}
        onSaved={onSaved}
      />
      <div className="flex min-w-0 flex-col gap-[18px]">
        <WindowForm sequence={sequence} locked={locked} onSaved={onSaved} />
        <BehaviorCard sequence={sequence} locked={locked} onSaved={onSaved} />
      </div>
    </div>
  );
}

type FormProps = {
  sequence: Sequence;
  locked: boolean;
  onSaved: (sequence: Sequence) => void;
};

function useSave(sequence: Sequence, onSaved: (sequence: Sequence) => void) {
  const [pending, setPending] = useState(false);

  async function save(patch: Partial<SequenceSettings>) {
    setPending(true);
    const result = await updateSequence(sequence.id, patch);
    setPending(false);
    if (!result.ok) {
      return result.error;
    }
    onSaved(result.data);
    toast.success(text.saved);
    return null;
  }

  return { pending, save };
}

function sameIds(a: string[], b: string[]) {
  return a.length === b.length && a.every((id) => b.includes(id));
}

function FormFooter({
  pending,
  disabled,
}: {
  pending: boolean;
  disabled: boolean;
}) {
  return (
    <div className="flex justify-end border-t border-border-subtle px-4 py-3">
      <Button
        type="submit"
        disabled={pending || disabled}
        aria-busy={pending || undefined}
        className={primaryButtonClass}
      >
        {pending ? <Spinner /> : null}
        {text.save}
      </Button>
    </div>
  );
}

function SendingForm({
  sequence,
  sources,
  locked,
  onSaved,
}: FormProps & { sources: SourceChoice[] }) {
  const labels = text.sending;
  const savedIds = useMemo(
    () => sequence.sources.map((source) => source.id),
    [sequence.sources],
  );
  const [sourceIds, setSourceIds] = useState(savedIds);
  const [fromName, setFromName] = useState(sequence.fromName ?? "");
  const [limit, setLimit] = useState(
    sequence.dailyLimitPerSource === null
      ? ""
      : String(sequence.dailyLimitPerSource),
  );
  const [errors, setErrors] = useState<{
    sources?: string;
    fromName?: string;
    limit?: string;
  }>({});
  const { pending, save } = useSave(sequence, onSaved);

  const choices = useMemo(() => {
    const known = new Set(sources.map((source) => source.id));
    const missing = sequence.sources
      .filter((source) => !known.has(source.id))
      .map(
        (source): SourceChoice => ({
          id: source.id,
          name: source.name,
          email: source.email,
          integrationType: source.integrationType,
          status:
            source.status === "paused" || source.status === "needs_attention"
              ? source.status
              : "active",
          isDefault: false,
        }),
      );
    return [...sources, ...missing];
  }, [sources, sequence.sources]);

  const deaf = sequence.stopOnReply
    ? sequence.sources.filter(
        (source) => !source.hasInbox && sourceIds.includes(source.id),
      )
    : [];
  const cleanFromName = fromName.trim();
  const changed =
    !sameIds(sourceIds, savedIds) ||
    cleanFromName !== (sequence.fromName ?? "") ||
    limit.trim() !==
      (sequence.dailyLimitPerSource === null
        ? ""
        : String(sequence.dailyLimitPerSource));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || locked) {
      return;
    }
    const parsed = parseDailyLimit(limit, maxDailyLimit);
    const next: typeof errors = {};
    if (cleanFromName.length > maxFromNameLength) {
      next.fromName = labels.fromNameTooLong(maxFromNameLength);
    }
    if (!parsed.ok) {
      next.limit = labels.dailyLimitInvalid(maxDailyLimit);
    }
    setErrors(next);
    if (!parsed.ok || next.fromName) {
      return;
    }
    const error = await save({
      sourceIds,
      fromName: cleanFromName === "" ? null : cleanFromName,
      dailyLimitPerSource: parsed.value,
    });
    if (!error) {
      return;
    }
    const message = describeError(error);
    if (error.field === "sourceIds") {
      setErrors({ sources: message });
    } else if (error.field === "fromName") {
      setErrors({ fromName: message });
    } else if (error.field === "dailyLimitPerSource") {
      setErrors({ limit: message });
    } else {
      toast.error(text.saveFailed, { description: message });
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="min-w-0">
      <SectionCard
        id="sequence-sending"
        title={labels.title}
        description={labels.description}
      >
        <div className="flex flex-col gap-5 px-4 py-4">
          <Field data-invalid={errors.sources ? true : undefined}>
            <FieldLabel htmlFor="sequence-sources" className="text-[13px]">
              {labels.sources}
            </FieldLabel>
            <SourceMultiSelect
              id="sequence-sources"
              sources={choices}
              value={sourceIds}
              disabled={pending || locked}
              error={errors.sources ?? null}
              label={labels.sources}
              placeholder={labels.sourcesPlaceholder}
              onChange={(value) => {
                setSourceIds(value);
                setErrors((current) => ({ ...current, sources: undefined }));
              }}
            />
            {sourceIds.length === 0 && !errors.sources ? (
              <p className="flex items-start gap-1.5 text-[13px] text-warning">
                <TriangleAlert
                  aria-hidden
                  strokeWidth={1.7}
                  className="mt-0.5 size-3.5 shrink-0"
                />
                {labels.sourcesMissing}
              </p>
            ) : null}
            {deaf.length > 0 ? (
              <p className="flex items-start gap-1.5 text-[13px] text-warning">
                <TriangleAlert
                  aria-hidden
                  strokeWidth={1.7}
                  className="mt-0.5 size-3.5 shrink-0"
                />
                {labels.noInbox(deaf.map((source) => source.name).join(", "))}
              </p>
            ) : null}
          </Field>

          <Field data-invalid={errors.fromName ? true : undefined}>
            <FieldLabel htmlFor="sequence-from-name" className="text-[13px]">
              {labels.fromName}
            </FieldLabel>
            <Input
              id="sequence-from-name"
              type="text"
              autoComplete="off"
              disabled={pending || locked}
              maxLength={maxFromNameLength}
              placeholder={labels.fromNamePlaceholder}
              value={fromName}
              onChange={(event) => {
                setFromName(event.target.value);
                setErrors((current) => ({ ...current, fromName: undefined }));
              }}
              aria-invalid={errors.fromName ? true : undefined}
              aria-describedby={
                errors.fromName
                  ? "sequence-from-name-error"
                  : "sequence-from-name-hint"
              }
              className={cn(inputClass, "max-w-[420px] md:text-[13px]")}
            />
            {errors.fromName ? (
              <FieldError
                id="sequence-from-name-error"
                className="text-[13px] text-danger"
              >
                {errors.fromName}
              </FieldError>
            ) : (
              <FieldDescription
                id="sequence-from-name-hint"
                className="text-[13px]"
              >
                {labels.fromNameHint}
              </FieldDescription>
            )}
          </Field>

          <Field data-invalid={errors.limit ? true : undefined}>
            <FieldLabel htmlFor="sequence-daily-limit" className="text-[13px]">
              {labels.dailyLimit}
            </FieldLabel>
            <div className="flex items-center gap-2">
              <Input
                id="sequence-daily-limit"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                disabled={pending || locked}
                maxLength={6}
                placeholder={labels.dailyLimitPlaceholder}
                value={limit}
                onChange={(event) => {
                  setLimit(event.target.value);
                  setErrors((current) => ({ ...current, limit: undefined }));
                }}
                aria-invalid={errors.limit ? true : undefined}
                aria-describedby={
                  errors.limit
                    ? "sequence-daily-limit-error"
                    : "sequence-daily-limit-hint"
                }
                className={cn(inputClass, "w-28 tabular-nums md:text-[13px]")}
              />
              <span className="text-muted-foreground">
                {labels.dailyLimitSuffix}
              </span>
            </div>
            {errors.limit ? (
              <FieldError
                id="sequence-daily-limit-error"
                className="text-[13px] text-danger"
              >
                {errors.limit}
              </FieldError>
            ) : (
              <FieldDescription
                id="sequence-daily-limit-hint"
                className="text-[13px]"
              >
                {labels.dailyLimitHint}
              </FieldDescription>
            )}
          </Field>
        </div>
        <FormFooter pending={pending} disabled={locked || !changed} />
      </SectionCard>
    </form>
  );
}

const dayItemClass =
  "h-8 w-11 rounded-lg border border-border bg-card px-0 text-[12.5px] font-medium text-muted-foreground shadow-xs hover:bg-muted hover:text-foreground focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary focus-visible:outline-solid aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-brand-hover";

function WindowForm({ sequence, locked, onSaved }: FormProps) {
  const labels = text.window;
  const savedStart = minutesToTime(sequence.windowStartMinute);
  const savedEnd = minutesToTime(sequence.windowEndMinute);
  const [days, setDays] = useState(sequence.sendDays);
  const [start, setStart] = useState(savedStart);
  const [end, setEnd] = useState(savedEnd);
  const [timezone, setTimezone] = useState<string | null>(sequence.timezone);
  const [errors, setErrors] = useState<{
    days?: string;
    start?: string;
    end?: string;
    timezone?: string;
  }>({});
  const { pending, save } = useSave(sequence, onSaved);
  const zones = useMemo(
    () => timezoneOptions(sequence.timezone),
    [sequence.timezone],
  );
  const local = useMemo(() => browserTimezone(), []);

  const changed =
    !sameDays(days, sequence.sendDays) ||
    start !== savedStart ||
    end !== savedEnd ||
    timezone !== sequence.timezone;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || locked) {
      return;
    }
    const startMinute =
      start === savedStart ? sequence.windowStartMinute : timeToMinutes(start);
    const endMinute =
      end === savedEnd ? sequence.windowEndMinute : timeToMinutes(end);
    const next: typeof errors = {};
    if (days.length === 0) {
      next.days = labels.daysMissing;
    }
    if (startMinute === null) {
      next.start = labels.timeInvalid;
    }
    if (endMinute === null) {
      next.end = labels.timeInvalid;
    } else if (startMinute !== null && endMinute <= startMinute) {
      next.end = labels.endBeforeStart;
    }
    if (!timezone) {
      next.timezone = labels.timezoneMissing;
    }
    setErrors(next);
    if (
      Object.keys(next).length > 0 ||
      startMinute === null ||
      endMinute === null ||
      !timezone
    ) {
      return;
    }
    const error = await save({
      sendDays: [...days].sort((a, b) => a - b),
      windowStartMinute: startMinute,
      windowEndMinute: endMinute,
      timezone,
    });
    if (!error) {
      return;
    }
    const message = describeError(error);
    if (error.field === "sendDays") {
      setErrors({ days: message });
    } else if (error.field === "windowStartMinute") {
      setErrors({ start: message });
    } else if (error.field === "windowEndMinute") {
      setErrors({ end: message });
    } else if (error.field === "timezone") {
      setErrors({ timezone: message });
    } else {
      toast.error(text.saveFailed, { description: message });
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="min-w-0">
      <SectionCard
        id="sequence-window"
        title={labels.title}
        description={labels.description}
      >
        <div className="flex flex-col gap-5 px-4 py-4">
          <Field data-invalid={errors.days ? true : undefined}>
            <div id="sequence-days-label" className="text-[13px] font-medium">
              {labels.days}
            </div>
            <ToggleGroup
              multiple
              aria-labelledby="sequence-days-label"
              aria-describedby={errors.days ? "sequence-days-error" : undefined}
              disabled={pending || locked}
              value={days.map(String)}
              onValueChange={(next) => {
                setDays(weekdays.filter((day) => next.includes(String(day))));
                setErrors((current) => ({ ...current, days: undefined }));
              }}
              className="flex-wrap gap-1.5"
            >
              {weekdays.map((day) => (
                <ToggleGroupItem
                  key={day}
                  value={String(day)}
                  aria-label={labels.dayLong[day]}
                  className={dayItemClass}
                >
                  {labels.dayShort[day]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {errors.days ? (
              <FieldError
                id="sequence-days-error"
                className="text-[13px] text-danger"
              >
                {errors.days}
              </FieldError>
            ) : null}
          </Field>

          <div className="flex flex-wrap items-start gap-x-3 gap-y-4">
            <Field
              data-invalid={errors.start ? true : undefined}
              className="w-32"
            >
              <FieldLabel htmlFor="sequence-start" className="text-[13px]">
                {labels.start}
              </FieldLabel>
              <Input
                id="sequence-start"
                type="time"
                step={300}
                required
                disabled={pending || locked}
                value={start}
                onChange={(event) => {
                  setStart(event.target.value);
                  setErrors((current) => ({ ...current, start: undefined }));
                }}
                aria-invalid={errors.start ? true : undefined}
                aria-describedby={
                  errors.start ? "sequence-start-error" : undefined
                }
                className={cn(inputClass, "tabular-nums md:text-[13px]")}
              />
              {errors.start ? (
                <FieldError
                  id="sequence-start-error"
                  className="text-[13px] text-danger"
                >
                  {errors.start}
                </FieldError>
              ) : null}
            </Field>
            <Field
              data-invalid={errors.end ? true : undefined}
              className="w-32"
            >
              <FieldLabel htmlFor="sequence-end" className="text-[13px]">
                {labels.end}
              </FieldLabel>
              <Input
                id="sequence-end"
                type="time"
                step={300}
                required
                disabled={pending || locked}
                value={end}
                onChange={(event) => {
                  setEnd(event.target.value);
                  setErrors((current) => ({ ...current, end: undefined }));
                }}
                aria-invalid={errors.end ? true : undefined}
                aria-describedby={errors.end ? "sequence-end-error" : undefined}
                className={cn(inputClass, "tabular-nums md:text-[13px]")}
              />
            </Field>
            <Field
              data-invalid={errors.timezone ? true : undefined}
              className="min-w-[240px] flex-1"
            >
              <FieldLabel htmlFor="sequence-timezone" className="text-[13px]">
                {labels.timezone}
              </FieldLabel>
              <OptionCombobox
                id="sequence-timezone"
                options={zones}
                value={timezone}
                label={labels.timezone}
                placeholder={labels.timezonePlaceholder}
                empty={labels.timezoneEmpty}
                disabled={pending || locked}
                clearable={false}
                invalid={Boolean(errors.timezone)}
                describedBy={
                  errors.timezone
                    ? "sequence-timezone-error"
                    : "sequence-timezone-hint"
                }
                onChange={(value) => {
                  setTimezone(value);
                  setErrors((current) => ({ ...current, timezone: undefined }));
                }}
              />
              {errors.timezone ? (
                <FieldError
                  id="sequence-timezone-error"
                  className="text-[13px] text-danger"
                >
                  {errors.timezone}
                </FieldError>
              ) : (
                <FieldDescription
                  id="sequence-timezone-hint"
                  className="text-[13px]"
                >
                  {labels.timezoneHint}{" "}
                  {local && local !== timezone && !locked ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setTimezone(local)}
                      className={cn(
                        "rounded-[4px] font-medium text-primary underline-offset-2 hover:underline",
                        focusRing,
                      )}
                    >
                      {labels.useBrowser(timezoneLabel(local))}
                    </button>
                  ) : null}
                </FieldDescription>
              )}
            </Field>
          </div>
          {errors.end ? (
            <p
              id="sequence-end-error"
              role="alert"
              className="-mt-2 text-[13px] text-danger"
            >
              {errors.end}
            </p>
          ) : null}
        </div>
        <FormFooter pending={pending} disabled={locked || !changed} />
      </SectionCard>
    </form>
  );
}

function sameDays(a: number[], b: number[]) {
  return a.length === b.length && a.every((day) => b.includes(day));
}

type Flag = "stopOnReply" | "trackOpens" | "trackClicks";

function BehaviorCard({ sequence, locked, onSaved }: FormProps) {
  const labels = text.behavior;
  const [saving, setSaving] = useState<Flag | null>(null);
  const [optimistic, setOptimistic] = useState<Partial<Record<Flag, boolean>>>(
    {},
  );

  async function toggle(flag: Flag, value: boolean) {
    if (saving || locked) {
      return;
    }
    setSaving(flag);
    setOptimistic({ [flag]: value });
    const result = await updateSequence(sequence.id, { [flag]: value });
    setSaving(null);
    setOptimistic({});
    if (!result.ok) {
      toast.error(text.switchFailed, {
        description: describeError(result.error),
      });
      return;
    }
    onSaved(result.data);
  }

  const rows: { flag: Flag; label: string; hint: string }[] = [
    {
      flag: "stopOnReply",
      label: labels.stopOnReply,
      hint: labels.stopOnReplyHint,
    },
    {
      flag: "trackOpens",
      label: labels.trackOpens,
      hint: labels.trackOpensHint,
    },
    {
      flag: "trackClicks",
      label: labels.trackClicks,
      hint: labels.trackClicksHint,
    },
  ];

  return (
    <SectionCard
      id="sequence-behavior"
      title={labels.title}
      description={labels.description}
    >
      <div className="flex flex-col gap-4 px-4 py-4">
        {rows.map((row) => {
          const id = `sequence-${row.flag}`;
          return (
            <div
              key={row.flag}
              className="flex items-start justify-between gap-4"
            >
              <div className="min-w-0">
                <div id={`${id}-label`} className="font-medium text-foreground">
                  {row.label}
                </div>
                <p id={`${id}-hint`} className="text-muted-foreground">
                  {row.hint}
                </p>
              </div>
              <div className="mt-0.5 flex items-center gap-2">
                {saving === row.flag ? (
                  <Spinner className="size-3.5 text-ink-tertiary" />
                ) : null}
                <Switch
                  id={id}
                  checked={optimistic[row.flag] ?? sequence[row.flag]}
                  disabled={locked || saving !== null}
                  aria-labelledby={`${id}-label`}
                  aria-describedby={`${id}-hint`}
                  onCheckedChange={(value) => void toggle(row.flag, value)}
                />
              </div>
            </div>
          );
        })}
        <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-muted-foreground">
          <Info
            aria-hidden
            strokeWidth={1.6}
            className="mt-0.5 size-4 shrink-0"
          />
          {labels.trackingNote}
        </p>
      </div>
    </SectionCard>
  );
}
