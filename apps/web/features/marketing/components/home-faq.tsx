import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type * as React from "react";

import { links } from "@/features/marketing/lib/links";

import { Section, SectionHeading } from "./section";

const questions: {
  id: string;
  question: string;
  answer: React.ReactNode;
}[] = [
  {
    id: "sending",
    question: "How does OpenCadence send my email?",
    answer: (
      <p>
        After you sign up, you connect your own mailboxes (Gmail, Outlook, or
        any IMAP/SMTP account) or your own providers (Resend, Amazon SES, or
        SendGrid). OpenCadence sends every message through them, so your sender
        reputation stays with your domain and your accounts.
      </p>
    ),
  },
  {
    id: "pricing",
    question: "How is it priced?",
    answer: (
      <p>
        Pricing is not per contact, so your bill does not rise because your list
        grew. You pay your email provider directly for the sending itself. The{" "}
        <Link href={links.pricing}>pricing page</Link> has the plan details.
      </p>
    ),
  },
  {
    id: "one-list",
    question: "Can I run newsletters and outreach from the same account?",
    answer: (
      <p>
        Yes. Newsletters, outreach sequences, and transactional email share one
        contact list and one suppression list. A contact on the suppression list
        is skipped by all three.
      </p>
    ),
  },
  {
    id: "deliverability",
    question: "How does it help my email reach the inbox?",
    answer: (
      <p>
        Warm-up raises the sending volume of each mailbox gradually. OpenCadence
        also checks the SPF, DKIM, and DMARC records on your domains and shows
        you the exact record to fix when one is wrong.
      </p>
    ),
  },
  {
    id: "import",
    question: "Can I bring my contacts with me, and take them out again?",
    answer: (
      <p>
        You can import contacts from a CSV file or from the tool you use today.
        You can export them to CSV at any time.
      </p>
    ),
  },
  {
    id: "teams",
    question: "Does it work for a team or an agency?",
    answer: (
      <p>
        Yes. You can keep separate workspaces and give each member a role.
        Sign-in supports single sign-on through OIDC and two-factor
        authentication, and the audit log records who did what.
      </p>
    ),
  },
  {
    id: "compliance",
    question: "How are unsubscribes and privacy requests handled?",
    answer: (
      <p>
        Unsubscribe handling and suppression apply to every send and cannot be
        turned off, and campaigns carry one-click List-Unsubscribe headers.
        OpenCadence keeps consent records and handles data export and erasure
        requests. You remain responsible for following the email laws that apply
        to you.
      </p>
    ),
  },
  {
    id: "self-host",
    question: "Can I run it on my own servers?",
    answer: (
      <p>
        Yes. OpenCadence is open source, so you can run it on your own servers
        in place of the hosted product. The{" "}
        <a href={links.selfHost} rel="noreferrer">
          setup guide
        </a>{" "}
        is in the repository.
      </p>
    ),
  },
];

function HomeFaq() {
  return (
    <Section id="faq">
      <div className="grid gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="min-w-0 lg:sticky lg:top-28 lg:self-start">
          <SectionHeading
            title="Questions before you sign up"
            lead="Short answers about sending, pricing, your team, and your data."
          />
          <p className="mt-6 text-muted-foreground">
            Something else?{" "}
            <Link
              href={links.contact}
              className="group/talk inline-flex items-center gap-1 rounded-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Talk to us
              <ArrowRight
                aria-hidden="true"
                size={16}
                strokeWidth={1.6}
                className="transition-transform group-hover/talk:translate-x-0.5 motion-reduce:transition-none"
              />
            </Link>
          </p>
        </div>
        <Accordion
          defaultValue={["sending"]}
          className="min-w-0 border-border border-t motion-reduce:**:data-[slot=accordion-content]:animate-none!"
        >
          {questions.map((item, index) => (
            <AccordionItem
              key={item.id}
              value={item.id}
              className="border-border border-b"
            >
              <AccordionTrigger className="items-baseline gap-4 py-5 text-base hover:text-primary hover:no-underline md:text-lg">
                <span
                  aria-hidden="true"
                  className="w-6 shrink-0 font-mono font-normal text-muted-foreground text-xs tabular-nums"
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 text-pretty">{item.question}</span>
              </AccordionTrigger>
              <AccordionContent className="max-w-[62ch] pr-6 pb-6 pl-10 text-base text-muted-foreground [&_a]:font-medium [&_a]:text-primary">
                {item.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </Section>
  );
}

export { HomeFaq };
