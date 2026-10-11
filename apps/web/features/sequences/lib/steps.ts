import {
  emptyStepStats,
  type Layout,
  maxSteps,
  type Step,
  type StepStats,
  type StepTemplate,
  type ThreadMode,
} from "@/features/sequences/lib/sequences";

export type DraftStep = {
  key: string;
  id: string | null;
  delayMinutes: number;
  template: StepTemplate | null;
  subject: string;
  threadMode: ThreadMode;
  stats: StepStats;
};

export type StepPatch = Partial<
  Pick<DraftStep, "delayMinutes" | "template" | "subject" | "threadMode">
>;

export type StepInput = {
  id?: string;
  delayMinutes: number;
  templateId: string | null;
  subject: string;
  threadMode: ThreadMode;
};

export type StepEdit =
  | { type: "insert"; index: number; key: string }
  | { type: "remove"; key: string }
  | { type: "move"; key: string; by: -1 | 1 }
  | { type: "update"; key: string; patch: StepPatch };

export type WaitUnit = "minutes" | "hours" | "days";

export type Wait = { amount: number; unit: WaitUnit };

export const waitUnits: WaitUnit[] = ["minutes", "hours", "days"];

export const unitMinutes: Record<WaitUnit, number> = {
  minutes: 1,
  hours: 60,
  days: 1440,
};

export const defaultFollowUpDelay = 3 * unitMinutes.days;
export const maxDelayMinutes = 365 * unitMinutes.days;

export function toDraftSteps(steps: Step[]): DraftStep[] {
  return steps.map((step) => ({
    key: step.id,
    id: step.id,
    delayMinutes: step.delayMinutes,
    template: step.template,
    subject: step.subject,
    threadMode: step.threadMode,
    stats: step.stats,
  }));
}

export function toStepInputs(steps: DraftStep[]): StepInput[] {
  return steps.map((step, index) => ({
    ...(step.id ? { id: step.id } : {}),
    delayMinutes: normalizeDelay(step.delayMinutes, index),
    templateId: step.template?.id ?? null,
    subject: step.subject.trim(),
    threadMode: step.threadMode,
  }));
}

export function minDelay(index: number) {
  return index === 0 ? 0 : 1;
}

export function normalizeDelay(minutes: number, index: number) {
  const rounded = Number.isFinite(minutes) ? Math.round(minutes) : 0;
  return Math.min(maxDelayMinutes, Math.max(minDelay(index), rounded));
}

export function toWait(minutes: number): Wait {
  if (minutes > 0 && minutes % unitMinutes.days === 0) {
    return { amount: minutes / unitMinutes.days, unit: "days" };
  }
  if (minutes > 0 && minutes % unitMinutes.hours === 0) {
    return { amount: minutes / unitMinutes.hours, unit: "hours" };
  }
  return { amount: minutes, unit: "minutes" };
}

export function fromWait(wait: Wait) {
  return wait.amount * unitMinutes[wait.unit];
}

export function parseAmount(value: string) {
  const trimmed = value.trim();
  if (!/^\d{1,6}$/.test(trimmed)) {
    return null;
  }
  return Number.parseInt(trimmed, 10);
}

export function canAddStep(steps: DraftStep[]) {
  return steps.length < maxSteps;
}

function blankStep(key: string, index: number): DraftStep {
  return {
    key,
    id: null,
    delayMinutes: index === 0 ? 0 : defaultFollowUpDelay,
    template: null,
    subject: "",
    threadMode: "reply",
    stats: emptyStepStats,
  };
}

function renormalize(steps: DraftStep[]) {
  return steps.map((step, index) => {
    const delayMinutes =
      index > 0 && step.delayMinutes < 1
        ? defaultFollowUpDelay
        : step.delayMinutes;
    return delayMinutes === step.delayMinutes
      ? step
      : { ...step, delayMinutes };
  });
}

export function applyStepEdit(steps: DraftStep[], edit: StepEdit): DraftStep[] {
  if (edit.type === "insert") {
    if (!canAddStep(steps)) {
      return steps;
    }
    const index = Math.min(steps.length, Math.max(0, edit.index));
    const next = [...steps];
    next.splice(index, 0, blankStep(edit.key, index));
    return renormalize(next);
  }
  const at = steps.findIndex((step) => step.key === edit.key);
  if (at === -1) {
    return steps;
  }
  if (edit.type === "remove") {
    return renormalize(steps.filter((step) => step.key !== edit.key));
  }
  if (edit.type === "move") {
    const to = at + edit.by;
    const moved = steps[at];
    const other = steps[to];
    if (!moved || !other) {
      return steps;
    }
    const next = [...steps];
    next[at] = { ...other, delayMinutes: moved.delayMinutes };
    next[to] = { ...moved, delayMinutes: other.delayMinutes };
    return renormalize(next);
  }
  return steps.map((step, index) =>
    step.key === edit.key
      ? {
          ...step,
          ...edit.patch,
          delayMinutes:
            edit.patch.delayMinutes === undefined
              ? step.delayMinutes
              : normalizeDelay(edit.patch.delayMinutes, index),
        }
      : step,
  );
}

export function adoptServerIds(
  current: DraftStep[],
  sent: DraftStep[],
  saved: Step[],
): DraftStep[] {
  const byKey = new Map<string, { sent: DraftStep; saved: Step }>();
  sent.forEach((step, index) => {
    const match = saved[index];
    if (match) {
      byKey.set(step.key, { sent: step, saved: match });
    }
  });
  return current.map((step) => {
    const match = byKey.get(step.key);
    if (!match) {
      return step;
    }
    const untouched = step === match.sent;
    const template =
      step.template &&
      match.saved.template &&
      step.template.id === match.saved.template.id &&
      match.saved.template.name !== "" &&
      match.saved.template.name !== step.template.name
        ? { ...step.template, name: match.saved.template.name }
        : step.template;
    const subject =
      untouched && step.subject.trim() === ""
        ? match.saved.subject
        : step.subject;
    return step.id === match.saved.id &&
      template === step.template &&
      subject === step.subject
      ? step
      : { ...step, id: match.saved.id, template, subject };
  });
}

export function mergeStepStats(
  current: DraftStep[],
  saved: Step[],
): DraftStep[] {
  const byId = new Map(saved.map((step) => [step.id, step.stats]));
  return current.map((step) => {
    const stats = step.id ? byId.get(step.id) : undefined;
    return stats &&
      (stats.sent !== step.stats.sent ||
        stats.opened !== step.stats.opened ||
        stats.clicked !== step.stats.clicked ||
        stats.replied !== step.stats.replied ||
        stats.bounced !== step.stats.bounced)
      ? { ...step, stats }
      : step;
  });
}

export function layoutForServer(
  steps: DraftStep[],
  layout: Layout | null,
): Layout | null {
  if (!layout) {
    return null;
  }
  const result: Layout = {};
  for (const step of steps) {
    const point = layout[step.key];
    if (step.id && point) {
      result[step.id] = { x: Math.round(point.x), y: Math.round(point.y) };
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

export function layoutFromServer(
  steps: DraftStep[],
  layout: Layout | null,
): Layout | null {
  if (!layout) {
    return null;
  }
  const result: Layout = {};
  for (const step of steps) {
    const point = step.id ? layout[step.id] : undefined;
    if (point) {
      result[step.key] = point;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}
