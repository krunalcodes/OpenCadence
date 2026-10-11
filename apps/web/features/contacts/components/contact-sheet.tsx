"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet";
import { cn } from "@workspace/ui/lib/utils";
import Link from "next/link";
import { type FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";
import { focusRing } from "@/components/app-shell/page-header";
import { OptionCombobox } from "@/components/product/option-combobox";
import { OptionMultiSelect } from "@/components/product/option-multi-select";
import {
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import { StatusBadge } from "@/components/status-badge";
import {
  CustomFieldControl,
  customFieldId,
} from "@/features/contacts/components/custom-field-control";
import {
  type Contact,
  type ContactField,
  type ContactList,
  maxEmailLength,
  maxProfileLength,
  maxTagLength,
  type Option,
  type ProfileKey,
} from "@/features/contacts/lib/contacts";
import {
  copy,
  describeError,
  membershipLabels,
  originLabels,
  profileLabels,
  suppressedLabels,
  suppressedNotes,
} from "@/features/contacts/lib/copy";
import {
  buildInput,
  type ContactDraft,
  customErrorKey,
  initialDraft,
  membershipChanges,
  tagChanges,
  timeZones,
} from "@/features/contacts/lib/form";
import {
  addListMember,
  bulkContacts,
  createContact,
  createTag,
  removeListMember,
  setListMemberStatus,
  updateContact,
} from "@/features/contacts/queries/client";
import type { ApiError } from "@/lib/api";
import type { EventClock } from "@/lib/event-clock";
import { appHref } from "@/lib/navigation";

const text = copy.sheet;

const labelClass = "text-[13px]";
const errorClass = "text-[13px] text-danger";
const sectionTitleClass =
  "text-sm leading-[1.4] font-semibold tracking-[-0.005em] text-foreground";

const textKeys: Exclude<ProfileKey, "timezone">[] = [
  "firstName",
  "lastName",
  "company",
  "jobTitle",
  "phone",
  "city",
  "country",
];

export type ContactSaveOutcome = "created" | "saved" | "partial";

type ContactSheetProps = {
  open: boolean;
  formKey: number;
  contact: Contact | null;
  fields: ContactField[] | null;
  lists: Option[];
  tags: Option[];
  clock: EventClock;
  onOpenChange: (open: boolean) => void;
  onSaved: (outcome: ContactSaveOutcome) => void;
  onTagCreated: (tag: Option) => void;
  onDelete: (contact: Contact) => void;
};

export function ContactSheet({
  open,
  formKey,
  contact,
  onOpenChange,
  ...rest
}: ContactSheetProps) {
  const [pending, setPending] = useState(false);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next || !pending) {
          onOpenChange(next);
        }
      }}
    >
      <SheetContent className="w-full gap-0 text-[13px] data-[side=right]:w-full data-[side=right]:sm:max-w-[520px]">
        <ContactForm
          key={formKey}
          contact={contact}
          pending={pending}
          onPendingChange={setPending}
          onCancel={() => onOpenChange(false)}
          {...rest}
        />
      </SheetContent>
    </Sheet>
  );
}

type ContactFormProps = Omit<
  ContactSheetProps,
  "open" | "formKey" | "onOpenChange"
> & {
  pending: boolean;
  onPendingChange: (pending: boolean) => void;
  onCancel: () => void;
};

type Errors = Record<string, string>;

