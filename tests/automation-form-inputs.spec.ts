import { test, expect } from "@playwright/test";

test("automation explorer shows resolved Feedback JSON and refreshes its generated folder", async ({ page }) => {
  let refreshed = false;
  await page.route("**/api/v1/**", async route => {
    const url = route.request().url();
    if (url.includes("standalone-inputs")) {
      expect(url).toContain("include_credentials=false");
      refreshed = true;
      return route.fulfill({ status: 204 });
    }
    if (url.endsWith("form-inputs")) return route.fulfill({ json: {
      path: "credentials/test-data.json", saved_fields: 1, missing_fields: 1,
      content: JSON.stringify({ schema_version: 2, test_cases: { "TC-012": { version: 1, inputs: {
        Name: { mode: "value", value: "Saved Feedback Name", source: "assigned", binding: "TC-012:v1:step2" },
        Subject: { mode: "value", value: null, source: "missing", binding: "TC-012:v1:step3" },
      } } } }, null, 2),
    } });
    if (url.endsWith("/generations/g1")) return route.fulfill({ json: {
      generation_id: "g1", scripts: [], blocked: [], file_tree: ["credentials/login-credentials.example.json"],
      sources: [{ path: "credentials/login-credentials.example.json", content: '{"accounts":{}}' }],
      lint: {}, selector_summary: {}, verification: { status: "PASSED", tsc: "PASSED", playwright_list: "PASSED" },
      approval_ids: [], review_status: "PENDING_APPROVAL", risk_level: "REVIEW", approval_required: true, label: "Generated suite",
    } });
    return route.fulfill({ json: url.includes("/automation/") ? { generations: [{ generation_id: "g1", script_count: 1, review_status: "PENDING_APPROVAL" }] } : [] });
  });
  await page.goto("/tests/automation-sections-harness.html");
  await expect(page.getByText("Form test data: 1 saved inputs, 1 missing inputs")).toBeVisible();
  await page.getByRole("button", { name: "View saved form inputs" }).click();
  const preview = page.getByRole("textbox", { name: "Read-only form inputs for credentials/test-data.json" });
  await expect(preview).toHaveValue(/Saved Feedback Name/);
  await expect(preview).toHaveAttribute("readonly", "");
  await expect(preview).toHaveValue(/TC-012/);
  await page.getByRole("button", { name: "Refresh inputs in generated folder" }).click();
  await expect(page.getByText(/Current inputs saved to the generated credentials folder/)).toBeVisible();
  expect(refreshed).toBe(true);
});
