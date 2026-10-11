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
import {
  Ellipsis,
  ListChecks,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  buttonFocusRing,
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
import { DeleteListDialog } from "@/features/lists/components/delete-list-dialog";
import { ListSheet } from "@/features/lists/components/list-sheet";
import { copy } from "@/features/lists/lib/copy";
import {
  type List,
  type ListsResult,
  listContactsSearch,
} from "@/features/lists/lib/lists";
import { useHydrated } from "@/hooks/use-hydrated";
import { createEventClock } from "@/lib/event-clock";
import { appHref } from "@/lib/navigation";

const noLists: List[] = [];
const noneDeleted: string[] = [];

type ListsScreenProps = {
  result: ListsResult;
};

export function ListsScreen({ result }: ListsScreenProps) {
  const router = useRouter();
  const hydrated = useHydrated();
  const ready = result.state === "ready";
  const [deleted, setDeleted] = useState(noneDeleted);
  const [target, setTarget] = useState<List | null>(null);
  const [editing, setEditing] = useState<List | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetKey, setSheetKey] = useState(0);
  const [retrying, startRetry] = useTransition();

  const lists = (ready ? result.lists : noLists).filter(
    (list) => !deleted.includes(list.id),
  );
  const clock = createEventClock(
    hydrated ? "local" : "stable",
    new Date(),
    copy.days,
  );

  function openSheet(list: List | null) {
    setEditing(list);
    setSheetKey((current) => current + 1);
    setSheetOpen(true);
  }

  function handleSaved(list: List, created: boolean) {
    setSheetOpen(false);
    toast.success(
      created ? copy.toasts.created(list.name) : copy.toasts.saved(list.name),
    );
    router.refresh();
  }

  function handleDeleted(list: List) {
    setDeleted((current) => [...current, list.id]);
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
              onClick={() => openSheet(null)}
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
        ) : lists.length === 0 ? (
          <Empty className="px-6 py-10">
            <EmptyHeader>
              <EmptyMedia
                variant="icon"
                className="size-9 border border-border bg-card text-primary shadow-xs"
              >
                <ListChecks strokeWidth={1.6} aria-hidden />
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
                onClick={() => openSheet(null)}
                className={secondaryButtonClass}
              >
                <Plus aria-hidden strokeWidth={1.8} />
                {copy.add}
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <Table className="min-w-[720px] text-[13px]">
            <TableHeader className="[&_tr]:border-border-subtle">
              <TableRow className="hover:bg-transparent">
                <TableHead className={tableHeadClass}>
                  {copy.columns.name}
                </TableHead>
                <TableHead className={cn(tableHeadClass, "text-right")}>
                  {copy.columns.subscribed}
                </TableHead>
                <TableHead className={cn(tableHeadClass, "text-right")}>
                  {copy.columns.unsubscribed}
                </TableHead>
                <TableHead className={tableHeadClass}>
                  {copy.columns.created}
                </TableHead>
                <TableHead className={tableHeadClass}>
                  <span className="sr-only">{copy.columns.actions}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lists.map((list) => {
                const moment = clock(list.createdAt);
                return (
                  <TableRow
                    key={list.id}
                    className="border-border-subtle hover:bg-muted/50"
                  >
                    <TableCell className={cn(tableCellClass, "max-w-[480px]")}>
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="truncate font-medium text-foreground">
                          {list.name}
                        </div>
                        {list.isPublic ? (
                          <span className="inline-flex h-[22px] shrink-0 items-center rounded-[6px] bg-border-subtle px-2 text-xs font-medium whitespace-nowrap text-muted-foreground">
                            {copy.publicBadge}
                          </span>
                        ) : null}
                      </div>
                      {list.description ? (
                        <div
                          title={list.description}
                          className="truncate text-[12.5px] text-ink-tertiary"
                        >
                          {list.description}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell
                      className={cn(
                        tableCellClass,
                        "text-right text-foreground tabular-nums",
                      )}
                    >
                      {copy.count(list.subscribedCount)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        tableCellClass,
                        "text-right text-muted-foreground tabular-nums",
                      )}
                    >
                      {copy.count(list.unsubscribedCount)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        tableCellClass,
                        "whitespace-nowrap text-muted-foreground tabular-nums",
                      )}
                    >
                      {moment ? (
                        <time dateTime={moment.iso} suppressHydrationWarning>
                          {moment.day}
                        </time>
                      ) : null}
                    </TableCell>
                    <TableCell className={cn(tableCellClass, "text-right")}>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          aria-label={copy.actionsFor(list.name)}
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
                          className="w-52 p-1 text-[13px]"
                        >
                          <DropdownMenuItem
                            className={menuItemClass}
                            render={
                              <Link
                                href={`${appHref("contacts")}?${listContactsSearch(list.id)}`}
                              />
                            }
                          >
                            <Users aria-hidden strokeWidth={1.6} />
                            {copy.menu.view}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className={menuItemClass}
                            onClick={() => openSheet(list)}
                          >
                            <Pencil aria-hidden strokeWidth={1.6} />
                            {copy.menu.edit}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            className={menuItemClass}
                            onClick={() => setTarget(list)}
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
        )}
      </section>

      <ListSheet
        open={sheetOpen}
        formKey={sheetKey}
        list={editing}
        onOpenChange={setSheetOpen}
        onSaved={handleSaved}
      />
      <DeleteListDialog
        list={target}
        onClose={() => setTarget(null)}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