function ContactForm({
  contact,
  fields,
  lists,
  tags,
  clock,
  pending,
  onPendingChange,
  onCancel,
  onSaved,
  onTagCreated,
  onDelete,
}: ContactFormProps) {
  const catalog = fields ?? noFields;
  const [draft, setDraft] = useState<ContactDraft>(() =>
    initialDraft(contact, catalog),
  );
  const [errors, setErrors] = useState<Errors>({});
  const [creatingTag, setCreatingTag] = useState(false);
  const zones = useMemo(
    () => timeZones(contact?.timezone ?? null),
    [contact?.timezone],
  );

  const added = contact ? clock(contact.createdAt) : null;
  const listOptions = mergeOptions(
    lists,
    (contact?.lists ?? []).map((list) => ({
      value: list.id,
      label: list.name,
    })),
  );
  const tagOptions = mergeOptions(tags, draft.tags);
  const original = new Map(
    (contact?.lists ?? []).map((list) => [list.id, list]),
  );

  function clearError(key: string) {
    if (errors[key]) {
      setErrors(({ [key]: _removed, ...others }) => others);
    }
  }

  function setLists(next: Option[]) {
    setDraft((current) => ({
      ...current,
      lists: next.map(
        (option): ContactList =>
          current.lists.find((list) => list.id === option.value) ??
          original.get(option.value) ?? {
            id: option.value,
            name: option.label,
            status: "subscribed",
          },
      ),
    }));
  }

  function toggleStatus(id: string) {
    setDraft((current) => ({
      ...current,
      lists: current.lists.map((list) =>
        list.id === id
          ? {
              ...list,
              status:
                list.status === "subscribed" ? "unsubscribed" : "subscribed",
            }
          : list,
      ),
    }));
  }

  async function handleCreateTag(name: string) {
    if (creatingTag) {
      return;
    }
    setCreatingTag(true);
    const result = await createTag(name);
    setCreatingTag(false);
    if (!result.ok) {
      toast.error(copy.toasts.tagFailed(name), {
        description: describeError(result.error),
      });
      return;
    }
    onTagCreated(result.data);
    setDraft((current) => ({
      ...current,
      tags: [...current.tags, result.data],
    }));
  }

  function focusFirst(next: Errors) {
    const key = Object.keys(next)[0];
    if (!key) {
      return;
    }
    const id =
      key === "email"
        ? "contact-email"
        : customFieldId(key.replace(/^custom:/, ""));
    document.getElementById(id)?.focus();
  }

  function fail(error: ApiError) {
    const { field } = error;
    if (error.code === "email_taken" || field === "email") {
      const next = {
        email:
          error.code === "email_taken" ? text.emailTaken : describeError(error),
      };
      setErrors(next);
      focusFirst(next);
      return;
    }
    const customKey = field?.replace(/^fields\./, "") ?? "";
    if (catalog.some((item) => item.key === customKey)) {
      const next = { [customErrorKey(customKey)]: describeError(error) };
      setErrors(next);
      focusFirst(next);
      return;
    }
    toast.error(copy.toasts.saveFailed, { description: describeError(error) });
  }

  async function submit(input: ReturnType<typeof buildInput>["input"]) {
    const email = draft.email.trim().toLowerCase();
    const tagIds = draft.tags.map((tag) => tag.value);
    if (!contact) {
      const result = await createContact({
        ...input,
        email,
        listIds: draft.lists.map((list) => list.id),
        tagIds,
      });
      onPendingChange(false);
      if (!result.ok) {
        fail(result.error);
        return;
      }
      toast.success(copy.toasts.created(result.data.email));
      onSaved("created");
      return;
    }
    if (Object.keys(input).length > 0) {
      const result = await updateContact(contact.id, input);
      if (!result.ok) {
        onPendingChange(false);
        fail(result.error);
        return;
      }
    }
    const memberships = membershipChanges(contact.lists, draft.lists);
    const tagDiff = tagChanges(
      contact.tags.map((tag) => tag.id),
      tagIds,
    );
    const ids = [contact.id];
    const results = await Promise.all([
      ...memberships.added.map((id) => addListMember(id, contact.id)),
      ...memberships.removed.map((id) => removeListMember(id, contact.id)),
      ...memberships.statuses.map((item) =>
        setListMemberStatus(item.id, contact.id, item.status),
      ),
      ...(tagDiff.added.length > 0
        ? [bulkContacts({ ids, action: "add_tags", tagIds: tagDiff.added })]
        : []),
      ...(tagDiff.removed.length > 0
        ? [
            bulkContacts({
              ids,
              action: "remove_tags",
              tagIds: tagDiff.removed,
            }),
          ]
        : []),
    ]);
    onPendingChange(false);
    const failed = results.find((result) => !result.ok);
    if (failed && !failed.ok) {
      toast.error(copy.toasts.partial(email), {
        description: describeError(failed.error),
      });
      onSaved("partial");
      return;
    }
    toast.success(copy.toasts.saved(email));
    onSaved("saved");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || creatingTag) {
      return;
    }
    const { input, problems } = buildInput(draft, contact, catalog);
    const next: Errors = {};
    for (const [key, problem] of Object.entries(problems)) {
      next[key] = text[problem];
    }
    setErrors(next);
    if (Object.keys(next).length > 0) {
      focusFirst(next);
      return;
    }
    onPendingChange(true);
    void submit(input);
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className="flex min-h-0 flex-1 flex-col"
    >
      <SheetHeader className="gap-1 border-b border-border-subtle px-5 py-4 pr-12">
        <SheetTitle className="truncate text-[15px] font-semibold tracking-[-0.01em]">
          {contact ? contact.email : text.addTitle}
        </SheetTitle>
        <SheetDescription className="text-[13px] leading-normal">
          {contact ? text.editDescription : text.addDescription}
        </SheetDescription>
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        {contact?.suppressed ? (
          <div className="flex flex-col items-start gap-2 rounded-lg bg-danger-surface px-3 py-2.5">
            <StatusBadge tone="danger" className="bg-card">
              {suppressedLabels[contact.suppressed]}
            </StatusBadge>
            <p className="text-[13px] text-foreground">
              {suppressedNotes[contact.suppressed]}{" "}
              <Link
                href={appHref("suppressions")}
                className={cn(
                  "rounded-[4px] font-medium text-danger underline underline-offset-2",
                  focusRing,
                )}
              >
                {text.suppressionLink}
              </Link>
            </p>
          </div>
        ) : null}

        <Field data-invalid={errors.email ? true : undefined}>
          <FieldLabel htmlFor="contact-email" className={labelClass}>
            {text.email}
          </FieldLabel>
          <Input
            id="contact-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            required
            maxLength={maxEmailLength}
            disabled={pending}
            placeholder={text.emailPlaceholder}
            value={draft.email}
            onChange={(event) => {
              const { value } = event.target;
              setDraft((current) => ({ ...current, email: value }));
              clearError("email");
            }}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? "contact-email-error" : undefined}
            className={cn(inputClass, "md:text-[13px]")}
          />
          {errors.email ? (
            <FieldError id="contact-email-error" className={errorClass}>
              {errors.email}
            </FieldError>
          ) : null}
        </Field>

        <div className="grid grid-cols-1 gap-x-3 gap-y-4 sm:grid-cols-2">
          {textKeys.map((key) => (
            <Field key={key}>
              <FieldLabel htmlFor={`contact-${key}`} className={labelClass}>
                {profileLabels[key]}
              </FieldLabel>
              <Input
                id={`contact-${key}`}
                name={key}
                type={key === "phone" ? "tel" : "text"}
                autoComplete="off"
                maxLength={maxProfileLength}
                disabled={pending}
                value={draft.profile[key]}
                onChange={(event) => {
                  const { value } = event.target;
                  setDraft((current) => ({
                    ...current,
                    profile: { ...current.profile, [key]: value },
                  }));
                }}
                className={cn(inputClass, "md:text-[13px]")}
              />
            </Field>
          ))}
          <Field>
            <FieldLabel htmlFor="contact-timezone" className={labelClass}>
              {profileLabels.timezone}
            </FieldLabel>
            <OptionCombobox
              id="contact-timezone"
              options={zones}
              value={draft.profile.timezone || null}
              label={profileLabels.timezone}
              placeholder={text.timezonePlaceholder}
              empty={text.timezoneEmpty}
              disabled={pending}
              className="w-full"
              onChange={(next) =>
                setDraft((current) => ({
                  ...current,
                  profile: { ...current.profile, timezone: next ?? "" },
                }))
              }
            />
          </Field>
        </div>

        {fields === null ? (
          <p className="rounded-lg bg-warning-surface px-3 py-2.5 text-[13px] text-warning">
            {text.customFailed}
          </p>
        ) : catalog.length > 0 ? (
          <section
            aria-labelledby="contact-custom-title"
            className="flex flex-col gap-4 border-t border-border-subtle pt-4"
          >
            <h3 id="contact-custom-title" className={sectionTitleClass}>
              {text.custom}
            </h3>
            {catalog.map((field) => (
              <CustomFieldControl
                key={field.id}
                field={field}
                value={draft.custom[field.key] ?? ""}
                error={errors[customErrorKey(field.key)]}
                disabled={pending}
                onChange={(value) => {
                  setDraft((current) => ({
                    ...current,
                    custom: { ...current.custom, [field.key]: value },
                  }));
                  clearError(customErrorKey(field.key));
                }}
              />
            ))}
          </section>
        ) : null}

        <div className="flex flex-col gap-4 border-t border-border-subtle pt-4">
          <Field>
            <FieldLabel htmlFor="contact-lists" className={labelClass}>
              {text.lists}
            </FieldLabel>
            <OptionMultiSelect
              id="contact-lists"
              options={listOptions}
              value={draft.lists.map((list) => ({
                value: list.id,
                label: list.name,
              }))}
              label={text.lists}
              placeholder={copy.picker.listsPlaceholder}
              empty={copy.picker.listsEmpty}
              disabled={pending}
              describedBy="contact-lists-hint"
              onChange={setLists}
            />
            <FieldDescription id="contact-lists-hint" className="text-[13px]">
              {text.listsHint}
            </FieldDescription>
            {contact && draft.lists.length > 0 ? (
              <>
                <ul
                  aria-label={text.memberships}
                  className="divide-y divide-border-subtle rounded-lg border border-border"
                >
                  {draft.lists.map((list) => {
                    const existing = original.has(list.id);
                    return (
                      <li
                        key={list.id}
                        className="flex min-h-10 items-center gap-2 px-3 py-1.5"
                      >
                        <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                          {list.name}
                        </span>
                        {existing ? (
                          <>
                            <StatusBadge
                              tone={
                                list.status === "subscribed"
                                  ? "success"
                                  : "neutral"
                              }
                            >
                              {membershipLabels[list.status]}
                            </StatusBadge>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={pending}
                              onClick={() => toggleStatus(list.id)}
                              className={cn(
                                secondaryButtonClass,
                                "h-7 px-2 text-[12.5px]",
                              )}
                            >
                              {list.status === "subscribed"
                                ? text.unsubscribe
                                : text.resubscribe}
                            </Button>
                          </>
                        ) : (
                          <span className="text-[12.5px] text-ink-tertiary">
                            {text.newMembership}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {draft.lists.some(
                  (list) =>
                    original.get(list.id)?.status === "unsubscribed" &&
                    list.status === "subscribed",
                ) ? (
                  <p role="status" className="text-[13px] text-warning">
                    {text.resubscribeHint}
                  </p>
                ) : null}
              </>
            ) : null}
          </Field>

          <Field>
            <FieldLabel htmlFor="contact-tags" className={labelClass}>
              {text.tags}
            </FieldLabel>
            <OptionMultiSelect
              id="contact-tags"
              options={tagOptions}
              value={draft.tags}
              label={text.tags}
              placeholder={copy.picker.tagsCreatePlaceholder}
              empty={copy.picker.tagsEmpty}
              disabled={pending}
              describedBy="contact-tags-hint"
              maxCreateLength={maxTagLength}
              creating={creatingTag}
              createLabel={copy.picker.create}
              onCreate={(name) => void handleCreateTag(name)}
              onChange={(next) =>
                setDraft((current) => ({ ...current, tags: next }))
              }
            />
            <FieldDescription id="contact-tags-hint" className="text-[13px]">
              {text.tagsHint}
            </FieldDescription>
          </Field>
        </div>

        {contact && added ? (
          <p className="border-t border-border-subtle pt-4 text-[12.5px] text-ink-tertiary tabular-nums">
            <time dateTime={added.iso}>
              {text.added(added.day, originLabels[contact.origin])}
            </time>
          </p>
        ) : null}
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-border-subtle px-5 py-4 sm:flex-row sm:items-center">
        {contact ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onDelete(contact)}
            className={cn(
              secondaryButtonClass,
              "text-danger hover:bg-danger-surface hover:text-danger sm:mr-auto",
            )}
          >
            {text.delete}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onCancel}
          className={cn(secondaryButtonClass, !contact && "sm:ml-auto")}
        >
          {text.cancel}
        </Button>
        <Button
          type="submit"
          disabled={pending || creatingTag}
          aria-busy={pending || undefined}
          className={primaryButtonClass}
        >
          {pending ? <Spinner /> : null}
          {contact ? text.save : text.create}
        </Button>
      </div>
    </form>
  );
}

const noFields: ContactField[] = [];

function mergeOptions(base: Option[], extra: Option[]) {
  const known = new Set(base.map((option) => option.value));
  return [...base, ...extra.filter((option) => !known.has(option.value))];
}
