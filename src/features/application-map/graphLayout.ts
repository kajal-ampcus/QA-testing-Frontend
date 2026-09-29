import dagre from "@dagrejs/dagre";
import type { AppState } from "../../types/api";

export interface GraphRelationship {
  id?: string;
  source_state_id?: string;
  target_state_id?: string;
  parent_fingerprint?: string;
  child_fingerprint?: string;
  source?: string;
  target?: string;
  label?: string;
  action?: string;
}

export interface ApplicationGraphData {
  edges?: GraphRelationship[];
}

type FlowEdge = { id: string; source: string; target: string };

const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LONG_HEX_SEGMENT = /^[0-9a-f]{16,}$/i;
const LONG_IDENTIFIER_SEGMENT = /^(?=.*\d)[a-z0-9_-]{20,}$/i;

function normalizeDynamicSegment(segment: string): string {
  if (/^\d+$/.test(segment)) return ":id";
  if (UUID_SEGMENT.test(segment)) return ":id";
  if (LONG_HEX_SEGMENT.test(segment)) return ":id";
  if (LONG_IDENTIFIER_SEGMENT.test(segment)) return ":id";
  return segment;
}

/** A stable route identity that ignores filters, hashes and concrete record IDs. */
export function normalizeFunctionalRoute(value: string): string {
  try {
    const absolute = /^[a-z][a-z\d+.-]*:\/\//i.test(value);
    const url = new URL(value || "/", "https://application.invalid");
    const segments = url.pathname
      .split("/")
      .filter(Boolean)
      .map((segment) => normalizeDynamicSegment(decodeURIComponent(segment)));
    const pathname = `/${segments.join("/")}` || "/";
    const route = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
    return absolute ? `${url.host.toLowerCase()}${route}` : route;
  } catch {
    const route = (value || "/").split(/[?#]/, 1)[0].replace(/\/+$/, "");
    return route || "/";
  }
}

function normalizePageText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(UUID_SEGMENT, ":id")
    .replace(/\b\d+\b/g, ":id")
    .toLocaleLowerCase()
    .slice(0, 160);
}

function firstElementName(state: AppState, roles: string[]): string {
  const accepted = new Set(roles.map((role) => role.toLocaleLowerCase()));
  const element = state.elements.find((candidate) =>
    accepted.has(String(candidate.role ?? "").toLocaleLowerCase()),
  );
  return normalizePageText(element?.name);
}

/**
 * Functional identity deliberately excludes observation/crawl metadata and the
 * full DOM fingerprint. Route plus document/dialog identity preserves meaningful
 * page or modal transitions while collapsing filters and record-ID variations.
 */
export function functionalStateIdentity(state: AppState): string {
  const documentTitle = firstElementName(state, ["RootWebArea"]);
  return JSON.stringify([
    normalizeFunctionalRoute(state.url_pattern),
    documentTitle,
    firstElementName(state, ["dialog", "alertdialog"]),
  ]);
}

export function functionalStateName(state: AppState): string {
  try {
    const route = normalizeFunctionalRoute(state.url_pattern);
    const pathname = route.includes("/") ? route.slice(route.indexOf("/")) : route;
    const parts = pathname.split("/").filter(Boolean);
    const segment = parts.at(-1);
    const heading = firstElementName(state, ["heading"]);
    const documentTitle = firstElementName(state, ["RootWebArea"]);
    const routeLooksLikeLocale = !!segment && /^[a-z]{2,3}(?:-[a-z]{2})?$/i.test(segment);
    const parentSegment = parts.at(-2)?.replace(/[-_]+/g, " ");
    const detailsName = parentSegment
      ? `${parentSegment.replace(/s$/i, "")} details`
      : "Details";
    const value = !segment || routeLooksLikeLocale
      ? heading || documentTitle || "Home"
      : decodeURIComponent(segment).replace(/^:id$/, detailsName).replace(/[-_]+/g, " ");
    return value.replace(/\b\w/g, (letter) => letter.toLocaleUpperCase());
  } catch {
    return firstElementName(state, ["heading", "RootWebArea"]) || "Page";
  }
}

function elementIdentity(element: Record<string, unknown>): string {
  const locator = typeof element.locator === "object"
    ? JSON.stringify(element.locator)
    : String(element.locator ?? "");
  const rawUrl = typeof element.url === "string" ? element.url : "";
  const url = /^(?:https?:\/\/|\/)/i.test(rawUrl) ? normalizeFunctionalRoute(rawUrl) : "";
  return JSON.stringify([
    normalizePageText(element.role),
    normalizePageText(element.name),
    normalizePageText(locator),
    url,
  ]);
}

function mergeFunctionalStates(group: AppState[]): AppState {
  const ordered = [...group].sort((left, right) =>
    left.reached_via.length - right.reached_via.length
    || left.state_code.localeCompare(right.state_code)
    || left.fingerprint.localeCompare(right.fingerprint),
  );
  const representative = ordered[0];
  const elements = new Map<string, Record<string, unknown>>();
  for (const state of ordered) {
    for (const element of state.elements) {
      const key = elementIdentity(element);
      if (!elements.has(key)) elements.set(key, element);
    }
  }
  return {
    ...representative,
    reached_via: [...new Set(ordered.flatMap((state) => state.reached_via))].sort(),
    elements: [...elements.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, element]) => element),
    evidence_ref: ordered.find((state) => state.evidence_ref)?.evidence_ref ?? null,
  };
}

