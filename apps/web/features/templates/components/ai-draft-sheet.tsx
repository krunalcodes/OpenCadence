"use client";

import { isDocumentVisuallyEmpty } from "@react-email/editor/core";
import { Button } from "@workspace/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet";
import { Textarea } from "@workspace/ui/components/textarea";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group";
import { cn } from "@workspace/ui/lib/utils";
import { Sparkles } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import type { Option } from "@/components/product/option";
import { OptionCombobox } from "@/components/product/option-combobox";
import {
  dialogActionsClass,
  dialogContentClass,
  dialogTitleClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
  segmentedGroupClass,
  segmentedItemClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import { useAiStream } from "@/features/templates/hooks/use-ai-stream";
import {
  type DraftKind,
  type DraftTone,
  draftKinds,
  draftTones,
  maxAiHtmlLength,
  maxAiMergeTags,
  maxPromptLength,
  parseDraft,
  wordCount,
} from "@/features/templates/lib/ai";
import { copy, describeAiError } from "@/features/templates/lib/copy";
import {
  aiHtmlToEditorHtml,
  draftPreviewDocument,
  editorHtmlToAiHtml,
  htmlToPlainText,
} from "@/features/templates/lib/document";
import type { Editor } from "@/features/templates/lib/editor";
import type { Brand } from "@/lib/brand";

const text = copy.ai.draft;

const kindOptions: Option[] = draftKinds.map((kind) => ({
  value: kind,
  label: text.kinds[kind],
}));

const toneOptions: Option[] = draftTones.map((tone) => ({
  value: tone,
  label: text.tones[tone],
}));

const modes = ["new", "revise"] as const;

type Mode = (typeof modes)[number];

export type AppliedDraft = { subject: string; preview: string; html: string };

type AiDraftSheetProps = {
  open: boolean;
  editor: Editor;
  brand: Brand | null;
  mergeTags: string[];
  onOpenChange: (open: boolean) => void;
  onApply: (draft: AppliedDraft) => void;
};

export function AiDraftSheet({
  open,
  editor,
  brand,
  mergeTags,
  onOpenChange,
  onApply,
}: AiDraftSheetProps) {
  const { stream, start, stop, reset } = useAiStream("/ai/draft");
  const [prompt, setPrompt] = useState("");
  const [promptError, setPromptError] = useState<string | null>(null);
  const [kind, setKind] = useState<DraftKind>("newsletter");
  const [tone, setTone] = useState<DraftTone>("friendly");
  const [mode, setMode] = useState<Mode>("new");
  const [confirming, setConfirming] = useState(false);

  const busy = stream.status === "streaming";
  const draft = useMemo(() => parseDraft(stream.text), [stream.text]);
  const finished = stream.status === "done" || stream.status === "stopped";
  const bodyHtml = useMemo(
    () => (finished && draft.body !== "" ? aiHtmlToEditorHtml(draft.body) : ""),
    [finished, draft.body],
  );
  const previewHtml = useMemo(
    () => (bodyHtml === "" ? "" : draftPreviewDocument(bodyHtml, brand)),
    [bodyHtml, brand],
  );
  const hasContent = open && !isDocumentVisuallyEmpty(editor.state.doc);
  const shownMode: Mode = hasContent ? mode : "new";
  const started = stream.status !== "idle";
  const plain = busy ? htmlToPlainText(draft.body) : "";
  const step = busy
    ? text.steps[draft.step]
    : stream.status === "stopped"
      ? text.steps.stopped
      : stream.status === "done"
        ? text.steps.done
        : null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) {
      return;
    }
    const value = prompt.trim();
    if (value === "") {
      setPromptError(text.promptMissing);
      document.getElementById("draft-prompt")?.focus();
      return;
    }
    setPromptError(null);
    const currentHtml =
      shownMode === "revise"
        ? editorHtmlToAiHtml(editor.getHTML()).slice(0, maxAiHtmlLength)
        : "";
    void start({
      prompt: value,
      kind,
      tone: text.tones[tone].toLowerCase(),
      mergeTags: mergeTags
        .filter((tag) => tag.length <= 80)
        .slice(0, maxAiMergeTags),
      ...(currentHtml === "" ? {} : { currentHtml }),
    });
  }

  function apply() {
    setConfirming(false);
    onApply({ subject: draft.subject, preview: draft.preview, html: bodyHtml });
    reset();
    onOpenChange(false);
  }

  function requestApply() {
    if (bodyHtml === "") {
      return;
    }
    if (isDocumentVisuallyEmpty(editor.state.doc)) {
      apply();
      return;
    }
    setConfirming(true);
  }

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            stop();
          }
          onOpenChange(next);
        }}
      >
        <SheetContent className="w-full gap-0 text-[13px] data-[side=right]:w-full data-[side=right]:sm:max-w-[520px]">
          <SheetHeader className="gap-1 border-b border-border-subtle px-5 py-4 pr-12">
            <SheetTitle className="text-[15px] font-semibold tracking-[-0.01em]">
              {text.title}
            </SheetTitle>
            <SheetDescription className="text-[13px] leading-normal">
              {text.description}
            </SheetDescription>
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
            <form
              noValidate
              onSubmit={handleSubmit}
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <label htmlFor="draft-prompt" className="font-medium">
                    {text.prompt}
                  </label>
                  <span className="text-[12px] text-ink-tertiary tabular-nums">
                    {text.promptCounter(prompt.length, maxPromptLength)}
                  </span>
                </div>
                <Textarea
                  id="draft-prompt"
                  rows={4}
                  maxLength={maxPromptLength}
                  disabled={busy}
                  placeholder={text.promptPlaceholder}
                  value={prompt}
                  onChange={(event) => {
                    setPrompt(event.target.value);
                    if (promptError) {
                      setPromptError(null);
                    }
                  }}
                  aria-invalid={promptError ? true : undefined}
                  aria-describedby={
                    promptError ? "draft-prompt-error" : undefined
                  }
                  className={cn(inputClass, "min-h-[92px] md:text-[13px]")}
                />
                {promptError ? (
                  <p
                    id="draft-prompt-error"
                    className="text-[13px] text-danger"
                  >
                    {promptError}
                  </p>
                ) : null}
              </div>

              {hasContent ? (
                <div className="flex flex-col gap-1.5">
                  <ToggleGroup
                    aria-label={text.mode}
                    value={[shownMode]}
                    disabled={busy}
                    onValueChange={(next) => {
                      const picked = modes.find((item) => item === next[0]);
                      if (picked) {
                        setMode(picked);
                      }
                    }}
                    className={segmentedGroupClass}
                  >
                    <ToggleGroupItem value="new" className={segmentedItemClass}>
                      {text.modeNew}
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="revise"
                      className={segmentedItemClass}
                    >
                      {text.modeRevise}
                    </ToggleGroupItem>
                  </ToggleGroup>
                  {shownMode === "revise" ? (
                    <p className="text-[12.5px] text-ink-tertiary">
                      {text.reviseHint}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <label htmlFor="draft-kind" className="font-medium">
                    {text.kind}
                  </label>
                  <OptionCombobox
                    id="draft-kind"
                    options={kindOptions}
                    value={kind}
                    label={text.kind}
                    placeholder={text.kindPlaceholder}
                    empty={text.kindEmpty}
                    disabled={busy}
                    clearable={false}
                    onChange={(next) => {
                      const picked = draftKinds.find((item) => item === next);
                      if (picked) {
                        setKind(picked);
                      }
                    }}
                    className="w-full"
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <label htmlFor="draft-tone" className="font-medium">
                    {text.tone}
                  </label>
                  <OptionCombobox
                    id="draft-tone"
                    options={toneOptions}
                    value={tone}
                    label={text.tone}
                    placeholder={text.tonePlaceholder}
                    empty={text.toneEmpty}
                    disabled={busy}
                    clearable={false}
                    onChange={(next) => {
                      const picked = draftTones.find((item) => item === next);
                      if (picked) {
                        setTone(picked);
                      }
                    }}
                    className="w-full"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="submit"
                  disabled={busy}
                  aria-busy={busy || undefined}
                  className={primaryButtonClass}
                >
                  {busy ? (
                    <Spinner />
                  ) : (
                    <Sparkles aria-hidden strokeWidth={1.8} />
                  )}
                  {started && !busy
                    ? text.again
                    : shownMode === "revise"
                      ? text.revise
                      : text.generate}
                </Button>
                {busy ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={stop}
                    className={secondaryButtonClass}
                  >
                    {copy.ai.stop}
                  </Button>
                ) : null}
              </div>
            </form>

            {stream.status === "failed" && stream.error ? (
              <p
                role="alert"
                className="rounded-lg border border-danger/30 bg-danger-surface px-3 py-2.5 text-danger"
              >
                {describeAiError(stream.error)}
              </p>
            ) : null}

            {started && (stream.text !== "" || busy) ? (
              <section
                aria-live="polite"
                aria-busy={busy || undefined}
                className="flex flex-col gap-3 border-t border-border-subtle pt-4"
              >
                {step ? (
                  <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground">
                    {busy ? <Spinner className="size-3.5" /> : null}
                    {step}
                    {busy && draft.step === "body" ? (
                      <span className="font-normal text-ink-tertiary tabular-nums">
                        {text.words(wordCount(plain))}
                      </span>
                    ) : null}
                  </p>
                ) : null}
                {draft.subject ? (
                  <div>
                    <p className="text-[12px] font-medium text-ink-tertiary">
                      {text.subject}
                    </p>
                    <p className="font-medium">{draft.subject}</p>
                  </div>
                ) : null}
                {draft.preview ? (
                  <div>
                    <p className="text-[12px] font-medium text-ink-tertiary">
                      {text.previewText}
                    </p>
                    <p className="text-muted-foreground">{draft.preview}</p>
                  </div>
                ) : null}
                {previewHtml !== "" ? (
                  <div className="flex flex-col gap-1">
                    <p className="text-[12px] font-medium text-ink-tertiary">
                      {text.body}
                    </p>
                    <iframe
                      title={text.frameTitle}
                      sandbox=""
                      srcDoc={previewHtml}
                      className="h-[340px] w-full rounded-lg border border-border bg-white"
                    />
                  </div>
                ) : plain !== "" ? (
                  <div className="flex flex-col gap-1">
                    <p className="text-[12px] font-medium text-ink-tertiary">
                      {text.body}
                    </p>
                    <p className="max-h-[340px] overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-card px-3 py-2.5 text-muted-foreground">
                      {plain}
                    </p>
                  </div>
                ) : finished ? (
                  <p role="alert" className="text-muted-foreground">
                    {text.incomplete}
                  </p>
                ) : null}
              </section>
            ) : null}
          </div>

          {finished && bodyHtml !== "" ? (
            <div className="flex flex-col-reverse gap-2 border-t border-border-subtle px-5 py-4 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={reset}
                className={secondaryButtonClass}
              >
                {text.discard}
              </Button>
              <Button
                type="button"
                onClick={requestApply}
                className={primaryButtonClass}
              >
                {text.insert}
              </Button>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className={dialogContentClass}>
          <DialogHeader>
            <DialogTitle className={dialogTitleClass}>
              {text.replaceTitle}
            </DialogTitle>
            <DialogDescription className="text-[13px]">
              {text.replaceBody}
            </DialogDescription>
          </DialogHeader>
          <div className={dialogActionsClass}>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirming(false)}
              className={secondaryButtonClass}
            >
              {text.replaceCancel}
            </Button>
            <Button
              type="button"
              onClick={apply}
              className={primaryButtonClass}
            >
              {text.replaceConfirm}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
