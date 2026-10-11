"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { cn } from "@workspace/ui/lib/utils";
import { Check, CircleAlert, Info } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  dangerButtonClass,
  dialogActionsClass,
  dialogContentClass,
  dialogTitleClass,
  secondaryButtonClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import {
  type BuilderContextValue,
  BuilderProvider,
} from "@/features/sequences/components/builder/builder-context";
import { SequenceCanvas } from "@/features/sequences/components/builder/sequence-canvas";
import { StepPanel } from "@/features/sequences/components/builder/step-panel";
import {
  type SaveFailure,
  type SaveStatus,
  useSequenceDraft,
} from "@/features/sequences/hooks/use-sequence-draft";
import { copy, describeError } from "@/features/sequences/lib/copy";
import type { Layout, Sequence } from "@/features/sequences/lib/sequences";
import { canAddStep, type StepPatch } from "@/features/sequences/lib/steps";

const text = copy.builder;
const saveToastId = "sequence-save";

export type StepReveal = { stepId: string; nonce: number };

export type SequenceBuilderProps = {
  sequence: Sequence;
  problemStepIds: ReadonlySet<string>;
  reveal: StepReveal | null;
  onSequenceChange: (sequence: Sequence) => void;
};

function focusNode(key: string) {
  const node = document.querySelector<HTMLElement>(
    `.react-flow__node[data-id="${CSS.escape(key)}"]`,
  );
  node?.focus();
}

export function SequenceBuilder({
  sequence,
  problemStepIds,
  reveal,
  onSequenceChange,
}: SequenceBuilderProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const focusPanel = useRef(false);
  const revealed = useRef<number | null>(null);

  const handleFailed = useCallback((failure: SaveFailure) => {
    toast.error(
      failure.target === "steps" ? text.saveFailed : text.layoutFailed,
      { id: saveToastId, description: describeError(failure.error) },
    );
  }, []);

  const handleRecovered = useCallback(() => {
    toast.dismiss(saveToastId);
  }, []);

  const draft = useSequenceDraft({
    sequence,
    onSaved: onSequenceChange,
    onFailed: handleFailed,
    onRecovered: handleRecovered,
  });
  const {
    steps,
    layout,
    status,
    insert,
    update,
    remove,
    move,
    restore,
    moveNodes,
    tidy,
    syncStats,
    saveNow,
    isDirty,
  } = draft;

  useEffect(() => {
    syncStats(sequence.steps);
  }, [sequence.steps, syncStats]);

  useEffect(() => {
    if (!reveal || reveal.nonce === revealed.current) {
      return;
    }
    revealed.current = reveal.nonce;
    const match = steps.find((step) => step.id === reveal.stepId);
    if (match) {
      focusPanel.current = true;
      setSelectedKey(match.key);
    }
  }, [reveal, steps]);

  useEffect(() => {
    if (selectedKey && focusPanel.current) {
      focusPanel.current = false;
      panelRef.current?.focus();
    }
  }, [selectedKey]);

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (isDirty()) {
        event.preventDefault();
      }
    }
    function onClick(event: MouseEvent) {
      if (
        !isDirty() ||
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
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [isDirty]);

  const selectedIndex = steps.findIndex((step) => step.key === selectedKey);
  const selected = steps[selectedIndex] ?? null;
  const deletingIndex = steps.findIndex((step) => step.key === deleting);
  const deletingStep = steps[deletingIndex] ?? null;

  const handleInsert = useCallback(
    (index: number) => {
      const key = insert(index);
      if (key) {
        focusPanel.current = true;
        setSelectedKey(key);
      }
    },
    [insert],
  );

  const handleDelay = useCallback(
    (key: string, minutes: number) => update(key, { delayMinutes: minutes }),
    [update],
  );

  const handleSelect = useCallback(
    (key: string | null, fromKeyboard: boolean) => {
      focusPanel.current = fromKeyboard && key !== null;
      setSelectedKey(key);
    },
    [],
  );

  const handleMove = useCallback(
    (moves: Layout) => moveNodes(moves),
    [moveNodes],
  );

  function removeStep(key: string, undoable: boolean) {
    const index = steps.findIndex((step) => step.key === key);
    const snapshot = remove(key);
    if (!snapshot) {
      return;
    }
    if (selectedKey === key) {
      setSelectedKey(null);
    }
    toast.success(
      text.stepDeleted(index + 1),
      undoable
        ? { action: { label: text.undo, onClick: () => restore(snapshot) } }
        : undefined,
    );
  }

  const requestDelete = useCallback((key: string) => setDeleting(key), []);

  function deleteFromPanel() {
    if (!selected) {
      return;
    }
    if (selected.stats.sent > 0) {
      setDeleting(selected.key);
      return;
    }
    removeStep(selected.key, true);
  }

  function closePanel() {
    const key = selectedKey;
    setSelectedKey(null);
    if (key) {
      window.setTimeout(() => focusNode(key), 0);
    }
  }

  const problemKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const step of steps) {
      if (step.id && problemStepIds.has(step.id)) {
        keys.add(step.key);
      }
    }
    return keys;
  }, [steps, problemStepIds]);

  const context = useMemo<BuilderContextValue>(
    () => ({
      steps,
      selectedKey,
      problemKeys,
      canAdd: canAddStep(steps),
      onInsert: handleInsert,
      onDelayChange: handleDelay,
    }),
    [steps, selectedKey, problemKeys, handleInsert, handleDelay],
  );

  return (
    <section
      aria-label={text.canvasLabel}
      className="flex h-[calc(100dvh-214px)] min-h-[540px] min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs"
    >
      <div className="flex min-h-10 flex-wrap items-center gap-x-4 gap-y-1 border-b border-border-subtle px-4 py-1.5">
        {status === "held" ? (
          <p
            role="status"
            className="flex min-w-0 flex-1 basis-72 items-center gap-2 text-[12.5px] text-warning"
          >
            <CircleAlert
              aria-hidden
              strokeWidth={1.6}
              className="size-4 shrink-0"
            />
            {sequence.status === "archived"
              ? text.heldArchived
              : steps.length === 0
                ? text.heldEmpty
                : text.heldHint}
          </p>
        ) : sequence.status === "active" ? (
          <p className="flex min-w-0 flex-1 basis-72 items-center gap-2 text-[12.5px] text-info">
            <Info aria-hidden strokeWidth={1.6} className="size-4 shrink-0" />
            {text.activeNotice}
          </p>
        ) : (
          <p className="min-w-0 flex-1 basis-72 truncate text-[12.5px] text-ink-tertiary">
            {sequence.status === "archived" ? text.archivedNotice : text.hint}
          </p>
        )}
        <SaveState status={status} onRetry={() => void saveNow()} />
      </div>

      <div
        className={cn(
          "grid min-h-0 flex-1 grid-cols-1",
          selected
            ? "grid-rows-[minmax(220px,1fr)_minmax(0,1.2fr)] lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-1"
            : "grid-rows-1",
        )}
      >
        <BuilderProvider value={context}>
          <SequenceCanvas
            steps={steps}
            layout={layout}
            selectedKey={selected ? selectedKey : null}
            onSelect={handleSelect}
            onMove={handleMove}
            onTidy={tidy}
            onDeleteRequest={requestDelete}
          />
        </BuilderProvider>
        {selected ? (
          <StepPanel
            key={selected.key}
            step={selected}
            index={selectedIndex}
            count={steps.length}
            panelRef={panelRef}
            onChange={(patch: StepPatch) => update(selected.key, patch)}
            onMove={(by) => move(selected.key, by)}
            onDelete={deleteFromPanel}
            onClose={closePanel}
          />
        ) : null}
      </div>

      <DeleteStepDialog
        position={deletingStep ? deletingIndex + 1 : null}
        sent={deletingStep?.stats.sent ?? 0}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deletingStep) {
            removeStep(deletingStep.key, deletingStep.stats.sent === 0);
          }
          setDeleting(null);
        }}
      />
    </section>
  );
}

