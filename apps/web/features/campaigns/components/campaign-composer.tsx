"use client";

import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Switch } from "@workspace/ui/components/switch";
import { cn } from "@workspace/ui/lib/utils";
import { Check, CircleAlert, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  type AudienceCount,
  AudiencePicker,
} from "@/components/pickers/audience-picker";
import { SourceCombobox } from "@/components/pickers/source-combobox";
import { TemplateCombobox } from "@/components/pickers/template-combobox";
import { SectionCard } from "@/components/product/section-card";
import { inputClass, secondaryButtonClass } from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import { StatusBadge } from "@/components/status-badge";
import { BackToCampaigns } from "@/features/campaigns/components/campaign-unavailable";
import {
  type CheckView,
  ComposerRail,
  type CountView,
  type RailAction,
} from "@/features/campaigns/components/composer-rail";
import { ScheduleDialog } from "@/features/campaigns/components/schedule-dialog";
import {
  SendDialog,
  type SendSummary,
} from "@/features/campaigns/components/send-dialog";
import { SendTestDialog } from "@/features/campaigns/components/send-test-dialog";
import { TemplatePreview } from "@/features/campaigns/components/template-preview";
import {
  type Campaign,
  type CampaignDraft,
  changedPayload,
  type DraftField,
  draftFields,
  draftOf,
  draftPayload,
  effectiveSource,
  isEmail,
  maxFromNameLength,
  maxNameLength,
  maxPreviewTextLength,
  maxSubjectLength,
  type ProblemField,
  selectionOf,
  withCampaignSource,
} from "@/features/campaigns/lib/campaigns";
import {
  audienceLabel,
  copy,
  describeError,
  fromLine,
  statusLabels,
  statusTones,
} from "@/features/campaigns/lib/copy";
import { exactMoment } from "@/features/campaigns/lib/schedule";
import {
  fetchCheck,
  sendCampaign,
  updateCampaign,
} from "@/features/campaigns/queries/client";
import {
  type AudienceList,
  type AudienceSegment,
  type AudienceSelection,
  toAudience,
} from "@/lib/audience";
import type { SourceChoice } from "@/lib/sources";
import type { TemplateChoice } from "@/lib/templates";

const text = copy.composer;

const typingDelay = 800;
const choiceDelay = 150;
const checkDelay = 400;
const saveToastId = "campaign-save";

type SaveState = "saved" | "dirty" | "saving" | "failed";

type FieldErrors = Partial<Record<DraftField, string>>;

const focusTargets: Record<ProblemField, string> = {
  audience: "campaign-audience",
  template: "campaign-template",
  subject: "campaign-subject",
  source: "campaign-source",
  from: "campaign-from-name",
  brand: "campaign-sender",
  schedule: "campaign-summary",
};

const sectionTargets: Record<ProblemField, string> = {
  audience: "campaign-audience",
  template: "campaign-content",
  subject: "campaign-content",
  source: "campaign-sender",
  from: "campaign-sender",
  brand: "campaign-sender",
  schedule: "campaign-summary",
};

export type CampaignComposerProps = {
  campaign: Campaign;
  brandName: string;
  userEmail: string;
  sources: SourceChoice[];
  lists: AudienceList[];
  segments: AudienceSegment[];
};

