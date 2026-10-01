/**
 * LiveDiscoveryGraph — shown during an active discovery run.
 *
 * Left: functional screens as they are verified.
 * Right: the latest Chrome DevTools MCP screenshot so you can see where
 * the crawl is going while the graph grows. Playwright is not used here.
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
import type { AppState, DiscoveryCheckpoint } from "../../types/api";

function LiveStateNode({
  data,
}: NodeProps<
  Node<{ state: AppState; isNew: boolean; isEntry: boolean; isCurrent: boolean }>
>) {
  const label = functionalStateName(data.state);

  return (
    <div
      className={`live-node ${data.isEntry ? "live-node--entry" : ""} ${
        data.isNew ? "live-node--new" : ""
      } ${data.isCurrent ? "live-node--current" : ""}`}
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
          ? "Chrome DevTools is visiting working screens…"
          : "Discovery worker is starting up…"}
      </p>
      <p className="live-graph-scanning-sub">
        Functional screens appear here as they are verified
      </p>
    </div>
  );
}

function LiveBrowserPane({
  liveView,
  jobStatus,
}: {
  liveView?: DiscoveryCheckpoint["live_view"];
  jobStatus?: string;
}) {
  const screenshot = liveView?.screenshot_ref;
  return (
    <div className="live-browser" aria-label="Live Chrome DevTools crawl">
      <div className="live-browser-chrome">
        <span className="live-browser-dot" />
        <span className="live-browser-dot live-browser-dot--amber" />
        <span className="live-browser-dot live-browser-dot--green" />
        <span className="live-browser-tool">Chrome DevTools</span>
        <div className="live-browser-url" title={liveView?.url || ""}>
          {liveView?.url || "Waiting for Chrome DevTools…"}
        </div>
      </div>
      <div className="live-browser-stage">
        {screenshot ? (
          <img
            key={screenshot}
            src={screenshot}
            alt={liveView?.label ? `Chrome DevTools visiting ${liveView.label}` : "Live Chrome DevTools crawl"}
            className="live-browser-frame"
          />
        ) : (
          <div className="live-browser-empty">
            <p>
              {jobStatus === "in_progress"
                ? "Chrome DevTools is opening the application…"
                : "The live crawl view appears once Chrome DevTools starts"}
            </p>
          </div>
        )}
      </div>
      <div className="live-browser-status">
        {liveView?.label ? (
          <>
            Now visiting <strong>{liveView.label}</strong>
            {liveView.action && liveView.action !== "ROOT" ? (
              <span className="live-browser-action">{liveView.action}</span>
            ) : null}
          </>
        ) : (
          "Watch the graph build as each working screen is confirmed"
        )}
      </div>
    </div>
  );
}

export default function LiveDiscoveryGraph({
  states,
  jobStatus,
  elementCount,
  flowGraph,
  liveView,
}: {
  states: AppState[];
  jobStatus?: string;
  stateCount: number;
  elementCount: number;
  flowGraph?: ApplicationGraphData;
  liveView?: DiscoveryCheckpoint["live_view"];
}) {
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

  const currentFingerprint = liveView?.fingerprint;
  const nodes = graph.nodes.map((n) => ({
    ...n,
    type: "live",
    data: {
      ...n.data,
      isNew: newCodes.has(n.data.state.state_code),
      isCurrent:
        !!currentFingerprint &&
        (n.data.state.fingerprint === currentFingerprint ||
          n.id === currentFingerprint),
    },
  }));

  const edges = graph.edges.map((e) => ({
    ...e,
    type: "smoothstep",
    className: "app-flow-edge",
    zIndex: 4,
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed, color: "#1f7a55", width: 18, height: 18 },
    style: { stroke: "#1f7a55", strokeWidth: 2.4 },
  }));

  return (
    <div className="live-graph-wrap">
      <div className="live-graph-header">
        <span className="live-graph-pulse-dot" />
        <span className="live-graph-header-label">Discovery run</span>
        <div className="live-graph-stats">
          <span>
            <strong>{graph.nodes.length}</strong> working screens
          </span>
          <span className="live-graph-sep" />
          <span>
            <strong>{elementCount}</strong> observed controls
          </span>
          {jobStatus === "in_progress" && (
            <>
              <span className="live-graph-sep" />
              <span className="live-graph-status">In progress</span>
            </>
          )}
        </div>
      </div>

      <div className="live-discovery-stack">
        <section className="live-crawl-section" aria-label="Live Chrome DevTools crawl">
          <div className="live-section-heading">Live Chrome DevTools crawl</div>
          <LiveBrowserPane liveView={liveView} jobStatus={jobStatus} />
        </section>
        <section className="live-graph-section" aria-label="Application graph">
          <div className="live-section-heading">Application graph</div>
          <div ref={canvasRef} className="live-graph-canvas">
            {states.length === 0 ? (
              <ScanningPlaceholder phase={jobStatus ?? ""} />
            ) : (
              <>
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  defaultEdgeOptions={{
                    type: "smoothstep",
                    zIndex: 4,
                    style: { stroke: "#1f7a55", strokeWidth: 2.4 },
                  }}
                  fitView
                  fitViewOptions={{ padding: 0.25, maxZoom: 1.1 }}
                  nodesDraggable={false}
                  nodesConnectable={false}
                  edgesFocusable={false}
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
                  {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
                </button>
              </>
            )}
          </div>
        </section>
      </div>

      <div className="live-graph-legend">
        <span className="live-graph-legend-entry">Entry screen</span>
        <span>Pages are nodes. Items on a page stay on that page.</span>
      </div>
    </div>
  );
}
