import type { Layout, Point } from "@/features/sequences/lib/sequences";
import type { StepEdit } from "@/features/sequences/lib/steps";

export type GraphNodeType = "start" | "step" | "add";
export type GraphEdgeType = "wait" | "tail";

export type GraphNodeData = { stepKey: string | null; index: number };
export type GraphEdgeData = { stepKey: string | null; insertIndex: number };

export type GraphNode = {
  id: string;
  type: GraphNodeType;
  position: Point;
  width: number;
  height: number;
  data: GraphNodeData;
  draggable: boolean;
  selectable: boolean;
  focusable: boolean;
  deletable: boolean;
};

export type GraphEdge = {
  id: string;
  type: GraphEdgeType;
  source: string;
  target: string;
  data: GraphEdgeData;
  selectable: boolean;
  focusable: boolean;
  deletable: boolean;
};

export type Graph = { nodes: GraphNode[]; edges: GraphEdge[] };

type Keyed = { key: string };

export const startNodeId = "start";
export const addNodeId = "add";

export const nodeSizes: Record<
  GraphNodeType,
  { width: number; height: number }
> = {
  start: { width: 208, height: 40 },
  step: { width: 304, height: 132 },
  add: { width: 304, height: 44 },
};

export const waitGap = 92;
export const tailGap = 44;

const stepPitch = nodeSizes.step.height + waitGap;

function centered(type: GraphNodeType, centerX: number) {
  return centerX - nodeSizes[type].width / 2;
}

function stepPositions(steps: Keyed[], layout: Layout | null) {
  const positions: Point[] = [];
  let previous: Point = {
    x: centered("step", 0),
    y: nodeSizes.start.height + waitGap - stepPitch,
  };
  for (const step of steps) {
    const saved = layout?.[step.key];
    const position = saved
      ? { x: saved.x, y: saved.y }
      : { x: previous.x, y: previous.y + stepPitch };
    positions.push(position);
    previous = position;
  }
  return positions;
}

export function buildGraph(steps: Keyed[], layout: Layout | null): Graph {
  const positions = stepPositions(steps, layout);
  const first = positions[0];
  const last = positions.at(-1);
  const firstCenter = first ? first.x + nodeSizes.step.width / 2 : 0;
  const lastCenter = last ? last.x + nodeSizes.step.width / 2 : 0;
  const startPosition: Point = first
    ? {
        x: centered("start", firstCenter),
        y: first.y - waitGap - nodeSizes.start.height,
      }
    : { x: centered("start", 0), y: 0 };
  const addPosition: Point = last
    ? {
        x: centered("add", lastCenter),
        y: last.y + nodeSizes.step.height + tailGap,
      }
    : { x: centered("add", 0), y: nodeSizes.start.height + tailGap };

  const fixed = {
    draggable: false,
    selectable: false,
    focusable: false,
    deletable: false,
  };

  const nodes: GraphNode[] = [
    {
      id: startNodeId,
      type: "start",
      position: startPosition,
      ...nodeSizes.start,
      data: { stepKey: null, index: -1 },
      ...fixed,
    },
    ...steps.map(
      (step, index): GraphNode => ({
        id: step.key,
        type: "step",
        position: positions[index] ?? { x: 0, y: 0 },
        ...nodeSizes.step,
        data: { stepKey: step.key, index },
        draggable: true,
        selectable: true,
        focusable: true,
        deletable: false,
      }),
    ),
    {
      id: addNodeId,
      type: "add",
      position: addPosition,
      ...nodeSizes.add,
      data: { stepKey: null, index: steps.length },
      ...fixed,
    },
  ];

  const still = { selectable: false, focusable: false, deletable: false };

  const edges: GraphEdge[] = [
    ...steps.map(
      (step, index): GraphEdge => ({
        id: `wait:${step.key}`,
        type: "wait",
        source: steps[index - 1]?.key ?? startNodeId,
        target: step.key,
        data: { stepKey: step.key, insertIndex: index },
        ...still,
      }),
    ),
    {
      id: "tail",
      type: "tail",
      source: steps.at(-1)?.key ?? startNodeId,
      target: addNodeId,
      data: { stepKey: null, insertIndex: steps.length },
      ...still,
    },
  ];

  return { nodes, edges };
}

export function frozenLayout(steps: Keyed[], layout: Layout | null): Layout {
  const positions = stepPositions(steps, layout);
  const result: Layout = {};
  steps.forEach((step, index) => {
    const position = positions[index];
    if (position) {
      result[step.key] = position;
    }
  });
  return result;
}

export function layoutWithMoves(
  steps: Keyed[],
  layout: Layout | null,
  moves: Layout,
): Layout {
  const result = frozenLayout(steps, layout);
  for (const step of steps) {
    const moved = moves[step.key];
    if (moved) {
      result[step.key] = { x: moved.x, y: moved.y };
    }
  }
  return result;
}

export function sameLayout(a: Layout | null, b: Layout | null) {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => {
      const other = b[key];
      const point = a[key];
      return (
        other !== undefined &&
        point !== undefined &&
        Math.round(other.x) === Math.round(point.x) &&
        Math.round(other.y) === Math.round(point.y)
      );
    })
  );
}

export function layoutAfterEdit(
  steps: Keyed[],
  layout: Layout | null,
  edit: StepEdit,
): Layout | null {
  if (!layout || edit.type === "update") {
    return layout;
  }
  const frozen = frozenLayout(steps, layout);
  if (edit.type === "insert") {
    const index = Math.min(steps.length, Math.max(0, edit.index));
    const displaced = steps[index];
    const before = steps[index - 1];
    const displacedAt = displaced ? frozen[displaced.key] : undefined;
    const beforeAt = before ? frozen[before.key] : undefined;
    const result: Layout = {};
    steps.forEach((step, at) => {
      const point = frozen[step.key];
      if (point) {
        result[step.key] =
          at >= index ? { x: point.x, y: point.y + stepPitch } : point;
      }
    });
    result[edit.key] = displacedAt
      ? { x: displacedAt.x, y: displacedAt.y }
      : beforeAt
        ? { x: beforeAt.x, y: beforeAt.y + stepPitch }
        : {
            x: centered("step", 0),
            y: nodeSizes.start.height + waitGap,
          };
    return result;
  }
  const at = steps.findIndex((step) => step.key === edit.key);
  if (at === -1) {
    return layout;
  }
  if (edit.type === "remove") {
    const result: Layout = {};
    steps.forEach((step, index) => {
      const point = frozen[step.key];
      if (point && index !== at) {
        result[step.key] =
          index > at ? { x: point.x, y: point.y - stepPitch } : point;
      }
    });
    return Object.keys(result).length > 0 ? result : null;
  }
  const other = steps[at + edit.by];
  const moved = steps[at];
  if (!other || !moved) {
    return layout;
  }
  const movedAt = frozen[moved.key];
  const otherAt = frozen[other.key];
  if (!movedAt || !otherAt) {
    return layout;
  }
  return { ...frozen, [moved.key]: otherAt, [other.key]: movedAt };
}
