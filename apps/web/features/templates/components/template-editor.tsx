"use client";

import "@react-email/editor/themes/default.css";
import "./template-editor.css";

import {
  EmailEditor,
  type EmailEditorProps,
  type EmailEditorRef,
} from "@react-email/editor";
import { EditorFocusScope, Inspector } from "@react-email/editor/ui";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { cn } from "@workspace/ui/lib/utils";
import {
  ArrowLeft,
  Braces,
  Check,
  CircleAlert,
  ClipboardCheck,
  Eye,
  ImagePlus,
  Send,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { focusRing } from "@/components/app-shell/page-header";
import type { Option } from "@/components/product/option";
import {
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import {
  AiDraftSheet,
  type AppliedDraft,
} from "@/features/templates/components/ai-draft-sheet";
import {
  AiRewritePopover,
  toolButtonClass,
} from "@/features/templates/components/ai-rewrite-popover";
import { AiSetupNote } from "@/features/templates/components/ai-setup-note";
import { editorHeightClass } from "@/features/templates/components/editor-skeleton";
import { MergeTagPicker } from "@/features/templates/components/merge-tag-picker";
import { PreviewDialog } from "@/features/templates/components/preview-dialog";
import { ReviewSheet } from "@/features/templates/components/review-sheet";
import { SendTestDialog } from "@/features/templates/components/send-test-dialog";
import { SubjectSuggestions } from "@/features/templates/components/subject-suggestions";
import { TagField } from "@/features/templates/components/tag-field";
import { useEditorScope } from "@/features/templates/hooks/use-editor-scope";
import {
  copy,
  describeError,
  describeImageError,
} from "@/features/templates/lib/copy";
import {
  brandTheme,
  importedHtml,
  starterHtml,
} from "@/features/templates/lib/document";
import {
  type Editor,
  type EditorRange,
  exportEmail,
  insertText,
  replaceBody,
  selectionRange,
} from "@/features/templates/lib/editor";
import {
  mergeTagKeys,
  mergeTagOptions,
  sampleValues,
} from "@/features/templates/lib/merge-tags";
import {
  type MergeField,
  maxHtmlLength,
  maxNameLength,
  maxPreviewTextLength,
  maxSubjectLength,
  maxTextLength,
  type Template,
} from "@/features/templates/lib/templates";
import { saveTemplate } from "@/features/templates/queries/client";
import type { Brand } from "@/lib/brand";
import { maxImageBytes, uploadImage } from "@/lib/media";
import { appHref } from "@/lib/navigation";
import type { SourceChoice } from "@/lib/sources";

const text = copy.editor;

const autosaveDelay = 2000;
const armDelay = 200;
const saveToastId = "template-save";

type Status = "saved" | "dirty" | "saving" | "failed";

type EditorContent = NonNullable<EmailEditorProps["content"]>;

export type TemplateEditorProps = {
  template: Template;
  brand: Brand | null;
  workspaceName: string;
  userEmail: string;
  aiConfigured: boolean;
  sources: SourceChoice[];
  fields: MergeField[];
};

function initialContent(template: Template, brand: Brand | null) {
  if (template.document) {
    return { content: template.document as EditorContent, seeded: false };
  }
  if (template.html.trim() !== "") {
    return { content: importedHtml(template.html), seeded: false };
  }
  return { content: starterHtml(brand), seeded: true };
}

async function uploadEditorImage(file: File) {
  const result = await uploadImage(file);
  if (!result.ok) {
    toast.error(copy.images.failed, {
      description: describeImageError(
        result.error,
        Math.round(maxImageBytes / (1024 * 1024)),
      ),
    });
    throw new Error(result.error.code || "upload_failed");
  }
  return { url: result.data.url };
}

export function TemplateEditor({
  template,
  brand,
  workspaceName,
  userEmail,
  aiConfigured,
  sources,
  fields,
}: TemplateEditorProps) {
  const [initial] = useState(() => initialContent(template, brand));
  const [theme] = useState(() => brandTheme(brand));
  const [editor, setEditor] = useState<Editor | null>(null);
  const [name, setName] = useState(template.name);
  const [subject, setSubject] = useState(template.subject);
  const [previewText, setPreviewText] = useState(template.previewText);
  const [nameError, setNameError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("saved");
  const [hasSelection, setHasSelection] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  const editorRef = useRef<Editor | null>(null);
  const values = useRef({
    name: template.name,
    subject: template.subject,
    previewText: template.previewText,
  });
  const changes = useRef(0);
  const saving = useRef(false);
  const armed = useRef(false);
  const dirty = useRef(false);
  const saveTimer = useRef<number | null>(null);
  const armTimer = useRef<number | null>(null);
  const bodyRange = useRef<EditorRange | null>(null);
  const nameInput = useRef<HTMLInputElement | null>(null);
  const scheduleRef = useRef<() => void>(() => {});

  const mergeOptions = useMemo(() => mergeTagOptions(fields), [fields]);
  const mergeKeys = useMemo(() => mergeTagKeys(fields), [fields]);
  const samples = useMemo(
    () =>
      sampleValues(
        {
          name: brand?.brandName || workspaceName,
          address: brand?.postalAddress ?? "",
          website: brand?.websiteUrl ?? "",
        },
        fields,
      ),
    [brand, workspaceName, fields],
  );

  const show = useCallback((next: Status) => {
    dirty.current = next !== "saved";
    setStatus(next);
  }, []);

  const save = useCallback(
    async (manual: boolean) => {
      const current = editorRef.current;
      if (!current || saving.current) {
        return false;
      }
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      const cleanName = values.current.name.trim().replace(/\s+/g, " ");
      if (cleanName === "") {
        setNameError(text.nameMissing);
        show("failed");
        if (manual) {
          nameInput.current?.focus();
        }
        return false;
      }
      const started = changes.current;
      saving.current = true;
      show("saving");
      let exported: { html: string; text: string };
      try {
        exported = await exportEmail(
          current,
          values.current.previewText.trim(),
        );
      } catch {
        saving.current = false;
        show("failed");
        toast.error(text.saveFailed, {
          id: saveToastId,
          description: text.exportFailed,
        });
        return false;
      }
      if (
        exported.html.length > maxHtmlLength ||
        exported.text.length > maxTextLength
      ) {
        saving.current = false;
        show("failed");
        toast.error(text.saveFailed, {
          id: saveToastId,
          description: text.tooLarge,
        });
        return false;
      }
      const result = await saveTemplate(template.id, {
        name: cleanName,
        subject: values.current.subject.trim(),
        previewText: values.current.previewText.trim(),
        document: current.getJSON(),
        html: exported.html,
        text: exported.text,
      });
      saving.current = false;
      if (!result.ok) {
        show("failed");
        if (result.error.code === "name_taken") {
          setNameError(text.nameTaken);
          if (manual) {
            nameInput.current?.focus();
          }
          return false;
        }
        if (result.error.field === "name") {
          setNameError(describeError(result.error));
          return false;
        }
        toast.error(text.saveFailed, {
          id: saveToastId,
          description: describeError(result.error),
        });
        return false;
      }
      toast.dismiss(saveToastId);
      if (changes.current === started) {
        show("saved");
      } else {
        show("dirty");
        scheduleRef.current();
      }
      return true;
    },
    [template.id, show],
  );

  const schedule = useCallback(() => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
    }
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      void save(false);
    }, autosaveDelay);
  }, [save]);

  useEffect(() => {
    scheduleRef.current = schedule;
  }, [schedule]);

  const markDirty = useCallback(() => {
    changes.current += 1;
    if (!saving.current) {
      show("dirty");
    }
    schedule();
  }, [schedule, show]);

  const exportCurrent = useCallback(async () => {
    const current = editorRef.current;
    if (!current) {
      return null;
    }
    try {
      return await exportEmail(current, values.current.previewText.trim());
    } catch {
      return null;
    }
  }, []);

  function handleReady(ref: EmailEditorRef) {
    if (!ref.editor || ref.editor === editorRef.current) {
      return;
    }
    editorRef.current = ref.editor;
    setEditor(ref.editor);
    armed.current = false;
    if (armTimer.current !== null) {
      window.clearTimeout(armTimer.current);
    }
    armTimer.current = window.setTimeout(() => {
      armTimer.current = null;
      armed.current = true;
      if (initial.seeded && changes.current === 0) {
        markDirty();
      }
    }, armDelay);
  }

  function handleUpdate() {
    if (armed.current) {
      markDirty();
    }
  }

  useEffect(() => {
    if (!editor) {
      return;
    }
    const update = () => setHasSelection(!editor.state.selection.empty);
    editor.on("transaction", update);
    return () => {
      editor.off("transaction", update);
    };
  }, [editor]);

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
        anchor.closest(".tiptap") ||
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
        void save(true);
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

  useEffect(
    () => () => {
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
      }
      if (armTimer.current !== null) {
        window.clearTimeout(armTimer.current);
      }
    },
    [],
  );

  function changeName(next: string) {
    values.current.name = next;
    setName(next);
    setNameError(null);
    markDirty();
  }

  function changeSubject(next: string) {
    values.current.subject = next;
    setSubject(next);
    markDirty();
  }

  function changePreviewText(next: string) {
    values.current.previewText = next;
    setPreviewText(next);
    markDirty();
  }

  function applyDraft(draft: AppliedDraft) {
    const current = editorRef.current;
    if (!current) {
      return;
    }
    replaceBody(current, draft.html);
    if (draft.subject !== "") {
      changeSubject(draft.subject.slice(0, maxSubjectLength));
    }
    if (draft.preview !== "") {
      changePreviewText(draft.preview.slice(0, maxPreviewTextLength));
    }
    markDirty();
    toast.success(copy.ai.draft.inserted);
  }

  const busy = status === "saving";

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-3.5 text-[13px] leading-normal",
        editorHeightClass,
      )}
    >
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          <Link
            href={appHref("templates")}
            aria-label={text.backLabel}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-1.5 font-medium text-muted-foreground hover:text-foreground",
              focusRing,
            )}
          >
            <ArrowLeft aria-hidden strokeWidth={1.6} className="size-4" />
            {text.back}
          </Link>
          <span aria-hidden className="text-ink-tertiary">
            /
          </span>
          <Input
            ref={nameInput}
            type="text"
            autoComplete="off"
            maxLength={maxNameLength}
            aria-label={text.nameLabel}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? "template-name-error" : undefined}
            placeholder={text.namePlaceholder}
            value={name}
            onChange={(event) => changeName(event.target.value)}
            className="h-8 min-w-0 flex-1 basis-56 border-transparent bg-transparent px-2 text-[15px] font-semibold tracking-[-0.01em] shadow-none hover:border-border focus-visible:border-input focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:text-[15px] lg:max-w-[420px]"
          />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <SaveStatus status={status} />
            <Button
              type="button"
              variant="outline"
              disabled={!editor}
              onClick={() => setPreviewOpen(true)}
              className={secondaryButtonClass}
            >
              <Eye aria-hidden strokeWidth={1.6} />
              {text.preview}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!editor}
              onClick={() => setTestOpen(true)}
              className={secondaryButtonClass}
            >
              <Send aria-hidden strokeWidth={1.6} />
              {text.sendTest}
            </Button>
            <Button
              type="button"
              disabled={!editor || busy || status === "saved"}
              aria-busy={busy || undefined}
              onClick={() => void save(true)}
              className={primaryButtonClass}
            >
              {busy ? <Spinner /> : null}
              {text.save}
            </Button>
          </div>
        </div>
        {nameError ? (
          <p
            id="template-name-error"
            role="alert"
            className="pl-2 text-[13px] text-danger"
          >
            {nameError}
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <TagField
          id="template-subject"
          label={text.subject}
          value={subject}
          placeholder={text.subjectPlaceholder}
          maxLength={maxSubjectLength}
          options={mergeOptions}
          pickerLabel={copy.mergeTags.forSubject}
          onChange={changeSubject}
          extra={
            aiConfigured ? (
              <SubjectSuggestions
                current={subject}
                exportEmail={exportCurrent}
                onPick={(suggestion) => {
                  changeSubject(suggestion.subject.slice(0, maxSubjectLength));
                  if (suggestion.previewText !== "") {
                    changePreviewText(
                      suggestion.previewText.slice(0, maxPreviewTextLength),
                    );
                  }
                }}
              />
            ) : null
          }
        />
        <TagField
          id="template-preview-text"
          label={text.previewText}
          value={previewText}
          placeholder={text.previewTextPlaceholder}
          maxLength={maxPreviewTextLength}
          options={mergeOptions}
          pickerLabel={copy.mergeTags.forPreview}
          onChange={changePreviewText}
        />
      </div>

      <section
        aria-label={text.canvasLabel}
        className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-xl border border-border bg-card shadow-xs lg:grid-cols-[minmax(0,1fr)_288px]"
      >
        <EmailEditor
          content={initial.content}
          theme={theme}
          placeholder={text.bodyPlaceholder}
          onReady={handleReady}
          onUpdate={handleUpdate}
          onUploadImage={uploadEditorImage}
          className="oc-canvas col-start-1 row-start-2 min-h-0 overflow-y-auto"
        >
          <EditorToolbar
            editor={editor}
            aiConfigured={aiConfigured}
            hasSelection={hasSelection}
            mergeOptions={mergeOptions}
            onMergeOpen={() => {
              bodyRange.current = editor ? selectionRange(editor) : null;
            }}
            onMergeInsert={(tag) => {
              if (editor) {
                insertText(
                  editor,
                  bodyRange.current ?? selectionRange(editor),
                  tag,
                );
              }
            }}
            onDraft={() => setDraftOpen(true)}
            onReview={() => setReviewOpen(true)}
          />
          <Inspector.Root
            aria-label={text.inspectorLabel}
            className="oc-inspector col-start-2 row-span-2 row-start-1 hidden min-h-0 overflow-y-auto border-l border-border-subtle px-4 py-3 outline-hidden lg:block"
          >
            <Inspector.Breadcrumb />
            <Inspector.Document />
            <Inspector.Node />
            <Inspector.Text />
          </Inspector.Root>
        </EmailEditor>
      </section>

      <PreviewDialog
        open={previewOpen}
        subject={subject}
        previewText={previewText}
        samples={samples}
        exportEmail={exportCurrent}
        onOpenChange={setPreviewOpen}
      />
      <SendTestDialog
        open={testOpen}
        defaultTo={userEmail}
        subject={subject}
        sources={sources}
        exportEmail={exportCurrent}
        onOpenChange={setTestOpen}
      />
      <ReviewSheet
        open={reviewOpen}
        aiConfigured={aiConfigured}
        subject={subject}
        previewText={previewText}
        exportEmail={exportCurrent}
        onOpenChange={setReviewOpen}
      />
      {editor && aiConfigured ? (
        <AiDraftSheet
          open={draftOpen}
          editor={editor}
          brand={brand}
          mergeTags={mergeKeys}
          onOpenChange={setDraftOpen}
          onApply={applyDraft}
        />
      ) : null}
    </div>
  );
}

