import { cn } from "cn";

export type CadenceEventState = "sent" | "sending" | "scheduled" | "warmup";

export type CadenceEvent = {
  id: string;
  label: string;
  start: number;
  end: number;
  state: CadenceEventState;
};

export type CadenceLane = { id: string; label: string; events: CadenceEvent[] };

type CadenceTimelineProps = {
  startHour: number;
  endHour: number;
  now?: number;
  lanes: CadenceLane[];
  className?: string;
};

const eventClass: Record<CadenceEventState, string> = {
  sent: "bg-sent-surface text-muted-foreground",
  sending: "bg-live text-live-foreground",
  scheduled:
    "border border-dashed border-ink-tertiary/70 bg-card text-muted-foreground",
  warmup: "bg-warmup-surface text-brand-hover",
};

const stateWords: Record<CadenceEventState, string> = {
  sent: "sent",
  sending: "sending now",
  scheduled: "scheduled",
  warmup: "warm-up",
};

function formatTime(hours: number) {
  const total = Math.round(hours * 60);
  const hh = Math.floor(total / 60);
  const mm = total - hh * 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function formatHour(hour: number) {
  return String(hour).padStart(2, "0");
}

function CadenceTimeline({
  startHour,
  endHour,
  now,
  lanes,
  className,
}: CadenceTimelineProps) {
  const span = endHour - startHour;
  const hasRange = Number.isFinite(span) && span > 0;
  const columns = hasRange ? Math.max(1, Math.ceil(span)) : 1;
  const hours = hasRange
    ? Array.from({ length: columns }, (_, index) => startHour + index)
    : [];
  const fraction = (time: number) =>
    hasRange ? Math.min(Math.max((time - startHour) / span, 0), 1) : 0;
  const showNow =
    hasRange && now !== undefined && now >= startHour && now <= endHour;

  const regionProps = {
    role: "group",
    tabIndex: 0,
    "aria-label": `Send timeline, ${formatTime(startHour)} to ${formatTime(endHour)}`,
  } as const;

  return (
    <div
      {...regionProps}
      data-slot="cadence-timeline"
      className={cn(
        "relative max-w-full min-w-0 overflow-x-auto overscroll-x-contain px-4 pt-3.5 pb-4 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
        className,
      )}
    >
      <ul className="sr-only">
        {showNow && now !== undefined ? (
          <li>Current time {formatTime(now)}</li>
        ) : null}
        {lanes.map((lane) => (
          <li key={lane.id}>
            {lane.label}
            {lane.events.length === 0 ? (
              ": nothing in this period"
            ) : (
              <ul>
                {lane.events.map((event) => (
                  <li key={event.id}>
                    {event.label}, {formatTime(event.start)} to{" "}
                    {formatTime(event.end)}, {stateWords[event.state]}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      <div aria-hidden="true" className="min-w-[640px]">
        <div
          className="grid font-mono text-[10.5px] text-ink-tertiary tabular-nums"
          style={{
            gridTemplateColumns: `92px repeat(${columns}, minmax(0, 1fr))`,
          }}
        >
          <span />
          {hours.map((hour) => (
            <span
              key={hour}
              className="overflow-hidden border-border-subtle border-l pb-1.5 pl-1"
            >
              {formatHour(hour)}
            </span>
          ))}
        </div>

        <div className="relative">
          {showNow && now !== undefined ? (
            <div
              className="pointer-events-none absolute -top-1 bottom-0 z-10 w-[1.5px] bg-primary"
              style={{
                left: `calc(92px + (100% - 92px) * ${fraction(now)})`,
              }}
            >
              <span className="absolute -top-[17px] left-[0.75px] -translate-x-1/2 rounded-[5px] bg-primary px-[5px] py-px font-medium font-mono text-[10.5px] text-primary-foreground tabular-nums leading-[1.4]">
                {formatTime(now)}
              </span>
            </div>
          ) : null}

          {lanes.map((lane) => (
            <div
              key={lane.id}
              className="grid h-[46px] grid-cols-[92px_minmax(0,1fr)] items-center border-border-subtle border-t"
            >
              <span className="truncate pr-2 font-medium text-[12.5px] text-muted-foreground">
                {lane.label}
              </span>
              <div
                className="relative h-full"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg, transparent calc(100% - 1px), var(--border-subtle) calc(100% - 1px))",
                  backgroundSize: `${100 / columns}% 100%`,
                }}
              >
                {lane.events.map((event) => {
                  const left = fraction(Math.min(event.start, event.end));
                  const right = fraction(Math.max(event.start, event.end));
                  if (!hasRange || right <= left) {
                    return null;
                  }
                  return (
                    <div
                      key={event.id}
                      data-state={event.state}
                      className={cn(
                        "absolute top-[9px] flex h-7 items-center gap-1.5 overflow-hidden rounded-[7px] px-[9px] font-medium text-xs",
                        eventClass[event.state],
                      )}
                      style={{
                        left: `${left * 100}%`,
                        width: `${(right - left) * 100}%`,
                      }}
                    >
                      {event.state === "sending" ? (
                        <span className="size-1.5 shrink-0 rounded-full bg-live-foreground" />
                      ) : null}
                      <span className="truncate">{event.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export { CadenceTimeline };
