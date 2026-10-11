import { buttonVariants } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import {
  ArrowRight,
  ArrowUpRight,
  AtSign,
  Cloud,
  Inbox,
  KeyRound,
  Layers,
  Lock,
  type LucideIcon,
  Mail,
  Newspaper,
  Plug,
  Send,
  Server,
  Webhook,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { links } from "@/features/marketing/lib/links";
import { AdapterSnippet, IntegrationsVisual } from "./integrations";
import { PageHero, Section, SectionHeading } from "./section";

type DirectoryItem = {
  name: string;
  icon: LucideIcon;
  body: string;
  capabilities: string[];
};

type DirectoryGroup = {
  label: string;
  count: string;
  summary: string;
  items: DirectoryItem[];
  filler: string;
};

const directory: DirectoryGroup[] = [
  {
    label: "Mailboxes",
    count: "01",
    summary:
      "Real inboxes for one-to-one email. They send your sequences, catch the replies, and run warm-up.",
    filler: "hidden sm:block",
    items: [
      {
        name: "Gmail",
        icon: Mail,
        body: "Personal Gmail and Google Workspace addresses.",
        capabilities: ["send", "receive replies", "warm-up"],
      },
      {
        name: "Outlook",
        icon: Inbox,
        body: "Outlook and Microsoft 365 mailboxes.",
        capabilities: ["send", "receive replies", "warm-up"],
      },
      {
        name: "IMAP/SMTP",
        icon: AtSign,
        body: "Any other mailbox, connected with a host, a port, and a login.",
        capabilities: ["send", "receive replies", "warm-up"],
      },
    ],
  },
  {
    label: "Email providers",
    count: "02",
    summary:
      "Sending services built for volume. Use them for newsletters, large campaigns, and transactional email.",
    filler: "hidden",
    items: [
      {
        name: "Resend",
        icon: Send,
        body: "Paste an API key and send from your verified domain.",
        capabilities: ["send"],
      },
      {
        name: "Amazon SES",
        icon: Cloud,
        body: "Send through your own AWS account in the region you choose.",
        capabilities: ["send"],
      },
      {
        name: "SendGrid",
        icon: Layers,
        body: "Connect with an API key and test it before you save.",
        capabilities: ["send"],
      },
      {
        name: "Other transactional providers",
        icon: Plug,
        body: "Any provider that gives you an API key or SMTP login.",
        capabilities: ["send"],
      },
    ],
  },
  {
    label: "Other",
    count: "03",
    summary:
      "Your own mail server, and channels beyond email for the same campaigns.",
    filler: "hidden xl:block xl:col-span-2",
    items: [
      {
        name: "Generic SMTP",
        icon: Server,
        body: "A relay or server that speaks SMTP, such as the one your office already runs.",
        capabilities: ["send"],
      },
      {
        name: "Custom channel webhooks",
        icon: Webhook,
        body: "Deliver a step as SMS, WhatsApp, or a call to any HTTP endpoint.",
        capabilities: ["send", "sms", "whatsapp", "http"],
      },
    ],
  },
];

const rotation = [
  { address: "maya@northwind.studio", sent: "38 / 80", next: true },
  { address: "sam@northwind.studio", sent: "71 / 80", next: false },
  { address: "priya@northwind.studio", sent: "24 / 80", next: false },
];

const storedKeys = [
  {
    name: "SendGrid API key",
    value: "SG.••••••••••••x9Qm",
    saved: "Saved 2 Oct",
  },
  {
    name: "Amazon SES secret key",
    value: "••••••••••••••••Hq2T",
    saved: "Saved 14 Sep",
  },
  {
    name: "hello@northwind.studio password",
    value: "••••••••••••••••",
    saved: "Saved 3 Aug",
  },
];

const credentialFacts = [
  {
    term: "Encrypted at rest",
    body: "Every API key and mailbox password is encrypted before it is stored.",
  },
  {
    term: "Never shown again",
    body: "Once you save a credential, the app shows only a masked value. Nobody on your team can read it back.",
  },
  {
    term: "Tested before it is saved",
    body: "Test connection sends a real email through the source, so you know the key works before a campaign depends on it.",
  },
];

const related = [
  {
    href: "/features/deliverability",
    label: "Deliverability",
    body: "Warm up each connected mailbox and check DNS and health for every sender.",
  },
  {
    href: "/features/transactional",
    label: "Transactional API",
    body: "Send receipts and password resets through the same connected providers.",
  },
];

const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

function MonoLabel({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-muted-foreground text-xs">{children}</p>;
}

function Directory() {
  return (
    <div className="mt-12 border-border border-t md:mt-14">
      {directory.map((group) => (
        <div
          key={group.label}
          className="grid border-border border-b lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)]"
        >
          <div className="min-w-0 py-6 lg:py-7 lg:pr-8">
            <MonoLabel>{group.count}</MonoLabel>
            <h3 className="mt-2 font-semibold text-xl tracking-[-0.02em]">
              {group.label}
            </h3>
            <p className="mt-2 text-muted-foreground text-sm">
              {group.summary}
            </p>
          </div>
          <ul className="-mb-px grid min-w-0 border-border border-t border-l sm:grid-cols-2 lg:border-t-0 xl:grid-cols-4">
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <li
                  key={item.name}
                  className="flex min-w-0 flex-col border-border border-r border-b p-5"
                >
                  <Icon
                    aria-hidden="true"
                    className="text-primary"
                    size={20}
                    strokeWidth={1.6}
                  />
                  <p className="mt-4 font-medium">{item.name}</p>
                  <p className="mt-1 text-muted-foreground text-sm">
                    {item.body}
                  </p>
                  <p className="mt-auto pt-4 font-mono text-[11px] text-muted-foreground leading-relaxed">
                    {item.capabilities.join(" · ")}
                  </p>
                </li>
              );
            })}
            <li
              aria-hidden="true"
              className={cn(
                "mk-hatch border-border border-r border-b",
                group.filler,
              )}
            />
          </ul>
        </div>
      ))}
    </div>
  );
}

