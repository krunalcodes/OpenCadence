"use client";

import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import {
  CircleAlert,
  CircleCheck,
  type LucideIcon,
  MailOpen,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  AuthHeader,
  linkClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/features/auth/components/form-parts";

type Tone = "info" | "success" | "warning";

const toneClasses: Record<Tone, string> = {
  info: "bg-info-surface text-info",
  success: "bg-success-surface text-success",
  warning: "bg-warning-surface text-warning",
};

const toneIcons: Record<Tone, LucideIcon> = {
  info: MailOpen,
  success: CircleCheck,
  warning: CircleAlert,
};

function InvitationPanel({
  tone = "info",
  title,
  description,
  children,
}: {
  tone?: Tone;
  title: string;
  description: ReactNode;
  children?: ReactNode;
}) {
  const Icon = toneIcons[tone];
  return (
    <div>
      <span
        aria-hidden="true"
        className={cn(
          "mb-5 grid size-10 place-items-center rounded-[10px]",
          toneClasses[tone],
        )}
      >
        <Icon strokeWidth={1.6} className="size-5" />
      </span>
      <AuthHeader title={title} description={description} />
      {children}
    </div>
  );
}

function LinkButton({
  href,
  variant = "primary",
  children,
}: {
  href: string;
  variant?: "primary" | "secondary";
  children: ReactNode;
}) {
  return (
    <Button
      nativeButton={false}
      variant={variant === "primary" ? "default" : "outline"}
      render={<Link href={href} />}
      className={
        variant === "primary" ? primaryButtonClass : secondaryButtonClass
      }
    >
      {children}
    </Button>
  );
}

function PanelLinks({ children }: { children: ReactNode }) {
  return (
    <p className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
      {children}
    </p>
  );
}

function Strong({ children }: { children: ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>;
}

export { InvitationPanel, LinkButton, linkClass, PanelLinks, Strong };
