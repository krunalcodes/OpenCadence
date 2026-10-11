"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LoadFailed } from "@/components/product/load-failed";
import { BackToDomains } from "@/features/domains/components/domain-parts";
import { copy } from "@/features/domains/lib/copy";

export function DomainUnavailable({ missing }: { missing: boolean }) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  const text = copy.unavailable;

  return (
    <div className="flex min-w-0 flex-col gap-3.5 text-[13px]">
      <BackToDomains />
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        {missing ? (
          <p role="alert" className="px-4 py-4 text-muted-foreground">
            <span className="font-medium text-foreground">
              {text.missingTitle}
            </span>{" "}
            {text.missingBody}
          </p>
        ) : (
          <LoadFailed
            title={text.failedTitle}
            body={text.failedBody}
            retryLabel={text.retry}
            pending={retrying}
            onRetry={() => startRetry(() => router.refresh())}
          />
        )}
      </section>
    </div>
  );
}
