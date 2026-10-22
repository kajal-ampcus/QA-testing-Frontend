import { test, expect } from "@playwright/test";

test("execution uses the full width and preserves summary, selection and run actions", async ({ page }, testInfo) => {
  const runs = [
    { id: "passed-1", status: "COMPLETED", summary: { passed: 2 } },
    { id: "failed-1", status: "FAILED", summary: { passed: 5, failed: 1, error: 2, skipped: 1 } },
    { id: "cancel-1", status: "CANCELLED", summary: { passed: 1, skipped: 2 } },
    { id: "skipped-1", status: "COMPLETED", summary: { skipped: 3 } },
  ].map((run) => ({ ...run, generation_id: "g1", results: [], result_count: 0 }));
  let submitted: { script_ids: string[] } | undefined;
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url()).pathname;
    let json: unknown = {};
    if (url.endsWith("/executions/projects/layout")) {
      if (route.request().method() === "POST") {
        submitted = route.request().postDataJSON();
        json = { job_id: "job1", run_id: "passed-1", status: "QUEUED" };
      } else json = { runs };
    } else if (url.includes("/runs/")) {
      json = runs.find((run) => url.endsWith(run.id));
    } else if (url.includes("/generations/")) {
      json = { scripts: Array.from({ length: 30 }, (_, i) => ({
        script_id: `s${i}`, test_case_id: `t${i}`, test_case_code: `TC-${String(i).padStart(3, "0")}`,
        review_status: "REVIEWED",
      })) };
    } else if (url.includes("/test-cases/")) {
      json = Array.from({ length: 30 }, (_, i) => ({ id: `t${i}`, current: {
        title: `Check application navigation item ${i}`, steps: [],
      } }));
    } else if (url.includes("/application-maps/")) json = { states: [] };
    else if (url.includes("/jobs/")) json = { status: "COMPLETED" };
    await route.fulfill({ json });
  });
  await page.goto("/tests/execution-layout-harness.html");
  await expect(page.getByText("No LLM on this path")).toHaveCount(0);
  const summary = page.locator(".execution-run-summary").getByRole("definition");
  await expect(summary).toHaveText(["2", "2", "0", "0", "0", "0"]);
  const history = page.locator(".execution-history-card");
  const controls = page.locator(".execution-controls");
  const historyBox = (await history.boundingBox())!;
  const controlsBox = (await controls.boundingBox())!;
  expect(historyBox.y + historyBox.height).toBeLessThan(controlsBox.y);
  expect(controlsBox.width).toBeCloseTo(historyBox.width, 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole("button", { name: /All cases so far|Latest run|Run failed-1/ })).toHaveCount(0);
  await expect(page.locator(".execution-history-list")).toHaveCount(0);
  await page.getByRole("button", { name: "Collapse Other" }).click();
  await expect(page.getByRole("checkbox", { name: /TC-000/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Expand Other" }).click();
  await page.getByRole("checkbox", { name: /TC-000/ }).uncheck();
  await page.screenshot({ path: testInfo.outputPath("execution-layout.png"), fullPage: true });
  await page.getByRole("button", { name: "Run selected (29)" }).click();
  await expect.poll(() => submitted?.script_ids.length).toBe(29);
  expect(submitted?.script_ids).not.toContain("s0");
});
