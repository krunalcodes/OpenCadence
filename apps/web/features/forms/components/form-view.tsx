import { cn } from "@workspace/ui/lib/utils";
import { CircleAlert, CircleCheck } from "lucide-react";
import { FormSubmitButton } from "@/features/forms/components/form-submit-button";
import { StatusFocus } from "@/features/forms/components/status-focus";
import { copy, fieldNames } from "@/features/forms/lib/copy";
import {
  emailFieldKey,
  type FormBrand,
  type FormField,
  type FormSettings,
} from "@/features/forms/lib/forms";
import {
  type DoneStatus,
  type FormProblem,
  type FormViewMode,
  fieldDomId,
  formTheme,
  inputHints,
  maxEmailLength,
  maxValueLength,
} from "@/features/forms/lib/public-form";

const text = copy.public;

export type FormViewProps = {
  brand: FormBrand;
  fields: FormField[];
  settings: FormSettings;
  mode: FormViewMode;
  done?: DoneStatus | null;
  problem?: FormProblem | null;
  action?: (data: FormData) => void | Promise<void>;
  hidden?: Record<string, string>;
  honeypot?: string | null;
  focusStatus?: boolean;
  idPrefix?: string;
};

const wrapperClasses: Record<FormViewMode, string> = {
  page: "min-h-svh bg-[var(--form-page)] px-4 py-8 sm:py-14",
  preview: "bg-[var(--form-page)] px-4 py-8",
  embed: "p-px",
};

const cardClasses: Record<FormViewMode, string> = {
  page: "p-6 shadow-[0_1px_2px_rgb(0_0_0/0.06)] sm:p-8",
  preview: "p-6 shadow-[0_1px_2px_rgb(0_0_0/0.06)]",
  embed: "p-5 sm:p-6",
};

const inputClass =
  "min-h-12 w-full rounded-lg border border-[var(--form-line)] bg-[var(--form-surface)] px-3.5 py-2.5 text-base text-[var(--form-ink)] outline-none focus-visible:border-[var(--form-ink)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--form-ink)] aria-invalid:border-[var(--form-danger)]";

const labelClass = "break-words text-[15px] leading-snug font-medium";

const headingClass =
  "text-balance break-words text-2xl leading-[1.2] font-semibold tracking-[-0.02em]";

const bodyClass =
  "mt-2.5 break-words text-base leading-[1.55] whitespace-pre-line text-[var(--form-muted)]";

function labelOf(field: FormField) {
  return field.label || fieldNames[field.key] || field.key;
}

function problemMessage(problem: FormProblem, field: FormField | null) {
  if (problem.reason === "busy") {
    return text.problem.busy;
  }
  if (problem.reason === "offline") {
    return text.problem.offline;
  }
  return field ? text.problem.invalid : text.problem.invalidGeneral;
}

function fieldError(field: FormField) {
  return field.key === emailFieldKey
    ? text.fieldErrors.email
    : text.fieldErrors.other(labelOf(field));
}

function BrandMark({ brand }: { brand: FormBrand }) {
  if (brand.logoUrl) {
    return (
      <img
        src={brand.logoUrl}
        alt={text.logoAlt(brand.name)}
        className="mb-6 block max-h-10 max-w-[180px] object-contain"
      />
    );
  }
  if (!brand.name) {
    return null;
  }
  return (
    <p className="mb-6 break-words text-[15px] font-semibold tracking-[-0.005em]">
      {brand.name}
    </p>
  );
}

type FieldControlProps = {
  field: FormField;
  id: string;
  marked: boolean;
  invalid: boolean;
};

function FieldControl({ field, id, marked, invalid }: FieldControlProps) {
  const label = labelOf(field);
  const mark =
    marked && field.required ? <span aria-hidden="true"> *</span> : null;
  const describedBy = invalid ? `${id}-error` : undefined;
  const error = invalid ? (
    <p
      id={`${id}-error`}
      className="text-sm leading-normal text-[var(--form-danger)]"
    >
      {fieldError(field)}
    </p>
  ) : null;

  if (field.type === "boolean") {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-start gap-3">
          <input
            id={id}
            name={field.key}
            type="checkbox"
            value="true"
            required={field.required}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            className="mt-0.5 size-5 shrink-0 rounded border border-[var(--form-line)] accent-[var(--form-primary)] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--form-ink)]"
          />
          <label htmlFor={id} className={labelClass}>
            {label}
            {mark}
          </label>
        </div>
        {error}
      </div>
    );
  }

  const hints = inputHints(field);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelClass}>
        {label}
        {mark}
      </label>
      {field.type === "select" ? (
        <select
          id={id}
          name={field.key}
          required={field.required}
          defaultValue=""
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={inputClass}
        >
          <option value="">{text.selectPlaceholder}</option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          name={field.key}
          type={hints.type}
          step={hints.type === "number" ? "any" : undefined}
          inputMode={hints.inputMode}
          autoComplete={hints.autoComplete}
          autoCapitalize={field.type === "email" ? "none" : undefined}
          spellCheck={field.type === "email" ? false : undefined}
          required={field.required}
          maxLength={field.type === "email" ? maxEmailLength : maxValueLength}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={inputClass}
        />
      )}
      {error}
    </div>
  );
}

