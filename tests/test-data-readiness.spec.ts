import { test, expect } from "@playwright/test";

const field = { test_case_id: "case1", test_case_code: "TC-001", field_code: "STATE-004/EL-052",
  field_key: "name", field_name: "Name", field_type: "text", form_group: "feedback",
  scenario: "POSITIVE", value: null, missing: true, source: "missing", runtime_only: false, fixture_id: null };
const credential = { ...field, field_code: "STATE-001/EL-001", field_name: "Password", runtime_only: true, missing: false, source: "runtime" };

async function mock(page: import("@playwright/test").Page, rows: object[]) {
  await page.route("**/api/v1/**", async route => {
    const url = route.request().url();
    await route.fulfill({ json: url.includes("smart-template") ? { case_count: 1, rows }
      : /\/projects\/p$/.test(url) ? { id: "p", name: "CEP" } : [] });
  });
}

test("generation prompts for missing form data and links to a separate form flow", async ({ page }) => {
  await mock(page, [field, credential]);
  await page.goto("/tests/test-data-harness.html");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("1 test case needs input values (1 missing)");
  await dialog.getByRole("button", { name: "Review test cases first" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Missing test data" })).toBeVisible();
  await page.getByRole("link", { name: "Add test data", exact: true }).click();
  await expect(page).toHaveURL(/section=forms/);
  await expect(page.getByRole("heading", { name: "Form test data", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Supply missing value" })).toBeVisible();
  await page.getByLabel("Show only missing values").uncheck();
  await expect(page.getByRole("cell", { name: /Password/ })).toHaveCount(0);
  await page.getByRole("tab", { name: /Login Credentials/ }).click();
  await expect(page).toHaveURL(/section=credentials/);
  await expect(page.getByRole("heading", { name: "Login credentials", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Test data requirements" })).toHaveCount(0);
});

test("ready data does not prompt and login runtime inputs are excluded", async ({ page }) => {
  await mock(page, [{ ...field, missing: false, source: "fixture" }, credential]);
  await page.goto("/tests/test-data-harness.html");
  await expect(page.getByRole("status")).toContainText("Test data ready");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("no mapped form inputs is distinct from data ready", async ({ page }) => {
  await mock(page, [credential]);
  await page.goto("/tests/test-data-harness.html");
  await expect(page.getByRole("status")).toContainText("no mapped form-input requirements");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
