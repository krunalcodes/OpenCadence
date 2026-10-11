"use client";

import { cn } from "@workspace/ui/lib/utils";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { focusRing } from "@/components/app-shell/page-header";
import { LoadFailed } from "@/components/product/load-failed";
import { copy } from "@/features/forms/lib/copy";
import { appHref } from "@/lib/navigation";

export const backLinkClass = cn(
  "inline-flex h-7 w-fit items-center gap-1.5 rounded-lg px-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground",
  focusRing,
);

export function BackToForms() {
  return (
    <Link href={appHref("forms")} className={backLinkClass}>
      <ArrowLeft aria-hidden strokeWidth={1.6} className="size-4" />
      {copy.unavailable.back}
    </Link>
  );
}

export function FormUnavailable() {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  const text = copy.unavailable;

  return (
    <div className="flex min-w-0 flex-col gap-3.5 text-[13px]">
      <BackToForms />
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <LoadFailed
          title={text.title}
          body={text.body}
          retryLabel={text.retry}
          pending={retrying}
          onRetry={() => startRetry(() => router.refresh())}
        />
      </section>
    </div>
  );
}
