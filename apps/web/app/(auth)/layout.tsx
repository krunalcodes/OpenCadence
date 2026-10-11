import { cn } from "@workspace/ui/lib/utils";
import Link from "next/link";
import { BrandMark } from "@/features/auth/components/brand-mark";

const dayStart = 8;
const dayHours = 7;
const now = 10 + 26 / 60;
const nowLabel = "10:26";
const hours = ["08", "09", "10", "11", "12", "13", "14"];

type SendState = "sending" | "sent" | "scheduled" | "warmup";

type Send = { label: string; start: number; end: number; state: SendState };

const lanes: { name: string; sends: Send[] }[] = [
  {
    name: "Campaigns",
    sends: [
      { label: "Weekly digest", start: 8.25, end: 9.5, state: "sent" },
      { label: "Product update", start: 9.75, end: 12, state: "sending" },
      { label: "Webinar invite", start: 13, end: 14.75, state: "scheduled" },
    ],
  },
  {
    name: "Sequences",
    sends: [
      {
        label: "Agency founders, step 2",
        start: 9,
        end: 12.5,
        state: "sending",
      },
      { label: "Trial ending", start: 13.25, end: 14.75, state: "scheduled" },
    ],
  },
  {
    name: "Transactional",
    sends: [{ label: "214 sent by API", start: 8, end: now, state: "sent" }],
  },
  {
    name: "Warm-up",
    sends: [
      {
        label: "4 mailboxes, 50 of 84 sent",
        start: 8,
        end: 14,
        state: "warmup",
      },
    ],
  },
];

const sendStyles: Record<SendState, string> = {
  sending: "bg-live text-live-foreground",
  sent: "bg-sent-surface text-muted-foreground",
  scheduled:
    "border border-ink-tertiary/60 border-dashed bg-card text-muted-foreground",
  warmup: "bg-warmup-surface text-brand-hover",
};

const legend: { label: string; swatch: string }[] = [
  { label: "Sending", swatch: "bg-live" },
  { label: "Sent", swatch: "bg-sent-surface" },
  {
    label: "Scheduled",
    swatch: "border border-ink-tertiary/60 border-dashed bg-card",
  },
  { label: "Warm-up", swatch: "bg-warmup-surface" },
];

const footerLinkClass =
  "rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function percent(value: number) {
  return `${(value * 100).toFixed(3)}%`;
}

function CadencePreview() {
  const nowOffset = (now - dayStart) / dayHours;

  return (
    <div
      aria-hidden="true"
      className="w-full rounded-[12px] border border-border bg-card shadow-xs"
    >
      <div className="flex items-start justify-between gap-4 border-border-subtle border-b px-4 py-3">
        <div className="min-w-0">
          <div className="font-semibold text-foreground text-sm leading-[1.4] tracking-[-0.005em]">
            Today's cadence
          </div>
          <div className="mt-0.5 text-ink-tertiary text-xs leading-[1.4]">
            Everything going out from this workspace, hour by hour
          </div>
        </div>
        <span className="inline-flex h-[22px] shrink-0 items-center rounded-md bg-border-subtle px-2 font-medium text-muted-foreground text-xs">
          Sample data
        </span>
      </div>

      <div className="px-4 pt-3.5 pb-7">
        <div className="grid grid-cols-[96px_repeat(7,minmax(0,1fr))] font-mono text-[10.5px] text-ink-tertiary tabular-nums">
          <span />
          {hours.map((hour) => (
            <span
              key={hour}
              className="border-border-subtle border-l pb-1.5 pl-1"
            >
              {hour}
            </span>
          ))}
        </div>

        <div className="relative">
          {lanes.map((lane) => (
            <div
              key={lane.name}
              className="grid h-11 grid-cols-[96px_minmax(0,1fr)] items-center border-border-subtle border-t"
            >
              <div className="font-medium text-[12.5px] text-muted-foreground">
                {lane.name}
              </div>
              <div className="relative h-full">
                <div className="absolute inset-0 grid grid-cols-7">
                  {hours.map((hour) => (
                    <span
                      key={hour}
                      className="border-border-subtle border-l"
                    />
                  ))}
                </div>
                {lane.sends.map((send) => (
                  <div
                    key={send.label}
                    className={cn(
                      "absolute top-2 flex h-7 items-center gap-1.5 overflow-hidden rounded-md px-2 font-medium text-xs",
                      sendStyles[send.state],
                    )}
                    style={{
                      left: percent((send.start - dayStart) / dayHours),
                      width: percent((send.end - send.start) / dayHours),
                    }}
                  >
                    {send.state === "sending" ? (
                      <span className="size-1.5 shrink-0 rounded-full bg-live-foreground" />
                    ) : null}
                    <span className="truncate">{send.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div
            className="absolute -top-1 -bottom-1 z-10 w-[1.5px] bg-primary"
            style={{ left: `calc(96px + (100% - 96px) * ${nowOffset})` }}
          >
            <span className="absolute top-full left-1/2 -translate-x-1/2 rounded-[5px] bg-primary px-1.5 py-px font-medium font-mono text-[10.5px] text-primary-foreground tabular-nums">
              {nowLabel}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-border-subtle border-t px-4 py-2.5 text-muted-foreground text-xs">
        {legend.map((item) => (
          <span key={item.label} className="inline-flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-[3px]", item.swatch)} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="grid min-h-svh bg-background lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="flex min-w-0 flex-col px-6 py-6 sm:px-10 lg:py-8">
        <header>
          <BrandMark />
        </header>
        <main className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[360px]">{children}</div>
        </main>
        <footer>
          <nav
            aria-label="Legal"
            className="flex gap-4 text-muted-foreground text-xs"
          >
            <Link href="/privacy" className={footerLinkClass}>
              Privacy
            </Link>
            <Link href="/terms" className={footerLinkClass}>
              Terms
            </Link>
          </nav>
        </footer>
      </div>

      <aside className="hidden min-w-0 flex-col items-center justify-center border-border border-l bg-muted px-8 py-10 lg:flex xl:px-12">
        <div className="w-full max-w-[620px]">
          <CadencePreview />
          <p className="mt-5 text-[13px] text-muted-foreground leading-normal">
            Campaigns, sequences, transactional email, and warm-up on one
            timeline, hour by hour.
          </p>
        </div>
      </aside>
    </div>
  );
}
