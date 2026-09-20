import { test, expect } from "@playwright/test";
test("live QA API: projects and workspace load through the configured proxy", async ({
  page,
  request,
}) => {
  test.skip(!process.env.LIVE_API, "Set LIVE_API=1 with the QA API running.");
  const response = await request.get("/api/v1/projects");
  expect(response.ok()).toBeTruthy();
  const projects = await response.json();
  expect(Array.isArray(projects)).toBeTruthy();
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your quality workspace" }),
  ).toBeVisible();
  if (projects.length) {
    await page.goto(`/projects/${projects[0].id}`);
    await expect(
      page.getByRole("heading", { name: projects[0].name, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "QA workflow" }),
    ).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
  } else {
    await expect(
      page.getByRole("heading", { name: "A fresh start for better QA" }),
    ).toBeVisible();
  }
});