export function CampaignComposer({
  campaign,
  brandName,
  userEmail,
  sources,
  lists,
  segments,
}: CampaignComposerProps) {
  const router = useRouter();
  const id = campaign.id;
  const [draft, setDraft] = useState(() => draftOf(campaign));
  const [selection, setSelection] = useState(() =>
    selectionOf(campaign.audience),
  );
  const [template, setTemplate] = useState<TemplateChoice | null>(() =>
    campaign.template
      ? { id: campaign.template.id, name: campaign.template.name, subject: "" }
      : null,
  );
  const [status, setStatus] = useState<SaveState>("saved");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [locked, setLocked] = useState(false);
  const [check, setCheck] = useState<CheckView>({ state: "loading" });
  const [checking, setChecking] = useState(true);
  const [pickerCount, setPickerCount] = useState<AudienceCount>({
    state: "incomplete",
  });
  const [previewKey, setPreviewKey] = useState(0);
  const [busy, setBusy] = useState<RailAction | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleKey, setScheduleKey] = useState(0);
  const [summary, setSummary] = useState<SendSummary | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [reloading, startReload] = useTransition();

  const draftRef = useRef(draft);
  const savedRef = useRef(draftPayload(draft));
  const changes = useRef(0);
  const dirty = useRef(false);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const saveTimer = useRef<number | null>(null);
  const checkTimer = useRef<number | null>(null);
  const checkBusy = useRef(false);
  const checkWanted = useRef(false);
  const mounted = useRef(true);
  const lockedRef = useRef(false);
  const scheduleRef = useRef<(delay: number) => void>(() => {});

  const show = useCallback((next: SaveState) => {
    dirty.current = next !== "saved";
    setStatus(next);
  }, []);

  const runCheck = useCallback(async () => {
    if (checkBusy.current) {
      checkWanted.current = true;
      return;
    }
    checkBusy.current = true;
    let result = await fetchCheck(id);
    while (checkWanted.current && mounted.current) {
      checkWanted.current = false;
      result = await fetchCheck(id);
    }
    checkBusy.current = false;
    if (!mounted.current) {
      return;
    }
    setChecking(false);
    setCheck(
      result.ok ? { state: "ready", check: result.data } : { state: "failed" },
    );
  }, [id]);

  const requestCheck = useCallback(
    (delay: number) => {
      if (lockedRef.current) {
        return;
      }
      setChecking(true);
      if (checkTimer.current !== null) {
        window.clearTimeout(checkTimer.current);
      }
      checkTimer.current = window.setTimeout(() => {
        checkTimer.current = null;
        void runCheck();
      }, delay);
    },
    [runCheck],
  );

  const persist = useCallback(async (): Promise<boolean> => {
    const payload = draftPayload(draftRef.current);
    const invalid: DraftField[] = [];
    const found: FieldErrors = {};
    if (payload.name === "") {
      invalid.push("name");
      found.name = text.nameMissing;
    }
    if (typeof payload.fromEmail === "string" && !isEmail(payload.fromEmail)) {
      invalid.push("fromEmail");
      found.fromEmail = text.sender.fromEmailInvalid;
    }
    if (typeof payload.replyTo === "string" && !isEmail(payload.replyTo)) {
      invalid.push("replyTo");
      found.replyTo = text.sender.replyToInvalid;
    }
    const changed = changedPayload(savedRef.current, payload, invalid);
    if (Object.keys(changed).length === 0) {
      setErrors(found);
      show(invalid.length > 0 ? "failed" : "saved");
      return invalid.length === 0;
    }
    const started = changes.current;
    show("saving");
    const result = await updateCampaign(id, changed);
    if (!mounted.current) {
      return false;
    }
    if (!result.ok) {
      show("failed");
      const field = draftFields.find((item) => item === result.error.field);
      if (result.error.code === "not_editable") {
        lockedRef.current = true;
        setLocked(true);
        toast.dismiss(saveToastId);
      } else if (field) {
        setErrors({
          ...found,
          [field]: result.error.message ?? text.fieldRejected,
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
    savedRef.current = { ...savedRef.current, ...changed };
    if ("templateId" in changed && changed.templateId !== null) {
      const current = draftRef.current;
      const filled: Partial<CampaignDraft> = {};
      if (current.subject.trim() === "" && result.data.subject !== "") {
        filled.subject = result.data.subject;
        savedRef.current.subject = result.data.subject;
      }
      if (current.previewText.trim() === "" && result.data.previewText !== "") {
        filled.previewText = result.data.previewText;
        savedRef.current.previewText = result.data.previewText;
      }
      if (Object.keys(filled).length > 0) {
        draftRef.current = { ...current, ...filled };
        setDraft(draftRef.current);
      }
    }
    setErrors(found);
    toast.dismiss(saveToastId);
    requestCheck(checkDelay);
    if (changes.current !== started) {
      show("dirty");
      scheduleRef.current(typingDelay);
      return false;
    }
    show(invalid.length > 0 ? "failed" : "saved");
    return invalid.length === 0;
  }, [id, show, requestCheck]);

  const save = useCallback(async (): Promise<boolean> => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (lockedRef.current) {
      return false;
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

  function update(patch: Partial<CampaignDraft>, delay: number) {
    if (lockedRef.current) {
      return;
    }
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    setDraft(next);
    changes.current += 1;
    setErrors((current) => {
      const fields = Object.keys(patch) as DraftField[];
      if (!fields.some((field) => current[field])) {
        return current;
      }
      const rest = { ...current };
      for (const field of fields) {
        delete rest[field];
      }
      return rest;
    });
    if (!inFlight.current) {
      show("dirty");
    }
    schedule(delay);
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
    requestCheck(0);
    function handleVisibility() {
      if (!document.hidden) {
        requestCheck(0);
        setPreviewKey((current) => current + 1);
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      mounted.current = false;
      document.removeEventListener("visibilitychange", handleVisibility);
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
      }
      if (checkTimer.current !== null) {
        window.clearTimeout(checkTimer.current);
      }
    };
  }, [requestCheck]);

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (dirty.current && !lockedRef.current) {
        event.preventDefault();
      }
    }
    function onClick(event: MouseEvent) {
      if (
        !dirty.current ||
        lockedRef.current ||
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

  const sourceChoices = withCampaignSource(sources, campaign.source);
  const defaultSource = sourceChoices.find((source) => source.isDefault);
  const sender = effectiveSource(sourceChoices, draft.sourceId);
  const needsFromEmail = sender !== null && sender.email === null;
  const fromEmail = sender
    ? (sender.email ?? (draft.fromEmail.trim() || null))
    : null;
  const from = fromEmail ? fromLine(draft.fromName, fromEmail) : null;
  const audienceName = audienceLabel(draft.audience, lists, segments);

  const fresh = status === "saved" && !checking && check.state === "ready";
  const checkedCount =
    check.state === "ready" ? check.check.recipientCount : null;
  let count: CountView;
  if (!draft.audience) {
    count = { state: "none" };
  } else if (fresh && checkedCount !== null) {
    count = { state: "ready", count: checkedCount };
  } else if (pickerCount.state === "ready") {
    count = { state: "ready", count: pickerCount.count };
  } else if (pickerCount.state === "failed") {
    count =
      status === "saved" && checkedCount !== null
        ? { state: "ready", count: checkedCount }
        : { state: "unknown" };
  } else {
    count = { state: "loading" };
  }

  const canSend =
    fresh &&
    !locked &&
    check.state === "ready" &&
    check.check.ready &&
    count.state === "ready" &&
    count.count > 0 &&
    from !== null &&
    audienceName !== null;

  const blocked =
    check.state === "ready" &&
    check.check.problems.some((problem) => problem.severity === "error");
  const note = locked
    ? null
    : status === "failed"
      ? copy.rail.unsaved
      : status !== "saved" || checking || check.state === "loading"
        ? copy.rail.waiting
        : check.state === "failed"
          ? null
          : blocked
            ? copy.rail.blocked
            : copy.rail.incomplete;

  function goTo(field: ProblemField) {
    const section = document.getElementById(sectionTargets[field]);
    section?.scrollIntoView({ block: "start" });
    const target = document.getElementById(focusTargets[field]) ?? section;
    target?.focus({ preventScroll: true });
  }

  function changeAudience(next: AudienceSelection) {
    setSelection(next);
    update({ audience: toAudience(next) }, choiceDelay);
  }

  function changeTemplate(next: TemplateChoice | null) {
    setTemplate(next);
    const patch: Partial<CampaignDraft> = { templateId: next?.id ?? null };
    if (next && next.subject !== "" && draftRef.current.subject.trim() === "") {
      patch.subject = next.subject.slice(0, maxSubjectLength);
    }
    update(patch, choiceDelay);
  }

  function buildSummary(): SendSummary | null {
    if (
      count.state !== "ready" ||
      check.state !== "ready" ||
      !from ||
      !audienceName
    ) {
      return null;
    }
    return {
      count: count.count,
      audience: audienceName,
      from,
      source: sender?.name ?? null,
      subject: draft.subject.trim(),
      warnings: check.check.problems.filter(
        (problem) => problem.severity === "warning",
      ),
    };
  }

  async function handleAction(action: RailAction) {
    if (busy || locked) {
      return;
    }
    if (action === "test") {
      setBusy("test");
      const ok = await flush();
      setBusy(null);
      if (!ok) {
        toast.error(text.saveFailed, {
          id: saveToastId,
          description: copy.rail.unsaved,
        });
        return;
      }
      if (!draftRef.current.templateId) {
        toast.error(copy.testDialog.noTemplate);
        goTo("template");
        return;
      }
      setTestOpen(true);
      return;
    }
    const next = buildSummary();
    if (!canSend || !next) {
      return;
    }
    setSummary(next);
    setSendError(null);
    if (action === "send") {
      setSendOpen(true);
    } else {
      setScheduleKey((current) => current + 1);
      setScheduleOpen(true);
    }
  }

  async function confirmSend(scheduledAt: Date | null) {
    if (sending) {
      return;
    }
    setSending(true);
    setSendError(null);
    const result = await sendCampaign(
      id,
      scheduledAt ? scheduledAt.toISOString() : null,
    );
    if (!result.ok) {
      setSending(false);
      setSendError(describeError(result.error));
      if (result.error.code === "not_editable") {
        lockedRef.current = true;
        setLocked(true);
      } else {
        requestCheck(0);
      }
      return;
    }
    const name = draftRef.current.name.trim() || copy.untitled;
    const moment = scheduledAt ? exactMoment(scheduledAt, "local") : null;
    toast.success(
      moment
        ? copy.scheduleDialog.scheduled(name, moment.day, moment.time)
        : copy.sendDialog.started(name),
    );
    dirty.current = false;
    lockedRef.current = true;
    router.refresh();
  }

  const disabled = locked || sending;

  return (
    <div className="flex min-w-0 flex-col gap-3.5 text-[13px] leading-normal">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          <BackToCampaigns />
          <span aria-hidden className="text-ink-tertiary">
            /
          </span>
          <Input
            type="text"
            autoComplete="off"
            maxLength={maxNameLength}
            disabled={disabled}
            aria-label={text.nameLabel}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? "campaign-name-error" : undefined}
            placeholder={text.namePlaceholder}
            value={draft.name}
            onChange={(event) =>
              update({ name: event.target.value }, typingDelay)
            }
            className="h-8 min-w-0 flex-1 basis-56 border-transparent bg-transparent px-2 text-[15px] font-semibold tracking-[-0.01em] shadow-none hover:border-border focus-visible:border-input focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:text-[15px] lg:max-w-[420px]"
          />
          <StatusBadge tone={statusTones.draft}>
            {statusLabels.draft}
          </StatusBadge>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <SaveStatus status={status} />
            {status === "failed" && !locked ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void save()}
                className={secondaryButtonClass}
              >
                {text.saveNow}
              </Button>
            ) : null}
          </div>
        </div>
        {errors.name ? (
          <p
            id="campaign-name-error"
            role="alert"
            className="pl-2 text-[13px] text-danger"
          >
            {errors.name}
          </p>
        ) : null}
      </div>

      {locked ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-warning-surface px-4 py-3 text-warning"
        >
          <Lock aria-hidden strokeWidth={1.6} className="size-4 shrink-0" />
          <p className="min-w-0 flex-1 basis-64">
            <span className="font-medium">{text.locked.title}.</span>{" "}
            {text.locked.body}
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={reloading}
            aria-busy={reloading || undefined}
            onClick={() => startReload(() => router.refresh())}
            className={cn(secondaryButtonClass, "text-foreground")}
          >
            {reloading ? <Spinner /> : null}
            {text.locked.reload}
          </Button>
        </div>
      ) : null}

      <div className="grid items-start gap-[18px] xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-[18px]">
          <div id="campaign-audience" tabIndex={-1} className={sectionClass}>
            <SectionCard
              id="campaign-audience-title"
              title={text.audience.title}
              description={text.audience.description}
            >
              <div className="flex flex-col gap-3 p-4">
                <AudiencePicker
                  value={selection}
                  lists={lists}
                  segments={segments}
                  disabled={disabled}
                  error={errors.audience}
                  onChange={changeAudience}
                  onCountChange={setPickerCount}
                />
                {selection.type === "lists" && selection.listIds.length > 1 ? (
                  <p className="text-[12.5px] text-ink-tertiary">
                    {text.audience.hint}
                  </p>
                ) : null}
              </div>
            </SectionCard>
          </div>

          <div id="campaign-content" tabIndex={-1} className={sectionClass}>
            <SectionCard
              id="campaign-content-title"
              title={text.content.title}
              description={text.content.description}
            >
              <div className="grid gap-x-5 gap-y-4 p-4 2xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
                <div className="flex min-w-0 flex-col gap-4">
                  <FieldBlock
                    id="campaign-template"
                    label={text.content.template}
                    hint={text.content.templateHint}
                  >
                    <TemplateCombobox
                      id="campaign-template"
                      value={template}
                      disabled={disabled}
                      error={errors.templateId}
                      describedBy="campaign-template-hint"
                      onChange={changeTemplate}
                    />
                  </FieldBlock>
                  <TextField
                    id="campaign-subject"
                    label={text.content.subject}
                    placeholder={text.content.subjectPlaceholder}
                    maxLength={maxSubjectLength}
                    value={draft.subject}
                    disabled={disabled}
                    error={errors.subject}
                    onChange={(subject) => update({ subject }, typingDelay)}
                  />
                  <TextField
                    id="campaign-preview-text"
                    label={text.content.previewText}
                    placeholder={text.content.previewTextPlaceholder}
                    maxLength={maxPreviewTextLength}
                    value={draft.previewText}
                    disabled={disabled}
                    error={errors.previewText}
                    hint={text.content.mergeHint}
                    onChange={(previewText) =>
                      update({ previewText }, typingDelay)
                    }
                  />
                </div>
                <TemplatePreview
                  templateId={draft.templateId}
                  templateName={template?.name ?? ""}
                  reloadKey={previewKey}
                />
              </div>
            </SectionCard>
          </div>

          <div id="campaign-sender" tabIndex={-1} className={sectionClass}>
            <SectionCard
              id="campaign-sender-title"
              title={text.sender.title}
              description={text.sender.description}
            >
              <div className="grid gap-x-5 gap-y-4 p-4 md:grid-cols-2">
                <FieldBlock
                  id="campaign-source"
                  label={text.sender.source}
                  hint={
                    sourceChoices.length === 0
                      ? undefined
                      : defaultSource
                        ? text.sender.sourceHintDefault
                        : text.sender.sourceHintNone
                  }
                  className="md:col-span-2"
                >
                  <SourceCombobox
                    id="campaign-source"
                    sources={sourceChoices}
                    value={draft.sourceId}
                    disabled={disabled}
                    error={errors.sourceId}
                    placeholder={
                      defaultSource
                        ? text.sender.sourcePlaceholderDefault(
                            defaultSource.name,
                          )
                        : undefined
                    }
                    describedBy="campaign-source-hint"
                    onChange={(sourceId) => update({ sourceId }, choiceDelay)}
                  />
                </FieldBlock>
                <TextField
                  id="campaign-from-name"
                  label={text.sender.fromName}
                  placeholder={brandName || text.sender.fromNamePlaceholder}
                  maxLength={maxFromNameLength}
                  value={draft.fromName}
                  disabled={disabled}
                  error={errors.fromName}
                  hint={text.sender.fromNameHint}
                  onChange={(fromName) => update({ fromName }, typingDelay)}
                />
                {needsFromEmail ? (
                  <TextField
                    id="campaign-from-email"
                    type="email"
                    label={text.sender.fromEmail}
                    placeholder={text.sender.fromEmailPlaceholder}
                    maxLength={320}
                    value={draft.fromEmail}
                    disabled={disabled}
                    error={errors.fromEmail}
                    hint={text.sender.fromEmailHint}
                    onChange={(value) =>
                      update({ fromEmail: value }, typingDelay)
                    }
                  />
                ) : sender?.email ? (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[13px] font-medium text-foreground">
                      {text.sender.fromEmail}
                    </span>
                    <p className="flex min-h-8 items-center rounded-lg border border-border-subtle bg-muted/50 px-2.5 py-1.5 text-muted-foreground">
                      {text.sender.fromFixed(sender.email)}
                    </p>
                  </div>
                ) : null}
                <TextField
                  id="campaign-reply-to"
                  type="email"
                  label={text.sender.replyTo}
                  placeholder={text.sender.replyToPlaceholder}
                  maxLength={320}
                  value={draft.replyTo}
                  disabled={disabled}
                  error={errors.replyTo}
                  hint={text.sender.replyToHint}
                  onChange={(replyTo) => update({ replyTo }, typingDelay)}
                />
              </div>
            </SectionCard>
          </div>

          <div id="campaign-tracking" tabIndex={-1} className={sectionClass}>
            <SectionCard
              id="campaign-tracking-title"
              title={text.tracking.title}
              description={text.tracking.description}
            >
              <div className="flex flex-col divide-y divide-border-subtle">
                <SwitchRow
                  id="campaign-track-opens"
                  label={text.tracking.opens}
                  hint={text.tracking.opensHint}
                  checked={draft.trackOpens}
                  disabled={disabled}
                  onChange={(trackOpens) => update({ trackOpens }, 0)}
                />
                <SwitchRow
                  id="campaign-track-clicks"
                  label={text.tracking.clicks}
                  hint={text.tracking.clicksHint}
                  checked={draft.trackClicks}
                  disabled={disabled}
                  onChange={(trackClicks) => update({ trackClicks }, 0)}
                />
              </div>
            </SectionCard>
          </div>
        </div>

        <div
          id="campaign-summary"
          tabIndex={-1}
          className="min-w-0 outline-hidden xl:sticky xl:top-[70px]"
        >
          <ComposerRail
            count={count}
            audience={audienceName}
            from={from}
            source={sender?.name ?? null}
            subject={draft.subject}
            check={check}
            checking={checking}
            unsaved={status === "dirty" || status === "saving"}
            canSend={canSend}
            note={note}
            busy={busy}
            onRetryCheck={() => requestCheck(0)}
            onGoTo={goTo}
            onAction={(action) => void handleAction(action)}
          />
        </div>
      </div>

      <SendTestDialog
        open={testOpen}
        campaignId={id}
        defaultTo={userEmail}
        onOpenChange={setTestOpen}
      />
      <SendDialog
        open={sendOpen}
        summary={summary}
        pending={sending}
        error={sendError}
        onConfirm={() => void confirmSend(null)}
        onOpenChange={setSendOpen}
      />
      <ScheduleDialog
        open={scheduleOpen}
        formKey={scheduleKey}
        summary={summary}
        pending={sending}
        error={sendError}
        onConfirm={(date) => void confirmSend(date)}
        onOpenChange={setScheduleOpen}
      />
    </div>
  );
}

const sectionClass = "min-w-0 scroll-mt-[70px] outline-hidden";

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

type FieldBlockProps = {
  id: string;
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
};

function FieldBlock({ id, label, hint, className, children }: FieldBlockProps) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-foreground">
        {label}
      </label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-[12.5px] text-ink-tertiary">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type TextFieldProps = {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  maxLength: number;
  type?: "text" | "email";
  disabled?: boolean;
  error?: string;
  hint?: string;
  onChange: (value: string) => void;
};

