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

export type FlowEdge = {
  id: string;
  source: string;
  target: string;
  action?: string;
};

const UUID_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LONG_HEX_SEGMENT = /^[0-9a-f]{16,}$/i;
const LONG_IDENTIFIER_SEGMENT = /^(?=.*\d)[a-z0-9_-]{20,}$/i;

function normalizeDynamicSegment(segment: string): string {
  if (/^\d+$/.test(segment)) return ":id";
  if (UUID_SEGMENT.test(segment)) return ":id";
  if (LONG_HEX_SEGMENT.test(segment)) return ":id";
  if (LONG_IDENTIFIER_SEGMENT.test(segment)) return ":id";
  return segment;
}

const CHROME_LABEL =
  /^(?:menu|menus|navigation|nav|sidebar|drawer|toolbar|header|footer|logo|toggle|hamburger|open menu|close menu|main menu|more|options|account menu|user menu)$/i;

function isChromeLabel(value: string): boolean {
  return CHROME_LABEL.test(value.trim());
}

function cleanDocumentTitle(value: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.split(/\s*(?:\||•|–|—)\s*/)[0]?.trim() || text;
}

/** A stable route identity that ignores filters and concrete record IDs. SPA hashes stay. */
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
    const hash = url.hash;
    const hashed =
      hash.startsWith("#/") || hash.startsWith("#!/")
        ? "#" +
          hash
            .slice(1)
            .split("/")
            .map((segment) =>
              normalizeDynamicSegment(decodeURIComponent(segment || "")),
            )
            .join("/")
        : "";
    const combined = `${route}${hashed}`;
    return absolute ? `${url.host.toLowerCase()}${combined}` : combined;
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

function firstElementName(
  state: AppState,
  roles: string[],
  skipChrome = false,
): string {
  const accepted = new Set(roles.map((role) => role.toLocaleLowerCase()));
  const element = state.elements.find((candidate) => {
    const name = String(candidate.name ?? "").trim();
    if (
      !accepted.has(String(candidate.role ?? "").toLocaleLowerCase()) ||
      !name
    ) {
      return false;
    }
    return !skipChrome || !isChromeLabel(name);
  });
  return cleanDocumentTitle(normalizePageText(element?.name));
}

const CATALOG_ROOTS = new Set([
  "menu",
  "menus",
  "catalog",
  "products",
  "items",
  "shop",
  "store",
]);

export function pageSectionRoute(route: string): string {
  const normalized = normalizeFunctionalRoute(route);
  const [pathPart, hashPart = ""] = normalized.split("#");
  let parts = (pathPart || "/").split("/").filter(Boolean);
  if (!parts.length && hashPart) {
    parts = hashPart.replace(/^!/, "").split("/").filter(Boolean);
  }
  if (!parts.length) return "/";
  if (parts[0] && CATALOG_ROOTS.has(parts[0].toLowerCase()))
    return `/${parts[0]}`;
  return `/${parts.join("/")}`;
}

/**
 * Page-level identity: Menu items collapse into Menu; Dashboard/Users stay nested pages.
 */
export function functionalStateIdentity(state: AppState): string {
  const route = pageSectionRoute(state.url_pattern);
  const dialog = firstElementName(state, ["dialog", "alertdialog"], true);
  if (route === "/") {
    const heading = firstElementName(state, ["heading"], true);
    const documentTitle = firstElementName(state, ["RootWebArea"], true);
    return JSON.stringify([route, heading || documentTitle || "home", dialog]);
  }
  return JSON.stringify([route, dialog]);
}

export function functionalStateName(state: AppState): string {
  try {
    const section = pageSectionRoute(state.url_pattern);
    const heading = firstElementName(state, ["heading"], true);
    const documentTitle = firstElementName(state, ["RootWebArea"], true);
    if (section !== "/") {
      const parts = section.split("/").filter(Boolean);
      const segment = parts.at(-1)?.replace(/[-_]+/g, " ") || "";
      const parentSegment = parts.at(-2)?.replace(/[-_]+/g, " ");
      const detailsName = parentSegment
        ? `${parentSegment.replace(/s$/i, "")} details`
        : "Details";
      const fromRoute = segment.replace(/^:id$/, detailsName);
      const value = fromRoute || heading || documentTitle || "Home";
      return value.replace(/\b\w/g, (letter) => letter.toLocaleUpperCase());
    }
    const value = heading || documentTitle || "Home";
    return value.replace(/\b\w/g, (letter) => letter.toLocaleUpperCase());
  } catch {
    return firstElementName(state, ["heading", "RootWebArea"], true) || "Page";
  }
}