function primaryFlowEdges(
  nodeIds: string[],
  relationships: FlowEdge[],
  preferredRoots: Set<string>,
): FlowEdge[] {
  // Keep a single visual parent per functional state. Return navigation and
  // cycles remain in the source map/details but do not clutter the overview.
  const byPair = new Map<string, FlowEdge>();
  for (const edge of relationships) {
    if (edge.source === edge.target) continue;
    const key = JSON.stringify([edge.source, edge.target]);
    const existing = byPair.get(key);
    if (!existing || edge.id < existing.id) byPair.set(key, edge);
  }
  const candidates = [...byPair.values()].sort((a, b) => a.id.localeCompare(b.id));
  const outgoing = new Map<string, FlowEdge[]>();
  const incomingCount = new Map(nodeIds.map((id) => [id, 0]));
  for (const edge of candidates) {
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
  }
  for (const edges of outgoing.values()) edges.sort((a, b) => a.target.localeCompare(b.target));

  const reachableCount = (start: string) => {
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length) {
      for (const edge of outgoing.get(queue.shift()!) ?? []) {
        if (!seen.has(edge.target)) {
          seen.add(edge.target);
          queue.push(edge.target);
        }
      }
    }
    return seen.size;
  };
  const rootOrder = [...nodeIds].sort((a, b) =>
    Number(preferredRoots.has(b)) - Number(preferredRoots.has(a))
    || reachableCount(b) - reachableCount(a)
    || (incomingCount.get(a) ?? 0) - (incomingCount.get(b) ?? 0)
    || a.localeCompare(b),
  );
  const naturalRoots = rootOrder.filter((id) => (incomingCount.get(id) ?? 0) === 0);
  const pendingRoots = [...naturalRoots, ...rootOrder.filter((id) => !naturalRoots.includes(id))];
  const visited = new Set<string>();
  const selected: FlowEdge[] = [];
  for (const root of pendingRoots) {
    if (visited.has(root)) continue;
    visited.add(root);
    const queue = [root];
    while (queue.length) {
      const parent = queue.shift()!;
      for (const edge of outgoing.get(parent) ?? []) {
        if (visited.has(edge.target)) continue;
        visited.add(edge.target);
        selected.push(edge);
        queue.push(edge.target);
      }
    }
  }
  return selected;
}

export function layoutApplicationGraph(
  states: AppState[],
  relationships: GraphRelationship[],
  width: number,
  height: number,
) {
  const groups = new Map<string, AppState[]>();
  for (const state of states) {
    const identity = functionalStateIdentity(state);
    groups.set(identity, [...(groups.get(identity) ?? []), state]);
  }

  const unique = new Map<string, AppState>();
  const aliases = new Map<string, string>();
  const preferredRoots = new Set<string>();
  for (const [, group] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const state = mergeFunctionalStates(group);
    const id = state.id || state.state_code || state.fingerprint;
    unique.set(id, state);
    if (group.some((observation) => observation.reached_via.length === 0)) {
      preferredRoots.add(id);
    }
    for (const observation of group) {
      for (const alias of [observation.id, observation.state_code, observation.fingerprint]) {
        if (alias) aliases.set(alias, id);
      }
    }
  }

  const normalizedEdges = new Map<string, FlowEdge>();
  for (const edge of relationships) {
    const source = aliases.get(edge.source_state_id ?? edge.parent_fingerprint ?? edge.source ?? "");
    const target = aliases.get(edge.target_state_id ?? edge.child_fingerprint ?? edge.target ?? "");
    if (!source || !target || source === target) continue;
    const pair = JSON.stringify([source, target]);
    normalizedEdges.set(pair, { id: `flow:${source}->${target}`, source, target });
  }
  const edges = primaryFlowEdges(
    [...unique.keys()],
    [...normalizedEdges.values()],
    preferredRoots,
  );
  const children = new Set(edges.map((edge) => edge.target));
  const graph = new dagre.graphlib.Graph()
    .setGraph({
      rankdir: "TB",
      ranker: "network-simplex",
      nodesep: 36,
      ranksep: 64,
      edgesep: 16,
      marginx: 24,
      marginy: 24,
    })
    .setDefaultEdgeLabel(() => ({}));
  const entries = [...unique.entries()].sort(([a], [b]) => a.localeCompare(b));
  entries.forEach(([id]) => graph.setNode(id, { width, height }));
  [...edges]
    .sort((a, b) => `${a.source}:${a.target}`.localeCompare(`${b.source}:${b.target}`))
    .forEach((edge) => graph.setEdge(edge.source, edge.target));
  dagre.layout(graph);
  return {
    edges,
    nodes: entries.map(([id, state]) => ({
      id,
      width,
      height,
      position: {
        x: graph.node(id).x - width / 2,
        y: graph.node(id).y - height / 2,
      },
      data: { state, isEntry: !children.has(id) },
    })),
  };
}
