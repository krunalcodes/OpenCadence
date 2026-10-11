"use client";

import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { cn } from "@workspace/ui/lib/utils";
import { Ellipsis, Pencil, Trash2 } from "lucide-react";
import { buttonFocusRing, focusRing } from "@/components/app-shell/page-header";
import {
  menuItemClass,
  tableCellClass,
  tableHeadClass,
} from "@/components/product/styles";
import { StatusBadge } from "@/components/status-badge";
import { type Contact, fullName } from "@/features/contacts/lib/contacts";
import { copy, suppressedLabels } from "@/features/contacts/lib/copy";
import type { EventClock } from "@/lib/event-clock";

const shownLists = 2;
const shownTags = 3;

const checkboxClass =
  "bg-card data-indeterminate:border-primary data-indeterminate:bg-primary data-indeterminate:text-primary-foreground data-indeterminate:before:h-0.5 data-indeterminate:before:w-2 data-indeterminate:before:rounded-full data-indeterminate:before:bg-current data-indeterminate:[&_svg]:hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function Blank() {
  return (
    <>
      <span aria-hidden="true" className="text-ink-tertiary">
        {copy.none}
      </span>
      <span className="sr-only">{copy.noneLabel}</span>
    </>
  );
}

type ContactsTableProps = {
  contacts: Contact[];
  clock: EventClock;
  selected: Set<string>;
  dimmed: boolean;
  onToggle: (id: string, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  onOpen: (contact: Contact) => void;
  onDelete: (contact: Contact) => void;
};

export function ContactsTable({
  contacts,
  clock,
  selected,
  dimmed,
  onToggle,
  onToggleAll,
  onOpen,
  onDelete,
}: ContactsTableProps) {
  const picked = contacts.filter((contact) => selected.has(contact.id)).length;
  const all = picked > 0 && picked === contacts.length;

  return (
    <Table
      className={cn(
        "min-w-[1040px] table-fixed text-[13px] transition-opacity",
        dimmed && "opacity-60",
      )}
    >
      <colgroup>
        <col className="w-11" />
        <col className="w-[27%]" />
        <col className="w-[16%]" />
        <col className="w-[14%]" />
        <col className="w-[19%]" />
        <col className="w-[24%]" />
        <col className="w-32" />
        <col className="w-14" />
      </colgroup>
      <TableHeader className="[&_tr]:border-border-subtle">
        <TableRow className="hover:bg-transparent">
          <TableHead className={cn(tableHeadClass, "pr-0")}>
            <Checkbox
              aria-label={copy.selectAll}
              checked={all}
              indeterminate={picked > 0 && !all}
              onCheckedChange={(checked) => onToggleAll(checked)}
              className={checkboxClass}
            />
          </TableHead>
          <TableHead className={tableHeadClass}>{copy.columns.email}</TableHead>
          <TableHead className={tableHeadClass}>{copy.columns.name}</TableHead>
          <TableHead className={tableHeadClass}>
            {copy.columns.company}
          </TableHead>
          <TableHead className={tableHeadClass}>{copy.columns.lists}</TableHead>
          <TableHead className={tableHeadClass}>{copy.columns.tags}</TableHead>
          <TableHead className={tableHeadClass}>{copy.columns.added}</TableHead>
          <TableHead className={tableHeadClass}>
            <span className="sr-only">{copy.columns.actions}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {contacts.map((contact) => {
          const moment = clock(contact.createdAt);
          const name = fullName(contact);
          const isSelected = selected.has(contact.id);
          const lists = contact.lists.slice(0, shownLists);
          const tags = contact.tags.slice(0, shownTags);
          return (
            <TableRow
              key={contact.id}
              data-state={isSelected ? "selected" : undefined}
              onClick={() => onOpen(contact)}
              className="cursor-pointer border-border-subtle hover:bg-muted/50 data-[state=selected]:bg-muted/70"
            >
              <TableCell
                className={cn(tableCellClass, "pr-0")}
                onClick={(event) => event.stopPropagation()}
              >
                <Checkbox
                  aria-label={copy.selectRow(contact.email)}
                  checked={isSelected}
                  onCheckedChange={(checked) => onToggle(contact.id, checked)}
                  className={checkboxClass}
                />
              </TableCell>
              <TableCell className={tableCellClass}>
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    title={contact.email}
                    aria-label={copy.openRow(contact.email)}
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpen(contact);
                    }}
                    className={cn(
                      "min-w-0 truncate rounded-[4px] text-left font-medium text-foreground",
                      focusRing,
                    )}
                  >
                    {contact.email}
                  </button>
                  {contact.suppressed ? (
                    <StatusBadge tone="danger">
                      {suppressedLabels[contact.suppressed]}
                    </StatusBadge>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className={tableCellClass}>
                {name ? (
                  <div title={name} className="truncate text-foreground">
                    {name}
                  </div>
                ) : (
                  <Blank />
                )}
              </TableCell>
              <TableCell className={tableCellClass}>
                {contact.company ? (
                  <div
                    title={contact.company}
                    className="truncate text-muted-foreground"
                  >
                    {contact.company}
                  </div>
                ) : (
                  <Blank />
                )}
              </TableCell>
              <TableCell className={tableCellClass}>
                {lists.length > 0 ? (
                  <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                    <span className="truncate">
                      {lists.map((list, index) => (
                        <span key={list.id}>
                          {index > 0 ? ", " : null}
                          {list.status === "unsubscribed" ? (
                            <>
                              <s className="text-ink-tertiary">{list.name}</s>
                              <span className="sr-only">
                                {` (${copy.unsubscribedNote})`}
                              </span>
                            </>
                          ) : (
                            list.name
                          )}
                        </span>
                      ))}
                    </span>
                    {contact.lists.length > shownLists ? (
                      <span className="shrink-0 text-ink-tertiary tabular-nums">
                        {copy.more(contact.lists.length - shownLists)}
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <Blank />
                )}
              </TableCell>
              <TableCell className={tableCellClass}>
                {tags.length > 0 ? (
                  <div className="flex min-w-0 items-center gap-1 overflow-hidden">
                    {tags.map((tag) => (
                      <span
                        key={tag.id}
                        title={tag.name}
                        className="inline-flex h-[22px] max-w-28 min-w-0 items-center rounded-[6px] bg-border-subtle px-2 text-xs font-medium text-muted-foreground"
                      >
                        <span className="truncate">{tag.name}</span>
                      </span>
                    ))}
                    {contact.tags.length > shownTags ? (
                      <span className="shrink-0 text-xs text-ink-tertiary tabular-nums">
                        {copy.more(contact.tags.length - shownTags)}
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <Blank />
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
                    {moment.day}
                  </time>
                ) : null}
              </TableCell>
              <TableCell
                className={cn(tableCellClass, "text-right")}
                onClick={(event) => event.stopPropagation()}
              >
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label={copy.actionsFor(contact.email)}
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
                    className="w-40 p-1 text-[13px]"
                  >
                    <DropdownMenuItem
                      className={menuItemClass}
                      onClick={() => onOpen(contact)}
                    >
                      <Pencil aria-hidden strokeWidth={1.6} />
                      {copy.edit}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      className={menuItemClass}
                      onClick={() => onDelete(contact)}
                    >
                      <Trash2 aria-hidden strokeWidth={1.6} />
                      {copy.delete}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
