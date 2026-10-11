import { Badge } from "@workspace/ui/components/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs";
import { cn } from "@workspace/ui/lib/utils";
import { Copy, KeyRound, Webhook } from "lucide-react";
import type * as React from "react";

const samples = [
  {
    value: "curl",
    label: "cURL",
    code: `curl -X POST https://api.opencadence.com/v1/transactional/send \\
  -H "Authorization: Bearer oc_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "template": "password-reset",
    "to": "dana@example.com",
    "via": "resend",
    "variables": {
      "first_name": "Dana",
      "reset_url": "https://app.northwind.studio/reset/..."
    }
  }'`,
  },
  {
    value: "node",
    label: "Node.js",
    code: `const response = await fetch(
  "https://api.opencadence.com/v1/transactional/send",
  {
    method: "POST",
    headers: {
      Authorization: "Bearer oc_live_...",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      template: "password-reset",
      to: "dana@example.com",
      via: "resend",
      variables: {
        first_name: "Dana",
        reset_url: "https://app.northwind.studio/reset/...",
      },
    }),
  },
);

const message = await response.json();`,
  },
  {
    value: "python",
    label: "Python",
    code: `import requests

response = requests.post(
    "https://api.opencadence.com/v1/transactional/send",
    headers={"Authorization": "Bearer oc_live_..."},
    json={
        "template": "password-reset",
        "to": "dana@example.com",
        "via": "resend",
        "variables": {
            "first_name": "Dana",
            "reset_url": "https://app.northwind.studio/reset/...",
        },
    },
)

message = response.json()`,
  },
] as const;

const responseBody = `{
  "id": "msg_01J...",
  "status": "queued",
  "via": "resend"
}`;

const deliveries = [
  { event: "email.delivered", to: "dana@example.com", time: "10:26:04" },
  { event: "email.opened", to: "dana@example.com", time: "10:26:41" },
  { event: "email.clicked", to: "dana@example.com", time: "10:27:09" },
  { event: "email.replied", to: "omar@example.com", time: "10:31:52" },
  { event: "email.bounced", to: "lee@example.com", time: "10:34:18" },
  { event: "contact.unsubscribed", to: "ines@example.com", time: "10:40:33" },
] as const;

function highlight(source: string) {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  for (const match of source.matchAll(/"(?:[^"\\]|\\.)*"/g)) {
    const start = match.index;
    const end = start + match[0].length;
    if (source[end] === ":") {
      continue;
    }
    if (start > last) {
      nodes.push(source.slice(last, start));
    }
    nodes.push(
      <span key={start} className="text-primary">
        {match[0]}
      </span>,
    );
    last = end;
  }
  nodes.push(source.slice(last));
  return nodes;
}

function Panel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[12px] border border-border bg-card shadow-xs",
        className,
      )}
      {...props}
    />
  );
}

function PanelHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex min-h-12 items-center gap-3 border-border-subtle border-b px-4 py-2",
        className,
      )}
      {...props}
    />
  );
}

function StatusBadge({ children }: { children: React.ReactNode }) {
  return (
    <Badge
      variant="secondary"
      className="h-[22px] gap-1.5 rounded-[6px] bg-success-surface px-2 text-success tabular-nums"
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {children}
    </Badge>
  );
}