function elementIdentity(element: Record<string, unknown>): string {
  const locator =
    typeof element.locator === "object"
      ? JSON.stringify(element.locator)
      : String(element.locator ?? "");
  const rawUrl = typeof element.url === "string" ? element.url : "";
  const url = /^(?:https?:\/\/|\/)/i.test(rawUrl)
    ? normalizeFunctionalRoute(rawUrl)
    : "";
  return JSON.stringify([
    normalizePageText(element.role),
    normalizePageText(element.name),
    normalizePageText(locator),
    url,
  ]);
}

function mergeFunctionalStates(group: AppState[]): AppState {
  const ordered = [...group].sort(
    (left, right) =>
      left.reached_via.length - right.reached_via.length ||
      left.state_code.localeCompare(right.state_code) ||
      left.fingerprint.localeCompare(right.fingerprint),
  );
  const representative = ordered[0];
  const elements = new Map<string, Record<string, unknown>>();
  for (const state of ordered) {
    for (const element of state.elements) {
      const key = elementIdentity(element);
      if (!elements.has(key)) elements.set(key, element);
    }
  }
  const reachedVia: string[] = [];
  const seenReached = new Set<string>();
  for (const state of ordered) {
    for (const step of state.reached_via) {
      if (seenReached.has(step)) continue;
      seenReached.add(step);
      reachedVia.push(step);
    }
  }
  return {
    ...representative,
    reached_via: reachedVia,
    elements: [...elements.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, element]) => element),
    evidence_ref:
      ordered.find((state) => state.evidence_ref)?.evidence_ref ?? null,
  };
}

const AUTH_ACTION =
  /(?:^authenticate\b|\brole=authentication\b|\b(?:log\s*in|sign\s*in|sign\s*on)\b)/i;
const RETURN_ACTION =
  /\b(?:back(?:\s+to)?|return|continue\s+(?:ordering|shopping)|go\s+back)\b/i;
const LOGIN_HINT = /\b(?:log[-_]?in|sign[-_]?in|sign[-_]?on)\b/i;
const RECOVERY_HINT = /\b(?:forgot|reset|recover)\b/i;
const REGISTER_HINT = /\b(?:register|sign[-_]?up|create\s+account)\b/i;

