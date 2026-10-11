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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { cn } from "@workspace/ui/lib/utils";
import {
  Archive,
  CircleSlash,
  ClipboardList,
  Ellipsis,
  ExternalLink,
  Link2,
  Plus,
  Send,
  SquarePen,
  Trash2,
} from "lucide-react";
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
import { Spinner } from "@/components/spinner";
import { StatusBadge } from "@/components/status-badge";
import {
  ConfirmFormDialog,
  type FormTarget,
} from "@/features/forms/components/confirm-form-dialog";
import { NameDialog } from "@/features/forms/components/name-dialog";
import {
  copy,
  describeError,
  statusLabels,
  statusTones,
} from "@/features/forms/lib/copy";
import {
  confirmedRate,
  type Form,
  type FormSummary,
  type FormsResult,
  formPath,
} from "@/features/forms/lib/forms";
import { runFormAction } from "@/features/forms/queries/client";
import { appHref } from "@/lib/navigation";

const noForms: FormSummary[] = [];
const noneDeleted: string[] = [];
const shownLists = 2;

type FormsScreenProps = {
  result: FormsResult;
};

const numberCellClass = cn(
  tableCellClass,
  "text-right whitespace-nowrap text-muted-foreground tabular-nums",
);

export function FormsScreen({ result }: FormsScreenProps) {
  const router = useRouter();
  const ready = result.state === "ready";
  const [deleted, setDeleted] = useState(noneDeleted);
  const [target, setTarget] = useState<FormTarget | null>(null);
  const [nameOpen, setNameOpen] = useState(false);
  const [nameKey, setNameKey] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [retrying, startRetry] = useTransition();

  const forms = (ready ? result.forms : noForms).filter(
    (form) => !deleted.includes(form.id),
  );

  function openName() {
    setNameKey((current) => current + 1);
    setNameOpen(true);
  }

  function handleCreated(form: Form) {
    router.push(appHref(formPath(form.id)));
  }

  async function publish(form: FormSummary) {
    if (busy) {
      return;
    }
    const name = form.name || copy.untitled;
    setBusy(form.id);
    const response = await runFormAction(form.id, "publish");
    setBusy(null);
    if (!response.ok) {
      toast.error(copy.toasts.publishFailed(name), {
        description: describeError(response.error),
      });
      return;
    }
    toast.success(copy.toasts.published(name));
    router.refresh();
  }

  async function unpublish(form: FormSummary) {
    if (busy) {
      return;
    }
    const name = form.name || copy.untitled;
    setBusy(form.id);
    const response = await runFormAction(form.id, "unpublish");
    setBusy(null);
    if (!response.ok) {
      toast.error(copy.toasts.unpublishFailed(name), {
        description: describeError(response.error),
      });
      return;
    }
    toast.success(copy.toasts.unpublished(name), {
      action: { label: copy.toasts.undo, onClick: () => void publish(form) },
    });
    router.refresh();
  }

  async function copyLink(form: FormSummary) {
    try {
      await navigator.clipboard.writeText(form.url);
      toast.success(copy.toasts.linkCopied);
    } catch {
      toast.error(copy.clipboard.failed, {
        description: copy.clipboard.failedBody,
      });
    }
  }

  function handleDone(done: FormTarget) {
    if (done.kind === "delete") {
      setDeleted((current) => [...current, done.id]);
    }
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
              onClick={openName}
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
        ) : forms.length === 0 ? (
          <Empty className="px-6 py-10">
            <EmptyHeader>
              <EmptyMedia
                variant="icon"
                className="size-9 border border-border bg-card text-primary shadow-xs"
              >
                <ClipboardList strokeWidth={1.6} aria-hidden />
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
                onClick={openName}
                className={secondaryButtonClass}
              >
                <Plus aria-hidden strokeWidth={1.8} />
                {copy.add}
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <Table className="min-w-[860px] table-fixed text-[13px]">
            <TableHeader className="[&_tr]:border-border-subtle">
              <TableRow className="hover:bg-transparent">
                <TableHead className={cn(tableHeadClass, "w-[28%]")}>
                  {copy.columns.name}
                </TableHead>
                <TableHead className={cn(tableHeadClass, "w-[120px]")}>
                  {copy.columns.status}
                </TableHead>
                <TableHead className={tableHeadClass}>
                  {copy.columns.lists}
                </TableHead>
                <TableHead
                  className={cn(tableHeadClass, "w-[116px] text-right")}
                >
                  {copy.columns.submissions}
                </TableHead>
                <TableHead
                  className={cn(tableHeadClass, "w-[104px] text-right")}
                >
                  {copy.columns.confirmed}
                </TableHead>
                <TableHead
                  className={cn(tableHeadClass, "w-[72px] text-right")}
                >
                  {copy.columns.rate}
                </TableHead>
                <TableHead className={cn(tableHeadClass, "w-14")}>
                  <span className="sr-only">{copy.columns.actions}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {forms.map((form) => {
                const href = appHref(formPath(form.id));
                const name = form.name || copy.untitled;
                const rate = confirmedRate(form);
                const lists = form.lists.slice(0, shownLists);
                const hidden = form.lists.length - lists.length;
                const allLists = form.lists.map((list) => list.name).join(", ");
                return (
                  <TableRow
                    key={form.id}
                    className="border-border-subtle hover:bg-muted/50"
                  >
                    <TableCell className={tableCellClass}>
                      <Link
                        href={href}
                        title={name}
                        className={cn(
                          "block truncate rounded-[4px] font-medium text-foreground hover:underline",
                          focusRing,
                        )}
                      >
                        {name}
                      </Link>
                      {form.doubleOptIn ? null : (
                        <div className="truncate text-[12.5px] text-ink-tertiary">
                          {copy.doubleOptInOff}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className={tableCellClass}>
                      <StatusBadge tone={statusTones[form.status]}>
                        {statusLabels[form.status]}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className={tableCellClass}>
                      {form.lists.length === 0 ? (
                        <div className="truncate text-ink-tertiary">
                          {copy.noLists}
                        </div>
                      ) : (
                        <div
                          title={allLists}
                          className="truncate text-muted-foreground"
                        >
                          {lists.map((list) => list.name).join(", ")}
                          {hidden > 0 ? (
                            <span className="text-ink-tertiary">
                              {" "}
                              {copy.moreLists(hidden)}
                            </span>
                          ) : null}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className={numberCellClass}>
                      {copy.number(form.submissionCount)}
                    </TableCell>
                    <TableCell className={numberCellClass}>
                      {copy.number(form.confirmedCount)}
                    </TableCell>
                    <TableCell className={numberCellClass}>
                      {rate === null ? (
                        <span className="text-ink-tertiary">{copy.none}</span>
                      ) : (
                        copy.percent(rate)
                      )}
                    </TableCell>
                    <TableCell className={cn(tableCellClass, "text-right")}>
                      {busy === form.id ? (
                        <span className="inline-grid size-7 place-items-center">
                          <Spinner className="size-3.5 text-ink-tertiary" />
                        </span>
                      ) : (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            aria-label={copy.actionsFor(name)}
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
                            {form.url ? (
                              <DropdownMenuItem
                                className={menuItemClass}
                                onClick={() => void copyLink(form)}
                              >
                                <Link2 aria-hidden strokeWidth={1.6} />
                                {copy.menu.copyLink}
                              </DropdownMenuItem>
                            ) : null}
                            {form.status === "published" && form.url ? (
                              <DropdownMenuItem
                                className={menuItemClass}
                                onClick={() =>
                                  window.open(
                                    form.url,
                                    "_blank",
                                    "noopener,noreferrer",
                                  )
                                }
                              >
                                <ExternalLink aria-hidden strokeWidth={1.6} />
                                {copy.menu.open}
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuSeparator />
                            {form.status === "published" ? (
                              <DropdownMenuItem
                                className={menuItemClass}
                                onClick={() => void unpublish(form)}
                              >
                                <CircleSlash aria-hidden strokeWidth={1.6} />
                                {copy.menu.unpublish}
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                className={menuItemClass}
                                onClick={() => void publish(form)}
                              >
                                <Send aria-hidden strokeWidth={1.6} />
                                {copy.menu.publish}
                              </DropdownMenuItem>
                            )}
                            {form.status === "archived" ? null : (
                              <DropdownMenuItem
                                className={menuItemClass}
                                onClick={() =>
                                  setTarget({
                                    kind: "archive",
                                    id: form.id,
                                    name: form.name,
                                  })
                                }
                              >
                                <Archive aria-hidden strokeWidth={1.6} />
                                {copy.menu.archive}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              className={menuItemClass}
                              onClick={() =>
                                setTarget({
                                  kind: "delete",
                                  id: form.id,
                                  name: form.name,
                                })
                              }
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
        )}
      </section>

      <NameDialog
        open={nameOpen}
        formKey={nameKey}
        onOpenChange={setNameOpen}
        onCreated={handleCreated}
      />
      <ConfirmFormDialog
        target={target}
        onClose={() => setTarget(null)}
        onDone={handleDone}
      />
    </div>
  );
}
