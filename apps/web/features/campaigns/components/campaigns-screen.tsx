"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@workspace/ui/components/combobox";
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
  ArrowUpRight,
  Copy,
  Ellipsis,
  Mail,
  Plus,
  Search,
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
import { StatusBadge } from "@/components/status-badge";
import { DeleteCampaignDialog } from "@/features/campaigns/components/delete-campaign-dialog";
import { NameDialog } from "@/features/campaigns/components/name-dialog";
import {
  type Campaign,
  type CampaignFilters,
  type CampaignStatus,
  type CampaignSummary,
  type CampaignsResult,
  campaignPath,
  campaignStatuses,
  filtersSearch,
  maxSearchLength,
  rateOf,
} from "@/features/campaigns/lib/campaigns";
import {
  copy,
  describeError,
  statusLabels,
  statusTones,
} from "@/features/campaigns/lib/copy";
import {
  duplicateCampaign,
  fetchCampaigns,
} from "@/features/campaigns/queries/client";
import { useHydrated } from "@/hooks/use-hydrated";
import { useLoadMore } from "@/hooks/use-load-more";
import { createEventClock } from "@/lib/event-clock";
import { appHref } from "@/lib/navigation";

const searchDelay = 300;

type StatusOption = { value: CampaignStatus; label: string };

const statusOptions: StatusOption[] = campaignStatuses.map((status) => ({
  value: status,
  label: statusLabels[status],
}));

const noCampaigns: CampaignSummary[] = [];
const noneDeleted: string[] = [];

type CampaignsScreenProps = {
  result: CampaignsResult;
  filters: CampaignFilters;
  brandName: string;
};

function dateOf(campaign: CampaignSummary) {
  switch (campaign.status) {
    case "draft":
      return campaign.updatedAt;
    case "scheduled":
      return campaign.scheduledAt;
    case "sent":
      return campaign.completedAt ?? campaign.startedAt;
    case "cancelled":
    case "failed":
      return campaign.completedAt ?? campaign.startedAt ?? campaign.updatedAt;
    default:
      return campaign.startedAt;
  }
}

