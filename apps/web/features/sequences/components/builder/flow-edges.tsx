"use client";

import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@workspace/ui/components/popover";
import {
  BaseEdge,
  type Edge,
  EdgeLabelRenderer,
  type EdgeProps,
  getSmoothStepPath,
} from "@xyflow/react";
import { Clock, Plus, Zap } from "lucide-react";
import {
  useBuilder,
  useBuilderStep,
} from "@/features/sequences/components/builder/builder-context";
import { WaitField } from "@/features/sequences/components/builder/wait-field";
import { copy } from "@/features/sequences/lib/copy";
import type {
  GraphEdgeData,
  GraphEdgeType,
} from "@/features/sequences/lib/graph";

const text = copy.builder;

export type FlowEdge = Edge<GraphEdgeData, GraphEdgeType>;

function pathOf(props: EdgeProps<FlowEdge>) {
  return getSmoothStepPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
    borderRadius: 14,
  });
}

export function WaitEdge(props: EdgeProps<FlowEdge>) {
  const { canAdd, onInsert, onDelayChange } = useBuilder();
  const found = useBuilderStep(props.data?.stepKey ?? null);
  const [path, labelX, labelY] = pathOf(props);

  if (!found || !props.data) {
    return <BaseEdge id={props.id} path={path} />;
  }
  const { step, index } = found;
  const label = text.waitShort(step.delayMinutes);
  const Icon = step.delayMinutes <= 0 ? Zap : Clock;
  const fieldId = `wait-${props.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  return (
    <>
      <BaseEdge id={props.id} path={path} />
      <EdgeLabelRenderer>
        <div
          className="oc-flow-edge-label nodrag nopan"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          <Popover>
            <PopoverTrigger
              className="oc-flow-wait"
              aria-label={text.editWait(
                text.wait(step.delayMinutes, index === 0),
              )}
            >
              <Icon aria-hidden strokeWidth={1.6} className="size-3.5" />
              <span className="tabular-nums">{label}</span>
            </PopoverTrigger>
            <PopoverContent
              side="right"
              align="center"
              sideOffset={10}
              className="w-auto gap-3 p-3.5 text-[13px]"
            >
              <PopoverHeader>
                <PopoverTitle className="text-[13px] font-semibold">
                  {text.waitPopover.title}
                </PopoverTitle>
                <PopoverDescription
                  id={`${fieldId}-hint`}
                  className="max-w-[260px] text-[12.5px] leading-normal"
                >
                  {index === 0 ? text.panel.waitFirstHint : text.panel.waitHint}
                </PopoverDescription>
              </PopoverHeader>
              <WaitField
                id={fieldId}
                minutes={step.delayMinutes}
                index={index}
                autoFocus
                describedBy={`${fieldId}-hint`}
                onChange={(minutes) => onDelayChange(step.key, minutes)}
              />
            </PopoverContent>
          </Popover>
          <button
            type="button"
            disabled={!canAdd}
            aria-label={text.insertStep(props.data.insertIndex + 1)}
            title={text.insertStep(props.data.insertIndex + 1)}
            onClick={() => onInsert(props.data?.insertIndex ?? index)}
            className="oc-flow-insert"
          >
            <Plus aria-hidden strokeWidth={2} className="size-3" />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export function TailEdge(props: EdgeProps<FlowEdge>) {
  const [path] = pathOf(props);
  return <BaseEdge id={props.id} path={path} className="oc-flow-tail" />;
}

export const edgeTypes = { wait: WaitEdge, tail: TailEdge };