function discoveryIndex(state: AppState): number {
  const match = String(state.state_code ?? "").match(/(\d+)\s*$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function pageText(state: AppState): string {
  return `${state.url_pattern} ${functionalStateName(state)}`.toLowerCase();
}

function isLoginPage(state: AppState): boolean {
  const text = pageText(state);
  return (
    LOGIN_HINT.test(text) &&
    !RECOVERY_HINT.test(text) &&
    !REGISTER_HINT.test(text)
  );
}

function isAuthSidePage(state: AppState): boolean {
  const text = pageText(state);
  return RECOVERY_HINT.test(text) || REGISTER_HINT.test(text);
}

function isAuthAction(action: string | undefined): boolean {
  return Boolean(action && AUTH_ACTION.test(action));
}

function isReturnAction(action: string | undefined): boolean {
  return Boolean(action && RETURN_ACTION.test(action));
}

function preferAction(
  current: string | undefined,
  incoming: string | undefined,
): string | undefined {
  if (isAuthAction(incoming) && !isAuthAction(current)) return incoming;
  if (isReturnAction(current) && incoming && !isReturnAction(incoming))
    return incoming;
  return current ?? incoming;
}

function compareDiscovery(
  left: AppState | undefined,
  right: AppState | undefined,
): number {
  const leftIndex = left ? discoveryIndex(left) : Number.MAX_SAFE_INTEGER;
  const rightIndex = right ? discoveryIndex(right) : Number.MAX_SAFE_INTEGER;
  return (
    leftIndex - rightIndex ||
    (left?.state_code ?? "").localeCompare(right?.state_code ?? "") ||
    (left?.fingerprint ?? "").localeCompare(right?.fingerprint ?? "")
  );
}

function pickLoginId(
  unique: Map<string, AppState>,
  preferredRoots: Set<string>,
): string | undefined {
  const ranked = [...unique.keys()].sort(
    (left, right) =>
      Number(preferredRoots.has(right)) - Number(preferredRoots.has(left)) ||
      Number(isLoginPage(unique.get(right)!)) -
        Number(isLoginPage(unique.get(left)!)) ||
      compareDiscovery(unique.get(left), unique.get(right)),
  );
  return (
    ranked.find((id) => isLoginPage(unique.get(id)!)) ??
    ranked.find((id) => preferredRoots.has(id))
  );
}

function pickLandingId(
  unique: Map<string, AppState>,
  loginId: string | undefined,
): string | undefined {
  const landed = [...unique.entries()]
    .filter(([id, state]) => {
      if (id === loginId || isAuthSidePage(state) || isLoginPage(state))
        return false;
      return isAuthAction(state.reached_via[0]);
    })
    .sort(
      ([, left], [, right]) =>
        left.reached_via.length - right.reached_via.length ||
        compareDiscovery(left, right),
    );
  return landed[0]?.[0];
}

function pickRootId(
  unique: Map<string, AppState>,
  preferredRoots: Set<string>,
  loginId: string | undefined,
): string | undefined {
  if (loginId && preferredRoots.has(loginId)) return loginId;
  const preferred = [...preferredRoots].sort(
    (left, right) =>
      Number(isLoginPage(unique.get(right)!)) -
        Number(isLoginPage(unique.get(left)!)) ||
      compareDiscovery(unique.get(left), unique.get(right)),
  );
  if (preferred.length) return preferred[0];
  if (loginId) return loginId;
  return [...unique.keys()].sort((left, right) =>
    compareDiscovery(unique.get(left), unique.get(right)),
  )[0];
}

function parentScore(options: {
  parentId: string;
  childId: string;
  action: string | undefined;
  loginId: string | undefined;
  landingId: string | undefined;
  unique: Map<string, AppState>;
}): number {
  const child = options.unique.get(options.childId);
  let score = 0;
  if (
    isAuthAction(options.action) ||
    (options.parentId === options.loginId &&
      options.childId === options.landingId)
  ) {
    score += 1000;
  }
  if (options.parentId === options.landingId) score += 400;
  if (options.parentId === options.loginId && child && isAuthSidePage(child))
    score += 500;
  if (
    options.parentId === options.loginId &&
    options.childId !== options.landingId &&
    !(child && isAuthSidePage(child))
  ) {
    score -= 250;
  }
  if (isReturnAction(options.action)) score -= 800;
  score -= discoveryIndex(options.unique.get(options.parentId)!) * 0.01;
  score -= discoveryIndex(options.unique.get(options.childId)!) * 0.001;
  return score;
}

function primaryFlowEdges(
  unique: Map<string, AppState>,
  relationships: FlowEdge[],
  preferredRoots: Set<string>,
): FlowEdge[] {
  const byPair = new Map<string, FlowEdge>();
  for (const edge of relationships) {
    if (edge.source === edge.target) continue;
    const key = JSON.stringify([edge.source, edge.target]);
    const existing = byPair.get(key);
    if (!existing) {
      byPair.set(key, edge);
      continue;
    }
    const action = preferAction(existing.action, edge.action);
    if (
      !existing.action ||
      action !== existing.action ||
      edge.id < existing.id
    ) {
      byPair.set(key, { ...existing, ...edge, action });
    }
  }

  const loginId = pickLoginId(unique, preferredRoots);
  const landingId = pickLandingId(unique, loginId);
  if (loginId && landingId && loginId !== landingId) {
    const pair = JSON.stringify([loginId, landingId]);
    const existing = byPair.get(pair);
    if (!existing || !isAuthAction(existing.action)) {
      byPair.set(pair, {
        id: `flow:${loginId}->${landingId}`,
        source: loginId,
        target: landingId,
        action: "authenticate",
      });
    }
  }

  const outgoing = new Map<string, FlowEdge[]>();
  const incoming = new Map<string, FlowEdge[]>();
  for (const edge of byPair.values()) {
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge]);
  }

  const sortOutgoing = (edges: FlowEdge[]) =>
    [...edges].sort(
      (left, right) =>
        Number(isReturnAction(left.action)) -
          Number(isReturnAction(right.action)) ||
        compareDiscovery(unique.get(left.target), unique.get(right.target)) ||
        left.target.localeCompare(right.target),
    );

  const rootId = pickRootId(unique, preferredRoots, loginId);
  if (!rootId) return [];

  const visited = new Set<string>([rootId]);
  const selected: FlowEdge[] = [];
  const queue = [rootId];

  const attach = (edge: FlowEdge) => {
    if (visited.has(edge.target)) return false;
    visited.add(edge.target);
    selected.push(edge);
    queue.push(edge.target);
    return true;
  };

  while (queue.length) {
    const parent = queue.shift()!;
    for (const edge of sortOutgoing(outgoing.get(parent) ?? [])) {
      attach(edge);
    }
  }

  const remaining = () => [...unique.keys()].filter((id) => !visited.has(id));

  const bestIncomingFromTree = (childId: string): FlowEdge | undefined => {
    const options = incoming.get(childId) ?? [];
    let best: { edge: FlowEdge; score: number } | undefined;
    for (const edge of options) {
      if (!visited.has(edge.source) || visited.has(edge.target)) continue;
      const score = parentScore({
        parentId: edge.source,
        childId: edge.target,
        action: edge.action,
        loginId,
        landingId,
        unique,
      });
      if (!best || score > best.score) best = { edge, score };
    }
    return best?.edge;
  };

  while (remaining().length) {
    let best: { edge: FlowEdge; score: number } | undefined;
    for (const childId of remaining()) {
      const edge = bestIncomingFromTree(childId);
      if (!edge) continue;
      const score = parentScore({
        parentId: edge.source,
        childId: edge.target,
        action: edge.action,
        loginId,
        landingId,
        unique,
      });
      if (!best || score > best.score) best = { edge, score };
    }
    if (best) {
      attach(best.edge);
      while (queue.length) {
        const parent = queue.shift()!;
        for (const edge of sortOutgoing(outgoing.get(parent) ?? []))
          attach(edge);
      }
      continue;
    }

    const leftover = remaining().sort((left, right) =>
      compareDiscovery(unique.get(left), unique.get(right)),
    );
    const landingPending = leftover.find((id) => id === landingId);
    if (landingPending && loginId && visited.has(loginId)) {
      attach({
        id: `flow:${loginId}->${landingPending}`,
        source: loginId,
        target: landingPending,
        action: "authenticate",
      });
      continue;
    }

    const publicEntry = leftover.find((id) => {
      if (!preferredRoots.has(id)) return false;
      const connected = [
        ...(outgoing.get(id) ?? []),
        ...(incoming.get(id) ?? []),
      ];
      return connected.every(
        (edge) => !visited.has(edge.source) && !visited.has(edge.target),
      );
    });
    if (publicEntry) {
      visited.add(publicEntry);
      queue.push(publicEntry);
      while (queue.length) {
        const parent = queue.shift()!;
        for (const edge of sortOutgoing(outgoing.get(parent) ?? []))
          attach(edge);
      }
      continue;
    }

    const childId = leftover[0];
    const parentId = landingId && visited.has(landingId) ? landingId : rootId;
    if (!childId || parentId === childId) break;
    attach({
      id: `flow:${parentId}->${childId}`,
      source: parentId,
      target: childId,
      action: "flow",
    });
  }

  return selected.sort(
    (left, right) =>
      compareDiscovery(unique.get(left.source), unique.get(right.source)) ||
      compareDiscovery(unique.get(left.target), unique.get(right.target)) ||
      left.id.localeCompare(right.id),
  );
}

