import { buttonVariants } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import {
  DnsRecords,
  HealthTable,
  RateLimits,
  SuppressionLog,
  TrackingDomains,
  WarmupRamp,
} from "@/features/marketing/components/deliverability";
import { DomainHealth } from "@/features/marketing/components/deliverability-domain-health";
import {
  PageHero,
  Section,
  SectionHeading,
} from "@/features/marketing/components/section";
import { features } from "@/features/marketing/lib/features";
import { links } from "@/features/marketing/lib/links";

const h2 =
  "text-balance font-semibold text-3xl tracking-[-0.03em] md:text-[2.5rem] md:leading-[1.08]";
const lead = "text-pretty text-lg text-muted-foreground";
const mono = "font-mono text-muted-foreground text-xs";

const fixSteps = [
  {
    title: "A check fails",
    body: "OpenCadence rechecks SPF, DKIM, and DMARC on every sending domain. A missing or changed record turns the domain red and raises an alert.",
  },
  {
    title: "The affected sends pause",
    body: "Mailboxes on that domain stop sending until the record is right. Every other mailbox and provider keeps going.",
  },
  {
    title: "The fix is on the row",
    body: "Open the failing check to see the record name and value. Copy both into your DNS host.",
  },
  {
    title: "You check again",
    body: "Run the check from the same row. Sending resumes once the record resolves.",
  },
];

const healthPoints = [
  {
    term: "Mailboxes",
    detail: "Sent against today's limit, and whether warm-up is on track.",
  },
  {
    term: "Providers",
    detail: "Volume against the daily cap, with bounce and complaint days.",
  },
  {
    term: "Domains",
    detail: "How many of the three DNS checks pass right now.",
  },
];

const suppressionPoints = [
  {
    term: "Hard bounce",
    detail: "The address does not exist. It is suppressed on the first one.",
  },
  {
    term: "Spam complaint",
    detail: "The recipient reported the email. They are never sent to again.",
  },
  {
    term: "Unsubscribe",
    detail: "One click in any email removes them from every later send.",
  },
];

const worksWith = ["integrations", "sequences"].flatMap((slug) => {
  const feature = features.find((item) => item.slug === slug);
  return feature ? [feature] : [];
});

const worksWithCopy: Record<string, string> = {
  integrations:
    "Connect Gmail, Outlook, IMAP/SMTP, Resend, Amazon SES, or SendGrid. Each one gets its own health and limits.",
  sequences:
    "Outreach steps send only from mailboxes that are healthy and under their limit.",
};

