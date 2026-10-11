"use client";

import { cn } from "@workspace/ui/lib/utils";
import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import {
  CircleAlert,
  CornerDownRight,
  Mail,
  Plus,
  UserRoundPlus,
} from "lucide-react";
import {
  useBuilder,
  useBuilderStep,
} from "@/features/sequences/components/builder/builder-context";
import { copy } from "@/features/sequences/lib/copy";
import type {
  GraphNodeData,
  GraphNodeType,
} from "@/features/sequences/lib/graph";
import { maxSteps } from "@/features/sequences/lib/sequences";

const text = copy.builder;

export type FlowNode = Node<GraphNodeData, GraphNodeType>;

function Anchor({ type }: { type: "source" | "target" }) {
  return (
    <Handle
      type={type}
      position={type === "source" ? Position.Bottom : Position.Top}
      isConnectable={false}
      aria-hidden="true"
      tabIndex={-1}
    />
  );
}

export function StartNode(_: NodeProps<FlowNode>) {
  return (
    <div className="oc-flow-start" title={text.startHint}>
      <UserRoundPlus aria-hidden strokeWidth={1.6} className="size-4" />
      <span className="truncate">{text.start}</span>
      <Anchor type="source" />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <dt className="text-ink-tertiary">{label}</dt>
      <dd className="font-medium text-foreground tabular-nums">
        {copy.number(value)}
      </dd>
    </div>
  );
}

export function StepNode({ data, selected, dragging }: NodeProps<FlowNode>) {
  const { problemKeys } = useBuilder();
  const found = useBuilderStep(data.stepKey);
  if (!found) {
    return null;
  }
  const { step, index } = found;
  const problem = problemKeys.has(step.key);
  const reply = index > 0 && step.threadMode === "reply";
  const subject = step.subject.trim();

  return (
    <div
      className="oc-flow-step"
      data-selected={selected || undefined}
      data-dragging={dragging || undefined}
      data-problem={problem || undefined}
    >
      <Anchor type="target" />
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <span className="oc-flow-step-number">{index + 1}</span>
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Mail aria-hidden strokeWidth={1.6} className="size-3.5 shrink-0" />
          {text.email}
        </span>
        <span className="ml-auto flex min-w-0 items-center gap-1 text-xs text-ink-tertiary">
          {reply ? (
            <CornerDownRight
              aria-hidden
              strokeWidth={1.6}
              className="size-3.5 shrink-0"
            />
          ) : null}
          <span className="truncate">
            {text.thread[index === 0 ? "new" : step.threadMode]}
          </span>
        </span>
      </div>
      <div className="min-w-0 px-3 pt-2">
        {step.template ? (
          <p className="truncate text-[13px] font-medium text-foreground">
            {step.template.name || text.email}
          </p>
        ) : (
          <p className="flex items-center gap-1.5 truncate text-[13px] font-medium text-warning">
            <CircleAlert
              aria-hidden
              strokeWidth={1.8}
              className="size-3.5 shrink-0"
            />
            {text.noTemplate}
          </p>
        )}
        <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
          {reply ? text.replySubject : subject || text.noSubject}
        </p>
      </div>
      <dl className="mt-auto flex items-center gap-4 border-t border-border-subtle px-3 py-2 text-xs">
        {step.stats.sent > 0 ? (
          <>
            <Stat label={text.stats.sent} value={step.stats.sent} />
            <Stat label={text.stats.opened} value={step.stats.opened} />
            <Stat label={text.stats.replied} value={step.stats.replied} />
          </>
        ) : (
          <div className="text-ink-tertiary">
            <dt className="sr-only">{text.stats.sent}</dt>
            <dd>{text.notSentYet}</dd>
          </div>
        )}
        {problem ? (
          <div className="ml-auto flex items-center gap-1 text-danger">
            <CircleAlert aria-hidden strokeWidth={1.8} className="size-3.5" />
            <span className="sr-only">{text.nodeProblem}</span>
          </div>
        ) : null}
      </dl>
      <Anchor type="source" />
    </div>
  );
}

export function AddNode({ data }: NodeProps<FlowNode>) {
  const { canAdd, steps, onInsert } = useBuilder();
  return (
    <div className="h-full w-full">
      <Anchor type="target" />
      <button
        type="button"
        disabled={!canAdd}
        title={canAdd ? undefined : text.stepLimit(maxSteps)}
        onClick={() => onInsert(data.index)}
        className={cn("oc-flow-add nodrag nopan")}
      >
        <Plus aria-hidden strokeWidth={1.8} className="size-4" />
        {canAdd
          ? steps.length === 0
            ? text.addFirstStep
            : text.addStep
          : text.stepLimit(maxSteps)}
      </button>
    </div>
  );
}

export const nodeTypes = { start: StartNode, step: StepNode, add: AddNode };
