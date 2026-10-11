import { cn } from "@workspace/ui/lib/utils";
import { Check, TriangleAlert } from "lucide-react";
import type { Ref } from "react";
import { focusRing } from "@/components/app-shell/page-header";

export const textLinkClass = cn(
  "rounded-[4px] font-medium text-foreground underline decoration-border underline-offset-[3px] hover:decoration-foreground",
  focusRing,
);

const noticeTones = {
  danger: "bg-danger-surface text-danger",
  warning: "bg-warning-surface text-warning",
  success: "bg-success-surface text-success",
};

type NoticeProps = {
  tone: keyof typeof noticeTones;
  id?: string;
  role?: "alert" | "status";
  children: React.ReactNode;
};

export function Notice({ tone, id, role, children }: NoticeProps) {
  const Icon = tone === "success" ? Check : TriangleAlert;
  return (
    <div
      id={id}
      role={role}
      className={cn(
        "flex items-start gap-2 rounded-lg px-3 py-2.5 text-[13px]",
        noticeTones[tone],
      )}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.6} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

type StepHeadingProps = {
  ref: Ref<HTMLHeadingElement>;
  children: React.ReactNode;
};

export function StepHeading({ ref, children }: StepHeadingProps) {
  return (
    <h2
      ref={ref}
      tabIndex={-1}
      className="text-sm leading-[1.4] font-semibold tracking-[-0.005em] text-foreground outline-none"
    >
      {children}
    </h2>
  );
}
