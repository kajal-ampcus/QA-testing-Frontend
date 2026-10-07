import type { AppMap, TestCase } from "../../types/api";

const NAMED_FLOWS: Record<string, string> = {
  login: "Login",
  "sign-in": "Login",
  signin: "Login",
  register: "Registration",
  registration: "Registration",
  signup: "Registration",
  "sign-up": "Registration",
  dashboard: "Dashboard",
  home: "Dashboard",
};

const LEADING_FLOWS = ["Login", "Registration", "Dashboard"];

export function isRunnableReview(status: string): boolean {
  return status === "REVIEWED" || status === "APPROVED";
}

export function flowNameFromUrl(urlPattern: string | null | undefined): string {
  const segments = pathSegments(urlPattern);
  if (segments.length === 0) return "Other";
  if (segments[0].length === 2 && /^[a-z]{2}$/i.test(segments[0])) segments.shift();
  const segment = segments.at(-1);
  if (!segment) return "Other";
  const slug = segment.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return NAMED_FLOWS[slug] ?? titleCase(segment);
}

export function flowNameForCase(
  test: Pick<TestCase, "current"> | undefined,
  map?: AppMap | null,
): string {
  const stateCode = firstStateCode(test);
  if (!stateCode || !map) return "Other";
  const state = map.states.find((item) => item.state_code === stateCode);
  return flowNameFromUrl(state?.url_pattern);
}

export function compareFlows(left: string, right: string): number {
  if (left === right) return 0;
  if (left === "Other") return 1;
  if (right === "Other") return -1;
  const leftRank = LEADING_FLOWS.indexOf(left);
  const rightRank = LEADING_FLOWS.indexOf(right);
  if (leftRank !== -1 || rightRank !== -1) {
    if (leftRank === -1) return 1;
    if (rightRank === -1) return -1;
    return leftRank - rightRank;
  }
  return left.localeCompare(right);
}

export function groupByFlow<T>(
  items: T[],
  flowOf: (item: T) => string,
): { flow: string; items: T[] }[] {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const flow = flowOf(item);
    const list = buckets.get(flow);
    if (list) list.push(item);
    else buckets.set(flow, [item]);
  }
  return [...buckets.entries()]
    .sort(([left], [right]) => compareFlows(left, right))
    .map(([flow, grouped]) => ({ flow, items: grouped }));
}

function firstStateCode(test: Pick<TestCase, "current"> | undefined): string {
  for (const step of test?.current.steps ?? []) {
    const stateCode = step.target?.state_code;
    if (stateCode) return stateCode;
  }
  return "";
}

function pathSegments(urlPattern: string | null | undefined): string[] {
  const path = pathOf(urlPattern);
  return path.split("/").filter(Boolean);
}

function pathOf(urlPattern: string | null | undefined): string {
  const raw = (urlPattern || "").trim();
  if (!raw) return "";
  const withoutQuery = raw.split("?")[0] ?? "";
  if (withoutQuery.includes("://")) {
    try {
      return new URL(withoutQuery).pathname || "/";
    } catch {
      return withoutQuery;
    }
  }
  return withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
}

function titleCase(segment: string): string {
  const words = segment
    .replace(/[_+]+/g, "-")
    .split("-")
    .map((word) => word.replace(/[^a-z0-9]/gi, ""))
    .filter(Boolean);
  if (words.length === 0) return "Other";
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