function TextField({
  id,
  label,
  value,
  placeholder,
  maxLength,
  type = "text",
  disabled,
  error,
  hint,
  onChange,
}: TextFieldProps) {
  const noteId = error || hint ? `${id}-note` : undefined;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-foreground">
        {label}
      </label>
      <Input
        id={id}
        type={type}
        inputMode={type === "email" ? "email" : undefined}
        autoComplete="off"
        spellCheck={type === "email" ? false : undefined}
        maxLength={maxLength}
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={noteId}
        className={cn(inputClass, "md:text-[13px]")}
      />
      {error || hint ? (
        <p
          id={noteId}
          role={error ? "alert" : undefined}
          className={cn(
            "text-[12.5px]",
            error ? "text-danger" : "text-ink-tertiary",
          )}
        >
          {error ?? hint}
        </p>
      ) : null}
    </div>
  );
}

type SwitchRowProps = {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
};

function SwitchRow({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: SwitchRowProps) {
  return (
    <div className="flex items-start justify-between gap-6 px-4 py-3.5">
      <div className="min-w-0">
        <div id={`${id}-label`} className="font-medium text-foreground">
          {label}
        </div>
        <p id={`${id}-hint`} className="max-w-[640px] text-muted-foreground">
          {hint}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-hint`}
        onCheckedChange={onChange}
        className="mt-0.5"
      />
    </div>
  );
}
