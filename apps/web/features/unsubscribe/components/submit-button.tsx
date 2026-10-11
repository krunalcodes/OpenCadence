"use client";

import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Spinner } from "@/components/spinner";
import { copy } from "@/features/unsubscribe/lib/copy";

const base =
  "h-auto min-h-11 w-full whitespace-normal px-4 py-2.5 text-[15px] leading-snug outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const variants = {
  primary: "hover:bg-brand-hover",
  secondary: "bg-card shadow-xs hover:bg-muted",
};

function SubmitButton({
  variant,
  children,
}: {
  variant: keyof typeof variants;
  children: ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant === "primary" ? "default" : "outline"}
      aria-disabled={pending}
      onClick={(event) => {
        if (pending) {
          event.preventDefault();
        }
      }}
      className={cn(base, variants[variant], pending && "opacity-80")}
    >
      {pending ? <Spinner /> : null}
      <span>{children}</span>
      {pending ? <span className="sr-only">{copy.pending}</span> : null}
    </Button>
  );
}

export { SubmitButton };