function SaveState({
  status,
  onRetry,
}: {
  status: SaveStatus;
  onRetry: () => void;
}) {
  return (
    <div className="ml-auto flex items-center gap-2">
      <p
        aria-live="polite"
        className={cn(
          "flex h-7 items-center gap-1.5 text-[12.5px] whitespace-nowrap",
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
      {status === "failed" ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRetry}
          className={cn(secondaryButtonClass, "h-7 px-2.5 text-[12.5px]")}
        >
          {text.retrySave}
        </Button>
      ) : null}
    </div>
  );
}

type DeleteStepDialogProps = {
  position: number | null;
  sent: number;
  onClose: () => void;
  onConfirm: () => void;
};

function DeleteStepDialog({
  position,
  sent,
  onClose,
  onConfirm,
}: DeleteStepDialogProps) {
  const [last, setLast] = useState({ position: position ?? 1, sent });
  const dialog = text.deleteStep;

  if (position !== null && (position !== last.position || sent !== last.sent)) {
    setLast({ position, sent });
  }

  return (
    <Dialog
      open={position !== null}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <DialogContent className={dialogContentClass}>
        <DialogHeader>
          <DialogTitle className={dialogTitleClass}>
            {dialog.title(last.position)}
          </DialogTitle>
          <DialogDescription className="text-[13px]">
            {last.sent > 0 ? dialog.sentBody(last.sent) : dialog.body}
          </DialogDescription>
        </DialogHeader>
        <div className={dialogActionsClass}>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className={secondaryButtonClass}
          >
            {dialog.cancel}
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            className={dangerButtonClass}
          >
            {dialog.confirm}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
