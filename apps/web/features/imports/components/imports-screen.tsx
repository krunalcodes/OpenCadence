"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { LoadFailed } from "@/components/product/load-failed";
import { ImportWizard } from "@/features/imports/components/import-wizard";
import { RecentImports } from "@/features/imports/components/recent-imports";
import { useImportPolling } from "@/features/imports/hooks/use-import-polling";
import { copy } from "@/features/imports/lib/copy";
import {
  type CatalogResult,
  type Import,
  type ImportsResult,
  isActive,
  mergeImports,
} from "@/features/imports/lib/imports";
import { useHydrated } from "@/hooks/use-hydrated";
import { createEventClock } from "@/lib/event-clock";

const noImports: Import[] = [];
const noUpdates: Record<string, Import> = {};

type Session = { key: number; resume: Import | null };

type ImportsScreenProps = {
  imports: ImportsResult;
  catalog: CatalogResult;
};

export function ImportsScreen({ imports, catalog }: ImportsScreenProps) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [live, setLive] = useState(noUpdates);
  const [known, setKnown] = useState(catalog);
  const [session, setSession] = useState<Session>({ key: 0, resume: null });
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retrying, startRetry] = useTransition();
  const [, startRefresh] = useTransition();

  if (catalog.state === "ready" && catalog !== known) {
    setKnown(catalog);
  }

  const shownCatalog = catalog.state === "ready" ? catalog : known;
  const loaded = imports.state === "ready" ? imports.imports : noImports;
  const items = mergeImports(loaded, live);
  const activeIds = items
    .filter((item) => isActive(item.status))
    .map((item) => item.id);
  const clock = createEventClock(
    hydrated ? "local" : "stable",
    new Date(),
    copy.days,
  );

  function track(item: Import) {
    setLive((existing) => ({ ...existing, [item.id]: item }));
  }

  const stale = useImportPolling(activeIds, (item) => {
    track(item);
    if (!isActive(item.status)) {
      startRefresh(() => router.refresh());
    }
  });

  function retry() {
    startRetry(() => router.refresh());
  }

  return (
    <div className="@container flex min-w-0 flex-col gap-[18px] text-[13px] leading-normal">
      <PageHeader
        title={copy.title}
        description={<p className="max-w-[720px]">{copy.description}</p>}
      />

      {shownCatalog.state === "ready" ? (
        <ImportWizard
          key={session.key}
          catalog={shownCatalog}
          resume={session.resume}
          live={live}
          stale={stale}
          onImport={(item) => {
            track(item);
            setCurrentId(item.id);
          }}
          onBusyChange={setBusy}
          onReset={() => {
            setCurrentId(null);
            setSession((existing) => ({
              key: existing.key + 1,
              resume: null,
            }));
          }}
        />
      ) : (
        <section
          aria-label={copy.wizard.label}
          className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-xs"
        >
          <LoadFailed
            title={copy.catalogFailed.title}
            body={copy.catalogFailed.body}
            retryLabel={copy.catalogFailed.retry}
            pending={retrying}
            onRetry={retry}
          />
        </section>
      )}

      <RecentImports
        failed={imports.state === "failed"}
        items={items}
        clock={clock}
        currentId={currentId}
        busy={busy}
        retrying={retrying}
        onRetry={retry}
        onResume={(item) => {
          setCurrentId(item.id);
          setSession((existing) => ({
            key: existing.key + 1,
            resume: item,
          }));
        }}
      />
    </div>
  );
}
