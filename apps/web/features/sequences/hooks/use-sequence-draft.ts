import { useCallback, useEffect, useRef, useState } from "react";
import {
  layoutAfterEdit,
  layoutWithMoves,
  sameLayout,
} from "@/features/sequences/lib/graph";
import type {
  Layout,
  Sequence,
  Step,
} from "@/features/sequences/lib/sequences";
import {
  adoptServerIds,
  applyStepEdit,
  canAddStep,
  type DraftStep,
  layoutForServer,
  layoutFromServer,
  mergeStepStats,
  type StepEdit,
  type StepPatch,
  toDraftSteps,
  toStepInputs,
} from "@/features/sequences/lib/steps";
import { saveSteps, updateSequence } from "@/features/sequences/queries/client";
import type { ApiError } from "@/lib/api";

export type SaveStatus = "saved" | "dirty" | "saving" | "failed" | "held";

export type SaveFailure = { target: "steps" | "layout"; error: ApiError };

export type DraftSnapshot = { steps: DraftStep[]; layout: Layout | null };

const stepsDelay = 700;
const layoutDelay = 900;

type Options = {
  sequence: Sequence;
  onSaved: (sequence: Sequence) => void;
  onFailed: (failure: SaveFailure) => void;
  onRecovered: () => void;
};