function DeliverabilityPage() {
  return (
    <>
      <PageHero
        label="Deliverability"
        title="Deliverability problems surface where you send, with the fix attached"
        lead="OpenCadence warms up each mailbox, checks SPF, DKIM, and DMARC on every sending domain, and keeps 14 days of health beside each sender. When something breaks, you see what to change and where."
      >
        <div className="flex flex-wrap gap-2.5">
          <Link
            href={links.signUp}
            className={cn(
              buttonVariants({ size: "lg" }),
              "h-11 gap-2 px-4.5 text-[15px] hover:bg-brand-hover",
            )}
          >
            Start for free
            <ArrowRight aria-hidden strokeWidth={1.75} />
          </Link>
          <Link
            href={links.demo}
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "h-11 bg-card px-4.5 text-[15px] shadow-xs",
            )}
          >
            Book a demo
          </Link>
        </div>
      </PageHero>

      <Section id="domain-health">
        <SectionHeading
          title="A failing record stops the send and shows you the fix"
          lead="Each sending domain has one panel with its three DNS checks. The alert names the mailbox it paused, and the failing row opens to the record you need to add."
        />
        <div className="mt-12 grid items-start gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <DomainHealth />
          <ol className="min-w-0 border-border border-t">
            {fixSteps.map((step, index) => (
              <li
                key={step.title}
                className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 border-border border-b py-5"
              >
                <span aria-hidden className={cn(mono, "pt-1 tabular-nums")}>
                  0{index + 1}
                </span>
                <div>
                  <h3 className="font-semibold text-base tracking-[-0.01em]">
                    {step.title}
                  </h3>
                  <p className="mt-1.5 text-[15px] text-muted-foreground">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Section>

      <Section id="warm-up">
        <div className="grid items-end gap-x-12 gap-y-4 lg:grid-cols-2">
          <h2 className={cn(h2, "min-w-0")}>
            Inbox warm-up that ramps each mailbox gradually
          </h2>
          <p className={cn(lead, "min-w-0")}>
            A new mailbox starts at 5 emails a day and adds a couple more each
            day, reaching 30 a day in two weeks. Each mailbox follows its own
            ramp, so the one you added last week never sends at the volume of
            the one you added last month.
          </p>
        </div>
        <div className="mt-12">
          <WarmupRamp />
        </div>
        <p className={cn(mono, "mt-3")}>
          A mailbox with a failing check holds its place on the ramp until the
          check passes.
        </p>
      </Section>

      <Section id="health">
        <div className="grid items-start gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)]">
          <div className="min-w-0 lg:sticky lg:top-28">
            <h2 className={h2}>
              Health for every mailbox, provider, and domain
            </h2>
            <p className={cn(lead, "mt-4")}>
              The last 14 days sit beside each sender in the place you pick it,
              so you see a bad week before you schedule the next send.
            </p>
            <dl className="mt-8 border-border border-t text-[15px]">
              {healthPoints.map((point) => (
                <div
                  key={point.term}
                  className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 border-border border-b py-3"
                >
                  <dt className="font-medium">{point.term}</dt>
                  <dd className="text-muted-foreground">{point.detail}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="min-w-0">
            <HealthTable />
          </div>
        </div>
      </Section>

      <Section id="dns-checks">
        <SectionHeading
          align="center"
          title="SPF, DKIM, and DMARC checks with the exact record to add"
          lead="Add a sending domain and OpenCadence runs all three checks, then keeps running them. Each result comes with the TXT name and value, ready to paste into your DNS host."
        />
        <div className="mt-12">
          <DnsRecords />
        </div>
      </Section>

      <Section id="suppression">
        <div className="grid items-center gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="order-2 min-w-0 lg:order-1">
            <SuppressionLog />
          </div>
          <div className="order-1 min-w-0 lg:order-2">
            <h2 className={h2}>Bounces and complaints suppress themselves</h2>
            <p className={cn(lead, "mt-4")}>
              OpenCadence reads bounce and complaint events from your mailboxes
              and providers and adds the address to your suppression list
              automatically. Newsletters and sequences share that list, so every
              later send skips it.
            </p>
            <dl className="mt-8 border-border border-t text-[15px]">
              {suppressionPoints.map((point) => (
                <div
                  key={point.term}
                  className="grid gap-x-3 gap-y-0.5 border-border border-b py-3 sm:grid-cols-[8.5rem_minmax(0,1fr)]"
                >
                  <dt className="font-medium">{point.term}</dt>
                  <dd className="text-muted-foreground">{point.detail}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </Section>

      <Section id="rate-limits">
        <SectionHeading
          title="Rate limits for each provider and each domain"
          lead="Set a daily cap on every provider and every sending domain. The count sits next to the limit, so you know how much room is left before you schedule, and sends that would go over wait for the next day."
        />
        <div className="mt-12">
          <RateLimits />
        </div>
      </Section>

      <Section id="tracking-domains">
        <div className="grid items-center gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <div className="min-w-0">
            <h2 className={h2}>Tracking links on your own domain</h2>
            <p className={cn(lead, "mt-4")}>
              Point one CNAME at OpenCadence and open, click, and unsubscribe
              links all run through a subdomain you control. Recipients and spam
              filters see your domain in every link.
            </p>
            <p className={cn(mono, "mt-6")}>
              One tracking domain per sending domain, verified before first use.
            </p>
          </div>
          <div className="min-w-0">
            <TrackingDomains />
          </div>
        </div>
      </Section>

      <section aria-labelledby="works-with" className="px-0 sm:px-4">
        <div className="mk-rails">
          <div className="mk-row grid md:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <div className="mk-hatch flex min-w-0 items-center px-6 py-6 md:px-10">
              <h2
                id="works-with"
                className="flex items-center gap-2 font-mono font-normal text-primary text-xs"
              >
                <span
                  aria-hidden
                  className="size-[7px] border border-primary bg-live"
                />
                Works with
              </h2>
            </div>
            {worksWith.map((feature) => (
              <Link
                key={feature.slug}
                href={feature.href}
                className="group min-w-0 border-border border-t px-6 py-6 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset md:border-t-0 md:border-l md:px-8"
              >
                <span className="flex items-center justify-between gap-3 font-semibold text-base tracking-[-0.01em]">
                  {feature.title}
                  <ArrowRight
                    aria-hidden
                    size={16}
                    strokeWidth={1.75}
                    className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                  />
                </span>
                <span className="mt-1.5 block text-[15px] text-muted-foreground">
                  {worksWithCopy[feature.slug]}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

export { DeliverabilityPage };
