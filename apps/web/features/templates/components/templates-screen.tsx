"use client";

import { Button } from "@workspace/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { cn } from "@workspace/ui/lib/utils";
import {
  Copy,
  Ellipsis,
  LayoutTemplate,
  Pencil,
  Plus,
  Search,
  SquarePen,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  buttonFocusRing,
  focusRing,
  PageHeader,
} from "@/components/app-shell/page-header";
import {
  type FilterChip,
  FilterChips,
} from "@/components/product/filter-chips";
import { LoadFailed } from "@/components/product/load-failed";
import {
  menuItemClass,
  primaryButtonClass,
  secondaryButtonClass,
  tableCellClass,
  tableHeadClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import { DeleteTemplateDialog } from "@/features/templates/components/delete-template-dialog";
import { NameDialog } from "@/features/templates/components/name-dialog";
import { copy, describeError } from "@/features/templates/lib/copy";
import {
  maxSearchLength,
  searchQuery,
  type Template,
  type TemplateSummary,
  type TemplatesResult,
  templatePath,
} from "@/features/templates/lib/templates";
import {
  duplicateTemplate,
  fetchTemplates,
} from "@/features/templates/queries/client";
import { useHydrated } from "@/hooks/use-hydrated";
import { useLoadMore } from "@/hooks/use-load-more";
import { createEventClock } from "@/lib/event-clock";
import { appHref } from "@/lib/navigation";

const searchDelay = 300;

const noTemplates: TemplateSummary[] = [];
const noneDeleted: string[] = [];

type TemplatesScreenProps = {
  result: TemplatesResult;
  search: string;
};

export function TemplatesScreen({ result, search }: TemplatesScreenProps) {
  const router = useRouter();
  const hydrated = useHydrated();
  const ready = result.state === "ready";
  const list = useLoadMore(result, {
    items: ready ? result.templates : noTemplates,
    nextCursor: ready ? result.nextCursor : null,
  });
  const [text, setText] = useState(search);
  const [deleted, setDeleted] = useState(noneDeleted);
  const [target, setTarget] = useState<TemplateSummary | null>(null);
  const [naming, setNaming] = useState<TemplateSummary | null>(null);
  const [nameOpen, setNameOpen] = useState(false);
  const [nameKey, setNameKey] = useState(0);
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const [navigating, startNavigation] = useTransition();
  const [retrying, startRetry] = useTransition();
  const requested = useRef(search);

  const templates = list.items.filter((item) => !deleted.includes(item.id));
  const clock = createEventClock(
    hydrated ? "local" : "stable",
    new Date(),
    copy.days,
  );
  const blank = ready && templates.length === 0 && search === "" && text === "";

  useEffect(() => {
    const next = text.trim();
    if (next === requested.current) {
      return;
    }
    const timer = window.setTimeout(() => {
      const query = searchQuery(next);
      const base = appHref("templates");
      requested.current = next;
      startNavigation(() => {
        router.replace(query ? `${base}?${query}` : base);
      });
    }, searchDelay);
    return () => window.clearTimeout(timer);
  }, [text, router]);

  function clearSearch() {
    setText("");
    requested.current = "";
    startNavigation(() => {
      router.replace(appHref("templates"));
    });
  }

  const chips: FilterChip[] =
    search === ""
      ? []
      : [{ id: "search", label: copy.searchChip(search), remove: clearSearch }];

  function loadMore() {
    void list.loadMore(async (cursor) => {
      const response = await fetchTemplates(search, cursor);
      if (!response.ok) {
        toast.error(copy.loadMoreFailed, {
          description: describeError(response.error),
        });
        return null;
      }
      return {
        items: response.data.templates,
        nextCursor: response.data.nextCursor,
      };
    });
  }

  function openName(template: TemplateSummary | null) {
    setNaming(template);
    setNameKey((current) => current + 1);
    setNameOpen(true);
  }

  function handleNamed(template: Template, created: boolean) {
    if (created) {
      router.push(appHref(templatePath(template.id)));
      return;
    }
    setNameOpen(false);
    toast.success(copy.toasts.renamed(template.name));
    router.refresh();
  }

  async function duplicate(template: TemplateSummary) {
    if (duplicating) {
      return;
    }
    setDuplicating(template.id);
    const response = await duplicateTemplate(template.id);
    setDuplicating(null);
    if (!response.ok) {
      toast.error(copy.toasts.duplicateFailed(template.name), {
        description: describeError(response.error),
      });
      return;
    }
    toast.success(copy.toasts.duplicated(response.data.name));
    router.refresh();
  }

  function handleDeleted(template: TemplateSummary) {
    setDeleted((current) => [...current, template.id]);
    router.refresh();
  }

  return (
    <div className="@container flex min-w-0 flex-col gap-[18px] text-[13px] leading-normal">
      <PageHeader
        title={copy.title}
        description={<p className="max-w-[720px]">{copy.description}</p>}
        actions={
          ready ? (
            <Button
              type="button"
              onClick={() => openName(null)}
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
        aria-busy={navigating || undefined}
        className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-xs"
      >
        {blank || !ready ? null : (
          <div className="flex flex-col gap-2.5 border-b border-border-subtle px-4 py-[13px]">
            <div className="flex flex-wrap items-center gap-2">
              <InputGroup className="h-8 w-72 max-w-full bg-card shadow-xs">
                <InputGroupAddon>
                  <Search aria-hidden strokeWidth={1.6} />
                </InputGroupAddon>
                <InputGroupInput
                  type="search"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={maxSearchLength}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  aria-label={copy.searchLabel}
                  placeholder={copy.searchPlaceholder}
                  className="text-[13px]"
                />
              </InputGroup>
              {navigating ? (
                <Spinner className="size-3.5 text-ink-tertiary" />
              ) : null}
              <p
                aria-live="polite"
                className="ml-auto text-[12.5px] text-ink-tertiary tabular-nums"
              >
                {copy.count(templates.length, list.cursor !== null)}
              </p>
            </div>
            <FilterChips
              chips={chips}
              label={copy.activeFilters}
              clearLabel={copy.clearAll}
              removeLabel={copy.removeFilter}
              onClear={clearSearch}
            />
          </div>
        )}

        {!ready ? (
          <LoadFailed
            title={copy.loadFailed.title}
            body={copy.loadFailed.body}
            retryLabel={copy.loadFailed.retry}
            pending={retrying}
            onRetry={() => startRetry(() => router.refresh())}
          />
        ) : blank ? (
          <Empty className="px-6 py-10">
            <EmptyHeader>
              <EmptyMedia
                variant="icon"
                className="size-9 border border-border bg-card text-primary shadow-xs"
              >
                <LayoutTemplate strokeWidth={1.6} aria-hidden />
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
                onClick={() => openName(null)}
                className={secondaryButtonClass}
              >
                <Plus aria-hidden strokeWidth={1.8} />
                {copy.add}
              </Button>
            </EmptyContent>
          </Empty>
        ) : templates.length === 0 ? (
          <Empty className="px-6 py-10">
            <EmptyHeader>
              <EmptyTitle className="text-sm font-semibold text-foreground">
                {copy.noMatchTitle}
              </EmptyTitle>
              <EmptyDescription className="text-[13px]">
                {copy.noMatchBody}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                type="button"
                variant="outline"
                onClick={clearSearch}
                className={secondaryButtonClass}
              >
                {copy.clearAll}
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <>
            <Table
              className={cn(
                "min-w-[720px] table-fixed text-[13px] transition-opacity",
                navigating && "opacity-60",
              )}
            >
              <TableHeader className="[&_tr]:border-border-subtle">
                <TableRow className="hover:bg-transparent">
                  <TableHead className={cn(tableHeadClass, "w-[34%]")}>
                    {copy.columns.name}
                  </TableHead>
                  <TableHead className={tableHeadClass}>
                    {copy.columns.subject}
                  </TableHead>
                  <TableHead className={cn(tableHeadClass, "w-44")}>
                    {copy.columns.edited}
                  </TableHead>
                  <TableHead className={cn(tableHeadClass, "w-14")}>
                    <span className="sr-only">{copy.columns.actions}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((template) => {
                  const moment = clock(template.updatedAt);
                  const href = appHref(templatePath(template.id));
                  return (
                    <TableRow
                      key={template.id}
                      className="border-border-subtle hover:bg-muted/50"
                    >
                      <TableCell className={tableCellClass}>
                        <Link
                          href={href}
                          title={template.name}
                          className={cn(
                            "block truncate rounded-[4px] font-medium text-foreground hover:underline",
                            focusRing,
                          )}
                        >
                          {template.name}
                        </Link>
                      </TableCell>
                      <TableCell className={tableCellClass}>
                        {template.subject ? (
                          <div
                            title={template.subject}
                            className="truncate text-muted-foreground"
                          >
                            {template.subject}
                          </div>
                        ) : (
                          <div className="truncate text-ink-tertiary">
                            {copy.noSubject}
                          </div>
                        )}
                      </TableCell>
                      <TableCell
                        className={cn(
                          tableCellClass,
                          "whitespace-nowrap text-muted-foreground tabular-nums",
                        )}
                      >
                        {moment ? (
                          <time dateTime={moment.iso} suppressHydrationWarning>
                            {moment.day}, {moment.time}
                          </time>
                        ) : null}
                      </TableCell>
                      <TableCell className={cn(tableCellClass, "text-right")}>
                        {duplicating === template.id ? (
                          <span className="inline-grid size-7 place-items-center">
                            <Spinner className="size-3.5 text-ink-tertiary" />
                          </span>
                        ) : (
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              aria-label={copy.actionsFor(template.name)}
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
                                <SquarePen aria-hidden strokeWidth={1.6} />
                                {copy.menu.edit}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className={menuItemClass}
                                onClick={() => openName(template)}
                              >
                                <Pencil aria-hidden strokeWidth={1.6} />
                                {copy.menu.rename}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className={menuItemClass}
                                onClick={() => void duplicate(template)}
                              >
                                <Copy aria-hidden strokeWidth={1.6} />
                                {copy.menu.duplicate}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                className={menuItemClass}
                                onClick={() => setTarget(template)}
                              >
                                <Trash2 aria-hidden strokeWidth={1.6} />
                                {copy.menu.remove}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {list.cursor ? (
              <div className="flex justify-center border-t border-border-subtle px-4 py-3">
                <Button
                  type="button"
                  variant="outline"
                  disabled={list.loading || navigating}
                  aria-busy={list.loading || undefined}
                  onClick={loadMore}
                  className={secondaryButtonClass}
                >
                  {list.loading ? <Spinner /> : null}
                  {copy.loadMore}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </section>

      <NameDialog
        open={nameOpen}
        formKey={nameKey}
        template={naming}
        onOpenChange={setNameOpen}
        onSaved={handleNamed}
      />
      <DeleteTemplateDialog
        template={target}
        onClose={() => setTarget(null)}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
