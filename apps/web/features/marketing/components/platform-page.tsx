import { buttonVariants } from "@workspace/ui/components/button";
import { Kbd, KbdGroup } from "@workspace/ui/components/kbd";
import { cn } from "@workspace/ui/lib/utils";
import { ArrowRight, Command } from "lucide-react";
import Link from "next/link";
import type * as React from "react";

import { links } from "@/features/marketing/lib/links";

import {
  AuditVisual,
  ComplianceVisual,
  LanguageVisual,
  PaletteVisual,
  ReportVisual,
  SignInVisual,
  TeamVisual,
  Visual,
} from "./platform";
import { PageHero, Section, SectionHeading } from "./section";

const H2 =
  "text-balance font-semibold text-3xl tracking-[-0.03em] md:text-[2.5rem] md:leading-[1.08]";
const H2_SMALL =
  "text-balance font-semibold text-2xl tracking-[-0.025em] md:text-[1.75rem] md:leading-[1.15]";
const H3 = "font-semibold text-base tracking-[-0.01em]";
const LEAD = "mt-4 max-w-[52ch] text-pretty text-lg text-muted-foreground";
const BODY = "mt-1.5 text-pretty text-muted-foreground text-sm leading-relaxed";
const CELL = "min-w-0 p-6 md:p-10";

const roles = ["Owner", "Admin", "Editor", "Viewer"];

const workspacePoints = [
  {
    title: "One workspace per client or brand",
    body: "Create a workspace for each client or brand you send for. Each one has its own members, so a client's team sees only its own account.",
  },
  {
    title: "Switch from a searchable list",
    body: "Open the switcher, type a few letters of the name, and you are working in that workspace.",
  },
];

const signInPoints = [
  {
    title: "Single sign-on",
    tag: "OIDC",
    body: "Connect an OpenID Connect identity provider in workspace settings, and members sign in through it.",
  },
  {
    title: "Two-factor authentication",
    tag: "2FA",
    body: "Require two-factor for every member of a workspace and see who has enrolled and who is still pending.",
  },
];

const auditPoints = [
  "Campaigns and sequences scheduled or sent",
  "Mailboxes connected and API keys created",
  "Roles changed and contacts exported",
];

const reportTypes = [
  {
    title: "Overview",
    body: "Sends, opens, clicks, and bounces across the whole workspace.",
  },
  {
    title: "Per campaign",
    body: "Open any campaign to see its own opens, clicks, and bounces.",
  },
  {
    title: "Per sequence",
    body: "The same numbers for every outreach sequence you run.",
  },
  {
    title: "Deliverability trends",
    body: "Delivery and bounce rates by day, so a bad day stands out.",
  },
];

const csvLines = [
  "campaign,sent,opens,clicks,bounces",
  "Weekly digest,12480,6564,1136,237",
  "Webinar invite,8210,4022,901,96",
  "October product update,11904,5870,1248,143",
];

const compliancePoints = [
  {
    title: "Consent records",
    body: "Each contact carries where they signed up, when they gave consent, and when they confirmed.",
  },
  {
    title: "Data export and erasure",
    body: "Answer a privacy request from the contact record. One button exports a person's data and another erases it.",
  },
  {
    title: "One-click unsubscribe headers",
    body: "Every campaign and sequence email carries List-Unsubscribe headers, so mail apps show their own unsubscribe button.",
  },
  {
    title: "Suppression that stays on",
    body: "The suppression list is checked on every send path, and it cannot be turned off.",
  },
];

const worksWith = [
  {
    href: "/features/transactional",
    title: "Transactional API",
    body: "Send receipts and password resets from your own app with a workspace API key.",
  },
  {
    href: links.pricing,
    title: "Pricing",
    body: "Plans are not priced per contact. Start for free and bring your team.",
  },
];

function Bleed({
  flush = "bottom",
  className,
  children,
}: {
  flush?: "bottom" | "all";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "-mx-6 md:-mx-10",
        flush === "all"
          ? "-my-16 md:-my-24"
          : "-mb-16 mt-12 border-border border-t md:-mb-24 md:mt-14",
        className,
      )}
    >
      {children}
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground leading-none">
      {children}
    </span>
  );
}

