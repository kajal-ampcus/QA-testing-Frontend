import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/projects/p1/credentials", (route) =>
    route.fulfill({
      json: ["Employee", "Admin", "Kitchen"].map((label) => ({
        label,
        role: label,
        credential_ref: `cred:${label}`,
        is_default: label === "Employee",
        created_at: "",
      })),
    }),
  );
  await page.route("**/api/v1/projects/p1/saved-inputs", (route) =>
    route.fulfill({ json: [] }),
  );
});

test("scratch discovery starts without an old role and clears the old role dropdown while starting", async ({
  page,
}) => {
  let submitted: Record<string, unknown> | undefined;
  await page.route(
    "**/api/v1/application-maps/projects/p1/discover",
    (route) => {
      submitted = route.request().postDataJSON();
      return route.fulfill({ json: { job_id: "new-discovery" } });
    },
  );
  await page.goto("/tests/discovery-explorer-harness.html");
  const dropdown = page.getByRole("combobox", {
    name: "Select discovery role",
  });
  await expect(dropdown.locator("option")).toHaveCount(3);
  await dropdown.selectOption("cred:Kitchen");
  await page
    .getByRole("button", { name: "Start guided map from scratch" })
    .click();
  await page
    .getByRole("button", { name: "Confirm and start discovery" })
    .click();
  await expect
    .poll(() => submitted)
    .toMatchObject({
      credential_ref: null,
      start_from_scratch: true,
      selected_branches: [],
    });
  expect(submitted).not.toHaveProperty("resume_application_map_id");
  await expect(dropdown).toHaveCount(0);
  await expect(
    page.getByText(
      "Login options will appear here when discovery finds them in the application.",
    ),
  ).toBeVisible();
});

test("Kitchen discovery uses its saved account and keeps Employee paths available", async ({
  page,
}, testInfo) => {
  let submitted: Record<string, unknown> | undefined;
  await page.route(
    "**/api/v1/application-maps/projects/p1/discover",
    (route) => {
      submitted = route.request().postDataJSON();
      return route.fulfill({ json: { job_id: "kitchen-job" } });
    },
  );
  await page.goto("/tests/discovery-explorer-harness.html");
  const roles = page.getByRole("combobox", { name: "Select discovery role" });
  await roles.selectOption("cred:Kitchen");
  await page.getByRole("checkbox", { name: /^Orders/ }).check();
  await page.screenshot({
    path: `test-results/discovery-explorer-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Discover selected account" }).click();
  await page
    .getByRole("button", { name: "Confirm and start discovery" })
    .click();
  await expect
    .poll(() => submitted)
    .toMatchObject({
      credential_ref: "cred:Kitchen",
      selected_branches: ["kitchen"],
      resume_application_map_id: "map1",
      start_from_scratch: false,
    });
  await roles.selectOption("cred:Employee");
  await expect(
    page.getByRole("checkbox", { name: /^Employee home/ }),
  ).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /^Payslips/ })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("role switching and reload preserve selections; Admin resumes the existing map", async ({
  page,
}) => {
  const submissions: any[] = [];
  await page.route(
    "**/api/v1/application-maps/projects/p1/discover",
    (route) => {
      submissions.push(route.request().postDataJSON());
      return route.fulfill({ json: { job_id: "job1" } });
    },
  );
  await page.goto("/tests/discovery-explorer-harness.html");
  const roles = page.getByRole("combobox", { name: "Select discovery role" });
  const paths = page.getByRole("region", { name: "Saved discovery paths" });
  await paths.getByRole("checkbox", { name: /^Payslips/ }).check();
  await roles.selectOption("cred:Admin");
  await paths.getByRole("checkbox", { name: /^Manage users/ }).check();
  await roles.selectOption("cred:Kitchen");
  await paths.getByRole("checkbox", { name: /^Orders/ }).check();
  await page.reload();
  await expect(roles).toHaveValue("cred:Kitchen");
  await expect(paths.getByRole("checkbox", { name: /^Orders/ })).toBeChecked();
  await roles.selectOption("cred:Employee");
  await expect(
    paths.getByRole("checkbox", { name: /^Payslips/ }),
  ).toBeChecked();
  await expect(
    paths.getByRole("checkbox", { name: /^Employee home/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Paths for this role" }),
  ).toHaveCount(1);
  await roles.selectOption("cred:Admin");
  await page.getByRole("button", { name: "Discover selected account" }).click();
  await expect(
    page.getByRole("heading", { name: "Confirm discovery for Admin" }),
  ).toBeVisible();
  expect(submissions).toHaveLength(0);
  await page
    .getByRole("button", { name: "Confirm and start discovery" })
    .click();
  await expect.poll(() => submissions.length).toBe(1);
  expect(submissions[0]).toMatchObject({
    credential_ref: "cred:Admin",
    selected_branches: ["admin"],
    resume_application_map_id: "map1",
    start_from_scratch: false,
  });
  await roles.selectOption("cred:Employee");
  await expect(
    paths.getByRole("checkbox", { name: /^Payslips/ }),
  ).toBeChecked();
  await expect(
    paths.getByRole("checkbox", { name: /^Employee home/ }),
  ).toBeVisible();
});

test("search, status filters and clearing a role do not change other selections", async ({
  page,
}) => {
  await page.goto("/tests/discovery-explorer-harness.html");
  const paths = page.getByRole("region", { name: "Saved discovery paths" });
  await paths.getByRole("checkbox", { name: /^Select all remaining/ }).check();
  await page.getByLabel("Filter discovery paths").selectOption("Complete");
  await expect(
    paths.getByRole("checkbox", { name: /^Employee home/ }),
  ).toBeVisible();
  await expect(paths.getByRole("checkbox", { name: /^Payslips/ })).toHaveCount(
    0,
  );
  await page.getByLabel("Search discovery paths").fill("missing");
  await expect(paths.getByText("No paths match this filter.")).toBeVisible();
  await page
    .getByRole("combobox", { name: "Select discovery role" })
    .selectOption("cred:Admin");
  await paths.getByRole("checkbox", { name: /^Manage users/ }).check();
  await paths.getByRole("button", { name: "Clear selection" }).click();
  await page
    .getByRole("combobox", { name: "Select discovery role" })
    .selectOption("cred:Employee");
  await expect(
    paths.getByRole("checkbox", { name: /^Payslips/ }),
  ).toBeChecked();
});