function SaveStatus({ status }: { status: Status }) {
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

type EditorToolbarProps = {
  editor: Editor | null;
  aiConfigured: boolean;
  hasSelection: boolean;
  mergeOptions: Option[];
  onMergeOpen: () => void;
  onMergeInsert: (tag: string) => void;
  onDraft: () => void;
  onReview: () => void;
};

function EditorToolbar({
  editor,
  aiConfigured,
  hasSelection,
  mergeOptions,
  onMergeOpen,
  onMergeInsert,
  onDraft,
  onReview,
}: EditorToolbarProps) {
  const scope = useEditorScope(editor);

  return (
    <EditorFocusScope>
      <div
        role="toolbar"
        aria-label={text.toolbarLabel}
        className="col-start-1 row-start-1 flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1.5 border-b border-border-subtle px-2.5 py-1.5"
      >
        <MergeTagPicker
          options={mergeOptions}
          contentRef={scope}
          onOpen={onMergeOpen}
          onInsert={onMergeInsert}
          trigger={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!editor}
              className={toolButtonClass}
            >
              <Braces aria-hidden strokeWidth={1.6} />
              {text.mergeTag}
            </Button>
          }
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!editor}
          title={text.addImageLabel}
          onClick={() => editor?.chain().focus().uploadImage().run()}
          className={toolButtonClass}
        >
          <ImagePlus aria-hidden strokeWidth={1.6} />
          {text.addImage}
        </Button>
        {aiConfigured && editor ? (
          <AiRewritePopover editor={editor} hasSelection={hasSelection} />
        ) : null}
        <div className="ml-auto flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1.5">
          {aiConfigured ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!editor}
              onClick={onDraft}
              className={toolButtonClass}
            >
              <Sparkles aria-hidden strokeWidth={1.6} />
              {text.draft}
            </Button>
          ) : (
            <AiSetupNote compact className="px-1.5" />
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!editor}
            onClick={onReview}
            className={toolButtonClass}
          >
            <ClipboardCheck aria-hidden strokeWidth={1.6} />
            {text.review}
          </Button>
        </div>
      </div>
    </EditorFocusScope>
  );
}
