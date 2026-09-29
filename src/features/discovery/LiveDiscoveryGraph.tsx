/**
 * LiveDiscoveryGraph — shown during an active discovery run.
 *
 * Each application state discovered by the crawler appears as a node the
 * moment it is persisted to the database. Edges come from the existing
 * application graph transitions. Nodes slide in
 * with an entrance animation and a short pulse so the user can see the map
 * growing in real-time.
 *
 * Layout: shared top-to-bottom Dagre hierarchy, derived from transitions.
 */

import { useMemo, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  type NodeProps,
  type Node,
  type ReactFlowInstance,
} from "@xyflow/react";
import {
  functionalStateName,
  layoutApplicationGraph,
  type ApplicationGraphData,
} from "../application-map/graphLayout";
import { Globe, Wifi, Maximize2, Minimize2 } from "lucide-react";
import "@xyflow/react/dist/style.css";
import type { AppState } from "../../types/api";

// ---------------------------------------------------------------------------
// Custom node
// ---------------------------------------------------------------------------

function LiveStateNode({
  data,
}: NodeProps<Node<{ state: AppState; isNew: boolean; isEntry: boolean }>>) {
  const s = data.state;
  const label = functionalStateName(s);
  const isEntry = data.isEntry;

  return (
    <div
      className={`live-node ${isEntry ? "live-node--entry" : ""} ${data.isNew ? "live-node--new" : ""}`}
    >
      <Handle type="target" position={Position.Top} />

      <div className="live-node-content">
        <span className="live-node-icon">
          <Globe size={13} />
        </span>
        <div className="live-node-title">{label}</div>
      </div>

      <Handle type="source" position={Position.Bottom} />
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
  elementCount,
  flowGraph,
}: {
  states: AppState[];
  jobStatus?: string;
  stateCount: number;
  elementCount: number;
  flowGraph?: ApplicationGraphData;
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

  const graph = useMemo(
    () => layoutApplicationGraph(states, flowGraph?.edges ?? [], 176, 60),
    [states, flowGraph],
  );

  const nodes = graph.nodes.map((n) => ({
    ...n,
    type: "live",
    data: { ...n.data, isNew: newCodes.has(n.data.state.state_code) },
  }));

  const edges = graph.edges.map((e) => ({
    ...e,
    type: "smoothstep",
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed, color: "#3db882" },
    style: { stroke: "#3db882", strokeWidth: 1.8, opacity: 0.75 },
  }));

  return (
    <div className="live-graph-wrap">
      {/* Header strip */}
      <div className="live-graph-header">
        <span className="live-graph-pulse-dot" />
        <span className="live-graph-header-label">Live discovery</span>
        <div className="live-graph-stats">
          <span>
            <strong>{graph.nodes.length}</strong> functional states
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
              <MiniMap pannable zoomable />
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