function PlatformPage() {
  return (
    <>
      <PageHero
        label="Teams and security"
        title="Run email as a team, with the controls a team needs."
        lead="Give every client or brand its own workspace and every teammate a role. Single sign-on, two-factor authentication, the audit log, reports, and consent records are in the same app you send from."
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
            <ArrowRight aria-hidden="true" strokeWidth={1.75} />
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

      <Section id="workspaces">
        <SectionHeading
          title="A separate workspace for every client or brand."
          lead="Agencies and multi-brand teams keep each account apart. You invite the people who work on it, give each of them a role, and move between workspaces from one list."
        />
        <Bleed className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Visual>
            <TeamVisual />
          </Visual>
          <div className="min-w-0 divide-y divide-border border-border border-t lg:border-t-0 lg:border-l">
            {workspacePoints.map((point) => (
              <div key={point.title} className="p-6 md:px-8 md:py-7">
                <h3 className={H3}>{point.title}</h3>
                <p className={BODY}>{point.body}</p>
              </div>
            ))}
            <div className="p-6 md:px-8 md:py-7">
              <h3 className={H3}>A role for every member</h3>
              <p className={BODY}>
                Set what each teammate can do when you invite them, and change
                it later from the members table.
              </p>
              <ul className="mt-4 flex flex-wrap gap-1.5">
                {roles.map((role) => (
                  <li key={role}>
                    <Tag>{role}</Tag>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Bleed>
      </Section>

      <Section id="sign-in">
        <Bleed
          flush="all"
          className="grid lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]"
        >
          <div className="flex min-w-0 flex-col">
            <div className="px-6 py-14 md:px-10 md:py-20">
              <h2 className={H2}>
                Your team signs in the way your company already does.
              </h2>
              <p className={LEAD}>
                Connect your identity provider for single sign-on, and require
                two-factor authentication across the workspace.
              </p>
            </div>
            <div className="mt-auto grid divide-y divide-border border-border border-t sm:grid-cols-2 sm:divide-x sm:divide-y-0">
              {signInPoints.map((point) => (
                <div key={point.title} className="min-w-0 p-6 md:p-8">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className={H3}>{point.title}</h3>
                    <Tag>{point.tag}</Tag>
                  </div>
                  <p className={BODY}>{point.body}</p>
                </div>
              ))}
            </div>
          </div>
          <div
            className={cn(
              CELL,
              "mk-hatch flex items-center border-border border-t lg:border-t-0 lg:border-l",
            )}
          >
            <Visual className="mx-auto w-full max-w-md border border-border">
              <SignInVisual />
            </Visual>
          </div>
        </Bleed>
      </Section>

      <Section id="audit-log">
        <Bleed
          flush="all"
          className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]"
        >
          <div
            className={cn(
              CELL,
              "mk-hatch order-2 flex items-center border-border border-t lg:order-1 lg:border-t-0 lg:border-r",
            )}
          >
            <Visual className="mx-auto w-full max-w-lg border border-border">
              <AuditVisual />
            </Visual>
          </div>
          <div className="order-1 flex min-w-0 flex-col lg:order-2">
            <div className="px-6 py-14 md:px-10 md:py-20">
              <h2 className={H2}>A record of who changed or sent what.</h2>
              <p className={LEAD}>
                Every change and every send goes into the audit log with the
                member's name and the time. Filter by member or by date to find
                a single action.
              </p>
            </div>
            <ul className="mt-auto divide-y divide-border border-border border-t">
              {auditPoints.map((point) => (
                <li
                  key={point}
                  className="flex items-center gap-3 px-6 py-3.5 text-sm md:px-10"
                >
                  <span
                    aria-hidden="true"
                    className="size-[7px] shrink-0 border border-primary"
                  />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </Bleed>
      </Section>

      <Section id="reports">
        <SectionHeading
          title="Dashboards and reports you can export."
          lead="Start at the overview dashboard, then open any campaign or sequence for its own numbers. Deliverability trends show how delivery moves from day to day."
        />
        <Bleed>
          <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
            {reportTypes.map((report) => (
              <div
                key={report.title}
                className="min-w-0 bg-background p-6 md:px-8"
              >
                <h3 className={H3}>{report.title}</h3>
                <p className={BODY}>{report.body}</p>
              </div>
            ))}
          </div>
          <div className="grid border-border border-t lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <Visual>
              <ReportVisual />
            </Visual>
            <div className="mk-hatch flex min-w-0 flex-col border-border border-t lg:border-t-0 lg:border-l">
              <div className="bg-background p-6 md:px-8 md:py-7">
                <h3 className={H3}>CSV export on every report</h3>
                <p className={BODY}>
                  Export the view you are looking at and open it in a
                  spreadsheet or load it into your own tools.
                </p>
              </div>
              <div
                aria-hidden="true"
                className="m-6 mt-auto border border-border bg-card md:m-8 md:mt-auto"
              >
                <div className="border-border-subtle border-b px-3.5 py-2 font-mono text-[11px] text-muted-foreground">
                  campaigns-2026-10-11.csv
                </div>
                <pre className="overflow-x-auto px-3.5 py-3 font-mono text-[12px] leading-relaxed">
                  {csvLines.map((line, index) => (
                    <span
                      key={line}
                      className={cn(
                        "block",
                        index === 0 && "text-muted-foreground",
                      )}
                    >
                      {line}
                    </span>
                  ))}
                </pre>
              </div>
            </div>
          </div>
        </Bleed>
      </Section>

      <Section id="compliance">
        <Bleed
          flush="all"
          className="grid xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
        >
          <div className="flex min-w-0 flex-col">
            <div className="px-6 py-14 md:px-10 md:py-16">
              <h2 className={H2}>
                Consent, erasure, and unsubscribes are part of sending.
              </h2>
              <p className={LEAD}>
                The records a privacy request asks for sit on the contact, and
                unsubscribe handling runs on every email you send.
              </p>
            </div>
            <div className="mt-auto grid gap-px border-border border-t bg-border sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-2">
              {compliancePoints.map((point) => (
                <div key={point.title} className="min-w-0 bg-background p-6">
                  <h3 className={H3}>{point.title}</h3>
                  <p className={BODY}>{point.body}</p>
                </div>
              ))}
            </div>
          </div>
          <Visual className="border-border border-t xl:border-t-0 xl:border-l">
            <ComplianceVisual />
          </Visual>
        </Bleed>
      </Section>

      <Section id="languages-and-keyboard">
        <Bleed flush="all">
          <div className="grid lg:grid-cols-2">
            <div className="flex min-w-0 flex-col">
              <div className={CELL}>
                <h2 className={H2_SMALL}>
                  In your language, and your subscribers'.
                </h2>
                <p className="mt-3 max-w-[48ch] text-pretty text-muted-foreground">
                  Each member picks the language of the app. Your public
                  subscription pages are translated too, so subscribers read
                  them in their own language.
                </p>
              </div>
              <Visual className="flex-1 border-border border-t">
                <LanguageVisual />
              </Visual>
            </div>
            <div className="flex min-w-0 flex-col border-border border-t lg:border-t-0 lg:border-l">
              <div className={CELL}>
                <h2 className={H2_SMALL}>
                  Frequent actions from the keyboard.
                </h2>
                <p className="mt-3 max-w-[48ch] text-pretty text-muted-foreground">
                  Open the command palette on any screen, type a few letters,
                  and start a campaign or jump to another page.
                </p>
                <p className="mt-4 flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
                  <KbdGroup>
                    <Kbd className="border border-border bg-card">
                      <Command aria-hidden="true" />
                      <span className="sr-only">Command</span>
                    </Kbd>
                    <Kbd className="border border-border bg-card">K</Kbd>
                  </KbdGroup>
                  opens the palette, and common actions have their own keys.
                </p>
              </div>
              <div
                aria-hidden="true"
                className="mk-hatch flex flex-1 select-none items-center border-border border-t p-6 md:p-10"
              >
                <PaletteVisual />
              </div>
            </div>
          </div>
          <p className="border-border border-t px-6 py-3 font-mono text-[11px] text-muted-foreground md:px-10">
            All names and figures in the product views on this page are sample
            data.
          </p>
        </Bleed>
      </Section>

      <Section id="works-with">
        <Bleed
          flush="all"
          className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]"
        >
          <div className="min-w-0 p-6 md:p-10">
            <h2 className={H2_SMALL}>Works with</h2>
            <p className="mt-3 max-w-[40ch] text-pretty text-muted-foreground">
              Workspaces and roles cover everything you send, including mail
              from your own app.
            </p>
          </div>
          {worksWith.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group flex min-w-0 flex-col border-border border-t p-6 outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset md:p-10 lg:border-t-0 lg:border-l"
            >
              <span className="flex items-center justify-between gap-3">
                <span className="font-semibold text-lg tracking-[-0.015em]">
                  {item.title}
                </span>
                <ArrowRight
                  aria-hidden="true"
                  size={18}
                  strokeWidth={1.6}
                  className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary motion-reduce:transition-none"
                />
              </span>
              <span className={BODY}>{item.body}</span>
            </Link>
          ))}
        </Bleed>
      </Section>
    </>
  );
}

export { PlatformPage };
