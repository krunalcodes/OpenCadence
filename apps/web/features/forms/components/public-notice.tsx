import { cn } from "@workspace/ui/lib/utils";
import { CircleAlert, CircleCheck } from "lucide-react";
import type { ReactNode } from "react";

const tones = {
  success: { icon: CircleCheck, className: "bg-success-surface text-success" },
  warning: { icon: CircleAlert, className: "bg-warning-surface text-warning" },
};

export const noticeLinkClass =
  "inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-border bg-card px-4 py-2.5 text-[15px] leading-snug font-medium text-foreground shadow-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

type PublicNoticeProps = {
  brandName?: string;
  tone?: keyof typeof tones | null;
  title: string;
  compact?: boolean;
  children?: ReactNode;
};

export function PublicNotice({
  brandName = "",
  tone = null,
  title,
  compact = false,
  children,
}: PublicNoticeProps) {
  const mark = tone ? tones[tone] : null;
  const Icon = mark?.icon;
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-[27rem] flex-col px-5",
        compact ? "py-6" : "min-h-svh pt-6 pb-12 sm:pt-10",
      )}
    >
      {brandName && !compact ? (
        <header className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-card text-sm font-semibold text-foreground shadow-xs"
          >
            {Array.from(brandName)[0]?.toUpperCase()}
          </span>
          <span className="min-w-0 truncate text-[15px] font-semibold tracking-[-0.005em] text-foreground">
            {brandName}
          </span>
        </header>
      ) : null}
      <main
        className={cn(
          "flex flex-1 flex-col justify-center",
          compact ? "" : "py-12",
        )}
      >
        {mark && Icon ? (
          <span
            aria-hidden="true"
            className={cn(
              "mb-5 grid size-10 place-items-center rounded-[10px]",
              mark.className,
            )}
          >
            <Icon strokeWidth={1.6} className="size-5" />
          </span>
        ) : null}
        <h1 className="text-balance break-words text-2xl leading-[1.2] font-semibold tracking-[-0.025em] text-foreground">
          {title}
        </h1>
        {children}
      </main>
    </div>
  );
}

export function NoticeText({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "mt-3 break-words text-[15px] leading-[1.55] text-muted-foreground",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function NoticeAlert({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="mb-6 flex gap-2.5 rounded-lg bg-warning-surface px-3.5 py-3 text-[14px] leading-normal text-warning"
    >
      <CircleAlert
        aria-hidden="true"
        strokeWidth={1.6}
        className="mt-0.5 size-4 shrink-0"
      />
      <span>{children}</span>
    </div>
  );
}
