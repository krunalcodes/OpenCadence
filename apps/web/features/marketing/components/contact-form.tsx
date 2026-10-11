"use client";

import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@workspace/ui/components/combobox";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Textarea } from "@workspace/ui/components/textarea";
import { Check, LoaderCircle } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import {
  type ContactErrors,
  type ContactField,
  type ContactSubmission,
  contactLimits,
  contactTopics,
  contactVolumes,
  topicNeedsVolume,
  validateContact,
} from "@/features/marketing/lib/contact";

type Option = { value: string; label: string };

type Values = {
  name: string;
  email: string;
  company: string;
  topic: Option | null;
  volume: Option | null;
  message: string;
  consent: boolean;
};

const topicOptions: Option[] = [...contactTopics];
const volumeOptions: Option[] = [...contactVolumes];

const initialValues: Values = {
  name: "",
  email: "",
  company: "",
  topic: null,
  volume: null,
  message: "",
  consent: false,
};

const controlClass = "h-10 px-3";
const optionalClass = "font-normal text-muted-foreground";

function toPayload(values: Values) {
  return {
    name: values.name,
    email: values.email,
    company: values.company,
    topic: values.topic?.value ?? null,
    volume: topicNeedsVolume(values.topic?.value)
      ? (values.volume?.value ?? null)
      : null,
    message: values.message,
    consent: values.consent,
  };
}

function errorsFor(values: Values): ContactErrors {
  const result = validateContact(toPayload(values));
  return result.ok ? {} : result.errors;
}

