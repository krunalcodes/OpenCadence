import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { Mail, Server } from "lucide-react";
import { buttonFocusRing } from "@/components/app-shell/page-header";
import { Spinner } from "@/components/spinner";
import { brandIcons } from "@/features/integrations/lib/brand-icons";
import type { IntegrationMark } from "@/features/integrations/lib/catalog";

export const primaryButtonClass = cn(
  "px-3 text-[13px] hover:bg-brand-hover",
  buttonFocusRing,
);

export const secondaryButtonClass = cn(
  "bg-card px-3 text-[13px] shadow-xs hover:bg-muted",
  buttonFocusRing,
);

export const dangerButtonClass = cn(
  "bg-danger px-3 text-[13px] text-white hover:bg-danger/90",
  buttonFocusRing,
);

export const inputClass = cn("bg-card text-[13px] shadow-xs", buttonFocusRing);

export const segmentedGroupClass =
  "h-8 w-fit gap-0 rounded-lg border border-border bg-muted p-0.5";

export const segmentedItemClass =
  "h-[26px] min-w-0 rounded-[6px] px-2.5 text-[12.5px] font-medium text-muted-foreground hover:bg-transparent hover:text-foreground focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary focus-visible:outline-solid aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-xs";

export const comingSoonClass =
  "inline-flex h-[22px] shrink-0 items-center rounded-[6px] bg-border-subtle px-2 text-xs font-medium whitespace-nowrap text-muted-foreground";

type SourceMarkProps = {
  integration: IntegrationMark;
  className?: string;
};

export function SourceMark({ integration, className }: SourceMarkProps) {
  const brand = brandIcons[integration.id];
  const Icon = integration.id === "smtp" ? Server : Mail;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-[7px] border border-border text-[11px] font-semibold tracking-[-0.01em]",
        brand ? "bg-card text-foreground" : "bg-muted text-muted-foreground",
        className,
      )}
    >
      {brand ? (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-[15px]"
          fill={brand.color ?? "currentColor"}
        >
          <path d={brand.path} />
        </svg>
      ) : (
        (integration.mark ?? <Icon className="size-4" strokeWidth={1.6} />)
      )}
    </span>
  );
}

type SectionCardProps = {
  id: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
};

export function SectionCard({
  id,
  title,
  description,
  action,
  children,
}: SectionCardProps) {
  return (
    <section
      aria-labelledby={id}
      className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-xs"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 border-b border-border-subtle px-4 py-[13px]">
        <div className="min-w-0 flex-1 basis-48">
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
        {action ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {action}
          </div>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export const dialogContentClass = "gap-5 p-5 text-[13px] sm:max-w-[420px]";

export const dialogTitleClass = "text-[15px] font-semibold tracking-[-0.01em]";

export const dialogActionsClass =
  "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end";

type LoadFailedProps = {
  title: string;
  body: string;
  retryLabel: string;
  pending: boolean;
  onRetry: () => void;
};

export function LoadFailed({
  title,
  body,
  retryLabel,
  pending,
  onRetry,
}: LoadFailedProps) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 px-4 py-4"
    >
      <p className="min-w-0 text-[13px] text-muted-foreground">
        <span className="font-medium text-foreground">{title}</span> {body}
      </p>
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={onRetry}
        className={secondaryButtonClass}
      >
        {pending ? <Spinner /> : null}
        {retryLabel}
      </Button>
    </div>
  );
}
