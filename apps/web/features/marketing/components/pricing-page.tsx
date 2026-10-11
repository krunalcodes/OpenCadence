"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion";
import { buttonVariants } from "@workspace/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group";
import { cn } from "@workspace/ui/lib/utils";
import { ArrowRight, Check, Minus } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { links } from "@/features/marketing/lib/links";
import {
  type BillingPeriod,
  billingPeriods,
  type ComparisonValue,
  comparison,
  contactsLimitLabel,
  defaultBillingPeriod,
  formatLimit,
  formatPrice,
  freePriceNote,
  type Plan,
  type PlanLimits,
  plans,
  recommendedTag,
  yearlySavingPercent,
  yearlyTotal,
} from "@/features/marketing/lib/pricing";

import { PageHero, Section, SectionHeading } from "./section";

const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const LIMIT_KEYS: readonly (keyof PlanLimits)[] = [
  "senders",
  "workspaces",
  "members",
];

const ctaHref = {
  signUp: links.signUp,
  contact: links.contact,
} as const;

function isBillingPeriod(value: unknown): value is BillingPeriod {
  return billingPeriods.some((period) => period.id === value);
}

function BillingToggle({
  billing,
  onChange,
}: {
  billing: BillingPeriod;
  onChange: (billing: BillingPeriod) => void;
}) {
  const saving = yearlySavingPercent();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <ToggleGroup
        aria-label="Billing period"
        value={[billing]}
        onValueChange={(value) => {
          const next = value[0];
          if (isBillingPeriod(next)) {
            onChange(next);
          }
        }}
        spacing={1}
        className="rounded-[10px] border border-border bg-card p-1 shadow-xs"
      >
        {billingPeriods.map((period) => (
          <ToggleGroupItem
            key={period.id}
            value={period.id}
            aria-label={`${period.label} billing`}
            className="h-9 rounded-[7px] px-4 text-muted-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary"
          >
            {period.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {saving > 0 ? (
        <p className="font-mono text-muted-foreground text-xs">
          Save {saving}% with yearly billing
        </p>
      ) : null}
    </div>
  );
}

function priceNote(plan: Plan, billing: BillingPeriod): string {
  if (!plan.price) {
    return plan.customPriceNote ?? "";
  }
  if (plan.price.monthly === 0) {
    return freePriceNote;
  }
  if (billing === "yearly") {
    return `Billed yearly at ${formatPrice(yearlyTotal(plan.price))}`;
  }
  return "Billed monthly";
}

function PlanColumn({ plan, billing }: { plan: Plan; billing: BillingPeriod }) {
  const amount = plan.price
    ? billing === "yearly"
      ? plan.price.yearlyPerMonth
      : plan.price.monthly
    : null;

  return (
    <article className="relative flex min-w-0 flex-col bg-background px-6 pt-8 pb-9 md:px-8">
      {plan.recommended ? (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-[3px] bg-primary"
        />
      ) : null}
      <div className="flex min-h-6 items-center justify-between gap-3">
        <h3 className="font-semibold text-lg tracking-[-0.015em]">
          {plan.name}
        </h3>
        {plan.recommended ? (
          <span className="rounded-[5px] border border-primary/25 bg-accent px-1.5 py-0.5 font-mono text-[11px] text-primary leading-none">
            {recommendedTag}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-pretty text-muted-foreground text-sm lg:min-h-10">
        {plan.audience}
      </p>

      <p className="mt-7 flex items-baseline gap-1.5">
        <span className="font-semibold text-[2.75rem] tabular-nums leading-none tracking-[-0.04em]">
          {amount === null ? plan.customPriceLabel : formatPrice(amount)}
        </span>
        {amount === null ? null : (
          <span className="text-muted-foreground text-sm">per month</span>
        )}
      </p>
      <p className="mt-2.5 font-mono text-muted-foreground text-xs">
        {priceNote(plan, billing)}
      </p>

      <Link
        href={ctaHref[plan.cta]}
        className={cn(
          buttonVariants({
            variant: plan.recommended ? "default" : "outline",
            size: "lg",
          }),
          "mt-7 h-10 w-full text-sm",
          plan.recommended
            ? "hover:bg-brand-hover"
            : "bg-card shadow-xs hover:bg-muted",
        )}
      >
        {plan.ctaLabel}
        <span className="sr-only"> on the {plan.name} plan</span>
      </Link>

      <ul className="mt-8 flex flex-col gap-2.5 border-border border-t pt-6 text-sm">
        <li className="flex gap-2.5">
          <Check
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-primary"
            strokeWidth={1.75}
          />
          <span className="font-medium">{contactsLimitLabel}</span>
        </li>
        {LIMIT_KEYS.map((key) => (
          <li key={key} className="flex gap-2.5">
            <Check
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-primary"
              strokeWidth={1.75}
            />
            <span>{formatLimit(key, plan.limits[key])}</span>
          </li>
        ))}
      </ul>

      <p className="mt-7 font-mono text-muted-foreground text-xs">
        {plan.highlightsLead}
      </p>
      <ul className="mt-3 flex flex-col gap-2 text-muted-foreground text-sm">
        {plan.highlights.map((highlight) => (
          <li key={highlight} className="text-pretty">
            {highlight}
          </li>
        ))}
      </ul>
    </article>
  );
}

function ComparisonCell({ value }: { value: ComparisonValue }) {
  if (value === true) {
    return (
      <>
        <Check
          aria-hidden="true"
          className="size-4 text-primary"
          strokeWidth={1.75}
        />
        <span className="sr-only">Included</span>
      </>
    );
  }
  if (value === false) {
    return (
      <>
        <Minus
          aria-hidden="true"
          className="size-4 text-border"
          strokeWidth={1.75}
        />
        <span className="sr-only">Not included</span>
      </>
    );
  }
  return <span className="tabular-nums">{value}</span>;
}

function ComparisonTable() {
  return (
    <div className="mt-10 border border-border bg-background md:mt-12">
      <Table className="min-w-[760px] table-fixed">
        <caption className="sr-only">
          Everything included in each OpenCadence plan
        </caption>
        <colgroup>
          <col className="w-[190px] sm:w-[32%]" />
          {plans.map((plan) => (
            <col key={plan.id} />
          ))}
        </colgroup>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead
              scope="col"
              className="sticky left-0 z-10 border-border border-r bg-background px-4 py-4 font-mono font-normal text-muted-foreground text-xs"
            >
              Feature
            </TableHead>
            {plans.map((plan) => (
              <TableHead
                key={plan.id}
                scope="col"
                className={cn(
                  "px-4 py-4 font-semibold text-sm",
                  plan.recommended && "text-primary",
                )}
              >
                {plan.name}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        {comparison.map((group) => (
          <TableBody
            key={group.title}
            className="border-border border-b last:border-b-0"
          >
            <TableRow className="hover:bg-transparent">
              <TableHead
                scope="colgroup"
                colSpan={plans.length + 1}
                className="h-auto bg-muted p-0"
              >
                <span className="sticky left-0 inline-flex items-center gap-2 px-4 py-2.5 font-mono font-normal text-primary text-xs">
                  <span
                    aria-hidden="true"
                    className="size-[7px] border border-primary bg-live"
                  />
                  {group.title}
                </span>
              </TableHead>
            </TableRow>
            {group.rows.map((row) => (
              <TableRow key={row.label} className="hover:bg-transparent">
                <TableHead
                  scope="row"
                  className="sticky left-0 z-10 h-auto whitespace-normal border-border border-r bg-background px-4 py-3 align-top font-normal"
                >
                  <span className="block text-pretty text-sm">{row.label}</span>
                  {row.hint ? (
                    <span className="mt-0.5 block text-pretty text-muted-foreground text-xs">
                      {row.hint}
                    </span>
                  ) : null}
                </TableHead>
                {plans.map((plan) => (
                  <TableCell
                    key={plan.id}
                    className="whitespace-normal px-4 py-3 align-top text-sm"
                  >
                    <ComparisonCell value={row.values[plan.id]} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        ))}
      </Table>
    </div>
  );
}

function GrowthFigure() {
  return (
    <div className="w-full min-w-0 border border-border bg-card">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-border border-b px-5 py-3 font-mono text-muted-foreground text-xs">
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="h-0.5 w-4 bg-primary" />
          Contacts
        </span>
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-0 w-4 border-muted-foreground border-t-2 border-dashed"
          />
          Your plan
        </span>
      </div>
      <svg
        aria-hidden="true"
        viewBox="0 0 400 170"
        className="block h-auto w-full"
        fill="none"
      >
        <g className="stroke-border-subtle" strokeWidth="1">
          <path d="M0 42.5H400M0 85H400M0 127.5H400" />
        </g>
        <path
          d="M20 150 L80 141 L140 127 L200 106 L260 82 L320 52 L380 20"
          className="stroke-primary"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M20 120H380"
          className="stroke-muted-foreground"
          strokeWidth="2"
          strokeDasharray="5 6"
          strokeLinecap="round"
        />
      </svg>
      <dl className="border-border border-t text-sm">
        <div className="flex flex-col gap-1 border-border border-b px-5 py-3.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
          <dt className="font-mono text-muted-foreground text-xs">
            Paid to your provider
          </dt>
          <dd className="text-pretty sm:text-right">The email you send</dd>
        </div>
        <div className="flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
          <dt className="font-mono text-muted-foreground text-xs">
            Paid to OpenCadence
          </dt>
          <dd className="text-pretty sm:text-right">
            Senders, workspaces, and team members
          </dd>
        </div>
      </dl>
    </div>
  );
}

const faqLinkClass = cn(
  "rounded-sm font-medium text-primary underline underline-offset-3 hover:text-brand-hover",
  FOCUS,
);

const faqs: readonly { question: string; answer: React.ReactNode }[] = [
  {
    question: "What counts as a connected mailbox or provider?",
    answer: (
      <p>
        Each Gmail, Outlook, or IMAP/SMTP mailbox you connect counts as one. So
        does each provider account you connect, such as Resend, Amazon SES, or
        SendGrid. A provider account counts once, however many domains you send
        from through it.
      </p>
    ),
  },
  {
    question: "Are contacts really unlimited?",
    answer: (
      <p>
        Yes. Every plan, including Free, holds as many contacts as you import or
        collect, and the price of a plan never depends on the size of your list.
      </p>
    ),
  },
  {
    question: "What do I pay my email provider?",
    answer: (
      <p>
        Whatever your provider charges for the email you send. A Gmail or
        Outlook mailbox sends within the limits of the account you already have.
        Resend, Amazon SES, and SendGrid bill you directly at their own rates.
        OpenCadence adds no fee per email.
      </p>
    ),
  },
  {
    question: "How do I change or cancel my plan?",
    answer: (
      <p>
        Open your workspace settings. You can move to another plan or cancel
        from there at any time.
      </p>
    ),
  },
  {
    question: "Can I host OpenCadence myself?",
    answer: (
      <p>
        Yes. OpenCadence is open source, and you can run it on your own servers.
        The{" "}
        <a
          href={links.selfHost}
          target="_blank"
          rel="noreferrer"
          className={faqLinkClass}
        >
          self-hosting guide
        </a>{" "}
        is on GitHub.
      </p>
    ),
  },
];

function PricingPage() {
  const [billing, setBilling] =
    React.useState<BillingPeriod>(defaultBillingPeriod);

  return (
    <>
      <PageHero
        label="Pricing"
        title="Email software with no per-contact pricing"
        lead="Contacts are unlimited on every plan. You choose a plan by how many mailboxes and providers you connect, how many workspaces you run, and how many people work in them."
      >
        <BillingToggle billing={billing} onChange={setBilling} />
      </PageHero>

      <section aria-labelledby="pricing-plans" className="px-0 sm:px-4">
        <div className="mk-rails">
          <h2 id="pricing-plans" className="sr-only">
            Plans
          </h2>
          <div className="mk-row grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => (
              <PlanColumn key={plan.id} plan={plan} billing={billing} />
            ))}
          </div>
        </div>
      </section>

      <Section>
        <SectionHeading
          title="Compare every plan"
          lead="The sending tools are the same on every plan. The plans differ in how much you connect and how your team works."
        />
        <ComparisonTable />
      </Section>

      <section className="px-0 sm:px-4">
        <div className="mk-rails">
          <div className="mk-row grid lg:grid-cols-[1.05fr_1fr]">
            <div className="min-w-0 border-border px-6 py-16 md:px-10 md:py-24 lg:border-r">
              <SectionHeading
                title="Your list can grow without the bill growing"
                lead="OpenCadence sends through the mailboxes and providers you connect, so the cost of sending stays between you and them."
              />
              <p className="mt-5 max-w-xl text-pretty text-muted-foreground">
                Your plan covers the software: the senders you connect, the
                workspaces you run, and the people on your team. Import another
                ten thousand contacts and the price of your plan stays where it
                was.
              </p>
            </div>
            <div className="mk-hatch flex min-w-0 items-center border-border border-t p-6 md:p-10 lg:border-t-0">
              <GrowthFigure />
            </div>
          </div>
        </div>
      </section>

      <Section>
        <div className="grid gap-10 lg:grid-cols-[1fr_1.35fr] lg:gap-16">
          <SectionHeading title="Pricing questions" className="min-w-0" />
          <Accordion className="min-w-0 border-border border-y">
            {faqs.map((faq) => (
              <AccordionItem key={faq.question} value={faq.question}>
                <AccordionTrigger className="gap-4 rounded-md py-4.5 text-base hover:no-underline">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="max-w-[62ch] pb-5 text-[15px] text-muted-foreground leading-relaxed">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </Section>

      <section className="px-0 sm:px-4">
        <div className="mk-rails">
          <div className="mk-row flex flex-col items-start gap-4 px-6 py-8 sm:flex-row sm:items-center sm:justify-between md:px-10">
            <p className="font-medium text-lg tracking-[-0.01em]">
              Not sure which plan fits?
            </p>
            <Link
              href={links.contact}
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-10 gap-2 bg-card px-4 text-sm shadow-xs",
              )}
            >
              Talk to us
              <ArrowRight aria-hidden="true" strokeWidth={1.75} />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

export { PricingPage };
