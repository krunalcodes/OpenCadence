"use client";

import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Spinner } from "@/components/spinner";
import { copy } from "@/features/forms/lib/copy";

export function NoticeSubmitButton({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      aria-disabled={pending}
      onClick={(event) => {
        if (pending) {
          event.preventDefault();
        }
      }}
      className={cn(
        "h-auto min-h-11 w-full px-4 py-2.5 text-[15px] leading-snug whitespace-normal outline-none hover:bg-brand-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        pending && "opacity-80",
      )}
    >
      {pending ? <Spinner /> : null}
      <span>{children}</span>
      {pending ? <span className="sr-only">{copy.public.pending}</span> : null}
    </Button>
  );
}