export function useSequenceDraft({
  sequence,
  onSaved,
  onFailed,
  onRecovered,
}: Options) {
  const sequenceId = sequence.id;
  const [steps, setStepsState] = useState(() => toDraftSteps(sequence.steps));
  const [layout, setLayoutState] = useState(() =>
    layoutFromServer(toDraftSteps(sequence.steps), sequence.layout),
  );
  const [status, setStatus] = useState<SaveStatus>("saved");

  const stepsRef = useRef(steps);
  const layoutRef = useRef(layout);
  const stepsRevision = useRef(0);
  const savedSteps = useRef(0);
  const layoutRevision = useRef(0);
  const savedLayout = useRef(0);
  const running = useRef(false);
  const dirty = useRef(false);
  const timer = useRef<number | null>(null);
  const counter = useRef(0);
  const handlers = useRef({ onSaved, onFailed, onRecovered });
  const mode = useRef(sequence.status);

  useEffect(() => {
    handlers.current = { onSaved, onFailed, onRecovered };
  }, [onSaved, onFailed, onRecovered]);

  const setSteps = useCallback((next: DraftStep[]) => {
    stepsRef.current = next;
    setStepsState(next);
  }, []);

  const setLayout = useCallback((next: Layout | null) => {
    layoutRef.current = next;
    setLayoutState(next);
  }, []);

  const pending = useCallback(
    () =>
      stepsRevision.current !== savedSteps.current ||
      layoutRevision.current !== savedLayout.current,
    [],
  );

  const held = useCallback(
    () =>
      mode.current === "archived" ||
      (mode.current === "active" &&
        stepsRevision.current !== savedSteps.current &&
        (stepsRef.current.length === 0 ||
          stepsRef.current.some((step) => step.template === null))),
    [],
  );

  const run = useCallback(async () => {
    if (running.current) {
      return;
    }
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    if (!pending()) {
      return;
    }
    if (held()) {
      setStatus("held");
      return;
    }
    running.current = true;
    setStatus("saving");
    let failed = false;
    let waiting = false;
    while (pending()) {
      if (held()) {
        waiting = true;
        break;
      }
      if (stepsRevision.current !== savedSteps.current) {
        const revision = stepsRevision.current;
        const sent = stepsRef.current;
        const result = await saveSteps(sequenceId, toStepInputs(sent));
        if (!result.ok) {
          failed = true;
          handlers.current.onFailed({ target: "steps", error: result.error });
          break;
        }
        savedSteps.current = revision;
        setSteps(adoptServerIds(stepsRef.current, sent, result.data.steps));
        if (layoutRef.current && sent.some((step) => step.id === null)) {
          layoutRevision.current += 1;
        }
        handlers.current.onSaved(result.data);
        continue;
      }
      const revision = layoutRevision.current;
      const result = await updateSequence(sequenceId, {
        layout: layoutForServer(stepsRef.current, layoutRef.current),
      });
      if (!result.ok) {
        failed = true;
        handlers.current.onFailed({ target: "layout", error: result.error });
        break;
      }
      savedLayout.current = revision;
    }
    running.current = false;
    dirty.current = failed || pending();
    setStatus(failed ? "failed" : waiting ? "held" : "saved");
    if (!failed) {
      handlers.current.onRecovered();
    }
  }, [sequenceId, pending, held, setSteps]);

  const schedule = useCallback(
    (delay: number) => {
      dirty.current = true;
      if (!running.current) {
        setStatus("dirty");
      }
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
      }
      timer.current = window.setTimeout(() => {
        timer.current = null;
        void run();
      }, delay);
    },
    [run],
  );

  const edit = useCallback(
    (change: StepEdit) => {
      const before = stepsRef.current;
      const next = applyStepEdit(before, change);
      if (next === before) {
        return false;
      }
      const nextLayout = layoutAfterEdit(before, layoutRef.current, change);
      setSteps(next);
      stepsRevision.current += 1;
      if (nextLayout !== layoutRef.current) {
        setLayout(nextLayout);
        layoutRevision.current += 1;
      }
      schedule(stepsDelay);
      return true;
    },
    [schedule, setSteps, setLayout],
  );

  const insert = useCallback(
    (index: number) => {
      if (!canAddStep(stepsRef.current)) {
        return null;
      }
      counter.current += 1;
      const key = `new:${Date.now().toString(36)}:${counter.current}`;
      return edit({ type: "insert", index, key }) ? key : null;
    },
    [edit],
  );

  const update = useCallback(
    (key: string, patch: StepPatch) => {
      edit({ type: "update", key, patch });
    },
    [edit],
  );

  const remove = useCallback(
    (key: string): DraftSnapshot | null => {
      const snapshot = { steps: stepsRef.current, layout: layoutRef.current };
      return edit({ type: "remove", key }) ? snapshot : null;
    },
    [edit],
  );

  const move = useCallback(
    (key: string, by: -1 | 1) => {
      edit({ type: "move", key, by });
    },
    [edit],
  );

  const restore = useCallback(
    (snapshot: DraftSnapshot) => {
      const known = new Map(
        stepsRef.current.map((step) => [step.key, step.id]),
      );
      setSteps(
        snapshot.steps.map((step) => ({
          ...step,
          id: known.get(step.key) ?? null,
        })),
      );
      setLayout(snapshot.layout);
      stepsRevision.current += 1;
      layoutRevision.current += 1;
      schedule(stepsDelay);
    },
    [schedule, setSteps, setLayout],
  );

  const moveNodes = useCallback(
    (moves: Layout) => {
      const next = layoutWithMoves(stepsRef.current, layoutRef.current, moves);
      if (sameLayout(next, layoutRef.current)) {
        return;
      }
      setLayout(next);
      layoutRevision.current += 1;
      schedule(layoutDelay);
    },
    [schedule, setLayout],
  );

  const tidy = useCallback(() => {
    if (layoutRef.current === null) {
      return;
    }
    setLayout(null);
    layoutRevision.current += 1;
    schedule(layoutDelay);
  }, [schedule, setLayout]);

  const syncStats = useCallback(
    (saved: Step[]) => {
      const next = mergeStepStats(stepsRef.current, saved);
      if (next.some((step, index) => step !== stepsRef.current[index])) {
        setSteps(next);
      }
    },
    [setSteps],
  );

  const isDirty = useCallback(() => dirty.current, []);

  const sequenceStatus = sequence.status;
  useEffect(() => {
    mode.current = sequenceStatus;
    if (dirty.current && !running.current && timer.current === null) {
      void run();
    }
  }, [sequenceStatus, run]);

  useEffect(
    () => () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
        void run();
      }
    },
    [run],
  );

  return {
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
    saveNow: run,
    isDirty,
  };
}
