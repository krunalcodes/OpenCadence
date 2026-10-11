import { buttonVariants } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { links } from "@/features/marketing/lib/links";

const nightFocus =
  "focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-live focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--mk-night)]";

const hours = ["09:00", "10:00", "11:00", "12:00", "13:00"] as const;

const lanes = [
  {
    name: "October product update",
    via: "Amazon SES",
    meta: "1,200 delivered",
    state: "sent",
    label: "Sent",
    left: "4%",
    width: "30%",
  },
  {
    name: "Founder outreach, step 2",
    via: "Gmail",
    meta: "412 of 960",
    state: "sending",
    label: "Sending",
    left: "30%",
    width: "38%",
  },
  {
    name: "Renewal reminder",
    via: "Outlook",
    meta: "Starts 12:30",
    state: "scheduled",
    label: "Scheduled",
    left: "70%",
    width: "26%",
  },
] as const;

const blockClass = {
  sent: "bg-white/10 text-[var(--mk-night-ink)]",
  sending: "bg-live font-medium text-live-foreground",
  scheduled:
    "border border-white/25 border-dashed text-[var(--mk-night-muted)]",
} as const;

function CadenceLanes() {
  return (
    <div
      aria-hidden="true"
      className="min-w-0 rounded-xl border border-[var(--mk-night-line)] bg-[var(--mk-night-2)]"
    >
      <div className="flex items-center justify-between gap-4 border-[var(--mk-night-line)] border-b px-4 py-3 sm:px-5">
        <p className="font-medium text-[var(--mk-night-ink)] text-sm">
          Cadence, today
        </p>
        <p className="flex items-center gap-2 font-mono text-[var(--mk-night-muted)] text-xs">
          <span className="size-1.5 rounded-full bg-live motion-safe:animate-pulse" />
          1 sending
        </p>
      </div>
      <div className="relative px-4 pt-1 pb-3 sm:px-5">
        <div className="pointer-events-none absolute inset-x-4 inset-y-0 flex justify-between sm:inset-x-5">
          {hours.map((hour) => (
            <span key={hour} className="w-px bg-[var(--mk-night-line)]" />
          ))}
        </div>
        <span className="pointer-events-none absolute inset-y-0 left-[60%] w-px bg-live/60" />
        <ul className="relative flex flex-col">
          {lanes.map((lane) => (
            <li key={lane.name} className="py-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-[var(--mk-night-ink)] text-sm">
                  {lane.name}
                  <span className="ml-2 font-mono text-[var(--mk-night-muted)] text-xs">
                    {lane.via}
                  </span>
                </p>
                <p className="shrink-0 font-mono text-[var(--mk-night-muted)] text-xs tabular-nums">
                  {lane.meta}
                </p>
              </div>
              <div className="relative mt-2 h-8">
                <div
                  className={cn(
                    "absolute inset-y-0 flex items-center rounded-md px-2.5 text-xs",
                    blockClass[lane.state],
                  )}
                  style={{ left: lane.left, width: lane.width }}
                >
                  <span className="truncate">{lane.label}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <div className="relative mt-1 flex justify-between font-mono text-[11px] text-[var(--mk-night-muted)] tabular-nums">
          {hours.map((hour) => (
            <span key={hour}>{hour}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function FinalCta() {
  return (
    <section className="px-4 py-16 md:py-24">
      <div className="mk-night mx-auto max-w-[1240px] rounded-[28px] selection:bg-live selection:text-live-foreground">
        <div className="mx-auto grid w-full max-w-[1240px] items-center gap-x-16 gap-y-14 px-6 py-20 md:px-10 md:py-28 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
          <div className="min-w-0">
            <h2 className="max-w-2xl text-balance font-semibold text-4xl text-[var(--mk-night-ink)] tracking-[-0.04em] sm:text-5xl md:text-6xl md:leading-[1.02]">
              Send your next campaign through your own providers
            </h2>
            <p className="mt-6 max-w-xl text-pretty text-[var(--mk-night-muted)] text-lg">
              Connect a mailbox or provider account you already have, then send
              newsletters and outreach from one contact list.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href={links.signUp}
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "h-11 gap-2 bg-live px-5 font-semibold text-[15px] text-live-foreground hover:bg-live/85",
                  nightFocus,
                )}
              >
                Start for free
                <ArrowRight aria-hidden="true" size={16} strokeWidth={2} />
              </Link>
              <Link
                href={links.demo}
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "h-11 border-white/20 bg-transparent px-5 text-[15px] text-[var(--mk-night-ink)] hover:border-white/35 hover:bg-white/10 hover:text-[var(--mk-night-ink)]",
                  nightFocus,
                )}
              >
                Book a demo
              </Link>
            </div>
            <p className="mt-5 text-[var(--mk-night-muted)] text-sm">
              No per-contact pricing. You pay your provider&apos;s rate for
              sending.
            </p>
          </div>
          <CadenceLanes />
        </div>
      </div>
    </section>
  );
}

export { FinalCta };
