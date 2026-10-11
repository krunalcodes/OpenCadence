"use client";

import { Button } from "@workspace/ui/components/button";
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
import { cn } from "@workspace/ui/lib/utils";
import { Plus, Search, SlidersHorizontal, Upload, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { focusRing, PageHeader } from "@/components/app-shell/page-header";
import {
  type FilterChip,
  FilterChips,
} from "@/components/product/filter-chips";
import { LoadFailed } from "@/components/product/load-failed";
import {
  linkButtonClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import { BulkBar } from "@/features/contacts/components/bulk-bar";
import { BulkDialog } from "@/features/contacts/components/bulk-dialogs";
import {
  type ContactSaveOutcome,
  ContactSheet,
} from "@/features/contacts/components/contact-sheet";
import { ContactsTable } from "@/features/contacts/components/contacts-table";
import { DeleteContactDialog } from "@/features/contacts/components/delete-contact-dialog";
import { FieldsSheet } from "@/features/contacts/components/fields-sheet";
import { MatchCount } from "@/features/contacts/components/match-count";
import { OptionCombobox } from "@/features/contacts/components/option-combobox";
import { useSynced } from "@/features/contacts/hooks/use-synced";
import {
  type BulkAction,
  type Contact,
  type ContactField,
  type ContactFilters,
  type ContactsResult,
  filtersSearch,
  hasFilters,
  maxSearchLength,
  type Option,
} from "@/features/contacts/lib/contacts";
import { copy, describeError } from "@/features/contacts/lib/copy";
import { fetchContacts } from "@/features/contacts/queries/client";
import { useHydrated } from "@/hooks/use-hydrated";
import { useLoadMore } from "@/hooks/use-load-more";
import { createEventClock } from "@/lib/event-clock";
import { appHref } from "@/lib/navigation";

const searchDelay = 300;

const noContacts: Contact[] = [];
const noIds: string[] = [];

const basePath = appHref("contacts");
const importPath = appHref("contacts/import");

function nameOf(options: Option[], id: string, fallback: string) {
  return options.find((option) => option.value === id)?.label ?? fallback;
}

type ContactsScreenProps = {
  result: ContactsResult;
  filters: ContactFilters;
  lists: Option[];
  tags: Option[];
  segments: Option[];
  fields: ContactField[] | null;
};

type Selection = { key: unknown; ids: string[] };

export function ContactsScreen({
  result,
  filters,
  lists,
  tags: loadedTags,
  segments,
  fields: loadedFields,
}: ContactsScreenProps) {
  const router = useRouter();
  const hydrated = useHydrated();
  const ready = result.state === "ready";
  const list = useLoadMore(result, {
    items: ready ? result.contacts : noContacts,
    nextCursor: ready ? result.nextCursor : null,
  });
  const [tags, setTags] = useSynced(loadedTags);
  const [fields, setFields] = useSynced(loadedFields);
  const [draft, setDraft] = useState<ContactFilters | null>(null);
  const [text, setText] = useState(filters.search);
  const [removed, setRemoved] = useState(noIds);
  const [selection, setSelection] = useState<Selection>({
    key: result,
    ids: noIds,
  });
  const [editing, setEditing] = useState<Contact | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetKey, setSheetKey] = useState(0);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [deleting, setDeleting] = useState<Contact | null>(null);
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);
  const [navigating, startNavigation] = useTransition();
  const [retrying, startRetry] = useTransition();
  const requested = useRef(filters.search);

  if (selection.key !== result) {
    setSelection({ key: result, ids: noIds });
  }

  const shown = navigating && draft ? draft : filters;
  const contacts = list.items.filter((item) => !removed.includes(item.id));
  const loadedIds = new Set(contacts.map((contact) => contact.id));
  const selectedIds =
    selection.key === result
      ? selection.ids.filter((id) => loadedIds.has(id))
      : noIds;
  const selected = new Set(selectedIds);
  const clock = createEventClock(
    hydrated ? "local" : "stable",
    new Date(),
    copy.days,
  );
  const bySegment = shown.segmentId !== null;
  const filtered = hasFilters(shown);
  const blank = ready && contacts.length === 0 && !filtered && text === "";

  function navigate(next: ContactFilters) {
    const search = filtersSearch(next);
    requested.current = next.search;
    setDraft(next);
    startNavigation(() => {
      router.replace(search ? `${basePath}?${search}` : basePath);
    });
  }

  const { listId, tagId } = shown;

  useEffect(() => {
    const next = text.trim();
    if (bySegment || next === requested.current) {
      return;
    }
    const timer = window.setTimeout(() => {
      const wanted = { search: next, listId, tagId, segmentId: null };
      const search = filtersSearch(wanted);
      requested.current = next;
      setDraft(wanted);
      startNavigation(() => {
        router.replace(search ? `${basePath}?${search}` : basePath);
      });
    }, searchDelay);
    return () => window.clearTimeout(timer);
  }, [text, listId, tagId, bySegment, router]);

  function clearAll() {
    setText("");
    navigate({ search: "", listId: null, tagId: null, segmentId: null });
  }

  const chips: FilterChip[] = [];
  if (shown.segmentId) {
    chips.push({
      id: "segment",
      label: copy.segmentChip(
        nameOf(segments, shown.segmentId, copy.unknownSegment),
      ),
      remove: clearAll,
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
  if (shown.listId) {
    chips.push({
      id: "list",
      label: copy.listChip(nameOf(lists, shown.listId, copy.unknownList)),
      remove: () => navigate({ ...shown, listId: null }),
    });
  }
  if (shown.tagId) {
    chips.push({
      id: "tag",
      label: copy.tagChip(nameOf(tags, shown.tagId, copy.unknownTag)),
      remove: () => navigate({ ...shown, tagId: null }),
    });
  }

  function loadMore() {
    void list.loadMore(async (cursor) => {
      const response = await fetchContacts(filters, cursor);
      if (!response.ok) {
        toast.error(copy.loadMoreFailed, {
          description: describeError(response.error),
        });
        return null;
      }
      return {
        items: response.data.contacts,
        nextCursor: response.data.nextCursor,
      };
    });
  }

  function openSheet(contact: Contact | null) {
    setEditing(contact);
    setSheetKey((current) => current + 1);
    setSheetOpen(true);
  }

  function handleSaved(_outcome: ContactSaveOutcome) {
    setSheetOpen(false);
    router.refresh();
  }

  function handleDeleted(contact: Contact) {
    setRemoved((current) => [...current, contact.id]);
    setSheetOpen(false);
    router.refresh();
  }

  function handleBulkDone(action: BulkAction, ids: string[]) {
    if (action === "delete") {
      setRemoved((current) => [...current, ...ids]);
    }
    setSelection({ key: result, ids: noIds });
    router.refresh();
  }

  function toggle(id: string, checked: boolean) {
    setSelection({
      key: result,
      ids: checked
        ? [...selectedIds.filter((item) => item !== id), id]
        : selectedIds.filter((item) => item !== id),
    });
  }

  const linkClass = cn(
    linkButtonClass,
    "gap-1.5 border-border px-3",
    secondaryButtonClass,
  );

  return (
    <div className="@container flex min-w-0 flex-col gap-[18px] text-[13px] leading-normal">
      <PageHeader
        title={copy.title}
        description={<p className="max-w-[720px]">{copy.description}</p>}
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setFieldsOpen(true)}
              className={secondaryButtonClass}
            >
              <SlidersHorizontal aria-hidden strokeWidth={1.6} />
              {copy.fields}
            </Button>
            <Link href={importPath} className={linkClass}>
              <Upload aria-hidden className="size-4" strokeWidth={1.6} />
              {copy.import}
            </Link>
            <Button
              type="button"
              onClick={() => openSheet(null)}
              className={primaryButtonClass}
            >
              <Plus aria-hidden strokeWidth={1.8} />
              {copy.add}
            </Button>
          </>
        }
      />

      <section
        aria-label={copy.title}
        aria-busy={navigating || undefined}
        className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-xs"
      >
        {blank ? null : (
          <div className="flex flex-col gap-2.5 border-b border-border-subtle px-4 py-[13px]">
            <div className="flex flex-wrap items-center gap-2">
              <InputGroup
                className="h-8 w-64 bg-card shadow-xs"
                data-disabled={bySegment || undefined}
              >
                <InputGroupAddon>
                  <Search aria-hidden strokeWidth={1.6} />
                </InputGroupAddon>
                <InputGroupInput
                  type="search"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={maxSearchLength}
                  disabled={bySegment}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  aria-label={copy.searchLabel}
                  placeholder={copy.searchPlaceholder}
                  className="text-[13px]"
                />
              </InputGroup>
              <OptionCombobox
                options={lists}
                value={shown.listId}
                label={copy.listLabel}
                placeholder={copy.listPlaceholder}
                empty={copy.listEmpty}
                disabled={bySegment}
                className="w-44"
                onChange={(next) => navigate({ ...shown, listId: next })}
              />
              <OptionCombobox
                options={tags}
                value={shown.tagId}
                label={copy.tagLabel}
                placeholder={copy.tagPlaceholder}
                empty={copy.tagEmpty}
                disabled={bySegment}
                className="w-44"
                onChange={(next) => navigate({ ...shown, tagId: next })}
              />
              <OptionCombobox
                options={segments}
                value={shown.segmentId}
                label={copy.segmentLabel}
                placeholder={copy.segmentPlaceholder}
                empty={copy.segmentEmpty}
                className="w-44"
                onChange={(next) => {
                  setText("");
                  navigate({
                    search: "",
                    listId: null,
                    tagId: null,
                    segmentId: next,
                  });
                }}
              />
              {navigating ? (
                <Spinner className="size-3.5 text-ink-tertiary" />
              ) : null}
              {ready && !navigating ? (
                <MatchCount filters={filters} version={result} />
              ) : null}
            </div>
            {bySegment ? (
              <p className="text-[12.5px] text-muted-foreground">
                {copy.segmentNote}{" "}
                <Link
                  href={appHref("segments")}
                  className={cn(
                    "rounded-[4px] font-medium text-foreground underline underline-offset-2",
                    focusRing,
                  )}
                >
                  {copy.editSegment}
                </Link>
              </p>
            ) : null}
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
                <Users strokeWidth={1.6} aria-hidden />
              </EmptyMedia>
              <EmptyTitle className="text-sm font-semibold text-foreground">
                {copy.emptyTitle}
              </EmptyTitle>
              <EmptyDescription className="text-[13px]">
                {copy.emptyBody}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="flex-row justify-center gap-2">
              <Button
                type="button"
                onClick={() => openSheet(null)}
                className={primaryButtonClass}
              >
                <Plus aria-hidden strokeWidth={1.8} />
                {copy.add}
              </Button>
              <Link href={importPath} className={linkClass}>
                <Upload aria-hidden className="size-4" strokeWidth={1.6} />
                {copy.import}
              </Link>
            </EmptyContent>
          </Empty>
        ) : contacts.length === 0 ? (
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
            <ContactsTable
              contacts={contacts}
              clock={clock}
              selected={selected}
              dimmed={navigating}
              onToggle={toggle}
              onToggleAll={(checked) =>
                setSelection({
                  key: result,
                  ids: checked ? [...loadedIds] : noIds,
                })
              }
              onOpen={openSheet}
              onDelete={setDeleting}
            />
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

      {selectedIds.length > 0 ? (
        <BulkBar
          count={selectedIds.length}
          onAction={setBulkAction}
          onClear={() => setSelection({ key: result, ids: noIds })}
        />
      ) : null}

      <ContactSheet
        open={sheetOpen}
        formKey={sheetKey}
        contact={editing}
        fields={fields}
        lists={lists}
        tags={tags}
        clock={clock}
        onOpenChange={setSheetOpen}
        onSaved={handleSaved}
        onTagCreated={(tag) =>
          setTags([...tags, tag].sort((a, b) => a.label.localeCompare(b.label)))
        }
        onDelete={setDeleting}
      />
      <FieldsSheet
        open={fieldsOpen}
        fields={fields}
        onOpenChange={setFieldsOpen}
        onChange={setFields}
      />
      <DeleteContactDialog
        contact={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={handleDeleted}
      />
      <BulkDialog
        action={bulkAction}
        ids={selectedIds}
        lists={lists}
        tags={tags}
        onClose={() => setBulkAction(null)}
        onDone={handleBulkDone}
      />
    </div>
  );
}