export function CampaignsScreen({
  result,
  filters,
  brandName,
}: CampaignsScreenProps) {
  const router = useRouter();
  const hydrated = useHydrated();
  const ready = result.state === "ready";
  const list = useLoadMore(result, {
    items: ready ? result.campaigns : noCampaigns,
    nextCursor: ready ? result.nextCursor : null,
  });
  const [text, setText] = useState(filters.search);
  const [draft, setDraft] = useState<CampaignFilters | null>(null);
  const [deleted, setDeleted] = useState(noneDeleted);
  const [target, setTarget] = useState<CampaignSummary | null>(null);
  const [nameOpen, setNameOpen] = useState(false);
  const [nameKey, setNameKey] = useState(0);
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const [navigating, startNavigation] = useTransition();
  const [retrying, startRetry] = useTransition();
  const requested = useRef(filters.search);
  const statusRef = useRef(filters.status);

  const shown = navigating && draft ? draft : filters;
  const campaigns = list.items.filter((item) => !deleted.includes(item.id));
  const clock = createEventClock(
    hydrated ? "local" : "stable",
    new Date(),
    copy.days,
  );
  const statusOption =
    statusOptions.find((option) => option.value === shown.status) ?? null;
  const filtered = shown.status !== null || shown.search !== "";
  const blank = ready && campaigns.length === 0 && !filtered && text === "";

  useEffect(() => {
    statusRef.current = shown.status;
  }, [shown.status]);

  function navigate(next: CampaignFilters) {
    const search = filtersSearch(next);
    const base = appHref("campaigns");
    setDraft(next);
    requested.current = next.search;
    startNavigation(() => {
      router.replace(search ? `${base}?${search}` : base);
    });
  }

  useEffect(() => {
    const next = text.trim();
    if (next === requested.current) {
      return;
    }
    const timer = window.setTimeout(() => {
      const wanted = { status: statusRef.current, search: next };
      const search = filtersSearch(wanted);
      const base = appHref("campaigns");
      requested.current = next;
      setDraft(wanted);
      startNavigation(() => {
        router.replace(search ? `${base}?${search}` : base);
      });
    }, searchDelay);
    return () => window.clearTimeout(timer);
  }, [text, router]);

  function clearAll() {
    setText("");
    navigate({ status: null, search: "" });
  }

  const chips: FilterChip[] = [];
  if (statusOption) {
    chips.push({
      id: "status",
      label: statusOption.label,
      remove: () => navigate({ ...shown, status: null }),
    });
  }
  if (shown.search !== "") {
    chips.push({
      id: "search",
      label: copy.searchChip(shown.search),
      remove: () => {
        setText("");
        navigate({ ...shown, search: "" });
      },
    });
  }

  function loadMore() {
    void list.loadMore(async (cursor) => {
      const response = await fetchCampaigns(filters, cursor);
      if (!response.ok) {
        toast.error(copy.loadMoreFailed, {
          description: describeError(response.error),
        });
        return null;
      }
      return {
        items: response.data.campaigns,
        nextCursor: response.data.nextCursor,
      };
    });
  }

  function openName() {
    setNameKey((current) => current + 1);
    setNameOpen(true);
  }

  function handleCreated(campaign: Campaign) {
    router.push(appHref(campaignPath(campaign.id)));
  }

  async function duplicate(campaign: CampaignSummary) {
    if (duplicating) {
      return;
    }
    setDuplicating(campaign.id);
    const response = await duplicateCampaign(campaign.id);
    setDuplicating(null);
    if (!response.ok) {
      toast.error(copy.toasts.duplicateFailed(campaign.name || copy.untitled), {
        description: describeError(response.error),
      });
      return;
    }
    toast.success(copy.toasts.duplicated(response.data.name || copy.untitled));
    router.refresh();
  }

  function handleDeleted(campaign: CampaignSummary) {
    setDeleted((current) => [...current, campaign.id]);
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
              <Combobox
                items={statusOptions}
                value={statusOption}
                onValueChange={(next: StatusOption | null) =>
                  navigate({ ...shown, status: next?.value ?? null })
                }
              >
                <ComboboxInput
                  aria-label={copy.statusLabel}
                  placeholder={copy.statusPlaceholder}
                  showClear={statusOption !== null}
                  className="h-8 w-44 bg-card text-[13px] shadow-xs"
                />
                <ComboboxContent>
                  <ComboboxEmpty>{copy.statusEmpty}</ComboboxEmpty>
                  <ComboboxList>
                    {(item: StatusOption) => (
                      <ComboboxItem
                        key={item.value}
                        value={item}
                        className="text-[13px]"
                      >
                        {item.label}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
              {navigating ? (
                <Spinner className="size-3.5 text-ink-tertiary" />
              ) : null}
              <p
                aria-live="polite"
                className="ml-auto text-[12.5px] text-ink-tertiary tabular-nums"
              >
                {copy.count(campaigns.length, list.cursor !== null)}
              </p>
            </div>
            <FilterChips
              chips={chips}
              label={copy.activeFilters}
              clearLabel={copy.clearAll}
              removeLabel={copy.removeFilter}
              onClear={clearAll}
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
                <Mail strokeWidth={1.6} aria-hidden />
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
        ) : campaigns.length === 0 ? (
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
                onClick={clearAll}
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
                "min-w-[980px] table-fixed text-[13px] transition-opacity",
                navigating && "opacity-60",
              )}
            >
              <TableHeader className="[&_tr]:border-border-subtle">
                <TableRow className="hover:bg-transparent">
                  <TableHead className={cn(tableHeadClass, "w-[28%]")}>
                    {copy.columns.name}
                  </TableHead>
                  <TableHead className={cn(tableHeadClass, "w-[112px]")}>
                    {copy.columns.status}
                  </TableHead>
                  <TableHead className={tableHeadClass}>
                    {copy.columns.audience}
                  </TableHead>
                  <TableHead
                    className={cn(tableHeadClass, "w-[104px] text-right")}
                  >
                    {copy.columns.recipients}
                  </TableHead>
                  <TableHead
                    className={cn(tableHeadClass, "w-[92px] text-right")}
                  >
                    {copy.columns.openRate}
                  </TableHead>
                  <TableHead
                    className={cn(tableHeadClass, "w-[92px] text-right")}
                  >
                    {copy.columns.clickRate}
                  </TableHead>
                  <TableHead className={cn(tableHeadClass, "w-[200px]")}>
                    {copy.columns.date}
                  </TableHead>
                  <TableHead className={cn(tableHeadClass, "w-14")}>
                    <span className="sr-only">{copy.columns.actions}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((campaign) => {
                  const name = campaign.name || copy.untitled;
                  const href = appHref(campaignPath(campaign.id));
                  const started = campaign.status !== "draft";
                  const counted =
                    started &&
                    (campaign.status !== "scheduled" ||
                      campaign.stats.recipients > 0);
                  const openRate = counted
                    ? rateOf(campaign.stats.opened, campaign.stats)
                    : null;
                  const clickRate = counted
                    ? rateOf(campaign.stats.clicked, campaign.stats)
                    : null;
                  const date = dateOf(campaign);
                  const moment = date ? clock(date) : null;
                  return (
                    <TableRow
                      key={campaign.id}
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
                        <div
                          title={campaign.subject || undefined}
                          className="truncate text-[12.5px] text-ink-tertiary"
                        >
                          {campaign.subject || copy.noSubject}
                        </div>
                      </TableCell>
                      <TableCell className={tableCellClass}>
                        <StatusBadge tone={statusTones[campaign.status]}>
                          {statusLabels[campaign.status]}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className={tableCellClass}>
                        {campaign.audienceLabel ? (
                          <div
                            title={campaign.audienceLabel}
                            className="truncate text-muted-foreground"
                          >
                            {campaign.audienceLabel}
                          </div>
                        ) : (
                          <div className="truncate text-ink-tertiary">
                            {copy.noAudience}
                          </div>
                        )}
                      </TableCell>
                      <TableCell
                        className={cn(
                          tableCellClass,
                          "text-right tabular-nums",
                          !counted && "text-ink-tertiary",
                        )}
                      >
                        {counted
                          ? copy.number(campaign.stats.recipients)
                          : copy.none}
                      </TableCell>
                      <TableCell
                        className={cn(
                          tableCellClass,
                          "text-right tabular-nums",
                          openRate === null && "text-ink-tertiary",
                        )}
                      >
                        {openRate === null ? copy.none : copy.percent(openRate)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          tableCellClass,
                          "text-right tabular-nums",
                          clickRate === null && "text-ink-tertiary",
                        )}
                      >
                        {clickRate === null
                          ? copy.none
                          : copy.percent(clickRate)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          tableCellClass,
                          "whitespace-nowrap text-muted-foreground tabular-nums",
                        )}
                      >
                        {moment ? (
                          <>
                            <span className="text-ink-tertiary">
                              {copy.dateLabels[campaign.status]}
                            </span>{" "}
                            <time
                              dateTime={moment.iso}
                              suppressHydrationWarning
                            >
                              {moment.day}, {moment.time}
                            </time>
                          </>
                        ) : (
                          <span className="text-ink-tertiary">{copy.none}</span>
                        )}
                      </TableCell>
                      <TableCell className={cn(tableCellClass, "text-right")}>
                        {duplicating === campaign.id ? (
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
                              className="w-56 p-1 text-[13px]"
                            >
                              <DropdownMenuItem
                                className={menuItemClass}
                                render={<Link href={href} />}
                              >
                                <ArrowUpRight aria-hidden strokeWidth={1.6} />
                                {copy.menu.open}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className={menuItemClass}
                                onClick={() => void duplicate(campaign)}
                              >
                                <Copy aria-hidden strokeWidth={1.6} />
                                {copy.menu.duplicate}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                disabled={campaign.status === "sending"}
                                className={menuItemClass}
                                onClick={() => setTarget(campaign)}
                              >
                                <Trash2 aria-hidden strokeWidth={1.6} />
                                {campaign.status === "sending"
                                  ? copy.menu.removeSending
                                  : copy.menu.remove}
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
        fromName={brandName}
        onOpenChange={setNameOpen}
        onCreated={handleCreated}
      />
      <DeleteCampaignDialog
        campaign={target}
        onClose={() => setTarget(null)}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
