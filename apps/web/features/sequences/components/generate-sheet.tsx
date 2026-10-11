"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { Input } from "@workspace/ui/components/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet";
import { cn } from "@workspace/ui/lib/utils";
import { ArrowLeft, Check, RefreshCw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  dialogActionsClass,
  dialogContentClass,
  dialogTitleClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import {
  type BriefErrors,
  briefFieldIds,
  briefFormId,
  GenerateBrief,
} from "@/features/sequences/components/generate-brief";
import {
  GeneratedStep,
  type StepPatch,
} from "@/features/sequences/components/generated-step";
import {
  type Brief,
  briefMergeTags,
  customChoice,
  emptyBrief,
  goalPresets,
  parseSequenceStream,
  type SequenceDraft,
  stepNodes,
  toFromDraftSteps,
  tonePresets,
  toSequenceDraft,
  wordCount,
} from "@/features/sequences/lib/ai";
import {
  copy,
  describeAiError,
  describeError,
} from "@/features/sequences/lib/copy";
import { browserTimezone } from "@/features/sequences/lib/schedule";
import {
  cleanName,
  maxNameLength,
  sequencePath,
} from "@/features/sequences/lib/sequences";
import {
  createSequenceFromDraft,
  updateSequence,
} from "@/features/sequences/queries/client";
import { useAiStream } from "@/hooks/use-ai-stream";
import { appHref } from "@/lib/navigation";

const text = copy.ai;
const nameFieldId = "sequence-ai-name";
const stepField = /^steps\.(\d+)(?:\.|$)/;

type GenerateSheetProps = {
  open: boolean;
  configured: boolean;
  onOpenChange: (open: boolean) => void;
};

export function GenerateSheet({
  open,
  configured,
  onOpenChange,
}: GenerateSheetProps) {
  if (configured) {
    return <GenerateFlow open={open} onOpenChange={onOpenChange} />;
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dialogContentClass}>
        <DialogHeader>
          <DialogTitle className={dialogTitleClass}>
            {text.setup.title}
          </DialogTitle>
          <DialogDescription className="text-[13px]">
            {text.setup.body}
          </DialogDescription>
        </DialogHeader>
        <div className={dialogActionsClass}>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className={secondaryButtonClass}
          >
            {text.setup.close}
          </Button>
          <Button
            nativeButton={false}
            render={<Link href={appHref("settings/ai")} />}
            className={primaryButtonClass}
          >
            {text.setup.link}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function goalText(brief: Brief) {
  if (brief.goal === customChoice) {
    return brief.customGoal.trim();
  }
  const preset = goalPresets.find((goal) => goal === brief.goal);
  return preset ? text.brief.goals[preset] : "";
}

function toneText(brief: Brief) {
  if (brief.tone === customChoice) {
    return brief.customTone.trim();
  }
  const preset = tonePresets.find((tone) => tone === brief.tone);
  return preset ? text.brief.tones[preset].toLowerCase() : "";
}

type FlowProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function GenerateFlow({ open, onOpenChange }: FlowProps) {
  const router = useRouter();
  const { stream, start, stop, reset } = useAiStream("/ai/sequence");
  const [stage, setStage] = useState<"brief" | "result">("brief");
  const [brief, setBrief] = useState<Brief>(emptyBrief);
  const [briefErrors, setBriefErrors] = useState<BriefErrors>({});
  const [requested, setRequested] = useState(emptyBrief.steps);
  const [edits, setEdits] = useState<SequenceDraft | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<"regenerate" | "close" | null>(null);
  const list = useRef<HTMLOListElement>(null);

  const busy = stream.status === "streaming";
  const finished =
    stream.status === "done" ||
    stream.status === "stopped" ||
    stream.status === "failed";
  const parsed = useMemo(() => parseSequenceStream(stream.text), [stream.text]);
  const base = useMemo(
    () => toSequenceDraft(parsed, finished),
    [parsed, finished],
  );
  const draft = edits ?? base;
  const stepCount = draft.steps.length;
  const words = busy ? wordCount(stream.text.replace(/<[^>]*>?/g, " ")) : 0;
  const hasDraft = stream.status !== "idle" && (busy || stepCount > 0);

  useEffect(() => {
    if (busy && stepCount > 0) {
      list.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
    }
  }, [busy, stepCount]);

  function clearResult() {
    setEdits(null);
    setEditing(null);
    setNameError(null);
    setStepErrors({});
  }

  function generate() {
    const prompt = brief.prompt.trim();
    const goal = goalText(brief);
    const tone = toneText(brief);
    const errors: BriefErrors = {};
    if (prompt === "") {
      errors.prompt = text.brief.promptMissing;
    }
    if (brief.goal === customChoice && goal === "") {
      errors.goal = text.brief.customGoalMissing;
    }
    if (brief.tone === customChoice && tone === "") {
      errors.tone = text.brief.customToneMissing;
    }
    setBriefErrors(errors);
    const invalid = errors.prompt
      ? briefFieldIds.prompt
      : errors.goal
        ? briefFieldIds.goal
        : errors.tone
          ? briefFieldIds.tone
          : null;
    if (invalid) {
      setStage("brief");
      window.requestAnimationFrame(() => {
        document.getElementById(invalid)?.focus();
      });
      return;
    }
    const audience = brief.audience.trim();
    clearResult();
    setRequested(brief.steps);
    setStage("result");
    void start({
      prompt,
      steps: brief.steps,
      mergeTags: briefMergeTags,
      ...(audience === "" ? {} : { audience }),
      ...(goal === "" ? {} : { goal }),
      ...(tone === "" ? {} : { tone }),
    });
  }

  function requestGenerate() {
    if (busy || creating) {
      return;
    }
    if (edits) {
      setConfirm("regenerate");
      return;
    }
    generate();
  }

  function requestClose() {
    if (creating) {
      return;
    }
    if (edits) {
      setConfirm("close");
      return;
    }
    stop();
    onOpenChange(false);
  }

  function confirmDiscard() {
    const action = confirm;
    setConfirm(null);
    if (action === "regenerate") {
      generate();
      return;
    }
    reset();
    clearResult();
    setStage("brief");
    onOpenChange(false);
  }

  function update(change: (current: SequenceDraft) => SequenceDraft) {
    setEdits((current) => change(current ?? base));
  }

  function changeStep(key: string, patch: StepPatch) {
    update((current) => ({
      ...current,
      steps: current.steps.map((step) =>
        step.key === key ? { ...step, ...patch } : step,
      ),
    }));
    if (stepErrors[key]) {
      setStepErrors(({ [key]: _cleared, ...rest }) => rest);
    }
  }

  function removeStep(key: string) {
    update((current) => ({
      ...current,
      steps: current.steps.filter((step) => step.key !== key),
    }));
    setStepErrors(({ [key]: _cleared, ...rest }) => rest);
    if (editing === key) {
      setEditing(null);
    }
  }

  function failName(message: string) {
    setNameError(message);
    window.requestAnimationFrame(() => {
      document.getElementById(nameFieldId)?.focus();
    });
  }

  async function create() {
    if (busy || creating || stepCount === 0) {
      return;
    }
    const name = cleanName(draft.name);
    const errors: Record<string, string> = {};
    draft.steps.forEach((step, index) => {
      if (stepNodes(step).length === 0) {
        errors[step.key] = text.result.bodyMissing;
      } else if (index === 0 && step.subject.trim() === "") {
        errors[step.key] = text.result.subjectMissing;
      }
    });
    setStepErrors(errors);
    const firstInvalid = draft.steps.find((step) => errors[step.key]);
    if (firstInvalid) {
      setEditing(firstInvalid.key);
    }
    if (name === "") {
      failName(text.result.nameMissing);
      return;
    }
    if (name.length > maxNameLength) {
      failName(text.result.nameTooLong(maxNameLength));
      return;
    }
    setNameError(null);
    if (firstInvalid) {
      const key = firstInvalid.key;
      window.requestAnimationFrame(() => {
        document
          .getElementById(`generated-${key}-error`)
          ?.scrollIntoView({ block: "center" });
      });
      return;
    }
    setCreating(true);
    const result = await createSequenceFromDraft(
      name,
      toFromDraftSteps(draft.steps),
    );
    if (result.ok) {
      const timezone = browserTimezone();
      if (timezone && timezone !== result.data.timezone) {
        await updateSequence(result.data.id, { timezone });
      }
      toast.success(text.result.created(result.data.name), {
        description: text.result.createdBody,
      });
      router.push(appHref(sequencePath(result.data.id)));
      return;
    }
    setCreating(false);
    const { error } = result;
    if (error.code === "name_taken") {
      failName(text.result.nameTaken);
      return;
    }
    if (error.field === "name") {
      failName(describeError(error));
      return;
    }
    const match = error.field ? stepField.exec(error.field) : null;
    const index = match ? Number(match[1]) : -1;
    const rejected = draft.steps[index];
    if (rejected) {
      setStepErrors({
        [rejected.key]: error.message ?? text.result.stepRejected(index + 1),
      });
      setEditing(rejected.key);
      return;
    }
    toast.error(text.result.createFailed, {
      description: describeError(error),
    });
  }

  const status = busy
    ? parsed.steps.length === 0
      ? text.result.starting
      : text.result.progress(
          parsed.steps.length,
          Math.max(requested, parsed.steps.length),
        )
    : stream.status === "stopped"
      ? text.result.stopped
      : stream.status === "done" && stepCount > 0
        ? text.result.done(stepCount)
        : null;

  const problem =
    stream.status === "failed" && stream.error
      ? describeAiError(stream.error)
      : finished && stepCount === 0
        ? edits
          ? text.result.noSteps
          : text.result.empty
        : null;

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (next) {
            onOpenChange(true);
          } else {
            requestClose();
          }
        }}
      >
        <SheetContent className="w-full gap-0 text-[13px] data-[side=right]:w-full data-[side=right]:sm:max-w-[640px]">
          <SheetHeader className="gap-1 border-b border-border-subtle px-5 py-4 pr-12">
            <SheetTitle className="text-[15px] font-semibold tracking-[-0.01em]">
              {text.title}
            </SheetTitle>
            <SheetDescription className="text-[13px] leading-normal">
              {text.description}
            </SheetDescription>
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
            {stage === "brief" ? (
              <GenerateBrief
                brief={brief}
                errors={briefErrors}
                onChange={(patch) => {
                  setBrief((current) => ({ ...current, ...patch }));
                  setBriefErrors({});
                }}
                onSubmit={requestGenerate}
              />
            ) : (
              <>
                {status ? (
                  <p
                    aria-live="polite"
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] font-medium text-muted-foreground"
                  >
                    {busy ? (
                      <Spinner className="size-3.5" />
                    ) : stream.status === "done" ? (
                      <Check
                        aria-hidden
                        strokeWidth={1.8}
                        className="size-3.5 text-success"
                      />
                    ) : null}
                    {status}
                    {busy && words > 0 ? (
                      <span className="font-normal text-ink-tertiary tabular-nums">
                        {text.result.words(words)}
                      </span>
                    ) : null}
                  </p>
                ) : null}

                {problem ? (
                  <div
                    role="alert"
                    className="flex flex-col gap-1 rounded-lg border border-danger/30 bg-danger-surface px-3 py-2.5 text-danger"
                  >
                    <p>{problem}</p>
                    {stream.status === "failed" && stepCount > 0 ? (
                      <p>{text.result.keptAfterError}</p>
                    ) : null}
                  </div>
                ) : null}

                {busy || stepCount > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={nameFieldId} className="font-medium">
                      {text.result.name}
                    </label>
                    <Input
                      id={nameFieldId}
                      type="text"
                      autoComplete="off"
                      disabled={busy || creating}
                      maxLength={maxNameLength}
                      placeholder={
                        busy
                          ? text.result.waitingForName
                          : text.result.namePlaceholder
                      }
                      value={draft.name}
                      onChange={(event) => {
                        const name = event.target.value;
                        update((current) => ({ ...current, name }));
                        setNameError(null);
                      }}
                      aria-invalid={nameError ? true : undefined}
                      aria-describedby={
                        nameError ? "sequence-ai-name-error" : undefined
                      }
                      className={cn(inputClass, "md:text-[13px]")}
                    />
                    {nameError ? (
                      <p
                        id="sequence-ai-name-error"
                        role="alert"
                        className="text-[13px] text-danger"
                      >
                        {nameError}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {stepCount > 0 ? (
                  <>
                    <ol
                      ref={list}
                      aria-label={text.result.stepsLabel}
                      aria-busy={busy || undefined}
                      className="flex flex-col gap-3"
                    >
                      {draft.steps.map((step, index) => (
                        <GeneratedStep
                          key={step.key}
                          step={step}
                          index={index}
                          writing={busy && index === stepCount - 1}
                          locked={busy || creating}
                          editing={!busy && !creating && editing === step.key}
                          error={stepErrors[step.key] ?? null}
                          onEdit={() => setEditing(step.key)}
                          onDone={() => setEditing(null)}
                          onChange={(patch) => changeStep(step.key, patch)}
                          onRemove={() => removeStep(step.key)}
                        />
                      ))}
                    </ol>
                    <p className="text-[12.5px] text-ink-tertiary">
                      {text.result.mergeNote}
                    </p>
                  </>
                ) : null}
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border-subtle px-5 py-4">
            {stage === "brief" ? (
              <>
                {hasDraft ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStage("result")}
                    className={cn(secondaryButtonClass, "mr-auto")}
                  >
                    {text.brief.viewDraft}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  onClick={requestClose}
                  className={secondaryButtonClass}
                >
                  {text.brief.cancel}
                </Button>
                <Button
                  type="submit"
                  form={briefFormId}
                  disabled={busy}
                  className={primaryButtonClass}
                >
                  <Sparkles aria-hidden strokeWidth={1.8} />
                  {text.brief.generate}
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={creating}
                  onClick={() => {
                    stop();
                    setStage("brief");
                  }}
                  className={cn(secondaryButtonClass, "mr-auto")}
                >
                  <ArrowLeft aria-hidden strokeWidth={1.6} />
                  {text.result.back}
                </Button>
                {busy ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={stop}
                    className={secondaryButtonClass}
                  >
                    {text.result.stop}
                  </Button>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={creating}
                      onClick={requestGenerate}
                      className={secondaryButtonClass}
                    >
                      <RefreshCw aria-hidden strokeWidth={1.6} />
                      {text.result.regenerate}
                    </Button>
                    <Button
                      type="button"
                      disabled={creating || stepCount === 0}
                      aria-busy={creating || undefined}
                      onClick={() => void create()}
                      className={primaryButtonClass}
                    >
                      {creating ? <Spinner /> : null}
                      {text.result.create}
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog
        open={confirm !== null}
        onOpenChange={(next) => {
          if (!next) {
            setConfirm(null);
          }
        }}
      >
        <DialogContent className={dialogContentClass}>
          <DialogHeader>
            <DialogTitle className={dialogTitleClass}>
              {text.discard.title}
            </DialogTitle>
            <DialogDescription className="text-[13px]">
              {confirm === "close"
                ? text.discard.closeBody
                : text.discard.regenerateBody}
            </DialogDescription>
          </DialogHeader>
          <div className={dialogActionsClass}>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirm(null)}
              className={secondaryButtonClass}
            >
              {text.discard.cancel}
            </Button>
            <Button
              type="button"
              onClick={confirmDiscard}
              className={primaryButtonClass}
            >
              {confirm === "close"
                ? text.discard.close
                : text.discard.regenerate}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