function RouteHead({
  icon: Icon,
  kind,
  name,
  detail,
}: {
  icon: LucideIcon;
  kind: string;
  name: string;
  detail: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
        <Icon aria-hidden="true" size={14} strokeWidth={1.6} />
        {kind}
      </div>
      <div className="mt-1.5 truncate font-medium">{name}</div>
      <div className="truncate text-muted-foreground text-xs tabular-nums">
        {detail}
      </div>
    </div>
  );
}

function Connector() {
  return (
    <span
      aria-hidden="true"
      className="hidden h-px w-full bg-border sm:block"
    />
  );
}

function RoutingVisual() {
  return (
    <figure className="min-w-0">
      <div className="mk-hatch border border-border p-4 text-[13px] sm:p-6">
        <div className="grid items-center gap-y-2 sm:grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)]">
          <RouteHead
            icon={Newspaper}
            kind="newsletter"
            name="October product update"
            detail="18,240 recipients"
          />
          <Connector />
          <div className="ml-4 flex min-w-0 items-center gap-2.5 rounded-lg border border-border bg-card p-3 sm:ml-0">
            <Cloud
              aria-hidden="true"
              className="shrink-0 text-muted-foreground"
              size={16}
              strokeWidth={1.6}
            />
            <div className="min-w-0">
              <div className="truncate font-medium">Amazon SES</div>
              <div className="truncate text-muted-foreground text-xs">
                us-east-1
              </div>
            </div>
            <span className="ml-auto inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-md bg-live px-2 font-medium text-live-foreground text-xs">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-current motion-safe:animate-pulse"
              />
              Sending
            </span>
          </div>
        </div>
        <div className="my-5 border-border border-t border-dashed" />
        <div className="grid items-center gap-y-2 sm:grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)]">
          <RouteHead
            icon={Workflow}
            kind="sequence"
            name="Agency outreach"
            detail="Step 2 of 4, follow-up"
          />
          <Connector />
          <ul className="ml-4 min-w-0 border-border border-l sm:ml-0">
            {rotation.map((mailbox) => (
              <li
                key={mailbox.address}
                className="flex min-w-0 items-center py-1"
              >
                <span
                  aria-hidden="true"
                  className="h-px w-3 shrink-0 bg-border"
                />
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2">
                  <Mail
                    aria-hidden="true"
                    className="shrink-0 text-muted-foreground"
                    size={16}
                    strokeWidth={1.6}
                  />
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {mailbox.address}
                    </div>
                    <div className="truncate font-mono text-[11px] text-muted-foreground tabular-nums">
                      {mailbox.sent} today
                      {mailbox.next ? ", sends next" : ""}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <figcaption className="mt-3 text-muted-foreground text-xs">
        Two sends running in one workspace, each through its own sources. Sample
        data.
      </figcaption>
    </figure>
  );
}

function StoredKeys() {
  return (
    <div
      aria-hidden="true"
      className="min-w-0 overflow-hidden rounded-xl border border-border bg-card text-[13px] shadow-xs"
    >
      <div className="flex items-center gap-2 border-border-subtle border-b px-4 py-3">
        <KeyRound
          className="shrink-0 text-muted-foreground"
          size={16}
          strokeWidth={1.6}
        />
        <span className="font-semibold text-sm tracking-[-0.005em]">
          Saved credentials
        </span>
      </div>
      <ul className="divide-y divide-border-subtle">
        {storedKeys.map((key) => (
          <li
            key={key.name}
            className="grid gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
          >
            <div className="min-w-0">
              <div className="truncate font-medium">{key.name}</div>
              <div className="truncate text-muted-foreground text-xs">
                {key.saved}
              </div>
            </div>
            <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-muted/50 px-2.5 py-1.5">
              <Lock
                className="shrink-0 text-muted-foreground"
                size={14}
                strokeWidth={1.6}
              />
              <span className="truncate font-mono text-xs">{key.value}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function IntegrationsPage() {
  return (
    <>
      <PageHero
        label="Integrations"
        title="Choose where every email goes out from"
        lead="Connect the mailboxes and email providers you already use, then pick the sender for each campaign and sequence. You keep your own sender reputation and pay your provider's rate."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={links.signUp}
            className={cn(
              buttonVariants({ size: "lg" }),
              "h-11 gap-2 px-4.5 text-[15px] hover:bg-brand-hover",
            )}
          >
            Start for free
            <ArrowRight aria-hidden="true" />
          </Link>
          <Link
            href={links.demo}
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "h-11 px-4.5 text-[15px]",
            )}
          >
            Book a demo
          </Link>
        </div>
      </PageHero>

      <Section id="connected-sources">
        <SectionHeading
          title="Every sender in your workspace on one page"
          lead="Each connected source shows what it can do, how much of today's limit it has used, and whether it is healthy. To add one, search the list, paste a key, and test the connection."
        />
        <div className="mt-12 md:mt-14">
          <IntegrationsVisual />
        </div>
      </Section>

      <Section id="directory">
        <SectionHeading
          title="What you can connect"
          lead="Three kinds of source cover one-to-one email, high-volume sends, and channels beyond email."
        />
        <Directory />
      </Section>

      <Section id="mixing">
        <div className="grid items-center gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <div className="min-w-0">
            <SectionHeading
              title="Use a different source for every send"
              lead="A newsletter goes out through Amazon SES while a sequence rotates its follow-ups across three Gmail mailboxes. Both run in the same workspace at the same time."
            />
            <dl className="mt-8 border-border border-b">
              <div className="grid gap-x-6 gap-y-1 border-border border-t py-4 sm:grid-cols-[140px_minmax(0,1fr)]">
                <dt className="font-medium">Per send</dt>
                <dd className="text-muted-foreground">
                  Choose the source when you set up a campaign or a sequence.
                </dd>
              </div>
              <div className="grid gap-x-6 gap-y-1 border-border border-t py-4 sm:grid-cols-[140px_minmax(0,1fr)]">
                <dt className="font-medium">Rotation</dt>
                <dd className="text-muted-foreground">
                  Give a sequence several mailboxes and it spreads sends across
                  them, inside each mailbox's daily limit.
                </dd>
              </div>
            </dl>
          </div>
          <RoutingVisual />
        </div>
      </Section>

      <Section id="credentials">
        <div className="grid gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
          <div className="order-2 min-w-0 lg:order-1">
            <StoredKeys />
            <p className="mt-3 text-muted-foreground text-xs">
              Saved keys and passwords stay masked. Sample data.
            </p>
          </div>
          <div className="order-1 min-w-0 lg:order-2">
            <SectionHeading
              title="Keys are encrypted and never shown again"
              lead="The credentials you connect can send email as you, so the app locks them away the moment you save."
            />
            <ol className="mt-8 border-border border-b">
              {credentialFacts.map((fact, index) => (
                <li
                  key={fact.term}
                  className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 border-border border-t py-4"
                >
                  <span
                    aria-hidden="true"
                    className="pt-0.5 font-mono text-muted-foreground text-xs"
                  >
                    0{index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium">{fact.term}</p>
                    <p className="mt-1 text-muted-foreground">{fact.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Section>

      <Section id="adapter">
        <div className="grid gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <div className="min-w-0">
            <SectionHeading
              title="Need one that is not listed?"
              lead="An integration is one small open-source package. Every source implements the same adapter interface: an id, a list of capabilities, and a send function. Write the adapter you need and it appears in the source picker beside the built-in ones."
            />
            <a
              href={links.github}
              className={cn(
                "mt-6 inline-flex items-center gap-1 rounded-sm font-medium text-primary text-sm underline-offset-4 hover:underline",
                focusRing,
              )}
            >
              Read the adapter source on GitHub
              <ArrowUpRight aria-hidden="true" size={16} strokeWidth={1.75} />
            </a>
          </div>
          <div className="min-w-0">
            <AdapterSnippet />
          </div>
        </div>
      </Section>

      <Section id="works-with">
        <div className="grid gap-y-6 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)] lg:items-stretch">
          <div className="min-w-0 lg:pr-8">
            <MonoLabel>Works with</MonoLabel>
            <h2 className="mt-2 font-semibold text-xl tracking-[-0.02em]">
              What your connected sources feed
            </h2>
          </div>
          <ul className="grid min-w-0 border border-border sm:grid-cols-2 sm:divide-x sm:divide-border">
            {related.map((item, index) => (
              <li
                key={item.href}
                className={cn(
                  "min-w-0",
                  index > 0 && "border-border border-t sm:border-t-0",
                )}
              >
                <Link
                  href={item.href}
                  className={cn(
                    "group flex h-full items-start gap-4 p-5 transition-colors hover:bg-muted/60",
                    focusRing,
                  )}
                >
                  <span className="min-w-0">
                    <span className="block font-medium">{item.label}</span>
                    <span className="mt-1 block text-muted-foreground text-sm">
                      {item.body}
                    </span>
                  </span>
                  <ArrowRight
                    aria-hidden="true"
                    className="mt-0.5 ml-auto shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary motion-reduce:transition-none"
                    size={16}
                    strokeWidth={1.75}
                  />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </Section>
    </>
  );
}

export { IntegrationsPage };
