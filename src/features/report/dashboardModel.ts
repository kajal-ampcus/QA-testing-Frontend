import type { ExecutionReportResult, ExecutionRun } from "../../types/api";

export const STATUS_COLORS = {
  passed: "#277456",
  failed: "#b24e41",
  skipped: "#9b6b26",
  error: "#5c6b73",
} as const;

export type StatusKey = keyof typeof STATUS_COLORS;

export interface StatusSlice {
  key: StatusKey;
  label: string;
  value: number;
  color: string;
}

export function statusSlices(counts: {
  passed: number;
  failed: number;
  skipped: number;
  error: number;
}): StatusSlice[] {
  return [
    { key: "passed", label: "Passed", value: counts.passed, color: STATUS_COLORS.passed },
    { key: "failed", label: "Failed", value: counts.failed, color: STATUS_COLORS.failed },
    { key: "skipped", label: "Skipped", value: counts.skipped, color: STATUS_COLORS.skipped },
    { key: "error", label: "Error", value: counts.error, color: STATUS_COLORS.error },
  ];
}

export interface RequirementBar {
  code: string;
  passed: number;
  failed: number;
  other: number;
  total: number;
}

function outcome(status: string): "passed" | "failed" | "other" {
  const value = status.toUpperCase();
  if (value === "PASSED") return "passed";
  if (value === "FAILED" || value === "ERROR") return "failed";
  return "other";
}

export function requirementBars(results: ExecutionReportResult[]): RequirementBar[] {
  const grouped = new Map<string, RequirementBar>();
  for (const row of results) {
    const code = row.requirement_code.trim() || "Unlinked";
    const bar = grouped.get(code) ?? { code, passed: 0, failed: 0, other: 0, total: 0 };
    bar[outcome(row.status)] += 1;
    bar.total += 1;
    grouped.set(code, bar);
  }
  return [...grouped.values()].sort((left, right) => right.failed - left.failed || right.total - left.total);
}

export interface DurationBar {
  code: string;
  title: string;
  duration: number;
  failed: boolean;
}

export function slowestTests(results: ExecutionReportResult[], limit = 6): DurationBar[] {
  return results
    .filter((row) => (row.duration_ms ?? 0) > 0)
    .map((row) => ({
      code: row.test_case_code,
      title: row.title,
      duration: row.duration_ms ?? 0,
      failed: outcome(row.status) === "failed",
    }))
    .sort((left, right) => right.duration - left.duration)
    .slice(0, limit);
}

export interface FailureGroup {
  message: string;
  count: number;
}

export function failureGroups(results: ExecutionReportResult[], limit = 5): FailureGroup[] {
  const grouped = new Map<string, number>();
  for (const row of results) {
    if (outcome(row.status) !== "failed") continue;
    const message = (row.error_message || "No error message").split("\n")[0].trim().slice(0, 140);
    const key = message || "No error message";
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }
  return [...grouped.entries()]
    .map(([message, count]) => ({ message, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, limit);
}

export interface RunPoint {
  id: string;
  label: string;
  passRate: number;
  total: number;
}

function summaryCount(summary: Record<string, number> | undefined, key: string): number {
  const value = Number(summary?.[key]);
  return Number.isFinite(value) ? value : 0;
}

export function runTrend(runs: ExecutionRun[]): RunPoint[] {
  return [...runs]
    .sort((left, right) =>
      (left.finished_at || left.created_at || "").localeCompare(right.finished_at || right.created_at || ""),
    )
    .slice(-8)
    .map((run) => {
      const passed = summaryCount(run.summary, "passed");
      const total =
        passed +
        summaryCount(run.summary, "failed") +
        summaryCount(run.summary, "skipped") +
        summaryCount(run.summary, "error");
      const stamp = (run.finished_at || run.created_at || "").slice(5, 16).replace("T", " ");
      return {
        id: run.id,
        label: stamp || "Run",
        passRate: total ? Math.round((passed / total) * 1000) / 10 : 0,
        total,
      };
    });
}

export function headline(
  counts: {
    total: number;
    passed: number;
    error: number;
    pass_rate: number;
  },
  resultCount: number,
): string {
  if (resultCount === 0 && counts.error > 0) {
    return "The run stopped before individual test results were recorded.";
  }
  if (!counts.total) return "This run has no test results.";
  if (counts.passed === counts.total) return `All ${counts.total} tests passed.`;
  if (counts.passed === 0) return `None of the ${counts.total} tests passed.`;
  return `${counts.passed} of ${counts.total} tests passed (${counts.pass_rate}%).`;
}

export function suiteFailure(detail: string): string {
  const line = detail.split("\n").map((item) => item.trim()).find(Boolean) || "";
  if (/TimeoutExpired/i.test(line)) {
    return "Playwright timed out before individual results were recorded.";
  }
  return line.replace(/^RuntimeError:\s*/, "").slice(0, 180);
}
