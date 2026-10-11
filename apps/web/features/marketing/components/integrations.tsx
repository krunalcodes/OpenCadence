import { Badge } from "@workspace/ui/components/badge";
import { buttonVariants } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import {
  Check,
  CircleCheck,
  Layers,
  Lock,
  type LucideIcon,
  Mail,
  Plus,
  Search,
  Server,
  Webhook,
} from "lucide-react";
import type * as React from "react";

type Status = "healthy" | "near" | "sending";

type Source = {
  name: string;
  detail: string;
  icon: LucideIcon;
  capabilities: string[];
  sent: number;
  limit: number;
  status: Status;
};

const sources: Source[] = [
  {
    name: "maya@northwind.studio",
    detail: "Gmail mailbox",
    icon: Mail,
    capabilities: ["Send", "Receive replies", "Warm-up"],
    sent: 38,
    limit: 80,
    status: "healthy",
  },
  {
    name: "sam@northwind.studio",
    detail: "Outlook mailbox",
    icon: Mail,
    capabilities: ["Send", "Receive replies", "Warm-up"],
    sent: 71,
    limit: 80,
    status: "near",
  },
  {
    name: "hello@northwind.studio",
    detail: "IMAP/SMTP mailbox",
    icon: Mail,
    capabilities: ["Send", "Receive replies"],
    sent: 12,
    limit: 50,
    status: "healthy",
  },
  {
    name: "Resend",
    detail: "Email provider, October product update",
    icon: Layers,
    capabilities: ["Send"],
    sent: 8112,
    limit: 50000,
    status: "sending",
  },
  {
    name: "Amazon SES",
    detail: "Email provider, us-east-1",
    icon: Layers,
    capabilities: ["Send"],
    sent: 12480,
    limit: 50000,
    status: "healthy",
  },
  {
    name: "Office relay",
    detail: "Generic SMTP, smtp.northwind.studio",
    icon: Server,
    capabilities: ["Send"],
    sent: 214,
    limit: 5000,
    status: "healthy",
  },
  {
    name: "SMS gateway",
    detail: "Custom channel webhook",
    icon: Webhook,
    capabilities: ["Send"],
    sent: 96,
    limit: 1000,
    status: "healthy",
  },
];

const statusStyles: Record<Status, { label: string; className: string }> = {
  healthy: { label: "Healthy", className: "bg-success-surface text-success" },
  near: { label: "Near limit", className: "bg-warning-surface text-warning" },
  sending: { label: "Sending", className: "bg-live text-live-foreground" },
};

const pickerGroups = [
  {
    label: "Mailboxes",
    icon: Mail,
    items: ["Gmail", "Outlook", "IMAP/SMTP account"],
  },
  {
    label: "Email providers",
    icon: Layers,
    items: ["Resend", "Amazon SES", "SendGrid"],
  },
  {
    label: "Other",
    icon: Server,
    items: ["Generic SMTP", "Custom channel webhook"],
  },
];

const selectedSource = "SendGrid";

function formatNumber(value: number) {
  return value.toLocaleString("en-US");
}

function StatusBadge({ status }: { status: Status }) {
  const { label, className } = statusStyles[status];
  return (
    <Badge
      variant="ghost"
      className={cn(
        "h-[22px] gap-1.5 rounded-md px-2 font-medium text-xs",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full bg-current",
          status === "sending" && "motion-safe:animate-pulse",
        )}
      />
      {label}
    </Badge>
  );
}

function TickProgress({ sent, limit }: { sent: number; limit: number }) {
  const percent = Math.round((sent / limit) * 100);
  const fill = percent >= 85 ? "var(--warning)" : "var(--primary)";
  return (
    <div
      aria-hidden="true"
      className="h-3 w-full [mask-image:repeating-linear-gradient(90deg,black_0_3px,transparent_3px_6px)]"
      style={{
        background: `linear-gradient(90deg, ${fill} ${percent}%, var(--border) ${percent}%)`,
      }}
    />
  );
}

