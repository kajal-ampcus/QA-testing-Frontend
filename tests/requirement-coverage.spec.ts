import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/**", async route => {
    const url = route.request().url(), body = route.request().postDataJSON();
    if (url.endsWith("discovery-coverage")) return route.fulfill({ json: { pages: body.state_codes.map((code: string) => ({
      state_code: code, url: code === "S1" ? "/en/login" : "/en/feedback",
      requirements: code === "S1" ? [{ id: "login", title: "Login", status: "APPROVED", match: "suggested" }] : [],
    })) } });
    if (url.endsWith("discovery-draft")) return route.fulfill({ json: body.save
      ? { requirement: { id: "feedback", status: "PENDING_APPROVAL" } }
      : { draft: { title: "Feedback", description: "Observed Feedback controls. Confirm business rules.",
        acceptance_criteria: [{ id: "AC-1", text: "Feedback displays Name, Subject and Message" }] } } });
    if (url.endsWith("discovery-scope")) return route.fulfill({ json: { id: "login", status: "PENDING_APPROVAL", version: 2 } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/tests/requirement-coverage-harness.html");
});

test("Login generation uses matched pages and Feedback-only selection cannot generate Login tests", async ({ page }) => {
  const generate = page.getByRole("button", { name: "Generate for 1 matched pages" });
  await expect(generate).toBeEnabled();
  await generate.click();
  await expect(page.locator("output")).toHaveText("Generated: S1");
  await page.getByRole("checkbox").first().uncheck();
  await expect(page.getByRole("button", { name: "Generate for 0 matched pages" })).toBeDisabled();
  await expect(page.getByRole("region", { name: "Requirement coverage" })).toContainText("/en/feedback");
});

test("discovered Feedback draft can be reviewed, edited and sent to approval", async ({ page }) => {
  await page.getByRole("button", { name: "Draft requirements from discovery" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Discovery does not establish submission success");
  await dialog.getByLabel("Title", { exact: true }).fill("Feedback form requirements");
  const request = page.waitForRequest(req => req.url().endsWith("discovery-draft") && req.postDataJSON()?.save);
  await dialog.getByRole("button", { name: "Save draft and review approval" }).click();
  const body = (await request).postDataJSON();
  expect(body.state_codes).toEqual(["S2"]);
  expect(body.title).toBe("Feedback form requirements");
  await expect(page.locator("output")).toHaveText("Approval: feedback S2");
});

test("linking existing requirements requests review of a new version", async ({ page }) => {
  await page.getByLabel("Link an existing requirement").selectOption("login");
  const request = page.waitForRequest(req => req.url().endsWith("discovery-scope"));
  await page.getByRole("button", { name: "Link pages and review" }).click();
  expect((await request).postDataJSON()).toEqual({ application_map_id: "map", state_codes: ["S2"], expected_version: 1 });
  await expect(page.locator("output")).toHaveText("Approval: login S2");
});

test("visibility-only Feedback requires outcome review before a functional revision can be saved", async ({ page }) => {
  await page.route("**/api/v1/requirements/projects/p/discovery-coverage", route => route.fulfill({ json: { pages: [{
    state_code: "S2", url: "/en/feedback", requirements: [{ id: "feedback", title: "Feedback", status: "APPROVED", match: "linked", form_behavior_missing: true }],
  }] } }));
  await page.route("**/api/v1/requirements/projects/p/discovery-draft", route => route.fulfill({ json: route.request().postDataJSON().save
    ? { requirement: { id: "feedback", status: "PENDING_APPROVAL", version: 2 } }
    : { requires_success_outcome: true, draft: { title: "Feedback", description: "Review form behavior", acceptance_criteria: [
      { id: "AC-1", text: "Name is visible" }, { id: "AC-2", text: "Submission without Name is blocked" },
    ] } } }));
  await page.goto("/tests/requirement-coverage-harness.html?feedback=1");
  await expect(page.getByText("Form behavior coverage is missing")).toBeVisible();
  await page.getByRole("button", { name: "Add functional and negative requirements" }).click();
  const dialog = page.getByRole("dialog");
  const save = dialog.getByRole("button", { name: "Save draft and review approval" });
  await expect(save).toBeDisabled();
  await dialog.getByLabel("Expected successful submission result").fill("The confirmed receipt is displayed.");
  const sent = page.waitForRequest(req => req.url().endsWith("discovery-draft") && req.postDataJSON().save);
  await save.click();
  const body = (await sent).postDataJSON();
  expect(body).toMatchObject({ existing_requirement_id: "feedback", expected_version: 1, behavioral: true,
    success_outcome: "The confirmed receipt is displayed." });
  await expect(page.locator("output")).toHaveText("Approval: feedback S2");
});
