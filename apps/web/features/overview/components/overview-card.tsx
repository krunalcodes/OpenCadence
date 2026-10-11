import { cn } from "@workspace/ui/lib/utils";
import Link from "next/link";

type OverviewCardProps = {
  id: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
};

export function OverviewCard({
  id,
  title,
  description,
  action,
  className,
  children,
}: OverviewCardProps) {
  return (
    <section
      aria-labelledby={id}
      className={cn(
        "min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-xs",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border-subtle px-4 py-[13px]">
        <div className="min-w-0 flex-1">
          <h2
            id={id}
            className="truncate text-sm leading-[1.4] font-semibold tracking-[-0.005em] text-foreground"
          >
            {title}
          </h2>
          {description ? (
            <p className="truncate text-[12.5px] text-ink-tertiary tabular-nums">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

type CardLinkProps = {
  href: string;
  children: React.ReactNode;
  className?: string;
};

export function CardLink({ href, children, className }: CardLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-7 shrink-0 items-center rounded-lg border border-border bg-card px-[9px] text-[12.5px] font-medium whitespace-nowrap text-foreground shadow-xs transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        className,
      )}
    >
      {children}
    </Link>
  );
}
