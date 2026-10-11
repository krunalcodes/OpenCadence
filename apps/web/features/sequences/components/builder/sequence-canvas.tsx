"use client";

import "@xyflow/react/dist/base.css";
import "./builder.css";

import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  type NodeChange,
  Panel,
  ReactFlow,
  useReactFlow,
} from "@xyflow/react";
import { AlignVerticalSpaceAround, Maximize, Minus, Plus } from "lucide-react";
import { useTheme } from "next-themes";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { buttonFocusRing } from "@/components/app-shell/page-header";
import {
  edgeTypes,
  type FlowEdge,
} from "@/features/sequences/components/builder/flow-edges";
import {
  type FlowNode,
  nodeTypes,
} from "@/features/sequences/components/builder/flow-nodes";
import { copy } from "@/features/sequences/lib/copy";
import { buildGraph, type GraphNode } from "@/features/sequences/lib/graph";
import type { Layout } from "@/features/sequences/lib/sequences";
import type { DraftStep } from "@/features/sequences/lib/steps";

const text = copy.builder;

const fitOptions = { padding: 0.18, maxZoom: 1, minZoom: 0.5 };
const keySeparator = "|";

const ariaLabels = {
  "node.a11yDescription.default": text.a11y.node,
  "node.a11yDescription.keyboardDisabled": text.a11y.nodeNoKeyboard,
  "node.a11yDescription.ariaLiveMessage": text.a11y.moved,
  "edge.a11yDescription.default": text.a11y.edge,
};

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function motion() {
  return { duration: reducedMotion() ? 0 : 220 };
}

function decorate(
  nodes: GraphNode[],
  previous: FlowNode[],
  selectedKey: string | null,
  labels: Map<string, string>,
): FlowNode[] {
  const known = new Map(previous.map((node) => [node.id, node]));
  return nodes.map((node) => ({
    ...node,
    measured: known.get(node.id)?.measured,
    selected: node.type === "step" && node.id === selectedKey,
    ariaLabel: labels.get(node.id),
  }));
}

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName))
  );
}

type SequenceCanvasProps = {
  steps: DraftStep[];
  layout: Layout | null;
  selectedKey: string | null;
  onSelect: (key: string | null, fromKeyboard: boolean) => void;
  onMove: (moves: Layout) => void;
  onTidy: () => void;
  onDeleteRequest: (key: string) => void;
};

export function SequenceCanvas({
  steps,
  layout,
  selectedKey,
  onSelect,
  onMove,
  onTidy,
  onDeleteRequest,
}: SequenceCanvasProps) {
  const { resolvedTheme } = useTheme();
  const signature = steps.map((step) => step.key).join(keySeparator);
  const graph = useMemo(
    () =>
      buildGraph(
        signature === ""
          ? []
          : signature.split(keySeparator).map((key) => ({ key })),
        layout,
      ),
    [signature, layout],
  );
  const labelSignature = steps
    .map((step) => step.template?.name ?? "")
    .join(keySeparator);
  const labels = useMemo(() => {
    const names = labelSignature.split(keySeparator);
    const map = new Map<string, string>();
    graph.nodes.forEach((node) => {
      if (node.type === "step") {
        map.set(
          node.id,
          text.nodeLabel(node.data.index + 1, names[node.data.index] || null),
        );
      } else if (node.type === "start") {
        map.set(node.id, text.start);
      }
    });
    return map;
  }, [graph, labelSignature]);

  const [nodes, setNodes] = useState<FlowNode[]>(() =>
    decorate(graph.nodes, [], selectedKey, labels),
  );
  const edges: FlowEdge[] = graph.edges;
  const selectedRef = useRef(selectedKey);
  const keyboard = useRef(false);

  useEffect(() => {
    selectedRef.current = selectedKey;
    setNodes((previous) =>
      decorate(graph.nodes, previous, selectedKey, labels),
    );
  }, [graph, selectedKey, labels]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      setNodes((previous) => applyNodeChanges(changes, previous));
      let selection = selectedRef.current;
      const moves: Layout = {};
      for (const change of changes) {
        if (change.type === "select") {
          if (change.selected) {
            selection = change.id;
          } else if (selection === change.id) {
            selection = null;
          }
        } else if (
          change.type === "position" &&
          change.dragging !== true &&
          change.position
        ) {
          moves[change.id] = change.position;
        }
      }
      if (Object.keys(moves).length > 0) {
        onMove(moves);
      }
      if (selection !== selectedRef.current) {
        selectedRef.current = selection;
        onSelect(selection, keyboard.current);
      }
      keyboard.current = false;
    },
    [onMove, onSelect],
  );

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (isTyping(event.target)) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      keyboard.current = true;
      window.setTimeout(() => {
        keyboard.current = false;
      }, 0);
      return;
    }
    if (
      (event.key === "Delete" || event.key === "Backspace") &&
      selectedRef.current
    ) {
      event.preventDefault();
      onDeleteRequest(selectedRef.current);
    }
  }

  return (
    <div
      role="presentation"
      onKeyDownCapture={handleKeyDown}
      className="relative h-full min-h-0 w-full min-w-0"
    >
      <ReactFlow<FlowNode, FlowEdge>
        className="oc-flow"
        aria-label={text.canvasLabel}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={handleNodesChange}
        colorMode={resolvedTheme === "dark" ? "dark" : "light"}
        ariaLabelConfig={ariaLabels}
        fitView
        fitViewOptions={fitOptions}
        minZoom={0.35}
        maxZoom={1.5}
        nodesConnectable={false}
        nodesDraggable
        nodesFocusable
        edgesFocusable={false}
        elementsSelectable
        selectNodesOnDrag={false}
        nodeDragThreshold={4}
        deleteKeyCode={null}
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        panOnScroll
        zoomOnDoubleClick={false}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={22}
          size={1.4}
          offset={11}
        />
        <CanvasControls tidy={layout !== null} onTidy={onTidy} />
      </ReactFlow>
    </div>
  );
}

const controlClass = cn(
  "size-7 rounded-[6px] text-muted-foreground hover:bg-accent hover:text-foreground",
  buttonFocusRing,
);

function CanvasControls({
  tidy,
  onTidy,
}: {
  tidy: boolean;
  onTidy: () => void;
}) {
  const flow = useReactFlow();
  const controls = text.controls;

  function fit() {
    void flow.fitView({ ...fitOptions, ...motion() });
  }

  return (
    <Panel position="bottom-left">
      <div
        role="toolbar"
        aria-label={controls.label}
        className="nodrag nopan flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5 shadow-xs"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={controls.zoomOut}
          title={controls.zoomOut}
          onClick={() => void flow.zoomOut(motion())}
          className={controlClass}
        >
          <Minus aria-hidden strokeWidth={1.6} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={controls.zoomIn}
          title={controls.zoomIn}
          onClick={() => void flow.zoomIn(motion())}
          className={controlClass}
        >
          <Plus aria-hidden strokeWidth={1.6} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={controls.fit}
          title={controls.fit}
          onClick={fit}
          className={controlClass}
        >
          <Maximize aria-hidden strokeWidth={1.6} />
        </Button>
        <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />
        <Button
          type="button"
          variant="ghost"
          disabled={!tidy}
          title={controls.tidyHint}
          onClick={() => {
            onTidy();
            window.setTimeout(fit, 60);
          }}
          className={cn(
            controlClass,
            "w-auto gap-1.5 px-2 text-[12.5px] font-medium",
          )}
        >
          <AlignVerticalSpaceAround aria-hidden strokeWidth={1.6} />
          {controls.tidy}
        </Button>
      </div>
    </Panel>
  );
}
