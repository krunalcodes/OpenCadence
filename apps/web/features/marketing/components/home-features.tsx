import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { WarmupRamp } from "@/features/marketing/components/deliverability";
import { DomainHealth } from "@/features/marketing/components/deliverability-domain-health";
import { IntegrationsVisual } from "@/features/marketing/components/integrations";
import { NewslettersWorkflow } from "@/features/marketing/components/newsletters";
import {
  Section,
  SectionHeading,
} from "@/features/marketing/components/section";
import {
  SequenceFlow,
  UnifiedInbox,
} from "@/features/marketing/components/sequences";

function MoreLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="group/more mt-8 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 font-medium text-sm shadow-xs outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {label}
      <ArrowRight
        aria-hidden="true"
        className="size-4 transition-transform group-hover/more:translate-x-0.5 motion-reduce:transition-none"
      />
    </Link>
  );
}

function HomeFeatures() {
  return (
    <>
      <NewslettersWorkflow />

      <Section id="sequences">
        <SectionHeading
          align="center"
          title="Follow-ups that stop the moment someone replies"
          lead="Build a sequence with delays and branches, rotate it across your mailboxes inside their daily limits, and read every reply in one inbox."
        />
        <div className="mt-12 min-w-0">
          <SequenceFlow />
        </div>
        <div className="mx-auto mt-6 min-w-0 max-w-xl">
          <UnifiedInbox />
        </div>
        <div className="text-center">
          <MoreLink href="/features/sequences" label="Explore sequences" />
        </div>
      </Section>

      <Section id="deliverability">
        <SectionHeading
          title="Deliverability problems show up where you send, with the fix attached"
          lead="OpenCadence warms up each mailbox, checks SPF, DKIM, and DMARC on every sending domain, and tells you which record to change."
        />
        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <div className="min-w-0">
            <DomainHealth />
          </div>
          <div className="min-w-0">
            <WarmupRamp />
          </div>
        </div>
        <MoreLink
          href="/features/deliverability"
          label="Explore deliverability"
        />
      </Section>

      <Section id="integrations">
        <SectionHeading
          align="center"
          title="Choose where every email goes out from"
          lead="Connect Gmail, Outlook, IMAP/SMTP, Resend, Amazon SES, or SendGrid, then use any mix of them across campaigns and sequences."
        />
        <div className="mt-12 min-w-0">
          <IntegrationsVisual />
        </div>
        <div className="text-center">
          <MoreLink
            href="/features/integrations"
            label="Explore integrations"
          />
        </div>
      </Section>
    </>
  );
}

export { HomeFeatures };
