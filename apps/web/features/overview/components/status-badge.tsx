import { cn } from "@workspace/ui/lib/utils";
import type { BadgeTone } from "@/features/overview/lib/sample";

const toneClasses: Record<BadgeTone, string> = {
  live: "bg-live text-live-foreground",
  success: "bg-success-surface text-success",
  warning: "bg-warning-surface text-warning",
  danger: "bg-danger-surface text-danger",
  neutral: "bg-border-subtle text-muted-foreground",
};

type StatusBadgeProps = {
  tone: BadgeTone;
  children: React.ReactNode;
  className?: string;
};

export function StatusBadge({ tone, children, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-[6px] px-2 text-xs font-medium whitespace-nowrap tabular-nums",
        toneClasses[tone],
        className,
      )}
    >
      <span aria-hidden="true" className="relative flex size-1.5 shrink-0">
        {tone === "live" ? (
          <span className="absolute inset-0 rounded-full bg-current opacity-60 motion-safe:animate-ping motion-safe:![animation-duration:2s]" />
        ) : null}
        <span className="relative size-1.5 rounded-full bg-current" />
      </span>
      {children}
    </span>
  );
}
