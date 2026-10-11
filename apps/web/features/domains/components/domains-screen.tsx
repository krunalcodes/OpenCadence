"use client";

import { Button } from "@workspace/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { cn } from "@workspace/ui/lib/utils";
import { Ellipsis, Globe, ListChecks, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  buttonFocusRing,
  focusRing,
  PageHeader,
} from "@/components/app-shell/page-header";
import { LoadFailed } from "@/components/product/load-failed";
import {
  menuItemClass,
  primaryButtonClass,
  secondaryButtonClass,
  tableCellClass,
  tableHeadClass,
} from "@/components/product/styles";
import { AddDomainSheet } from "@/features/domains/components/add-domain-sheet";
import { DeleteDomainDialog } from "@/features/domains/components/delete-domain-dialog";
import {
  DomainStatusBadge,
  RecordMarks,
} from "@/features/domains/components/domain-parts";
import { copy } from "@/features/domains/lib/copy";
import type { Domain, DomainsResult } from "@/features/domains/lib/domains";
import { useHydrated } from "@/hooks/use-hydrated";
import { createEventClock } from "@/lib/event-clock";
import { appHref } from "@/lib/navigation";

const noDomains: Domain[] = [];
const noSuggestions: string[] = [];
const noneDeleted: string[] = [];

type DomainsScreenProps = {
  result: DomainsResult;
};

