import assert from "node:assert/strict";
import test from "node:test";
import type { ExecutionReportResult, ExecutionRun } from "../../types/api";
import {
  failureGroups,
  headline,
  requirementBars,
  runTrend,
  slowestTests,
  suiteFailure,
} from "./dashboardModel.ts";

function row(overrides: Partial<ExecutionReportResult> = {}): ExecutionReportResult {
  return {
    id: "1",
    test_case_code: "TC-001",
    title: "Sign in",
    requirement_code: "REQ-001",
    status: "FAILED",
    expected: "Home",
    actual: "Login",
    duration_ms: 1000,
    error_message: "TimeoutError: locator.waitFor",
    evidence: [],
    ...overrides,
  };
}

test("requirement bars group failures ahead of passes", () => {
  const bars = requirementBars([
    row({ id: "a", requirement_code: "REQ-002", status: "PASSED" }),
    row({ id: "b", requirement_code: "REQ-001", status: "FAILED" }),
    row({ id: "c", requirement_code: "REQ-001", status: "ERROR" }),
    row({ id: "d", requirement_code: "  ", status: "SKIPPED" }),
  ]);
  assert.equal(bars[0].code, "REQ-001");
  assert.equal(bars[0].failed, 2);
  assert.equal(bars.find((bar) => bar.code === "Unlinked")?.other, 1);
});

test("failure groups keep the first line and rank by count", () => {
  const groups = failureGroups([
    row({ id: "a", error_message: "TimeoutError: wait\nCall log" }),
    row({ id: "b", error_message: "TimeoutError: wait\nmore" }),
    row({ id: "c", status: "PASSED", error_message: "ignored" }),
    row({ id: "d", error_message: "Wrong password" }),
  ]);
  assert.deepEqual(groups[0], { message: "TimeoutError: wait", count: 2 });
  assert.equal(groups[1].message, "Wrong password");
});

test("slowest tests are the longest durations", () => {
  const tests = slowestTests([
    row({ id: "a", test_case_code: "TC-001", duration_ms: 400 }),
    row({ id: "b", test_case_code: "TC-002", duration_ms: 900 }),
    row({ id: "c", test_case_code: "TC-003", duration_ms: null }),
  ]);
  assert.deepEqual(
    tests.map((item) => item.code),
    ["TC-002", "TC-001"],
  );
});

test("run trend is oldest to newest and uses the summary counts", () => {
  const run = (id: string, finished: string, passed: number, failed: number): ExecutionRun => ({
    id,
    generation_id: "g",
    job_id: null,
    environment: "development",
    base_url: "https://example.test",
    run_destructive: false,
    status: "FAILED",
    summary: { passed, failed, skipped: 0, error: 0 },
    started_at: finished,
    finished_at: finished,
    created_at: finished,
    result_count: passed + failed,
  });
  const points = runTrend([
    run("new", "2026-10-05T07:58:00", 1, 1),
    run("old", "2026-10-05T07:35:00", 0, 2),
  ]);
  assert.deepEqual(
    points.map((point) => point.id),
    ["old", "new"],
  );
  assert.equal(points[0].passRate, 0);
  assert.equal(points[1].passRate, 50);
});

test("a suite timeout becomes a short failure reason", () => {
  assert.equal(
    suiteFailure("RuntimeError: TimeoutExpired: Command '['npx', 'playwright']"),
    "Playwright timed out before individual results were recorded.",
  );
});

test("headline describes an empty, clean, mixed, and stopped run", () => {
  assert.match(headline({ total: 0, passed: 0, error: 0, pass_rate: 0 }, 0), /no test results/);
  assert.match(headline({ total: 4, passed: 4, error: 0, pass_rate: 100 }, 4), /All 4/);
  assert.match(headline({ total: 4, passed: 0, error: 0, pass_rate: 0 }, 4), /None of the 4/);
  assert.match(headline({ total: 4, passed: 1, error: 0, pass_rate: 25 }, 4), /1 of 4/);
  assert.match(headline({ total: 1, passed: 0, error: 1, pass_rate: 0 }, 0), /stopped before/);
});
