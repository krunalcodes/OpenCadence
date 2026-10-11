import { buttonVariants } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { ArrowDown, ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import {
  PageHero,
  Section,
  SectionHeading,
} from "@/features/marketing/components/section";
import {
  ApiKeyRow,
  CodePanel,
  ResponsePanel,
  WebhookDeliveries,
} from "@/features/marketing/components/transactional";
import { features } from "@/features/marketing/lib/features";
import { links } from "@/features/marketing/lib/links";

const afterRequest = [
  {
    step: "01",
    title: "Checked against your suppression list",
    body: "Anyone who unsubscribed or bounced is skipped, the same as in a newsletter or a sequence.",
  },
  {
    step: "02",
    title: "Sent through the integration you name",
    body: "The via field picks any provider or mailbox connected to the workspace.",
  },
  {
    step: "03",
    title: "Counted in the same reports",
    body: "Delivery, opens, and clicks sit beside your campaign numbers.",
  },
];

type Segment = string | { value: string };

const templateSource: { label: string; segments: Segment[] }[] = [
  {
    label: "Subject",
    segments: ["Reset your ", { value: "{{product_name}}" }, " password"],
  },
  {
    label: "Body",
    segments: [
      "Hi ",
      { value: "{{first_name}}" },
      ",\n\nUse the link below to choose a new password. It expires in ",
      { value: "{{expires_in}}" },
      ".\n\n",
      { value: "{{reset_url}}" },
    ],
  },
];

const templateRendered: { label: string; segments: Segment[] }[] = [
  {
    label: "Subject",
    segments: ["Reset your ", { value: "Northwind" }, " password"],
  },
  {
    label: "Body",
    segments: [
      "Hi ",
      { value: "Dana" },
      ",\n\nUse the link below to choose a new password. It expires in ",
      { value: "30 minutes" },
      ".\n\n",
      { value: "https://app.northwind.studio/reset/..." },
    ],
  },
];

const providers = ["resend", "ses", "sendgrid", "smtp", "gmail", "outlook"];

const endpoints = [
  { method: "GET", path: "/v1/contacts", note: "List contacts" },
  { method: "POST", path: "/v1/campaigns", note: "Create a campaign" },
  {
    method: "POST",
    path: "/v1/sequences/{id}/enroll",
    note: "Enroll a contact in a sequence",
  },
  {
    method: "POST",
    path: "/v1/transactional/send",
    note: "Send a stored template",
  },
];

const keyFacts = [
  {
    title: "One key per app",
    body: "Give your billing service and your sign-up flow separate keys, so you can revoke one without touching the other.",
  },
  {
    title: "Only the scopes it needs",
    body: "A key with transactional:send can send email and read nothing else.",
  },
  {
    title: "Tied to one workspace",
    body: "A key reaches the contacts, templates, and integrations of its own workspace only.",
  },
];

const webhookEvents = [
  "delivered",
  "opened",
  "clicked",
  "bounced",
  "replied",
  "unsubscribed",
];

const csvSource = `email,first_name,plan
dana@example.com,Dana,Team
omar@example.com,Omar,Starter
ines@example.com,Ines,Team`;

const csvMapping = [
  { column: "email", field: "Email" },
  { column: "first_name", field: "First name" },
  { column: "plan", field: "Custom field: Plan" },
];

const worksWith = features.filter(
  (feature) => feature.slug === "integrations" || feature.slug === "platform",
);

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2";

function MonoLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.08em]">
      {children}
    </p>
  );
}

