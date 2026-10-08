export type ShotFilter = "all" | "new" | "changed" | "duplicate" | "needs_review";

export interface Shot {
  id: string;
  src: string;
  fingerprint: string;
  pageKey: string;
  label: string;
  flow: string;
  sha256: string | null;
  versionStatus: "new" | "changed" | "unchanged" | "unknown";
  reviewed: boolean;
}

export interface ShotGroup {
  key: string;
  title: string;
  shots: Shot[];
}

interface DeltaItem {
  fingerprint?: string;
  page_key?: string;
  url_pattern?: string;
  evidence_ref?: string | null;
  label?: string;
}

interface GalleryInput {
  states?: Array<{
    fingerprint: string;
    url_pattern: string;
    reached_via?: string[];
    evidence_ref?: string | null;
    evidence_sha256?: string | null;
  }>;
  coverage?: Record<string, unknown>;
  diagnostic?: {
    screenshot_ref?: string | null;
    failed_actions?: Array<{ screenshot_ref?: string | null; action?: string }>;
  } | null;
  inputRequests?: Array<{
    id: string;
    page_title?: string;
    page_url?: string;
    screenshot_ref?: string | null;
  }>;
  reviewed?: string[];
  previousStates?: Array<{
    fingerprint: string;
    url_pattern: string;
    evidence_ref?: string | null;
    evidence_sha256?: string | null;
  }>;
}

function statusFor(
  fingerprint: string,
  pageKey: string,
  delta: Record<string, DeltaItem[] | undefined>,
): Shot["versionStatus"] {
  for (const status of ["new", "changed", "unchanged"] as const) {
    if ((delta[status] || []).some((item) => item.fingerprint === fingerprint)) return status;
  }
  if ((delta.changed || []).some((item) => (item.page_key || item.url_pattern) === pageKey)) {
    return "changed";
  }
  return "unknown";
}

export function collectShots(input: GalleryInput): Shot[] {
  const delta = (input.coverage?.screen_delta || {}) as Record<string, DeltaItem[] | undefined>;
  const reviewed = new Set(input.reviewed || []);
  const shots: Shot[] = [];
  const push = (shot: Omit<Shot, "versionStatus" | "reviewed"> & { versionStatus?: Shot["versionStatus"] }) => {
    if (!shot.src) return;
    if (shots.some((item) => item.src === shot.src && item.fingerprint === shot.fingerprint)) return;
    const versionStatus = shot.versionStatus || statusFor(shot.fingerprint, shot.pageKey, delta);
    shots.push({
      ...shot,
      versionStatus,
      reviewed: reviewed.has(shot.fingerprint),
    });
  };

  for (const state of input.states || []) {
    if (!state.evidence_ref) continue;
    push({
      id: state.fingerprint,
      src: state.evidence_ref,
      fingerprint: state.fingerprint,
      pageKey: state.url_pattern,
      label: state.url_pattern,
      flow: (state.reached_via || []).slice(-1)[0] || "Entry",
      sha256: state.evidence_sha256 || null,
    });
  }
  if (input.diagnostic?.screenshot_ref) {
    push({
      id: `diagnostic:${input.diagnostic.screenshot_ref}`,
      src: input.diagnostic.screenshot_ref,
      fingerprint: "diagnostic",
      pageKey: "Diagnostic",
      label: "Discovery stopped",
      flow: "Diagnostic",
      sha256: null,
      versionStatus: "unknown",
    });
  }
  for (const [index, action] of (input.diagnostic?.failed_actions || []).entries()) {
    if (!action.screenshot_ref) continue;
    push({
      id: `failed:${index}:${action.screenshot_ref}`,
      src: action.screenshot_ref,
      fingerprint: `failed:${index}`,
      pageKey: "Failed actions",
      label: action.action || `Failed action ${index + 1}`,
      flow: "Failed action",
      sha256: null,
      versionStatus: "unknown",
    });
  }
  for (const request of input.inputRequests || []) {
    if (!request.screenshot_ref) continue;
    push({
      id: request.id,
      src: request.screenshot_ref,
      fingerprint: request.id,
      pageKey: request.page_url || "Input",
      label: request.page_title || "Input request",
      flow: "Input request",
      sha256: null,
      versionStatus: "unknown",
    });
  }
  for (const state of input.previousStates || []) {
    if (!state.evidence_ref) continue;
    push({
      id: `previous:${state.fingerprint}`,
      src: state.evidence_ref,
      fingerprint: state.fingerprint,
      pageKey: state.url_pattern,
      label: `${state.url_pattern} (previous)`,
      flow: "Previous version",
      sha256: state.evidence_sha256 || null,
      versionStatus: "unchanged",
    });
  }
  return shots;
}

export function duplicateIds(shots: Shot[]): Set<string> {
  const groups = new Map<string, Shot[]>();
  for (const shot of shots) {
    if (!shot.sha256) continue;
    const key = `${shot.sha256}:${shot.fingerprint}`;
    groups.set(key, [...(groups.get(key) || []), shot]);
  }
  const duplicates = new Set<string>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (const shot of group.slice(1)) duplicates.add(shot.id);
  }
  return duplicates;
}

export function filterShots(shots: Shot[], filter: ShotFilter, duplicates: Set<string>): Shot[] {
  if (filter === "all") return shots;
  if (filter === "duplicate") return shots.filter((shot) => duplicates.has(shot.id));
  if (filter === "needs_review") {
    return shots.filter((shot) => !shot.reviewed && shot.versionStatus !== "unchanged");
  }
  if (filter === "new") return shots.filter((shot) => shot.versionStatus === "new");
  return shots.filter((shot) => shot.versionStatus === "changed");
}

export function groupShots(shots: Shot[], by: "page" | "state" | "flow"): ShotGroup[] {
  const groups = new Map<string, Shot[]>();
  for (const shot of shots) {
    const key = by === "page" ? shot.pageKey : by === "flow" ? shot.flow : shot.fingerprint;
    groups.set(key, [...(groups.get(key) || []), shot]);
  }
  return [...groups.entries()].map(([key, items]) => ({
    key,
    title: by === "state" ? items[0]?.label || key : key,
    shots: items,
  }));
}

export const GALLERY_PAGE_SIZE = 24;
