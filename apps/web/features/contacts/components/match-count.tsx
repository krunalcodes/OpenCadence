"use client";

import { Skeleton } from "@workspace/ui/components/skeleton";
import { useEffect, useState } from "react";
import type { ContactFilters } from "@/features/contacts/lib/contacts";
import { copy } from "@/features/contacts/lib/copy";
import { fetchContactCount } from "@/features/contacts/queries/client";

type MatchCountProps = {
  filters: ContactFilters;
  version: unknown;
};

type Counted = { version: unknown; count: number | null };

export function MatchCount({ filters, version }: MatchCountProps) {
  const [counted, setCounted] = useState<Counted | null>(null);
  const { search, listId, tagId, segmentId } = filters;

  useEffect(() => {
    let current = true;
    void fetchContactCount({ search, listId, tagId, segmentId }).then(
      (result) => {
        if (current) {
          setCounted({ version, count: result.ok ? result.data : null });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [search, listId, tagId, segmentId, version]);

  if (!counted || counted.version !== version) {
    return (
      <div className="ml-auto" role="status" aria-label={copy.countLoading}>
        <Skeleton className="h-4 w-24" />
      </div>
    );
  }
  if (counted.count === null) {
    return null;
  }
  return (
    <p
      aria-live="polite"
      className="ml-auto text-[12.5px] text-ink-tertiary tabular-nums"
    >
      {copy.count(counted.count)}
    </p>
  );
}