function TemplateCell({
  heading,
  rows,
  mono,
  className,
}: {
  heading: string;
  rows: { label: string; segments: Segment[] }[];
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 bg-card", className)}>
      <div className="border-border border-b px-4 py-2.5">
        <MonoLabel>{heading}</MonoLabel>
      </div>
      <dl className="divide-y divide-border-subtle">
        {rows.map((row) => (
          <div key={row.label} className="px-4 py-3.5">
            <dt className="text-[12px] text-muted-foreground">{row.label}</dt>
            <dd
              className={cn(
                "mt-1 overflow-x-auto whitespace-pre-wrap break-words text-[13.5px] leading-[1.7]",
                mono && "font-mono text-[12.5px]",
              )}
            >
              {row.segments.map((segment) =>
                typeof segment === "string" ? (
                  segment
                ) : (
                  <span
                    key={segment.value}
                    className="rounded-[4px] bg-accent px-1 py-px text-primary"
                  >
                    {segment.value}
                  </span>
                ),
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function TransactionalPage() {
  return (
    <>
      <PageHero
        label="Transactional API"
        title="Send receipts and password resets through the same system as your marketing email"
        lead="One request from your own app sends a stored template through a provider you already pay for. It follows the same suppression list as your newsletters and sequences, and shows up in the same reports."
      >
        <div className="flex flex-wrap gap-3">
          <Link
            href={links.signUp}
            className={cn(
              buttonVariants({ size: "lg" }),
              "h-11 px-5 text-[15px] hover:bg-brand-hover",
            )}
          >
            Start for free
          </Link>
          <Link
            href={links.demo}
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "h-11 px-5 text-[15px]",
            )}
          >
            Book a demo
          </Link>
        </div>
      </PageHero>

      <Section aria-labelledby="tx-request">
        <div className="max-w-2xl">
          <h2
            id="tx-request"
            className="text-balance font-semibold text-3xl tracking-[-0.03em] md:text-[2.5rem] md:leading-[1.08]"
          >
            One POST request sends the email
          </h2>
          <p className="mt-4 text-pretty text-lg text-muted-foreground">
            Name a template, a recipient, and the integration to send through.
            The API answers with a message id you can look up later.
          </p>
        </div>

        <div className="mt-12 grid gap-[18px] lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
          <CodePanel />
          <div className="flex min-w-0 flex-col gap-[18px]">
            <ResponsePanel />
            <ol className="flex-1 border-border border-t">
              {afterRequest.map((item) => (
                <li
                  key={item.step}
                  className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2 border-border border-b py-4"
                >
                  <span
                    aria-hidden
                    className="pt-0.5 font-mono text-[12px] text-primary"
                  >
                    {item.step}
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-[15px] tracking-[-0.01em]">
                      {item.title}
                    </h3>
                    <p className="mt-1 text-pretty text-[14px] text-muted-foreground leading-relaxed">
                      {item.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <p className="mt-4 font-mono text-[11.5px] text-muted-foreground">
          Sample request and response.
        </p>
      </Section>

      <Section aria-label="Stored templates">
        <div className="grid gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-start">
          <div className="min-w-0">
            <SectionHeading
              title="Keep the wording in a template and send only the variables"
              lead="Write and edit templates in OpenCadence. Your code passes values such as first_name at send time, so changing the copy never needs a deploy."
            />
            <div className="mt-8 border-border border-t pt-5">
              <MonoLabel>Values for the via field</MonoLabel>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {providers.map((provider) => (
                  <li
                    key={provider}
                    className="rounded-[6px] border border-border bg-card px-2 py-1 font-mono text-[12px]"
                  >
                    {provider}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-pretty text-[14px] text-muted-foreground leading-relaxed">
                Any integration connected to the workspace can carry a
                transactional email, so receipts can go through one provider and
                password resets through another.
              </p>
            </div>
          </div>

          <figure className="min-w-0">
            <div className="grid overflow-hidden rounded-[12px] border border-border md:grid-cols-2">
              <TemplateCell
                heading="Template: password-reset"
                rows={templateSource}
                mono
                className="border-border border-b md:border-r md:border-b-0"
              />
              <TemplateCell
                heading="What Dana receives"
                rows={templateRendered}
              />
            </div>
            <figcaption className="mt-3 flex items-center gap-2 font-mono text-[11.5px] text-muted-foreground">
              <ArrowDown aria-hidden size={13} className="md:-rotate-90" />
              Highlighted variables are filled in at send time. Sample data.
            </figcaption>
          </figure>
        </div>
      </Section>

      <Section aria-label="REST API">
        <div className="grid gap-x-14 gap-y-10 lg:grid-cols-2 lg:items-start">
          <div className="order-2 min-w-0 lg:order-1">
            <div className="flex items-baseline justify-between gap-4 border-border border-b pb-2.5">
              <MonoLabel>Example endpoints</MonoLabel>
              <span className="font-mono text-[11.5px] text-muted-foreground">
                api.opencadence.com
              </span>
            </div>
            <ul>
              {endpoints.map((endpoint) => (
                <li
                  key={endpoint.method + endpoint.path}
                  className="grid gap-x-4 gap-y-0.5 border-border border-b py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline"
                >
                  <code className="block min-w-0 overflow-x-auto whitespace-nowrap font-mono text-[13px]">
                    <span className="inline-block w-12 font-medium text-primary">
                      {endpoint.method}
                    </span>
                    {endpoint.path}
                  </code>
                  <span className="text-[13px] text-muted-foreground">
                    {endpoint.note}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 font-mono text-[11.5px] text-muted-foreground">
              Four examples from the full API.
            </p>
          </div>
          <SectionHeading
            className="order-1 min-w-0 lg:order-2"
            title="A REST API for everything else in the product"
            lead="Contacts, campaigns, sequences, and templates all have endpoints, versioned under /v1. Whatever you can do in the interface, your code can do too."
          />
        </div>
      </Section>

      <Section aria-label="API keys">
        <SectionHeading
          title="Scoped API keys for each workspace"
          lead="Create as many keys as you have apps, and limit each one to the job it does."
        />
        <ApiKeyRow className="mt-10" />
        <div className="mt-10 grid border-border border-t md:grid-cols-3 md:divide-x md:divide-border">
          {keyFacts.map((fact) => (
            <div
              key={fact.title}
              className="min-w-0 border-border border-b py-5 md:px-6 md:first:pl-0 md:last:pr-0"
            >
              <h3 className="font-semibold text-base tracking-[-0.01em]">
                {fact.title}
              </h3>
              <p className="mt-1.5 text-pretty text-[15px] text-muted-foreground leading-relaxed">
                {fact.body}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section aria-label="Webhooks">
        <div className="grid gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center">
          <WebhookDeliveries />
          <div className="min-w-0">
            <SectionHeading
              title="Your app hears back when something happens"
              lead="OpenCadence posts to your endpoint when an email is delivered, opened, clicked, or bounced, and when a contact replies or unsubscribes."
            />
            <ul className="mt-8 grid grid-cols-2 border-border border-t border-l sm:grid-cols-3">
              {webhookEvents.map((event) => (
                <li
                  key={event}
                  className="min-w-0 truncate border-border border-r border-b px-3 py-2.5 font-mono text-[12.5px]"
                >
                  {event}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section aria-label="CSV import and export">
        <div className="grid gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-start">
          <SectionHeading
            className="min-w-0"
            title="Bring contacts in from a CSV file and take them out again"
            lead="Upload a file, match each column to a contact field, and import. Export your contacts to CSV whenever you want a copy."
          />
          <div
            aria-hidden
            className="grid min-w-0 overflow-hidden rounded-[12px] border border-border bg-card md:grid-cols-2"
          >
            <div className="min-w-0 border-border border-b md:border-r md:border-b-0">
              <div className="border-border border-b px-4 py-2.5">
                <MonoLabel>contacts.csv</MonoLabel>
              </div>
              <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-[1.7]">
                <code>
                  <span className="text-primary">
                    {csvSource.split("\n")[0]}
                  </span>
                  {`\n${csvSource.split("\n").slice(1).join("\n")}`}
                </code>
              </pre>
            </div>
            <div className="min-w-0">
              <div className="border-border border-b px-4 py-2.5">
                <MonoLabel>Column mapping</MonoLabel>
              </div>
              <ul className="divide-y divide-border-subtle text-[13px]">
                {csvMapping.map((row) => (
                  <li
                    key={row.column}
                    className="flex items-center gap-2.5 px-4 py-3"
                  >
                    <span className="font-mono text-[12.5px] text-primary">
                      {row.column}
                    </span>
                    <ArrowRight
                      size={13}
                      className="shrink-0 text-muted-foreground"
                    />
                    <span className="min-w-0 truncate">{row.field}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Section>

      <Section aria-labelledby="tx-works-with">
        <h2
          id="tx-works-with"
          className="font-semibold text-xl tracking-[-0.02em]"
        >
          Works with
        </h2>
        <ul className="mt-6 grid border-border border-t border-l sm:grid-cols-2">
          {worksWith.map((feature) => (
            <li
              key={feature.slug}
              className="min-w-0 border-border border-r border-b"
            >
              <Link
                href={feature.href}
                className={cn(
                  "group flex h-full items-start justify-between gap-4 p-5 transition-colors hover:bg-muted md:p-6",
                  focusRing,
                )}
              >
                <span className="min-w-0">
                  <span className="block font-semibold text-base tracking-[-0.01em]">
                    {feature.title}
                  </span>
                  <span className="mt-1 block text-pretty text-[15px] text-muted-foreground">
                    {feature.description}
                  </span>
                </span>
                <ArrowUpRight
                  aria-hidden
                  size={18}
                  strokeWidth={1.75}
                  className="mt-0.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
                />
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

export { TransactionalPage };