function SourceRow({ source }: { source: Source }) {
  const Icon = source.icon;
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2.5 px-4 py-3 md:grid-cols-[minmax(0,1fr)_204px_128px_96px]">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-md border border-border bg-muted text-muted-foreground">
          <Icon aria-hidden="true" size={16} strokeWidth={1.6} />
        </span>
        <div className="min-w-0">
          <div className="truncate font-medium">{source.name}</div>
          <div className="truncate text-muted-foreground text-xs">
            {source.detail}
          </div>
        </div>
      </div>
      <div className="order-3 flex flex-wrap gap-1 md:order-2">
        {source.capabilities.map((capability) => (
          <Badge
            key={capability}
            variant="outline"
            className="h-5 rounded-md px-1.5 font-medium text-[11px] text-muted-foreground"
          >
            {capability}
          </Badge>
        ))}
      </div>
      <div className="order-4 w-28 justify-self-end md:order-3 md:w-auto md:justify-self-stretch">
        <div className="mb-1 text-muted-foreground text-xs tabular-nums">
          <span className="font-medium text-foreground">
            {formatNumber(source.sent)}
          </span>
          {" / "}
          {formatNumber(source.limit)}
          <span className="sr-only"> sent today against the daily limit</span>
        </div>
        <TickProgress sent={source.sent} limit={source.limit} />
      </div>
      <div className="order-2 justify-self-end md:order-4 md:justify-self-start">
        <StatusBadge status={source.status} />
      </div>
    </li>
  );
}