export function FormView({
  brand,
  fields,
  settings,
  mode,
  done = null,
  problem = null,
  action,
  hidden,
  honeypot = null,
  focusStatus = false,
  idPrefix = "form",
}: FormViewProps) {
  const Heading = mode === "preview" ? "h3" : "h1";
  const Main = mode === "preview" ? "div" : "main";
  const doneId = `${idPrefix}-done`;
  const problemId = `${idPrefix}-problem`;
  const consentId = `${idPrefix}-consent`;
  const marked = fields.some((field) => !field.required);
  const badField =
    problem?.reason === "invalid" && problem.field
      ? (fields.find((field) => field.key === problem.field) ?? null)
      : null;

  return (
    <div
      data-form-view={mode}
      style={formTheme(brand)}
      className={cn("text-[var(--form-ink)] antialiased", wrapperClasses[mode])}
    >
      <Main
        className={cn(
          "mx-auto w-full max-w-[28rem] rounded-2xl border border-[var(--form-soft)] bg-[var(--form-surface)]",
          cardClasses[mode],
        )}
      >
        {mode === "embed" ? null : <BrandMark brand={brand} />}

        {done ? (
          <div id={doneId} role="status" tabIndex={-1} className="outline-none">
            <CircleCheck
              aria-hidden="true"
              strokeWidth={1.6}
              className="mb-4 size-9 text-[var(--form-ink)]"
            />
            <Heading className={headingClass}>
              {settings.successTitle || text.doneFallbackTitle}
            </Heading>
            {settings.successMessage ? (
              <p className={bodyClass}>{settings.successMessage}</p>
            ) : null}
          </div>
        ) : (
          <>
            <Heading className={headingClass}>
              {settings.title || text.fallbackTitle}
            </Heading>
            {settings.description ? (
              <p className={bodyClass}>{settings.description}</p>
            ) : null}

            {problem ? (
              <div
                id={problemId}
                role="alert"
                tabIndex={-1}
                className="mt-5 flex gap-2.5 rounded-lg bg-[var(--form-danger-soft)] px-4 py-3 text-[15px] leading-normal text-[var(--form-danger)] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--form-danger)]"
              >
                <CircleAlert
                  aria-hidden="true"
                  strokeWidth={1.6}
                  className="mt-0.5 size-5 shrink-0"
                />
                <div className="min-w-0">
                  <p className="font-semibold">{text.problem.title}</p>
                  <p>{problemMessage(problem, badField)}</p>
                  {badField ? (
                    <a
                      href={`#${fieldDomId(idPrefix, badField.key)}`}
                      className="mt-1 inline-block rounded-[4px] font-medium underline underline-offset-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--form-danger)]"
                    >
                      {fieldError(badField)}
                    </a>
                  ) : null}
                </div>
              </div>
            ) : null}

            <form action={action} className="relative mt-6 flex flex-col gap-4">
              {Object.entries(hidden ?? {}).map(([name, value]) => (
                <input key={name} type="hidden" name={name} value={value} />
              ))}
              {honeypot ? (
                <div
                  aria-hidden="true"
                  className="absolute top-0 -left-[9999px] h-px w-px overflow-hidden"
                >
                  <label htmlFor={`${idPrefix}-extra`}>
                    {text.honeypotLabel}
                  </label>
                  <input
                    id={`${idPrefix}-extra`}
                    type="text"
                    name={honeypot}
                    tabIndex={-1}
                    autoComplete="off"
                    defaultValue=""
                  />
                </div>
              ) : null}

              {marked ? (
                <p className="text-sm text-[var(--form-muted)]">
                  {text.requiredNote}
                </p>
              ) : null}

              {fields.map((field) => (
                <FieldControl
                  key={field.key}
                  field={field}
                  id={fieldDomId(idPrefix, field.key)}
                  marked={marked}
                  invalid={badField?.key === field.key}
                />
              ))}

              {settings.consentText ? (
                <p
                  id={consentId}
                  className="break-words text-sm leading-normal whitespace-pre-line text-[var(--form-muted)]"
                >
                  {settings.consentText}
                </p>
              ) : null}

              <FormSubmitButton
                label={settings.buttonLabel || text.fallbackButton}
                describedBy={settings.consentText ? consentId : undefined}
              />
            </form>
          </>
        )}
      </Main>
      {focusStatus && (done || problem) ? (
        <StatusFocus targetId={done ? doneId : problemId} />
      ) : null}
    </div>
  );
}
