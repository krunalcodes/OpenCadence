import { cn } from "cn";

export type HealthDay = "healthy" | "warning" | "failing" | "none";

type HealthStripProps = {
  days: HealthDay[];
  className?: string;
  "aria-label"?: string;
};

const dayClass: Record<HealthDay, string> = {
  healthy: "h-full bg-success",
  warning: "h-full bg-warning",
  failing: "h-full bg-danger",
  none: "h-[45%] bg-border",
};

function summarize(days: HealthDay[]) {
  if (days.length === 0) {
    return "No health data";
  }
  const count = (status: HealthDay) =>
    days.filter((day) => day === status).length;
  const parts = [
    `${count("healthy")} healthy`,
    `${count("warning")} warning`,
    `${count("failing")} failing`,
  ];
  const missing = count("none");
  if (missing > 0) {
    parts.push(`${missing} with no data`);
  }
  const span = days.length === 1 ? "Last day" : `Last ${days.length} days`;
  return `${span}: ${parts.join(", ")}`;
}

function HealthStrip({
  days,
  className,
  "aria-label": ariaLabel,
}: HealthStripProps) {
  return (
    <span
      role="img"
      aria-label={ariaLabel ?? summarize(days)}
      data-slot="health-strip"
      className={cn(
        "inline-flex h-[18px] shrink-0 items-end gap-0.5",
        className,
      )}
    >
      {days.map((day, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={cn("w-1 rounded-[1.5px]", dayClass[day])}
        />
      ))}
    </span>
  );
}

export { HealthStrip };
