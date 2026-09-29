import { useEffect, useMemo, useRef, useState } from "react";
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
} from "./graphLayout";
import { Globe, Search, Network, Maximize2, Minimize2 } from "lucide-react";
import "@xyflow/react/dist/style.css";
import type { AppMap, AppState } from "../../types/api";
import {
  Card,
  DetailDrawer,
  StatusBadge,
  EmptyState,
  NextAction,
} from "../../components/ui";
function StateNode({
  data,
}: NodeProps<
  Node<{
    state: AppState;
    dim: boolean;
    highlighted: boolean;
    onOpen: () => void;
  }>
>) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Inspect ${data.state.state_code}`}
      onClick={data.onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          data.onOpen();
        }
      }}
      className={`map-node ${data.dim ? "dim" : ""} ${data.highlighted ? "highlighted" : ""}`}
    >
      <Handle type="target" position={Position.Top} />
      <div className="map-node-content">
        <span className="map-node-icon">
          <Globe size={16} />
        </span>
        <h3>{functionalStateName(data.state)}</h3>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
const nodeTypes = { application: StateNode };
export default function ApplicationMap({
  map,
  onNext,
  onRetry,
}: {
  map: AppMap;
  onNext: () => void;
  onRetry: () => void;
}) {
  const [selected, setSelected] = useState<AppState>();
  const [hover, setHover] = useState<string>();
  const [search, setSearch] = useState("");

  // ------------------------------------------------------------
  // FULLSCREEN
  // Uses the real browser Fullscreen API so the graph canvas takes
  // over the entire screen (not just a CSS-expanded box), and keeps
  // React state in sync so the icon/label flips and Esc is handled.
  // ------------------------------------------------------------
  const graphRef = useRef<HTMLDivElement>(null);
  const rfInstance = useRef<ReactFlowInstance<any, any> | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await graphRef.current?.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      const active = document.fullscreenElement === graphRef.current;
      setIsFullscreen(active);
      // Re-fit the graph once the browser has finished resizing the
      // element, so the whole map is centered and legible at the new
      // (much larger, or restored) canvas size.
      requestAnimationFrame(() => {
        rfInstance.current?.fitView({ padding: 0.2, maxZoom: 1 });
      });
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const graph = useMemo(() => {
    const source = map.coverage?.app_flow_graph as ApplicationGraphData | undefined;
    const checkpoint = map.discovery_checkpoint as (typeof map.discovery_checkpoint & { graph?: ApplicationGraphData });
    const relationships = (map.status === "RUNNING" ? checkpoint?.graph?.edges : undefined)
      ?? source?.edges ?? checkpoint?.graph?.edges ?? [];
    const layout = layoutApplicationGraph(map.states, relationships, 196, 64);
    return {
      edges: layout.edges,
      nodes: layout.nodes.map((node) => ({
        ...node,
        type: "application",
        data: { ...node.data, dim: false, highlighted: false },
      })),
    };
  }, [map]);
  const active = hover || selected?.id || selected?.state_code;
  const related = new Set(
    active
      ? [
          active,
          ...graph.edges
            .filter((e) => e.source === active || e.target === active)
            .flatMap((e) => [e.source, e.target]),
        ]
      : [],
  );
  const nodes = graph.nodes.map((n) => ({
    ...n,
    data: {
      ...n.data,
      dim:
        (!!search &&
          !`${functionalStateName(n.data.state)} ${n.data.state.state_code} ${n.data.state.url_pattern}`
            .toLowerCase()
            .includes(search.toLowerCase())) ||
        (!!active && !related.has(n.id)),
      highlighted: related.has(n.id),
      onOpen: () => setSelected(n.data.state),
    },
  }));
  const edges = graph.edges.map((e) => ({
    ...e,
    type: "smoothstep",
    animated: !!active && (e.source === active || e.target === active),
    markerEnd: { type: MarkerType.ArrowClosed, color: "#81938c" },
    style: {
      stroke:
        active && related.has(e.source) && related.has(e.target)
          ? "#278066"
          : "#bdc8c2",
      strokeWidth: 1.5,
    },
  }));
  return (
    <>
      <Card className="map-card">
        <div className="card-heading">
          <div className="heading-icon">
            <Network size={20} />
          </div>
          <div>
            <h2>Your application, mapped</h2>
            <p>
              {graph.nodes.length} states · {graph.edges.length}
              connections · Version {map.version}
            </p>
          </div>
          <StatusBadge status={map.status} />
        </div>
        <div className="map-toolbar">
          <label className="search">
            <Search size={15} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search application states"
              placeholder="Find a state or URL…"
            />
          </label>
          <span className="field-hint">
            Select a state to explore its elements
          </span>
        </div>
        {!map.states.length ? (
          <EmptyState
            title="No states recorded"
            description="Review discovery details and run discovery again."
          />
        ) : (
          <div ref={graphRef} className="graph">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
              nodesDraggable={false}
              nodesConnectable={false}
              onNodeClick={(_, n) => setSelected(n.data.state)}
              onNodeMouseEnter={(_, n) => setHover(n.id)}
              onNodeMouseLeave={() => setHover(undefined)}
              onInit={(instance) => (rfInstance.current = instance)}
              minZoom={0.1}
              maxZoom={1.8}
            >
              <Background color="#d5ddd7" gap={22} size={1} />
              <Controls showInteractive={false} />
              <MiniMap
                nodeColor="#b9d5c6"
                maskColor="rgba(242,246,242,.8)"
                pannable
                zoomable
              />
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
          </div>
        )}
        <div className="graph-legend">
          <span>
            <i />
            Observed state
          </span>
          <span>
            — Application flow relationship
          </span>
          <span>Scroll to zoom · Drag to pan</span>
        </div>
        {search && !nodes.some((n) => !n.data.dim) && (
          <p className="notice">No matching states. Try a state code or URL.</p>
        )}
      </Card>
      <NextAction
        title={
          map.status === "COMPLETE"
            ? "Turn observations into test coverage"
            : "Complete discovery to continue"
        }
        description={
          map.status === "COMPLETE"
            ? "Design test cases using your approved requirement and this application map."
            : "Test generation needs a complete map. Review discovery details and retry."
        }
        label={
          map.status === "COMPLETE"
            ? "Continue to test generation"
            : "Review discovery"
        }
        onClick={map.status === "COMPLETE" ? onNext : onRetry}
      />
      {selected && (
        <DetailDrawer
          title={functionalStateName(selected)}
          onClose={() => setSelected(undefined)}
        >
          <div className="tags">
            <span className="tag mono">{selected.state_code}</span>
            <StatusBadge status="Observed" />
          </div>
          <label>
            URL<span className="value">{selected.url_pattern}</span>
          </label>
          <h3>Navigation path</h3>
          {selected.reached_via.length ? (
            <ol className="path-list">
              {selected.reached_via.map((p, i) => (
                <li key={i}>
                  <code>{p}</code>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">
              Entry state. No navigation actions recorded.
            </p>
          )}
          <h3>
            Observed elements{" "}
            <span className="count">{selected.elements.length}</span>
          </h3>
          <div className="element-list">
            {selected.elements.map((el, i) => (
              <details key={i}>
                <summary>
                  <span className="mono">
                    {String(el.element_code || `Observation ${i + 1}`)}
                  </span>{" "}
                  {String(el.name || el.role || "Observation")}
                </summary>
                <dl>
                  {Object.entries(el).map(([k, v]) => (
                    <div key={k}>
                      <dt>{k.replaceAll("_", " ")}</dt>
                      <dd>
                        {typeof v === "object" ? JSON.stringify(v) : String(v)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </details>
            ))}
          </div>
          <details>
            <summary>Map coverage details</summary>
            <pre>{JSON.stringify(map.coverage, null, 2)}</pre>
          </details>
        </DetailDrawer>
      )}
    </>
  );
}
