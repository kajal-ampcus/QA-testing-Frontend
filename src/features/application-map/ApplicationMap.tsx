import { useMemo, useState } from "react";
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
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import { Globe, Search, Network } from "lucide-react";
import "@xyflow/react/dist/style.css";
import type { AppMap, AppState } from "../../types/api";
import {
  Card,
  DetailDrawer,
  StatusBadge,
  EmptyState,
  NextAction,
} from "../../components/ui";
export function pathEdges(states: AppState[]) {
  return states.flatMap((state) => {
    if (!state.reached_via.length) return [];
    const prefix = state.reached_via.slice(0, -1);
    let parents = states.filter(
      (p) =>
        p.state_code !== state.state_code &&
        JSON.stringify(p.reached_via) === JSON.stringify(prefix),
    );
    // Older maps can contain more than one phase-entry state with an empty
    // path. Resolve a public link transition from the observed href instead
    // of dropping an otherwise valid edge as ambiguous.
    if (parents.length > 1) {
      const childPath = new URL(
        state.url_pattern,
        "https://placeholder.invalid",
      ).pathname;
      const hrefParents = parents.filter((parent) =>
        parent.elements.some((element) => {
          if (element.role !== "link" || typeof element.url !== "string") {
            return false;
          }
          try {
            return new URL(element.url, "https://placeholder.invalid").pathname === childPath;
          } catch {
            return false;
          }
        }),
      );
      if (hrefParents.length === 1) parents = hrefParents;
    }
    return parents.length === 1
      ? [
          {
            id: `${parents[0].state_code}-${state.state_code}`,
            source: parents[0].state_code,
            target: state.state_code,
            label:
              state.reached_via.at(-1)?.match(/name=['"](.*?)['"]\)/)?.[1] ||
              "Navigation path",
          },
        ]
      : [];
  });
}
function title(s: AppState) {
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
      <Handle type="target" position={Position.Left} />
      <header>
        <span className="map-node-icon">
          <Globe size={16} />
        </span>
        <span className="mono">{data.state.state_code}</span>
        <span className="observed-dot" title="Observed state" />
      </header>
      <h3>{title(data.state)}</h3>
      <p>{data.state.url_pattern}</p>
      <footer>
        <span>{data.state.elements.length} elements</span>
        <span>Observed</span>
      </footer>
      <Handle type="source" position={Position.Right} />
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
  const graph = useMemo(() => {
    const edges = pathEdges(map.states);
    const g = new dagre.graphlib.Graph()
      .setGraph({ rankdir: "LR", nodesep: 42, ranksep: 100 })
      .setDefaultEdgeLabel(() => ({}));
    map.states.forEach((s) =>
      g.setNode(s.state_code, { width: 244, height: 145 }),
    );
    edges.forEach((e) => g.setEdge(e.source, e.target));
    dagre.layout(g);
    return {
      edges,
      nodes: map.states.map((s) => ({
        id: s.state_code,
        type: "application",
        width: 244,
        height: 150,
        position: {
          x: g.node(s.state_code).x - 122,
          y: g.node(s.state_code).y - 72,
        },
        data: { state: s, dim: false, highlighted: false },
      })),
    };
  }, [map]);
  const active = hover || selected?.state_code;
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
          !`${n.data.state.state_code} ${n.data.state.url_pattern}`
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
    labelStyle: { fontSize: 10, fill: "#68766e" },
    labelBgStyle: { fill: "#f8faf8" },
    labelBgPadding: [6, 4] as [number, number],
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
              {map.states.length} states · {graph.edges.length} path-derived
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
          <div className="graph">
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
          </div>
        )}
        <div className="graph-legend">
          <span>
            <i />
            Observed state
          </span>
          <span>
            — Connection inferred from a unique matching navigation path
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
            : "Generate from the partial graph"
        }
        description={
          map.status === "COMPLETE"
            ? "Design test cases using your approved requirement and this application map."
            : "Use the states discovered so far now, then continue discovery and generate only for newly added states later."
        }
        label={
          map.status === "COMPLETE"
            ? "Continue to test generation"
            : "Generate from partial graph"
        }
        onClick={onNext}
      />
      {selected && (
        <DetailDrawer
          title={title(selected)}
          onClose={() => setSelected(undefined)}
        >
          <div className="tags">
            <span className="tag mono">{selected.state_code}</span>
            <StatusBadge status="Observed" />
          </div>
          <label>
            URL<span className="value">{selected.url_pattern}</span>
          </label>
          {selected.evidence_ref && (
            <>
              <h3>Observed screenshot</h3>
              <a href={selected.evidence_ref} target="_blank" rel="noreferrer">
                <img
                  src={selected.evidence_ref}
                  alt={`Observed state ${selected.state_code}`}
                  style={{ width: "100%", borderRadius: "8px", border: "1px solid var(--border)" }}
                />
              </a>
            </>
          )}
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
