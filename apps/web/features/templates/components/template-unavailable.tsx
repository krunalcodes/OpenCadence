"use client";

import { cn } from "@workspace/ui/lib/utils";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { focusRing } from "@/components/app-shell/page-header";
import { LoadFailed } from "@/components/product/load-failed";
import { copy } from "@/features/templates/lib/copy";
import { appHref } from "@/lib/navigation";

export function TemplateUnavailable() {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  const text = copy.editor;

  return (
    <div className="flex min-w-0 flex-col gap-3.5 text-[13px]">
      <Link
        href={appHref("templates")}
        className={cn(
          "inline-flex h-7 w-fit items-center gap-1.5 rounded-lg px-1.5 font-medium text-muted-foreground hover:text-foreground",
          focusRing,
        )}
      >
        <ArrowLeft aria-hidden strokeWidth={1.6} className="size-4" />
        {text.back}
      </Link>
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <LoadFailed
          title={text.notFoundTitle}
          body={text.notFoundBody}
          retryLabel={copy.loadFailed.retry}
          pending={retrying}
          onRetry={() => startRetry(() => router.refresh())}
        />
      </section>
    </div>
  );
}
