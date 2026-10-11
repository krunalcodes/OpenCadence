import { cn } from "cn";

type TickProgressProps = {
  value: number;
  max: number;
  tone?: "brand" | "success" | "warning";
  className?: string;
  "aria-label"?: string;
};

const toneClass = {
  brand: "[--tick:var(--primary)]",
  success: "[--tick:var(--success)]",
  warning: "[--tick:var(--warning)]",
} as const;

function TickProgress({
  value,
  max,
  tone = "brand",
  className,
  "aria-label": ariaLabel,
}: TickProgressProps) {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 0;
  const safeValue = Number.isFinite(value)
    ? Math.min(Math.max(value, 0), safeMax)
    : 0;
  const percent = safeMax > 0 ? (safeValue / safeMax) * 100 : 0;

  return (
    <div
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={safeValue}
      data-slot="tick-progress"
      data-tone={tone}
      className={cn(
        "h-3 w-full min-w-0 [mask-image:repeating-linear-gradient(90deg,black_0_3px,transparent_3px_6px)]",
        toneClass[tone],
        className,
      )}
      style={{
        backgroundImage: `linear-gradient(90deg, var(--tick) ${percent}%, var(--border) ${percent}%)`,
      }}
    />
  );
}

export { TickProgress };
