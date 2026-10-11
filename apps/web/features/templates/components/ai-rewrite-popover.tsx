"use client";

import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@workspace/ui/components/popover";
import { cn } from "@workspace/ui/lib/utils";
import { Sparkles } from "lucide-react";
import { type FormEvent, useState } from "react";
import {
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import { useAiStream } from "@/features/templates/hooks/use-ai-stream";
import { useEditorScope } from "@/features/templates/hooks/use-editor-scope";
import {
  maxContextLength,
  maxInstructionLength,
  maxRewriteLength,
  type RewriteAction,
  rewriteActions,
} from "@/features/templates/lib/ai";
import { copy, describeAiError } from "@/features/templates/lib/copy";
import {
  type Editor,
  type EditorRange,
  insertText,
  selectedText,
  selectionRange,
} from "@/features/templates/lib/editor";

const text = copy.ai.rewrite;

export const toolButtonClass =
  "h-7 gap-1.5 px-2 text-[12.5px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background";

type Target = { range: EditorRange; text: string };

type Request = { action: RewriteAction; instruction: string };

type AiRewritePopoverProps = {
  editor: Editor;
  hasSelection: boolean;
};

export function AiRewritePopover({
  editor,
  hasSelection,
}: AiRewritePopoverProps) {
  const scope = useEditorScope(editor);
  const { stream, start, stop, reset } = useAiStream("/ai/rewrite");
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);
  const [instruction, setInstruction] = useState("");
  const [last, setLast] = useState<Request | null>(null);

  const tooLong = target !== null && target.text.length > maxRewriteLength;
  const usable = target !== null && target.text.trim() !== "" && !tooLong;
  const busy = stream.status === "streaming";
  const choosing = stream.status === "idle";

  function run(request: Request) {
    if (!target || !usable) {
      return;
    }
    setLast(request);
    void start({
      text: target.text,
      action: request.action,
      ...(request.action === "custom"
        ? { instruction: request.instruction }
        : {}),
      context: editor.getText().slice(0, maxContextLength),
    });
  }

  function handleCustom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    const value = instruction.trim();
    if (value !== "") {
      run({ action: "custom", instruction: value });
    }
  }

  function accept() {
    if (!target) {
      return;
    }
    const replacement = stream.text.trim();
    setOpen(false);
    reset();
    insertText(editor, target.range, replacement);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          const range = selectionRange(editor);
          setTarget({ range, text: selectedText(editor, range) });
          setInstruction("");
          setLast(null);
          reset();
        } else {
          reset();
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger
        disabled={!hasSelection && !open}
        title={hasSelection || open ? undefined : text.needSelection}
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={toolButtonClass}
          />
        }
      >
        <Sparkles aria-hidden strokeWidth={1.6} />
        {copy.editor.rewrite}
      </PopoverTrigger>
      <PopoverContent
        ref={scope}
        align="start"
        className="w-[360px] gap-3 p-3.5 text-[13px]"
      >
        <PopoverHeader>
          <PopoverTitle className="text-[13px] font-semibold">
            {text.title}
          </PopoverTitle>
        </PopoverHeader>

        {!usable ? (
          <p role="alert" className="text-muted-foreground">
            {tooLong ? text.tooLong(maxRewriteLength) : text.needSelection}
          </p>
        ) : choosing ? (
          <>
            <div className="flex flex-col gap-1">
              <p className="text-[12px] font-medium text-ink-tertiary">
                {text.selected}
              </p>
              <p className="line-clamp-3 whitespace-pre-wrap rounded-lg bg-muted px-2.5 py-2 text-[12.5px] text-muted-foreground">
                {target?.text}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {rewriteActions.map((action) => (
                <Button
                  key={action}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => run({ action, instruction: "" })}
                  className={cn(secondaryButtonClass, "h-7 px-2.5")}
                >
                  {text.actions[action]}
                </Button>
              ))}
            </div>
            <form onSubmit={handleCustom} className="flex items-center gap-2">
              <Input
                type="text"
                autoComplete="off"
                maxLength={maxInstructionLength}
                aria-label={text.custom}
                placeholder={text.customPlaceholder}
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                className={cn(inputClass, "h-8 min-w-0 flex-1 md:text-[13px]")}
              />
              <Button
                type="submit"
                size="sm"
                disabled={instruction.trim() === ""}
                className={cn(primaryButtonClass, "shrink-0")}
              >
                {text.customRun}
              </Button>
            </form>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <p className="flex items-center gap-1.5 text-[12px] font-medium text-ink-tertiary">
                {busy ? <Spinner className="size-3" /> : null}
                {busy ? text.writing : text.result}
              </p>
              <p
                aria-live="polite"
                aria-busy={busy || undefined}
                className="max-h-56 min-h-[52px] overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-card px-2.5 py-2 text-[13px]"
              >
                {stream.text.trim()}
              </p>
            </div>
            {stream.status === "failed" && stream.error ? (
              <p role="alert" className="text-[13px] text-danger">
                {describeAiError(stream.error)}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center justify-end gap-2">
              {busy ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={stop}
                  className={secondaryButtonClass}
                >
                  {copy.ai.stop}
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={reset}
                    className="mr-auto px-2 text-[13px] text-muted-foreground"
                  >
                    {text.back}
                  </Button>
                  {last ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => run(last)}
                      className={secondaryButtonClass}
                    >
                      {text.retry}
                    </Button>
                  ) : null}
                  {stream.status === "done" ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={accept}
                      className={primaryButtonClass}
                    >
                      {text.accept}
                    </Button>
                  ) : null}
                </>
              )}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
