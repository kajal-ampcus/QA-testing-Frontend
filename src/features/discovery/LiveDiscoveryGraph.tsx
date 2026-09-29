/**
 * LiveDiscoveryGraph — shown during an active discovery run.
 *
 * Each application state discovered by the crawler appears as a node the
 * moment it is persisted to the database. Edges are inferred from
 * `reached_via` paths (same algorithm as ApplicationMap). Nodes slide in
 * with an entrance animation and a short pulse so the user can see the map
 * growing in real-time.
 *
 * Layout: dagre left-to-right (same as the finished ApplicationMap view).
 */

import { useMemo, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  type NodeProps,
  type Node,
  type ReactFlowInstance,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import { Globe, Wifi, Maximize2, Minimize2 } from "lucide-react";
import "@xyflow/react/dist/style.css";
import type { AppState } from "../../types/api";
import { pathEdges } from "../application-map/ApplicationMap";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pageTitle(s: AppState): string {
  try {
    const p = new URL(s.url_pattern, "https://placeholder.invalid").pathname;
    return p === "/"
      ? "Home"
      : decodeURIComponent(
          p.split("/").filter(Boolean).at(-1) || "Page",
        ).replaceAll("-", " ");
  } catch {
    return s.state_code;
  }
}

function layoutGraph(states: AppState[]) {
  const edges = pathEdges(states);
  const g = new dagre.graphlib.Graph()
    .setGraph({ rankdir: "LR", nodesep: 50, ranksep: 120 })
    .setDefaultEdgeLabel(() => ({}));

  states.forEach((s) => g.setNode(s.state_code, { width: 200, height: 110 }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);

  return {
    edges,
    nodes: states.map((s) => ({
      id: s.state_code,
      type: "live",
      width: 200,
      height: 110,
      position: {
        x: g.node(s.state_code).x - 100,
        y: g.node(s.state_code).y - 55,
      },
      data: { state: s },
    })),
  };
}

// ---------------------------------------------------------------------------
// Custom node
// ---------------------------------------------------------------------------

function LiveStateNode({
  data,
}: NodeProps<Node<{ state: AppState; isNew: boolean }>>) {
  const s = data.state;
  const label = pageTitle(s);
  const isEntry = s.reached_via.length === 0;

  return (
    <div
      className={`live-node ${isEntry ? "live-node--entry" : ""} ${data.isNew ? "live-node--new" : ""}`}
    >
      <Handle type="target" position={Position.Left} />

      {/* Phase badge */}
      <div className="live-node-phase">
        {isEntry ? "Entry" : `Depth ${s.reached_via.length}`}
      </div>

      {/* Icon + code */}
      <div className="live-node-header">
        <span className="live-node-icon">
          <Globe size={13} />
        </span>
        <span className="live-node-code">{s.state_code}</span>
        <span className="live-node-ping" title="Freshly observed" />
      </div>

      {/* Page title */}
      <div className="live-node-title">{label}</div>

      {/* URL truncated */}
      <div className="live-node-url" title={s.url_pattern}>
        {s.url_pattern.length > 34
          ? s.url_pattern.slice(0, 31) + "…"
          : s.url_pattern}
      </div>

      {/* Element count */}
      <div className="live-node-footer">
        <span>{s.elements.length} elements</span>
        <span className="live-node-dot" />
        <span>Observed</span>
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { live: LiveStateNode };

// ---------------------------------------------------------------------------
// Empty state shown while waiting for the first state
// ---------------------------------------------------------------------------

function ScanningPlaceholder({ phase }: { phase: string }) {
  return (
    <div className="live-graph-scanning">
      <div className="live-graph-radar">
        <div className="live-graph-radar-ring" />
        <div className="live-graph-radar-ring live-graph-radar-ring--2" />
        <div className="live-graph-radar-ring live-graph-radar-ring--3" />
        <Wifi size={22} className="live-graph-radar-icon" />
      </div>
      <p className="live-graph-scanning-label">
        {phase === "in_progress"
          ? "Browser is crawling your application…"
          : "Discovery worker is starting up…"}
      </p>
      <p className="live-graph-scanning-sub">
        Nodes will appear here as states are discovered
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function LiveDiscoveryGraph({
  states,
  jobStatus,
  stateCount,
  elementCount,
}: {
  states: AppState[];
  jobStatus?: string;
  stateCount: number;
  elementCount: number;
}) {
  // Track which state_codes are "newly arrived" for the pop-in animation.
  // After 1.2 s we remove them from the set so the animation doesn't replay.
  const knownCodes = useRef<Set<string>>(new Set());
  const [newCodes, setNewCodes] = useState<Set<string>>(new Set());

  useEffect(() => {
    const incoming = states
      .map((s) => s.state_code)
      .filter((c) => !knownCodes.current.has(c));

    if (incoming.length === 0) return;

    incoming.forEach((c) => knownCodes.current.add(c));
    setNewCodes((prev) => new Set([...prev, ...incoming]));

    const timer = setTimeout(() => {
      setNewCodes((prev) => {
        const next = new Set(prev);
        incoming.forEach((c) => next.delete(c));
        return next;
      });
    }, 1200);

    return () => clearTimeout(timer);
  }, [states]);

  // ------------------------------------------------------------
  // FULLSCREEN
  // Same pattern as ApplicationMap: real Fullscreen API on the canvas
  // element itself, kept in sync via the fullscreenchange event (also
  // covers the user pressing Esc), with a re-fit once the resize lands.
  // ------------------------------------------------------------
  const canvasRef = useRef<HTMLDivElement>(null);
  const rfInstance = useRef<ReactFlowInstance<any, any> | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await canvasRef.current?.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      const active = document.fullscreenElement === canvasRef.current;
      setIsFullscreen(active);
      requestAnimationFrame(() => {
        rfInstance.current?.fitView({ padding: 0.25, maxZoom: 1.1 });
      });
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const graph = useMemo(() => layoutGraph(states), [states]);

  const nodes = graph.nodes.map((n) => ({
    ...n,
    data: { ...n.data, isNew: newCodes.has(n.id) },
  }));

  const edges = graph.edges.map((e) => ({
    ...e,
    type: "smoothstep",
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed, color: "#3db882" },
    style: { stroke: "#3db882", strokeWidth: 1.8, opacity: 0.75 },
    labelStyle: { fontSize: 10, fill: "#5a8a72" },
    labelBgStyle: { fill: "#f0faf5" },
    labelBgPadding: [6, 3] as [number, number],
  }));

  return (
    <div className="live-graph-wrap">
      {/* Header strip */}
      <div className="live-graph-header">
        <span className="live-graph-pulse-dot" />
        <span className="live-graph-header-label">Live discovery</span>
        <div className="live-graph-stats">
          <span>
            <strong>{stateCount}</strong> states
          </span>
          <span className="live-graph-sep" />
          <span>
            <strong>{elementCount}</strong> elements
          </span>
          {jobStatus === "in_progress" && (
            <>
              <span className="live-graph-sep" />
              <span className="live-graph-status">In progress</span>
            </>
          )}
        </div>
      </div>

      {/* Graph canvas */}
      <div ref={canvasRef} className="live-graph-canvas">
        {states.length === 0 ? (
          <ScanningPlaceholder phase={jobStatus ?? ""} />
        ) : (
          <>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.25, maxZoom: 1.1 }}
              nodesDraggable={false}
              nodesConnectable={false}
              onInit={(instance) => (rfInstance.current = instance)}
              minZoom={0.1}
              maxZoom={2}
            >
              <Background color="#c8d9d0" gap={20} size={1} />
              <Controls showInteractive={false} />
            </ReactFlow>

            <button
              type="button"
              className="graph-fullscreen-btn"
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? (
                <Minimize2 size={17} />
              ) : (
                <Maximize2 size={17} />
              )}
            </button>
          </>
        )}
      </div>

      {/* Phase legend */}
      <div className="live-graph-legend">
        <span className="live-graph-legend-entry">Entry state</span>
        <span>→ Authenticated states grow as the crawler explores</span>
      </div>
    </div>
  );
}
