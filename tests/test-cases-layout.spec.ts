import { test, expect } from "@playwright/test";
test("history label and long requirement names stay inside the card", async ({page}) => {
  await page.goto("/tests/test-cases-layout-harness.html");
  const card = page.locator(".test-card");
  const label = page.getByText("Show cases from earlier application maps", {exact:true});
  const checkbox = page.getByRole("checkbox", {name: "Show cases from earlier application maps"});
  await expect(checkbox).toBeVisible();
  const c = (await card.boundingBox())!;
  const l = (await label.boundingBox())!;
  const b = (await checkbox.boundingBox())!;
  expect(b.width).toBe(16);
  expect(Math.abs(b.y + b.height/2 - (l.y+l.height/2))).toBeLessThan(15);
  expect(l.x).toBeGreaterThan(c.x + 20);
  expect(l.x+l.width).toBeLessThanOrEqual(c.x+c.width-20);
  expect(await page.locator(".test-case-context").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await expect(page.getByText("Review the generated drafts below")).toHaveCount(0);
  await expect(page.getByText("Coverage needs attention")).toBeVisible();
  await expect(page.locator(".test-generation-details")).not.toHaveAttribute("open", "");
  await checkbox.check();
  await expect(checkbox).toBeChecked();
});
test("Excel import opens requirement selection in the all-requirements view", async ({page}) => {
  await page.goto("/tests/test-cases-layout-harness.html?multi");
  const button = page.getByRole("button", {name: "Import Excel", exact:true});
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  await button.click();
  await page.getByLabel("Import into requirement").selectOption("r2");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", {name: "Choose Excel file"}).click();
  await chooser;
});
test("no empty draft or generation notice is shown", async ({page}) => {
  await page.goto("/tests/test-cases-layout-harness.html?clean");
  await expect(page.locator(".test-card")).toBeVisible();
  await expect(page.locator(".test-generation-notes")).toHaveCount(0);
});