function groupedStates(states: AppState[]): {
  unique: Map<string, AppState>;
  aliases: Map<string, string>;
  preferredRoots: Set<string>;
} {
  const groups = new Map<string, AppState[]>();
  for (const state of states) {
    const identity = functionalStateIdentity(state);
    groups.set(identity, [...(groups.get(identity) ?? []), state]);
  }

  const unique = new Map<string, AppState>();
  const aliases = new Map<string, string>();
  const preferredRoots = new Set<string>();
  for (const [, group] of [...groups.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const state = mergeFunctionalStates(group);
    const id = state.id || state.state_code || state.fingerprint;
    unique.set(id, state);
    if (group.some((observation) => observation.reached_via.length === 0)) {
      preferredRoots.add(id);
    }
    for (const observation of group) {
      for (const alias of [
        observation.id,
        observation.state_code,
        observation.fingerprint,
      ]) {
        if (alias) aliases.set(alias, id);
      }
    }
  }
  return { unique, aliases, preferredRoots };
}

export function selectApplicationFlowTree(
  states: AppState[],
  relationships: GraphRelationship[],
): { nodes: Map<string, AppState>; edges: FlowEdge[] } {
  const { unique, aliases, preferredRoots } = groupedStates(states);
  const normalizedEdges = new Map<string, FlowEdge>();
  for (const edge of relationships) {
    const source = aliases.get(
      edge.source_state_id ?? edge.parent_fingerprint ?? edge.source ?? "",
    );
    const target = aliases.get(
      edge.target_state_id ?? edge.child_fingerprint ?? edge.target ?? "",
    );
    if (!source || !target || source === target) continue;
    const action = edge.action ?? edge.label;
    const pair = JSON.stringify([source, target]);
    const existing = normalizedEdges.get(pair);
    normalizedEdges.set(pair, {
      id: `flow:${source}->${target}`,
      source,
      target,
      action: preferAction(existing?.action, action),
    });
  }
  return {
    nodes: unique,
    edges: primaryFlowEdges(
      unique,
      [...normalizedEdges.values()],
      preferredRoots,
    ),
  };
}

export function layoutApplicationGraph(
  states: AppState[],
  relationships: GraphRelationship[],
  width: number,
  height: number,
) {
  const { nodes: unique, edges } = selectApplicationFlowTree(
    states,
    relationships,
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
  const entries = [...unique.entries()].sort(([, left], [, right]) =>
    compareDiscovery(left, right),
  );
  entries.forEach(([id]) => graph.setNode(id, { width, height }));
  edges.forEach((edge) => graph.setEdge(edge.source, edge.target));
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