function ContactForm() {
  const [values, setValues] = React.useState<Values>(initialValues);
  const [errors, setErrors] = React.useState<ContactErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [sent, setSent] = React.useState<ContactSubmission | null>(null);
  const [focusRequest, setFocusRequest] = React.useState(0);
  const [website, setWebsite] = React.useState("");
  const formRef = React.useRef<HTMLFormElement>(null);
  const successRef = React.useRef<HTMLHeadingElement>(null);

  const showVolume = topicNeedsVolume(values.topic?.value);

  React.useEffect(() => {
    if (focusRequest === 0) {
      return;
    }
    formRef.current
      ?.querySelector<HTMLElement>('[aria-invalid="true"]')
      ?.focus();
  }, [focusRequest]);

  React.useEffect(() => {
    if (sent) {
      successRef.current?.focus();
    }
  }, [sent]);

  function update<K extends keyof Values>(field: K, value: Values[K]) {
    const next = { ...values, [field]: value };
    setValues(next);
    if (errors[field]) {
      setErrors((current) => ({
        ...current,
        [field]: errorsFor(next)[field],
      }));
    }
  }

  function check(field: ContactField) {
    setErrors((current) => ({
      ...current,
      [field]: errorsFor(values)[field],
    }));
  }

  function describe(field: ContactField) {
    return {
      "aria-invalid": errors[field] ? true : undefined,
      "aria-describedby": errors[field] ? `contact-${field}-error` : undefined,
    };
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }

    setFormError(null);
    const payload = toPayload(values);
    const result = validateContact(payload);

    if (!result.ok) {
      setErrors(result.errors);
      setFocusRequest((count) => count + 1);
      return;
    }

    setErrors({});
    setSubmitting(true);

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, website }),
      });

      if (response.ok) {
        setSent(result.data);
        return;
      }

      const body: unknown = await response.json().catch(() => null);
      const serverErrors =
        response.status === 400 &&
        typeof body === "object" &&
        body !== null &&
        "errors" in body &&
        typeof body.errors === "object" &&
        body.errors !== null
          ? (body.errors as ContactErrors & { form?: string })
          : null;

      if (serverErrors) {
        const { form, ...fieldErrors } = serverErrors;
        setErrors(fieldErrors);
        if (form || Object.keys(fieldErrors).length === 0) {
          setFormError(
            "We could not accept the form. Check each field and send it again.",
          );
        } else {
          setFocusRequest((count) => count + 1);
        }
        return;
      }

      setFormError(
        "Something went wrong on our side and your message was not sent. Wait a moment and send it again.",
      );
    } catch {
      setFormError(
        "Your message was not sent because the connection dropped. Check your connection and send it again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    const topicLabel = contactTopics.find(
      (item) => item.value === sent.topic,
    )?.label;
    const volumeLabel = contactVolumes.find(
      (item) => item.value === sent.volume,
    )?.label;
    const summary = [
      { term: "Topic", detail: topicLabel },
      { term: "Name", detail: sent.name },
      { term: "Reply to", detail: sent.email },
      { term: "Company", detail: sent.company },
      { term: "Monthly volume", detail: volumeLabel },
      { term: "Message", detail: sent.message },
    ].filter((row) => row.detail);

    return (
      <div role="status" className="min-w-0">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-success-surface text-success"
          >
            <Check strokeWidth={2} className="size-4" />
          </span>
          <h3
            ref={successRef}
            tabIndex={-1}
            className="font-semibold text-xl tracking-[-0.02em] outline-none"
          >
            {sent.topic === "demo" ? "Demo request sent" : "Message sent"}
          </h3>
        </div>
        <p className="mt-3 text-muted-foreground">
          Thanks, {sent.name}. We reply by email to{" "}
          <span className="break-all font-medium text-foreground">
            {sent.email}
          </span>
          . Here is what you sent.
        </p>
        <dl className="mt-6 border-border border-t text-sm">
          {summary.map((row) => (
            <div
              key={row.term}
              className="grid gap-1 border-border border-b py-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4"
            >
              <dt className="font-mono text-muted-foreground text-xs sm:pt-0.5">
                {row.term}
              </dt>
              <dd className="wrap-anywhere min-w-0 whitespace-pre-wrap">
                {row.detail}
              </dd>
            </div>
          ))}
        </dl>
        <Button
          type="button"
          variant="outline"
          className="mt-6 h-10 px-4"
          onClick={() => {
            setValues(initialValues);
            setSent(null);
          }}
        >
          Send another message
        </Button>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={handleSubmit}
      aria-label="Contact the team"
      className="relative min-w-0"
    >
      <FieldGroup>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.name)} className="min-w-0">
            <FieldLabel htmlFor="contact-name">Full name</FieldLabel>
            <Input
              id="contact-name"
              name="name"
              autoComplete="name"
              required
              maxLength={contactLimits.name}
              value={values.name}
              onChange={(event) => update("name", event.target.value)}
              onBlur={() => check("name")}
              disabled={submitting}
              className={controlClass}
              {...describe("name")}
            />
            {errors.name ? (
              <FieldError id="contact-name-error">{errors.name}</FieldError>
            ) : null}
          </Field>
          <Field data-invalid={Boolean(errors.email)} className="min-w-0">
            <FieldLabel htmlFor="contact-email">Work email</FieldLabel>
            <Input
              id="contact-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              spellCheck={false}
              required
              maxLength={contactLimits.email}
              value={values.email}
              onChange={(event) => update("email", event.target.value)}
              onBlur={() => check("email")}
              disabled={submitting}
              className={controlClass}
              {...describe("email")}
            />
            {errors.email ? (
              <FieldError id="contact-email-error">{errors.email}</FieldError>
            ) : null}
          </Field>
        </div>

        <Field data-invalid={Boolean(errors.company)}>
          <FieldLabel htmlFor="contact-company">
            Company <span className={optionalClass}>(optional)</span>
          </FieldLabel>
          <Input
            id="contact-company"
            name="company"
            autoComplete="organization"
            maxLength={contactLimits.company}
            value={values.company}
            onChange={(event) => update("company", event.target.value)}
            onBlur={() => check("company")}
            disabled={submitting}
            className={controlClass}
            {...describe("company")}
          />
          {errors.company ? (
            <FieldError id="contact-company-error">{errors.company}</FieldError>
          ) : null}
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.topic)} className="min-w-0">
            <FieldLabel htmlFor="contact-topic">What do you need?</FieldLabel>
            <Combobox
              items={topicOptions}
              value={values.topic}
              onValueChange={(value) => update("topic", value)}
              disabled={submitting}
            >
              <ComboboxInput
                id="contact-topic"
                placeholder="Choose one"
                required
                disabled={submitting}
                onBlur={() => {
                  if (errors.topic) {
                    check("topic");
                  }
                }}
                className="h-10 w-full"
                {...describe("topic")}
              />
              <ComboboxContent>
                <ComboboxEmpty>
                  No match. Clear the box to see all.
                </ComboboxEmpty>
                <ComboboxList>
                  {(item: Option) => (
                    <ComboboxItem key={item.value} value={item}>
                      {item.label}
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
            {errors.topic ? (
              <FieldError id="contact-topic-error">{errors.topic}</FieldError>
            ) : null}
          </Field>

          {showVolume ? (
            <Field data-invalid={Boolean(errors.volume)} className="min-w-0">
              <FieldLabel htmlFor="contact-volume">
                Monthly sending volume
              </FieldLabel>
              <Combobox
                items={volumeOptions}
                value={values.volume}
                onValueChange={(value) => update("volume", value)}
                disabled={submitting}
              >
                <ComboboxInput
                  id="contact-volume"
                  placeholder="Emails per month"
                  required
                  disabled={submitting}
                  className="h-10 w-full"
                  {...describe("volume")}
                />
                <ComboboxContent>
                  <ComboboxEmpty>
                    No match. Clear the box to see all.
                  </ComboboxEmpty>
                  <ComboboxList>
                    {(item: Option) => (
                      <ComboboxItem key={item.value} value={item}>
                        {item.label}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
              {errors.volume ? (
                <FieldError id="contact-volume-error">
                  {errors.volume}
                </FieldError>
              ) : null}
            </Field>
          ) : null}
        </div>

        <Field data-invalid={Boolean(errors.message)}>
          <FieldLabel htmlFor="contact-message">Message</FieldLabel>
          <Textarea
            id="contact-message"
            name="message"
            required
            rows={5}
            maxLength={contactLimits.messageMax}
            value={values.message}
            onChange={(event) => update("message", event.target.value)}
            onBlur={() => check("message")}
            disabled={submitting}
            className="min-h-32 px-3 py-2.5"
            {...describe("message")}
          />
          {errors.message ? (
            <FieldError id="contact-message-error">{errors.message}</FieldError>
          ) : null}
        </Field>

        <Field data-invalid={Boolean(errors.consent)}>
          <div className="flex items-start gap-3">
            <Checkbox
              id="contact-consent"
              aria-labelledby="contact-consent-label"
              name="consent"
              required
              checked={values.consent}
              onCheckedChange={(checked) => update("consent", checked)}
              disabled={submitting}
              className="mt-0.5"
              {...describe("consent")}
            />
            <Label
              id="contact-consent-label"
              htmlFor="contact-consent"
              className="inline min-w-0 font-normal text-foreground leading-snug"
            >
              I agree that OpenCadence can use these details to reply to me, as
              described in the{" "}
              <Link
                href="/privacy"
                className="font-medium text-primary underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                privacy policy
              </Link>
              .
            </Label>
          </div>
          {errors.consent ? (
            <FieldError id="contact-consent-error">{errors.consent}</FieldError>
          ) : null}
        </Field>

        <div
          aria-hidden="true"
          className="absolute top-0 -left-[9999px] size-px overflow-hidden"
        >
          <label htmlFor="contact-website">Website</label>
          <input
            id="contact-website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
          />
        </div>

        {formError ? (
          <p
            role="alert"
            className="rounded-lg bg-danger-surface px-3 py-2.5 text-danger text-sm"
          >
            {formError}
          </p>
        ) : null}

        <div>
          <Button
            type="submit"
            disabled={submitting}
            className="h-11 gap-2 px-5 text-[15px] hover:bg-brand-hover"
          >
            {submitting ? (
              <>
                <LoaderCircle
                  aria-hidden="true"
                  className="animate-spin motion-reduce:animate-none"
                />
                Sending
              </>
            ) : values.topic?.value === "demo" ? (
              "Request a demo"
            ) : (
              "Send message"
            )}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

export { ContactForm };
