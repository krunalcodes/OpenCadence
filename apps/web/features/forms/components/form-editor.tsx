"use client";

import { Button } from "@workspace/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { Input } from "@workspace/ui/components/input";
import { Switch } from "@workspace/ui/components/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs";
import { cn } from "@workspace/ui/lib/utils";
import {
  Archive,
  Check,
  CircleAlert,
  Ellipsis,
  ExternalLink,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { buttonFocusRing, focusRing } from "@/components/app-shell/page-header";
import { SourceCombobox } from "@/components/pickers/source-combobox";
import type { Option } from "@/components/product/option";
import { OptionMultiSelect } from "@/components/product/option-multi-select";
import { SectionCard } from "@/components/product/section-card";
import {
  linkButtonClass,
  menuItemClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import { StatusBadge } from "@/components/status-badge";
import {
  ConfirmFormDialog,
  type FormTarget,
} from "@/features/forms/components/confirm-form-dialog";
import {
  FieldBlock,
  noteId,
  TextField,
} from "@/features/forms/components/editor-fields";
import { FieldsEditor } from "@/features/forms/components/fields-editor";
import { FormPreview } from "@/features/forms/components/form-preview";
import { BackToForms } from "@/features/forms/components/form-unavailable";
import { ShareTab } from "@/features/forms/components/share-tab";
import { SubmissionsTable } from "@/features/forms/components/submissions-table";
import {
  copy,
  describeError,
  fieldNames,
  problemText,
  statusLabels,
  statusTones,
} from "@/features/forms/lib/copy";
import {
  changedPayload,
  type DraftKey,
  draftOf,
  draftPayload,
  draftSettings,
  type FieldChoice,
  type Form,
  type FormBrand,
  type FormDraft,
  type FormField,
  isWebUrl,
  maxNameLength,
  maxUrlLength,
  type SettingKey,
  settingKeys,
  settingLimits,
  standardFieldKeys,
} from "@/features/forms/lib/forms";
import { isEmail } from "@/features/forms/lib/public-form";
import {
  type FormAction,
  type FormProblem,
  runFormAction,
  updateForm,
} from "@/features/forms/queries/client";
import type { AudienceList } from "@/lib/audience";
import { appHref } from "@/lib/navigation";
import type { SourceChoice } from "@/lib/sources";

const text = copy.editor;

const typingDelay = 800;
const choiceDelay = 150;
const saveToastId = "form-save";

const tabs = ["build", "share", "submissions"] as const;

type EditorTab = (typeof tabs)[number];

type SaveState = "saved" | "dirty" | "saving" | "failed";

type ErrorKey =
  | "name"
  | "listIds"
  | "fields"
  | "sourceId"
  | "redirectUrl"
  | "fromEmail"
  | SettingKey;

type FieldErrors = Partial<Record<ErrorKey, string>>;

type Refusal = { kind: "publish" | "save"; problems: FormProblem[] };

const errorKeys: ErrorKey[] = [
  "name",
  "listIds",
  "fields",
  "sourceId",
  "redirectUrl",
  "fromEmail",
  ...settingKeys,
];

const tabClass =
  "h-[26px] flex-none rounded-[6px] border-0 px-3 text-[12.5px] font-medium text-muted-foreground hover:text-foreground focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary focus-visible:outline-solid data-active:bg-card data-active:text-foreground data-active:shadow-xs";

const sectionClass = "min-w-0 scroll-mt-[70px] outline-hidden";

const standardChoices: FieldChoice[] = standardFieldKeys.map((key) => ({
  key,
  label: fieldNames[key] ?? key,
  type: key === "phone" ? "tel" : "text",
  options: [],
}));

function errorKeyOf(field: string | null): ErrorKey | null {
  const name = field?.replace(/^settings\./, "") ?? "";
  return errorKeys.find((key) => key === name) ?? null;
}

export type FormEditorProps = {
  form: Form;
  brand: FormBrand;
  lists: AudienceList[];
  sources: SourceChoice[];
  customFields: FieldChoice[];
};

export function FormEditor({
  form: initial,
  brand,
  lists,
  sources,
  customFields,
}: FormEditorProps) {
  const router = useRouter();
  const id = initial.id;
  const [form, setForm] = useState(initial);
  const [draft, setDraft] = useState(() => draftOf(initial));
  const [status, setStatus] = useState<SaveState>("saved");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [acting, setActing] = useState<FormAction | null>(null);
  const [target, setTarget] = useState<FormTarget | null>(null);
  const [tab, setTab] = useState<EditorTab>("build");
  const [visited, setVisited] = useState<EditorTab[]>(["build"]);

  const draftRef = useRef(draft);
  const savedRef = useRef(draftPayload(draft));
  const changes = useRef(0);
  const dirty = useRef(false);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const saveTimer = useRef<number | null>(null);
  const mounted = useRef(true);
  const scheduleRef = useRef<(delay: number) => void>(() => {});

  const show = useCallback((next: SaveState) => {
    dirty.current = next !== "saved";
    setStatus(next);
  }, []);

  const persist = useCallback(async (): Promise<boolean> => {
    const current = draftRef.current;
    const payload = draftPayload(current);
    const skip: DraftKey[] = [];
    const found: FieldErrors = {};
    if (payload.name === "") {
      skip.push("name");
      found.name = text.nameMissing;
    }
    if (
      payload.settings.redirectUrl !== null &&
      !isWebUrl(payload.settings.redirectUrl)
    ) {
      found.redirectUrl = text.after.redirectInvalid;
      payload.settings.redirectUrl = savedRef.current.settings.redirectUrl;
    }
    if (
      payload.settings.fromEmail !== null &&
      !isEmail(payload.settings.fromEmail)
    ) {
      found.fromEmail = text.confirmation.fromEmailInvalid;
      payload.settings.fromEmail = savedRef.current.settings.fromEmail;
    }
    const invalid = Object.keys(found).length > 0;
    const changed = changedPayload(savedRef.current, payload, skip);
    if (Object.keys(changed).length === 0) {
      setErrors(found);
      show(invalid ? "failed" : "saved");
      return !invalid;
    }
    const started = changes.current;
    show("saving");
    const result = await updateForm(id, changed);
    if (!mounted.current) {
      return false;
    }
    if (!result.ok) {
      show("failed");
      if (result.problems.length > 0) {
        setErrors(found);
        setRefusal({ kind: "save", problems: result.problems });
        toast.dismiss(saveToastId);
        return false;
      }
      const key = errorKeyOf(result.error.field);
      if (key) {
        setErrors({
          ...found,
          [key]:
            result.error.code === "name_taken"
              ? copy.errors.nameTaken
              : (result.error.message ?? text.fieldRejected),
        });
      } else {
        setErrors(found);
        toast.error(text.saveFailed, {
          id: saveToastId,
          description: describeError(result.error),
        });
      }
      return false;
    }
    setForm(result.data);
    setRefusal(null);
    setErrors(found);
    toast.dismiss(saveToastId);
    if (changes.current !== started) {
      savedRef.current = { ...savedRef.current, ...changed };
      show("dirty");
      scheduleRef.current(typingDelay);
      return false;
    }
    const server = draftOf(result.data);
    const next: FormDraft = {
      ...server,
      name: found.name ? current.name : server.name,
      redirectUrl: found.redirectUrl ? current.redirectUrl : server.redirectUrl,
      fromEmail: found.fromEmail ? current.fromEmail : server.fromEmail,
    };
    draftRef.current = next;
    setDraft(next);
    savedRef.current = draftPayload(server);
    show(invalid ? "failed" : "saved");
    return !invalid;
  }, [id, show]);

  const save = useCallback(async (): Promise<boolean> => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (inFlight.current) {
      await inFlight.current;
    }
    const run = persist();
    inFlight.current = run;
    const ok = await run;
    if (inFlight.current === run) {
      inFlight.current = null;
    }
    return ok;
  }, [persist]);

  const schedule = useCallback(
    (delay: number) => {
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
      }
      saveTimer.current = window.setTimeout(() => {
        saveTimer.current = null;
        void save();
      }, delay);
    },
    [save],
  );

  useEffect(() => {
    scheduleRef.current = schedule;
  }, [schedule]);

  function update(patch: Partial<FormDraft>, delay: number, clear: ErrorKey[]) {
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    setDraft(next);
    changes.current += 1;
    setErrors((current) => {
      if (!clear.some((key) => current[key])) {
        return current;
      }
      const rest = { ...current };
      for (const key of clear) {
        delete rest[key];
      }
      return rest;
    });
    if (!inFlight.current) {
      show("dirty");
    }
    schedule(delay);
  }

  function updateSetting(key: SettingKey, value: string) {
    update(
      { settings: { ...draftRef.current.settings, [key]: value } },
      typingDelay,
      [key],
    );
  }

  async function flush() {
    if (inFlight.current) {
      await inFlight.current;
    }
    for (let attempt = 0; attempt < 3 && dirty.current; attempt += 1) {
      await save();
    }
    return !dirty.current;
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (dirty.current) {
        event.preventDefault();
      }
    }
    function onClick(event: MouseEvent) {
      if (
        !dirty.current ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        !(event.target instanceof Element)
      ) {
        return;
      }
      const anchor = event.target.closest("a[href]");
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.target === "_blank" ||
        anchor.origin !== window.location.origin ||
        anchor.pathname === window.location.pathname
      ) {
        return;
      }
      if (!window.confirm(text.leaveConfirm)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      dirty.current = false;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "s"
      ) {
        event.preventDefault();
        void save();
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [save]);

  function selectTab(next: EditorTab) {
    setTab(next);
    setVisited((current) =>
      current.includes(next) ? current : [...current, next],
    );
  }

  function goTo(targetId: string) {
    selectTab("build");
    window.requestAnimationFrame(() => {
      const element = document.getElementById(targetId);
      element?.scrollIntoView({ block: "center" });
      element?.focus({ preventScroll: true });
    });
  }

  async function act(action: FormAction) {
    if (acting) {
      return;
    }
    const name = draftRef.current.name.trim() || form.name || copy.untitled;
    setActing(action);
    if (action === "publish") {
      const ok = await flush();
      if (!mounted.current) {
        return;
      }
      if (!ok) {
        setActing(null);
        toast.error(copy.toasts.publishFailed(name), {
          description: text.refused.unsaved,
        });
        return;
      }
    }
    const result = await runFormAction(id, action);
    if (!mounted.current) {
      return;
    }
    setActing(null);
    if (!result.ok) {
      if (action === "publish" && result.problems.length > 0) {
        setRefusal({ kind: "publish", problems: result.problems });
        window.requestAnimationFrame(() => {
          document.getElementById("form-refusal")?.focus();
        });
        return;
      }
      toast.error(
        action === "publish"
          ? copy.toasts.publishFailed(name)
          : copy.toasts.unpublishFailed(name),
        { description: describeError(result.error) },
      );
      return;
    }
    setForm(result.data);
    setRefusal(null);
    if (action === "publish") {
      toast.success(copy.toasts.published(name));
    } else {
      toast.success(copy.toasts.unpublished(name), {
        action: { label: copy.toasts.undo, onClick: () => void act("publish") },
      });
    }
    router.refresh();
  }

  function handleDone(done: FormTarget) {
    if (done.kind === "delete") {
      dirty.current = false;
      router.push(appHref("forms"));
      return;
    }
    setForm((current) => ({ ...current, status: "archived" }));
    router.refresh();
  }

  const catalog = [...standardChoices, ...customFields];
  const catalogLabels = new Map(
    catalog.map((choice) => [choice.key, choice.label]),
  );
  const previewFields: FormField[] = draft.fields.map((field) => ({
    ...field,
    label:
      field.label.trim() ||
      fieldNames[field.key] ||
      catalogLabels.get(field.key) ||
      field.key,
  }));

  const listOptions: Option[] = lists.map((list) => ({
    value: list.id,
    label: list.name,
  }));
  const selectedLists: Option[] = draft.listIds.map(
    (listId) =>
      listOptions.find((option) => option.value === listId) ?? {
        value: listId,
        label:
          form.lists.find((list) => list.id === listId)?.name ??
          text.audience.missingList,
      },
  );

  const sourceChoices: SourceChoice[] =
    form.source && !sources.some((source) => source.id === form.source?.id)
      ? [
          ...sources,
          {
            id: form.source.id,
            name: form.source.name,
            email: null,
            integrationType: "unknown",
            status: "needs_attention",
            isDefault: false,
          },
        ]
      : sources;
  const defaultSource = sourceChoices.find((source) => source.isDefault);
  const sender =
    sourceChoices.find((source) => source.id === draft.sourceId) ??
    (draft.sourceId ? null : (defaultSource ?? null));
  const needsFromEmail = sender !== null && sender.email === null;

  const published = form.status === "published";
  const archived = form.status === "archived";
  const busy = acting !== null;

  return (
    <div className="flex min-w-0 flex-col gap-3.5 text-[13px] leading-normal">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          <BackToForms />
          <span aria-hidden className="text-ink-tertiary">
            /
          </span>
          <Input
            type="text"
            autoComplete="off"
            maxLength={maxNameLength}
            aria-label={text.nameLabel}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? "form-name-error" : undefined}
            placeholder={text.namePlaceholder}
            value={draft.name}
            onChange={(event) =>
              update({ name: event.target.value }, typingDelay, ["name"])
            }
            className="h-8 min-w-0 flex-1 basis-56 border-transparent bg-transparent px-2 text-[15px] font-semibold tracking-[-0.01em] shadow-none hover:border-border focus-visible:border-input focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:text-[15px] lg:max-w-[420px]"
          />
          <StatusBadge tone={statusTones[form.status]}>
            {statusLabels[form.status]}
          </StatusBadge>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <SaveStatus status={status} />
            {status === "failed" ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void save()}
                className={secondaryButtonClass}
              >
                {text.saveNow}
              </Button>
            ) : null}
            {published && form.url ? (
              <a
                href={form.url}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  linkButtonClass,
                  "gap-1.5 border-border bg-card px-3 text-foreground shadow-xs hover:bg-muted",
                  buttonFocusRing,
                )}
              >
                <ExternalLink
                  aria-hidden
                  strokeWidth={1.6}
                  className="size-4"
                />
                {text.openForm}
              </a>
            ) : null}
            {published ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                aria-busy={acting === "unpublish" || undefined}
                onClick={() => void act("unpublish")}
                className={secondaryButtonClass}
              >
                {acting === "unpublish" ? <Spinner /> : null}
                {text.unpublish}
              </Button>
            ) : (
              <Button
                type="button"
                disabled={busy}
                aria-busy={acting === "publish" || undefined}
                onClick={() => void act("publish")}
                className={primaryButtonClass}
              >
                {acting === "publish" ? <Spinner /> : null}
                {archived ? text.publishAgain : text.publish}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={text.moreActions}
                render={
                  <Button
                    variant="outline"
                    size="icon-sm"
                    className={cn(
                      "size-8 bg-card text-muted-foreground shadow-xs hover:bg-muted",
                      buttonFocusRing,
                    )}
                  />
                }
              >
                <Ellipsis aria-hidden strokeWidth={1.6} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44 p-1 text-[13px]">
                {archived ? null : (
                  <>
                    <DropdownMenuItem
                      className={menuItemClass}
                      onClick={() =>
                        setTarget({ kind: "archive", id, name: form.name })
                      }
                    >
                      <Archive aria-hidden strokeWidth={1.6} />
                      {copy.menu.archive}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem
                  variant="destructive"
                  className={menuItemClass}
                  onClick={() =>
                    setTarget({ kind: "delete", id, name: form.name })
                  }
                >
                  <Trash2 aria-hidden strokeWidth={1.6} />
                  {copy.menu.remove}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {errors.name ? (
          <p
            id="form-name-error"
            role="alert"
            className="pl-2 text-[13px] text-danger"
          >
            {errors.name}
          </p>
        ) : null}
      </div>

      {refusal ? (
        <RefusalBanner
          refusal={refusal}
          hasSources={sourceChoices.length > 0}
          onGoTo={goTo}
        />
      ) : null}

      {archived ? (
        <p className="flex items-start gap-2.5 rounded-xl border border-border bg-warning-surface px-4 py-3 text-warning">
          <Archive
            aria-hidden
            strokeWidth={1.6}
            className="mt-0.5 size-4 shrink-0"
          />
          <span>
            <span className="font-medium">{text.archivedNote.title}.</span>{" "}
            {text.archivedNote.body}
          </span>
        </p>
      ) : null}

      <Tabs
        value={tab}
        onValueChange={(next) =>
          selectTab(tabs.find((item) => item === next) ?? "build")
        }
        className="gap-3.5"
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <TabsList
            aria-label={text.tabsLabel}
            className="h-8 gap-0 rounded-lg border border-border bg-muted p-0.5 group-data-horizontal/tabs:h-8"
          >
            {tabs.map((item) => (
              <TabsTrigger key={item} value={item} className={tabClass}>
                {text.tabs[item]}
                {item === "submissions" && form.submissionCount > 0 ? (
                  <span className="text-ink-tertiary tabular-nums">
                    {copy.number(form.submissionCount)}
                  </span>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
          {published ? (
            <p className="ml-auto text-[12.5px] text-ink-tertiary">
              {text.liveNote}
            </p>
          ) : null}
        </div>

        <TabsContent value="build" keepMounted className="text-[13px]">
          <div className="grid items-start gap-[18px] xl:grid-cols-[minmax(0,1fr)_minmax(380px,460px)]">
            <div className="flex min-w-0 flex-col gap-[18px]">
              <div className={sectionClass}>
                <SectionCard
                  id="form-audience-title"
                  title={text.audience.title}
                  description={text.audience.description}
                >
                  <div className="flex flex-col gap-4 p-4">
                    <FieldBlock
                      id="form-lists"
                      label={text.audience.lists}
                      error={errors.listIds}
                      hint={
                        lists.length === 0 ? (
                          <>
                            {text.audience.noListsYet}{" "}
                            <Link
                              href={appHref("lists")}
                              className={cn(
                                "rounded-[4px] font-medium text-primary underline underline-offset-2",
                                focusRing,
                              )}
                            >
                              {text.audience.createList}
                            </Link>
                          </>
                        ) : (
                          text.audience.listsHint
                        )
                      }
                    >
                      <OptionMultiSelect
                        id="form-lists"
                        options={listOptions}
                        value={selectedLists}
                        label={text.audience.lists}
                        placeholder={text.audience.listsPlaceholder}
                        empty={text.audience.listsEmpty}
                        invalid={errors.listIds ? true : undefined}
                        describedBy={noteId("form-lists")}
                        onChange={(next) =>
                          update(
                            { listIds: next.map((option) => option.value) },
                            choiceDelay,
                            ["listIds"],
                          )
                        }
                      />
                    </FieldBlock>
                    <div className="flex items-start justify-between gap-6 border-t border-border-subtle pt-4">
                      <div className="min-w-0">
                        <div
                          id="form-double-opt-in-label"
                          className="font-medium text-foreground"
                        >
                          {text.audience.doubleOptIn}
                        </div>
                        <p
                          id="form-double-opt-in-hint"
                          className="max-w-[640px] text-muted-foreground"
                        >
                          {text.audience.doubleOptInHint}
                        </p>
                      </div>
                      <Switch
                        id="form-double-opt-in"
                        checked={draft.doubleOptIn}
                        aria-labelledby="form-double-opt-in-label"
                        aria-describedby="form-double-opt-in-hint"
                        onCheckedChange={(doubleOptIn) =>
                          update({ doubleOptIn }, 0, [])
                        }
                        className="mt-0.5"
                      />
                    </div>
                    {draft.doubleOptIn ? null : (
                      <div
                        role="status"
                        className="flex items-start gap-2.5 rounded-lg bg-warning-surface px-3.5 py-3 text-warning"
                      >
                        <TriangleAlert
                          aria-hidden
                          strokeWidth={1.6}
                          className="mt-0.5 size-4 shrink-0"
                        />
                        <p>
                          <span className="font-medium">
                            {text.audience.warningTitle}.
                          </span>{" "}
                          {text.audience.warningBody}
                        </p>
                      </div>
                    )}
                  </div>
                </SectionCard>
              </div>

              <div className={sectionClass}>
                <SectionCard
                  id="form-fields-title"
                  title={text.fields.title}
                  description={text.fields.description}
                >
                  <FieldsEditor
                    fields={draft.fields}
                    catalog={catalog}
                    disabled={false}
                    error={errors.fields}
                    onChange={(fields) =>
                      update({ fields }, typingDelay, ["fields"])
                    }
                  />
                </SectionCard>
              </div>

              <div className={sectionClass}>
                <SectionCard
                  id="form-texts-title"
                  title={text.texts.title}
                  description={text.texts.description}
                >
                  <div className="grid gap-x-5 gap-y-4 p-4 md:grid-cols-2">
                    <SettingField
                      name="title"
                      draft={draft}
                      errors={errors}
                      onChange={updateSetting}
                      className="md:col-span-2"
                    />
                    <SettingField
                      name="description"
                      rows={2}
                      draft={draft}
                      errors={errors}
                      onChange={updateSetting}
                      className="md:col-span-2"
                    />
                    <SettingField
                      name="consentText"
                      rows={2}
                      hint={text.texts.consentHint}
                      draft={draft}
                      errors={errors}
                      onChange={updateSetting}
                      className="md:col-span-2"
                    />
                    <SettingField
                      name="buttonLabel"
                      hint={text.texts.emptyHint}
                      draft={draft}
                      errors={errors}
                      onChange={updateSetting}
                    />
                  </div>
                </SectionCard>
              </div>

              <div className={sectionClass}>
                <SectionCard
                  id="form-after-title"
                  title={text.after.title}
                  description={text.after.description}
                >
                  <div className="flex flex-col gap-4 p-4">
                    <SettingField
                      name="successTitle"
                      draft={draft}
                      errors={errors}
                      onChange={updateSetting}
                    />
                    <SettingField
                      name="successMessage"
                      rows={2}
                      hint={
                        draft.doubleOptIn
                          ? text.after.doubleOptInHint
                          : undefined
                      }
                      draft={draft}
                      errors={errors}
                      onChange={updateSetting}
                    />
                    <TextField
                      id="form-redirect-url"
                      type="url"
                      label={text.after.redirectUrl}
                      placeholder={text.after.redirectPlaceholder}
                      maxLength={maxUrlLength}
                      value={draft.redirectUrl}
                      error={errors.redirectUrl}
                      hint={text.after.redirectHint}
                      onChange={(redirectUrl) =>
                        update({ redirectUrl }, typingDelay, ["redirectUrl"])
                      }
                    />
                  </div>
                </SectionCard>
              </div>

              <div className={sectionClass}>
                <SectionCard
                  id="form-confirmation-title"
                  title={text.confirmation.title}
                  description={text.confirmation.description}
                >
                  {draft.doubleOptIn ? (
                    <div className="grid gap-x-5 gap-y-4 p-4 md:grid-cols-2">
                      <SettingField
                        name="confirmSubject"
                        hint={text.confirmation.subjectHint}
                        draft={draft}
                        errors={errors}
                        onChange={updateSetting}
                        className="md:col-span-2"
                      />
                      <FieldBlock
                        id="form-source"
                        label={text.confirmation.source}
                        error={errors.sourceId}
                        hint={
                          sourceChoices.length === 0 ? (
                            <>
                              {text.confirmation.noSources}{" "}
                              <Link
                                href={appHref("integrations")}
                                className={cn(
                                  "rounded-[4px] font-medium text-primary underline underline-offset-2",
                                  focusRing,
                                )}
                              >
                                {text.confirmation.connect}
                              </Link>
                            </>
                          ) : defaultSource ? (
                            text.confirmation.sourceHintDefault
                          ) : (
                            text.confirmation.sourceHintNone
                          )
                        }
                      >
                        <SourceCombobox
                          id="form-source"
                          sources={sourceChoices}
                          value={draft.sourceId}
                          placeholder={
                            defaultSource
                              ? text.confirmation.sourcePlaceholderDefault(
                                  defaultSource.name,
                                )
                              : undefined
                          }
                          describedBy={noteId("form-source")}
                          onChange={(sourceId) =>
                            update({ sourceId }, choiceDelay, ["sourceId"])
                          }
                        />
                      </FieldBlock>
                      {needsFromEmail ? (
                        <TextField
                          id="form-from-email"
                          type="email"
                          label={text.confirmation.fromEmail}
                          placeholder={text.confirmation.fromEmailPlaceholder}
                          maxLength={320}
                          value={draft.fromEmail}
                          error={errors.fromEmail}
                          hint={text.confirmation.fromEmailHint}
                          onChange={(fromEmail) =>
                            update({ fromEmail }, typingDelay, ["fromEmail"])
                          }
                        />
                      ) : sender?.email ? (
                        <div className="flex flex-col gap-1.5">
                          <span className="text-[13px] font-medium text-foreground">
                            {text.confirmation.fromEmail}
                          </span>
                          <p className="flex min-h-8 items-center rounded-lg border border-border-subtle bg-muted/50 px-2.5 py-1.5 break-all text-muted-foreground">
                            {text.confirmation.fromFixed(sender.email)}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="px-4 py-4 text-muted-foreground">
                      {text.confirmation.off}
                    </p>
                  )}
                </SectionCard>
              </div>
            </div>

            <div className="min-w-0 xl:sticky xl:top-[70px]">
              <FormPreview
                brand={brand}
                fields={previewFields}
                settings={draftSettings(draft)}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="share" keepMounted className="text-[13px]">
          {visited.includes("share") ? <ShareTab form={form} /> : null}
        </TabsContent>

        <TabsContent value="submissions" keepMounted className="text-[13px]">
          {visited.includes("submissions") ? (
            <SubmissionsTable formId={id} fields={form.fields} />
          ) : null}
        </TabsContent>
      </Tabs>

      <ConfirmFormDialog
        target={target}
        onClose={() => setTarget(null)}
        onDone={handleDone}
      />
    </div>
  );
}

function SaveStatus({ status }: { status: SaveState }) {
  return (
    <p
      aria-live="polite"
      className={cn(
        "flex h-7 items-center gap-1.5 px-1 text-[12.5px] whitespace-nowrap",
        status === "failed" ? "text-danger" : "text-ink-tertiary",
      )}
    >
      {status === "saving" ? (
        <Spinner className="size-3.5" />
      ) : status === "saved" ? (
        <Check aria-hidden strokeWidth={1.8} className="size-3.5" />
      ) : status === "failed" ? (
        <CircleAlert aria-hidden strokeWidth={1.8} className="size-3.5" />
      ) : (
        <span aria-hidden className="size-1.5 rounded-full bg-warning" />
      )}
      {text.status[status]}
    </p>
  );
}

type SettingFieldProps = {
  name: SettingKey;
  rows?: number;
  hint?: string;
  className?: string;
  draft: FormDraft;
  errors: FieldErrors;
  onChange: (key: SettingKey, value: string) => void;
};

function SettingField({
  name,
  rows,
  hint,
  className,
  draft,
  errors,
  onChange,
}: SettingFieldProps) {
  return (
    <TextField
      id={`form-setting-${name}`}
      label={text.texts.labels[name]}
      rows={rows}
      maxLength={settingLimits[name]}
      value={draft.settings[name]}
      error={errors[name]}
      hint={hint}
      className={className}
      onChange={(value) => onChange(name, value)}
    />
  );
}

const fixLinkClass = cn(
  "w-fit rounded-[4px] text-left text-[12.5px] font-medium text-foreground underline underline-offset-2",
  focusRing,
);

type RefusalBannerProps = {
  refusal: Refusal;
  hasSources: boolean;
  onGoTo: (targetId: string) => void;
};

function RefusalBanner({ refusal, hasSources, onGoTo }: RefusalBannerProps) {
  const refused = text.refused;
  return (
    <div
      id="form-refusal"
      role="alert"
      tabIndex={-1}
      className="flex items-start gap-2.5 rounded-xl border border-border bg-danger-surface px-4 py-3 text-danger outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
    >
      <CircleAlert
        aria-hidden
        strokeWidth={1.6}
        className="mt-0.5 size-4 shrink-0"
      />
      <div className="flex min-w-0 flex-col gap-2">
        <p>
          <span className="font-medium">
            {refusal.kind === "publish"
              ? refused.publishTitle
              : refused.saveTitle}
            .
          </span>
          {refusal.kind === "save" ? ` ${refused.saveBody}` : null}
        </p>
        <ul className="flex flex-col gap-2">
          {refusal.problems.map((problem) => (
            <li
              key={`${problem.code}:${problem.field}`}
              className="flex flex-col gap-0.5"
            >
              <span className="break-words">{problemText(problem)}</span>
              {problem.field === "listIds" ? (
                <button
                  type="button"
                  onClick={() => onGoTo("form-lists")}
                  className={fixLinkClass}
                >
                  {refused.chooseLists}
                </button>
              ) : problem.field === "settings.fromEmail" ? (
                <button
                  type="button"
                  onClick={() => onGoTo("form-from-email")}
                  className={fixLinkClass}
                >
                  {refused.enterFrom}
                </button>
              ) : problem.field === "sourceId" ? (
                <span className="flex flex-wrap gap-x-4 gap-y-0.5">
                  {hasSources ? (
                    <button
                      type="button"
                      onClick={() => onGoTo("form-source")}
                      className={fixLinkClass}
                    >
                      {refused.chooseSource}
                    </button>
                  ) : null}
                  <Link href={appHref("integrations")} className={fixLinkClass}>
                    {refused.openSources}
                  </Link>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
