import { cn } from "@workspace/ui/lib/utils";
import { buttonFocusRing } from "@/components/app-shell/page-header";

export const primaryButton = cn(
  "px-3 text-[13px] hover:bg-brand-hover",
  buttonFocusRing,
);

export const secondaryButton = cn(
  "bg-card px-3 text-[13px] shadow-xs hover:bg-muted",
  buttonFocusRing,
);

export const dangerButton = cn(
  "bg-danger px-3 text-[13px] text-white hover:bg-danger/90",
  buttonFocusRing,
);

export const dangerOutlineButton = cn(
  "border-danger/30 bg-card px-3 text-[13px] text-danger shadow-xs hover:bg-danger-surface hover:text-danger",
  buttonFocusRing,
);

export const fieldWidth = "max-w-[420px]";

export const dialogContent = "gap-5 p-5 text-[13px] sm:max-w-[420px]";

export const dialogTitle = "font-semibold text-[15px] tracking-[-0.01em]";

export const dialogActions =
  "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end";

type Tone = "success" | "neutral" | "warning" | "info";

const toneClasses: Record<Tone, string> = {
  success: "bg-success-surface text-success",
  neutral: "bg-border-subtle text-muted-foreground",
  warning: "bg-warning-surface text-warning",
  info: "bg-info-surface text-info",
};

export function SettingsBadge({
  tone,
  dot = true,
  className,
  children,
}: {
  tone: Tone;
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[6px] px-2 font-medium text-xs",
        toneClasses[tone],
        className,
      )}
    >
      {dot ? (
        <span aria-hidden className="size-1.5 rounded-full bg-current" />
      ) : null}
      {children}
    </span>
  );
}

export function SettingsRow({
  icon,
  title,
  detail,
  action,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  detail?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[60px] flex-wrap items-center gap-x-3 gap-y-2 border-border-subtle border-b px-5 py-3 last:border-b-0">
      {icon ? (
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-card text-muted-foreground shadow-xs"
        >
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1 basis-48">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-foreground">
          {title}
        </div>
        {detail ? (
          <div className="mt-0.5 text-muted-foreground text-xs leading-normal">
            {detail}
          </div>
        ) : null}
      </div>
      {action ? (
        <div className="flex shrink-0 items-center gap-2">{action}</div>
      ) : null}
    </div>
  );
}

export const sessionExpiredCodes = new Set([
  "SESSION_EXPIRED",
  "SESSION_NOT_FRESH",
]);