function AddIntegrationPanel() {
  return (
    <div
      aria-hidden="true"
      className="border-border border-t bg-background xl:border-t-0 xl:border-l"
    >
      <div className="border-border-subtle border-b px-4 py-3">
        <div className="font-semibold text-sm tracking-[-0.005em]">
          Add integration
        </div>
        <div className="text-muted-foreground text-xs">
          Search for a mailbox, provider, or channel
        </div>
      </div>
      <div className="grid gap-5 p-4 md:grid-cols-2 xl:grid-cols-1">
        <div>
          <div className="mb-1.5 font-medium text-xs">Source</div>
          <div className="flex h-8 items-center gap-2 rounded-lg border border-primary bg-card px-2.5 ring-2 ring-primary/15">
            <Search
              className="shrink-0 text-muted-foreground"
              size={16}
              strokeWidth={1.6}
            />
            <span className="text-muted-foreground">Search sources</span>
          </div>
          <div className="mt-1.5 rounded-lg border border-border bg-card p-1 shadow-md">
            {pickerGroups.map((group) => {
              const GroupIcon = group.icon;
              return (
                <div key={group.label}>
                  <div className="px-2 pt-1.5 pb-1 font-medium text-muted-foreground text-xs">
                    {group.label}
                  </div>
                  {group.items.map((item) => (
                    <div
                      key={item}
                      className={cn(
                        "flex h-7 items-center gap-2 rounded-md px-2",
                        item === selectedSource && "bg-muted font-medium",
                      )}
                    >
                      <GroupIcon
                        className="shrink-0 text-muted-foreground"
                        size={16}
                        strokeWidth={1.6}
                      />
                      <span className="truncate">{item}</span>
                      {item === selectedSource ? (
                        <Check
                          className="ml-auto shrink-0 text-primary"
                          size={16}
                          strokeWidth={1.75}
                        />
                      ) : null}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <div className="mb-1.5 font-medium text-xs">SendGrid API key</div>
          <div className="flex h-8 items-center gap-2 rounded-lg border border-border bg-card px-2.5">
            <Lock
              className="shrink-0 text-muted-foreground"
              size={16}
              strokeWidth={1.6}
            />
            <span className="truncate font-mono text-xs">
              SG.••••••••••••••••••••x9Qm
            </span>
          </div>
          <p className="mt-1.5 text-muted-foreground text-xs">
            Encrypted before it is stored. It is never shown again after you
            save.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className={buttonVariants({ variant: "outline" })}>
              Test connection
            </span>
            <span
              className={cn(buttonVariants(), "hover:bg-primary")}
              data-slot="button"
            >
              Save integration
            </span>
          </div>
          <div className="mt-3 flex items-start gap-1.5 text-success text-xs tabular-nums">
            <CircleCheck
              className="mt-px shrink-0"
              size={16}
              strokeWidth={1.6}
            />
            <span>Connected. SendGrid accepted the test email in 412 ms.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function IntegrationsVisual() {
  return (
    <figure className="min-w-0">
      <div className="overflow-hidden rounded-xl border border-border bg-card text-[13px] shadow-xs">
        <div className="grid xl:grid-cols-[minmax(0,1fr)_336px]">
          <div className="min-w-0">
            <div className="flex items-center gap-3 border-border-subtle border-b px-4 py-3">
              <div className="min-w-0">
                <div className="font-semibold text-sm tracking-[-0.005em]">
                  Integrations
                </div>
                <div className="truncate text-muted-foreground text-xs tabular-nums">
                  Northwind Studio, 7 connected
                </div>
              </div>
              <span
                aria-hidden="true"
                className={cn(buttonVariants(), "ml-auto hover:bg-primary")}
              >
                <Plus size={16} strokeWidth={1.75} />
                Add integration
              </span>
            </div>
            <div
              aria-hidden="true"
              className="hidden grid-cols-[minmax(0,1fr)_204px_128px_96px] gap-x-4 border-border-subtle border-b bg-muted/50 px-4 py-2 font-medium text-muted-foreground text-xs md:grid"
            >
              <span>Source</span>
              <span>Used for</span>
              <span>Today</span>
              <span>Status</span>
            </div>
            <ul className="divide-y divide-border-subtle">
              {sources.map((source) => (
                <SourceRow key={source.name} source={source} />
              ))}
            </ul>
          </div>
          <AddIntegrationPanel />
        </div>
      </div>
      <figcaption className="mt-3 text-muted-foreground text-xs">
        The integrations page with the add panel open. All names and figures are
        sample data.
      </figcaption>
    </figure>
  );
}

function Keyword({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}

function Str({ children }: { children: React.ReactNode }) {
  return <span className="text-primary">{children}</span>;
}

function AdapterSnippet() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      <div className="border-border-subtle border-b px-4 py-2 font-mono text-muted-foreground text-xs">
        integrations/acme-mail/src/index.ts
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-[1.7]">
        <code>
          <span className="block">
            <Keyword>export const</Keyword>
            {" acmeMail: Adapter = {"}
          </span>
          <span className="block">
            {"  id: "}
            <Str>{'"acme-mail"'}</Str>
            {","}
          </span>
          <span className="block">
            {"  capabilities: ["}
            <Str>{'"send"'}</Str>
            {"],"}
          </span>
          <span className="block">
            {"  "}
            <Keyword>async</Keyword>
            {" send(message, { apiKey }) {"}
          </span>
          <span className="block">
            {"    "}
            <Keyword>const</Keyword>
            {" res = "}
            <Keyword>await</Keyword>
            {" fetch("}
            <Str>{'"https://api.acme-mail.example/send"'}</Str>
            {", {"}
          </span>
          <span className="block">
            {"      method: "}
            <Str>{'"POST"'}</Str>
            {","}
          </span>
          <span className="block">
            {"      headers: { "}
            <Str>{'"x-api-key"'}</Str>
            {": apiKey },"}
          </span>
          <span className="block">
            {"      body: JSON.stringify(message),"}
          </span>
          <span className="block">{"    });"}</span>
          <span className="block">
            {"    "}
            <Keyword>return</Keyword>
            {" { messageId: ("}
            <Keyword>await</Keyword>
            {" res.json()).id };"}
          </span>
          <span className="block">{"  },"}</span>
          <span className="block">{"};"}</span>
        </code>
      </pre>
    </div>
  );
}

export { AdapterSnippet, IntegrationsVisual };
