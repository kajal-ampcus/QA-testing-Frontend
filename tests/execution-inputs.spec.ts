import { test, expect } from "@playwright/test";

test("automatic resolution has no mode selector and manual fallback resumes with invalid data", async ({
  page,
}) => {
  let status = "RESOLVING_INPUT";
  let submitted: unknown;
  let overrides: unknown;
  await page.route("**/api/v1/executions/**", async (route) => {
    const url = route.request().url();
    if (url.endsWith("/generations/g1/inputs")) {
      if (route.request().method() === "POST") {
        overrides = route.request().postDataJSON();
        await route.fulfill({ json: { revision: 1 } });
      } else {
        await route.fulfill({
          json: {
            revision: overrides ? 1 : 0,
            supported: true,
            values: {},
            bindings: [
              {
                key: "TC-001:v1:step2",
                case_code: "TC-001",
                field: "Email",
                category: "NEGATIVE",
                sensitive: false,
                allow_empty: true,
              },
            ],
          },
        });
      }
    } else if (url.endsWith("/input-requests/request1")) {
      submitted = route.request().postDataJSON();
      status = "DONE";
      await route.fulfill({ json: { status: "RESOLVED" } });
    } else {
      await route.fulfill({
        json: {
          requests:
            status === "DONE"
              ? []
              : [
                  {
                    id: "request1",
                    case_code: "TC-001",
                    category: "NEGATIVE",
                    field: "Email",
                    objective: "Reject invalid email",
                    sensitive: false,
                    allow_empty: true,
                    status,
                  },
                ],
        },
      });
    }
  });
  await page.goto("/tests/execution-inputs-harness.html");
  await expect(page.getByText("Resolving input automatically…")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /generate|choose llm|negative mode/i }),
  ).toHaveCount(0);
  status = "WAITING_FOR_INPUT";
  await expect(
    page.getByRole("button", { name: "Submit and continue" }),
  ).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("abc@");
  await page.getByRole("button", { name: "Submit and continue" }).click();
  await expect(
    page.getByRole("heading", { name: "Execution inputs", exact: true }),
  ).toHaveCount(0);
  expect(submitted).toEqual({ mode: "value", value: "abc@" });
  await page.getByText("Optional input overrides", { exact: true }).click();
  await page.getByRole("checkbox", { name: /Override TC-001/ }).check();
  await page
    .getByRole("checkbox", { name: "Leave empty", exact: true })
    .check();
  await page.getByRole("button", { name: "Save input overrides" }).click();
  await expect
    .poll(() => overrides)
    .toEqual({
      expected_revision: 0,
      values: { "TC-001:v1:step2": { mode: "empty", value: "" } },
    });
});