export function DomainsScreen({ result }: DomainsScreenProps) {
  const router = useRouter();
  const hydrated = useHydrated();
  const ready = result.state === "ready";
  const [deleted, setDeleted] = useState(noneDeleted);
  const [target, setTarget] = useState<Domain | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetKey, setSheetKey] = useState(0);
  const [sheetDomain, setSheetDomain] = useState("");
  const [retrying, startRetry] = useTransition();

  const domains = (ready ? result.domains : noDomains).filter(
    (domain) => !deleted.includes(domain.id),
  );
  const suggestions = ready ? result.suggestions : noSuggestions;
  const clock = createEventClock(
    hydrated ? "local" : "stable",
    new Date(),
    copy.days,
  );

  function openSheet(domain: string) {
    setSheetDomain(domain);
    setSheetKey((current) => current + 1);
    setSheetOpen(true);
  }

  function handleCreated(domain: Domain) {
    setSheetOpen(false);
    toast.success(copy.toasts.created(domain.domain));
    router.push(appHref(`domains/${domain.id}`));
  }

  function handleDeleted(domain: Domain) {
    setDeleted((current) => [...current, domain.id]);
    router.refresh();
  }

  const suggestionChips =
    suggestions.length > 0 ? (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="text-[12.5px] text-muted-foreground">
          {copy.suggestionsTitle}
        </span>
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            aria-label={copy.addSuggested(suggestion)}
            onClick={() => openSheet(suggestion)}
            className={cn(
              "inline-flex h-[22px] max-w-full items-center gap-1 rounded-[6px] border border-border bg-card pr-2 pl-1.5 font-mono text-xs text-foreground hover:bg-muted",
              focusRing,
            )}
          >
            <Plus
              aria-hidden
              strokeWidth={1.8}
              className="size-3 text-muted-foreground"
            />
            <span className="truncate">{suggestion}</span>
          </button>
        ))}
      </div>
    ) : null;

  return (
    <div className="@container flex min-w-0 flex-col gap-[18px] text-[13px] leading-normal">
      <PageHeader
        title={copy.title}
        description={<p className="max-w-[720px]">{copy.description}</p>}
        actions={
          ready ? (
            <Button
              type="button"
              onClick={() => openSheet("")}
              className={primaryButtonClass}
            >
              <Plus aria-hidden strokeWidth={1.8} />
              {copy.add}
            </Button>
          ) : null
        }
      />

      <section
        aria-label={copy.title}
        className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-xs"
      >
        {!ready ? (
          <LoadFailed
            title={copy.loadFailed.title}
            body={copy.loadFailed.body}
            retryLabel={copy.loadFailed.retry}
            pending={retrying}
            onRetry={() => startRetry(() => router.refresh())}
          />
        ) : domains.length === 0 ? (
          <Empty className="px-6 py-10">
            <EmptyHeader>
              <EmptyMedia
                variant="icon"
                className="size-9 border border-border bg-card text-primary shadow-xs"
              >
                <Globe strokeWidth={1.6} aria-hidden />
              </EmptyMedia>
              <EmptyTitle className="text-sm font-semibold text-foreground">
                {copy.emptyTitle}
              </EmptyTitle>
              <EmptyDescription className="text-[13px]">
                {copy.emptyBody}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                type="button"
                variant="outline"
                onClick={() => openSheet("")}
                className={secondaryButtonClass}
              >
                <Plus aria-hidden strokeWidth={1.8} />
                {copy.add}
              </Button>
              {suggestionChips ? (
                <div className="flex justify-center">{suggestionChips}</div>
              ) : null}
            </EmptyContent>
          </Empty>
        ) : (
          <>
            {suggestionChips ? (
              <div className="border-b border-border-subtle px-4 py-2.5">
                {suggestionChips}
              </div>
            ) : null}
            <Table className="min-w-[760px] text-[13px]">
              <TableHeader className="[&_tr]:border-border-subtle">
                <TableRow className="hover:bg-transparent">
                  <TableHead className={tableHeadClass}>
                    {copy.columns.domain}
                  </TableHead>
                  <TableHead className={tableHeadClass}>
                    {copy.columns.status}
                  </TableHead>
                  <TableHead className={tableHeadClass}>
                    {copy.columns.records}
                  </TableHead>
                  <TableHead className={tableHeadClass}>
                    {copy.columns.checked}
                  </TableHead>
                  <TableHead className={tableHeadClass}>
                    <span className="sr-only">{copy.columns.actions}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {domains.map((domain) => {
                  const moment = domain.lastCheckedAt
                    ? clock(domain.lastCheckedAt)
                    : null;
                  const sources = copy.sourcesLine(
                    domain.sources.map((source) => source.name),
                  );
                  const href = appHref(`domains/${domain.id}`);
                  return (
                    <TableRow
                      key={domain.id}
                      className="border-border-subtle hover:bg-muted/50"
                    >
                      <TableCell
                        className={cn(tableCellClass, "max-w-[420px]")}
                      >
                        <Link
                          href={href}
                          className={cn(
                            "block truncate rounded-[4px] font-medium text-foreground hover:underline",
                            focusRing,
                          )}
                        >
                          {domain.domain}
                        </Link>
                        <div
                          title={sources}
                          className="truncate text-[12.5px] text-ink-tertiary"
                        >
                          {sources}
                        </div>
                      </TableCell>
                      <TableCell className={tableCellClass}>
                        <DomainStatusBadge status={domain.status} />
                      </TableCell>
                      <TableCell className={tableCellClass}>
                        <RecordMarks domain={domain} />
                      </TableCell>
                      <TableCell
                        className={cn(
                          tableCellClass,
                          "whitespace-nowrap text-muted-foreground tabular-nums",
                        )}
                      >
                        {moment ? (
                          <time dateTime={moment.iso} suppressHydrationWarning>
                            {copy.at(moment.day, moment.time)}
                          </time>
                        ) : (
                          copy.neverChecked
                        )}
                      </TableCell>
                      <TableCell className={cn(tableCellClass, "text-right")}>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            aria-label={copy.actionsFor(domain.domain)}
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className={cn(
                                  "-mr-1.5 text-muted-foreground hover:bg-accent",
                                  buttonFocusRing,
                                )}
                              />
                            }
                          >
                            <Ellipsis aria-hidden strokeWidth={1.6} />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="w-48 p-1 text-[13px]"
                          >
                            <DropdownMenuItem
                              className={menuItemClass}
                              render={<Link href={href} />}
                            >
                              <ListChecks aria-hidden strokeWidth={1.6} />
                              {copy.menu.open}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              className={menuItemClass}
                              onClick={() => setTarget(domain)}
                            >
                              <Trash2 aria-hidden strokeWidth={1.6} />
                              {copy.menu.remove}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </>
        )}
      </section>

      <AddDomainSheet
        open={sheetOpen}
        formKey={sheetKey}
        initialDomain={sheetDomain}
        suggestions={suggestions}
        onOpenChange={setSheetOpen}
        onCreated={handleCreated}
      />
      <DeleteDomainDialog
        domain={target}
        onClose={() => setTarget(null)}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