function CodePanel({ className }: { className?: string }) {
  return (
    <Panel className={cn("flex min-w-0 flex-col", className)}>
      <Tabs defaultValue="curl" className="min-w-0 flex-1 gap-0">
        <PanelHeader className="justify-between">
          <TabsList aria-label="Request language">
            {samples.map((sample) => (
              <TabsTrigger
                key={sample.value}
                value={sample.value}
                className="px-2.5 text-[13px]"
              >
                {sample.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <p className="hidden truncate font-mono text-[12px] text-muted-foreground sm:block">
            <span className="font-medium text-foreground">POST</span>{" "}
            /v1/transactional/send
          </p>
        </PanelHeader>
        {samples.map((sample) => (
          <TabsContent
            key={sample.value}
            value={sample.value}
            className="min-h-[29rem] min-w-0 rounded-b-[12px] focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2"
          >
            <pre className="overflow-x-auto p-4 font-mono text-[12.5px] text-foreground leading-[1.7] sm:p-5 sm:text-[13px]">
              <code>{highlight(sample.code)}</code>
            </pre>
          </TabsContent>
        ))}
      </Tabs>
    </Panel>
  );
}

function ResponsePanel({ className }: { className?: string }) {
  return (
    <Panel className={cn("min-w-0", className)}>
      <PanelHeader className="justify-between">
        <h3 className="font-semibold text-[14px] tracking-[-0.005em]">
          Response
        </h3>
        <span className="flex items-center gap-2 font-mono text-[12px] text-muted-foreground">
          <StatusBadge>202</StatusBadge>
          application/json
        </span>
      </PanelHeader>
      <pre className="overflow-x-auto p-4 font-mono text-[12.5px] text-foreground leading-[1.7] sm:text-[13px]">
        <code>{highlight(responseBody)}</code>
      </pre>
    </Panel>
  );
}

function WebhookDeliveries({ className }: { className?: string }) {
  return (
    <Panel className={cn("min-w-0", className)}>
      <PanelHeader>
        <Webhook
          aria-hidden
          size={16}
          strokeWidth={1.6}
          className="shrink-0 text-muted-foreground"
        />
        <div className="min-w-0">
          <h3 className="font-semibold text-[14px] tracking-[-0.005em]">
            Webhook deliveries
          </h3>
          <p className="truncate font-mono text-[12px] text-muted-foreground">
            app.northwind.studio/hooks/cadence
          </p>
        </div>
      </PanelHeader>
      <ul className="text-[13px]">
        {deliveries.map((delivery) => (
          <li
            key={delivery.event}
            className="flex items-center gap-3 border-border-subtle border-b px-4 py-2.5 last:border-b-0"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-[12.5px]">
                {delivery.event}
              </p>
              <p className="truncate text-[12px] text-muted-foreground">
                {delivery.to}
              </p>
            </div>
            <time className="font-mono text-[12px] text-muted-foreground tabular-nums">
              {delivery.time}
            </time>
            <StatusBadge>200</StatusBadge>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function ApiKeyRow({ className }: { className?: string }) {
  return (
    <Panel
      role="img"
      aria-label="An API key named Northwind app, production, with the scopes transactional:send and contacts:read, last used 2 minutes ago. The key is masked and has a copy button."
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 text-[13px]",
        className,
      )}
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-[7px] border border-border bg-muted text-muted-foreground">
        <KeyRound size={16} strokeWidth={1.6} />
      </span>
      <div className="min-w-0">
        <p className="truncate font-medium">Northwind app, production</p>
        <p className="text-[12px] text-muted-foreground tabular-nums">
          Northwind Studio workspace · last used 2 minutes ago
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {["transactional:send", "contacts:read"].map((scope) => (
          <Badge
            key={scope}
            variant="secondary"
            className="h-[22px] rounded-[6px] bg-border-subtle px-2 font-mono font-normal text-[11.5px] text-muted-foreground"
          >
            {scope}
          </Badge>
        ))}
      </div>
      <div className="flex h-8 min-w-0 items-center gap-2 rounded-[8px] border border-border bg-background pr-1 pl-3 md:ml-auto">
        <span className="truncate font-mono text-[12px] text-muted-foreground">
          oc_live_••••••••••••••••4f2a
        </span>
        <span className="grid size-6 shrink-0 place-items-center rounded-[6px] text-muted-foreground">
          <Copy size={14} strokeWidth={1.75} />
        </span>
      </div>
    </Panel>
  );
}

export { ApiKeyRow, CodePanel, ResponsePanel, WebhookDeliveries };
