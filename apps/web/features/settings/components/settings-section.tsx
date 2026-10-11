import { cn } from "@workspace/ui/lib/utils";
import { useId } from "react";

type SettingsSectionProps = {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  tone?: "default" | "danger";
  flush?: boolean;
  className?: string;
  children?: React.ReactNode;
};

export function SettingsSection({
  title,
  description,
  action,
  footer,
  tone = "default",
  flush = false,
  className,
  children,
}: SettingsSectionProps) {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "grid gap-x-10 gap-y-4 border-border-subtle border-b py-7 first:pt-0 last:border-b-0 @4xl/settings:grid-cols-[minmax(0,300px)_minmax(0,1fr)]",
        className,
      )}
    >
      <header className="min-w-0">
        <h2
          id={headingId}
          className="font-semibold text-[15px] text-foreground leading-6 tracking-[-0.01em]"
        >
          {title}
        </h2>
        {description ? (
          <div className="mt-1 text-pretty text-[13px] text-muted-foreground leading-normal">
            {description}
          </div>
        ) : null}
        {action ? <div className="mt-3 flex gap-2">{action}</div> : null}
      </header>
      <div
        className={cn(
          "min-w-0 self-start overflow-hidden rounded-[12px] border bg-card shadow-xs",
          tone === "danger" ? "border-danger/30" : "border-border",
        )}
      >
        {children ? (
          <div className={flush ? undefined : "p-5"}>{children}</div>
        ) : null}
        {footer ? (
          <footer className="flex flex-wrap items-center justify-between gap-3 border-border-subtle border-t bg-muted/40 px-5 py-3 text-[13px] text-muted-foreground">
            {footer}
          </footer>
        ) : null}
      </div>
    </section>
  );
}

export function SettingsStack({ children }: { children: React.ReactNode }) {
  return <div className="@container/settings flex flex-col">{children}</div>;
}
