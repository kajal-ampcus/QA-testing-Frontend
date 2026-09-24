import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type {
  Project,
  Requirement,
  Approval,
  AppMap,
  TestCase,
} from "../src/types/api";
const project: Project = {
  id: "p1",
  name: "Customer portal",
  application_url: "https://portal.example.test",
  credential_ref: null,
};
const requirement: Requirement = {
  id: "r1",
  project_id: "p1",
  req_code: "REQ-001",
  version: 1,
  status: "NEEDS_CLARIFICATION",
  title: "Secure customer sign-in",
  description: "Customers can sign in and reach their dashboard.",
  acceptance_criteria: [
    {
      id: "AC-1",
      text: "Valid credentials open the dashboard.",
      source: "REQUIREMENT",
    },
  ],
  ambiguities: [
    {
      field: "Response time",
      issue: "How quickly should sign-in complete?",
      requires_clarification: true,
    },
  ],
  domain_tags: ["Authentication"],
};
const map: AppMap = {
  id: "m1",
  project_id: "p1",
  version: 1,
  base_url: project.application_url!,
  status: "COMPLETE",
  termination_reason: "EXPLORATION_EXHAUSTED",
  coverage: { states: 2 },
  states: [
    {
      state_code: "STATE-001",
      url_pattern: "/login",
      fingerprint: "login",
      reached_via: [],
      elements: [
        {
          element_code: "EL-001",
          name: "Sign in",
          role: "button",
          risk: "SAFE",
          source: "OBSERVED_DOM",
        },
      ],
    },
    {
      state_code: "STATE-002",
      url_pattern: "/dashboard",
      fingerprint: "dashboard",
      reached_via: ["click(role=button,name='Sign in')"],
      elements: [
        {
          element_code: "EL-001",
          name: "Profile",
          role: "link",
          risk: "SAFE",
          source: "OBSERVED_DOM",
        },
      ],
    },
  ],
};
const testCase: TestCase = {
  id: "t1",
  project_id: "p1",
  tc_code: "TC-001",
  requirement_id: "r1",
  requirement_version: 2,
  application_map_id: "m1",
  status: "DRAFT",
  current_version: 1,
  current: {
    version: 1,
    title: "Sign in with valid credentials",
    objective: "Verify secure access.",
    category: "POSITIVE",
    preconditions: ["A test account exists."],
    steps: [
      {
        step_number: 1,
        action: "click",
        target: {
          state_code: "STATE-001",
          element_code: "EL-001",
          element_name: "Sign in",
        },
        expected: "Dashboard opens",
      },
    ],
    expected_result: "Dashboard is visible.",
    test_data: { account: "test account" },
    traceability: ["AC-1"],
    confidence: 0.95,
  },
};
async function fixture(
  page: Page,
  options: {
    existing?: boolean;
    approved?: boolean;
    map?: boolean;
    failedJob?: boolean;
    failAnalysis?: boolean;
    conflict?: boolean;
    tests?: boolean;
    resumable?: boolean;
    generationCoverage?: boolean;
  } = {},
) {
  const state = {
    projects: options.existing ? [structuredClone(project)] : ([] as Project[]),
    requirements: options.existing
      ? [
          {
            ...structuredClone(requirement),
            ...(options.approved
              ? { status: "APPROVED", version: 2, ambiguities: [] }
              : {}),
          },
        ]
      : ([] as Requirement[]),
    approvals: [] as Approval[],
    map: options.map ? structuredClone(map) : (null as AppMap | null),
    tests: options.tests ? [structuredClone(testCase)] : ([] as TestCase[]),
    polls: 0,
    discovers: 0,
    analysis: 0,
    conflicted: false,
  };
  if (options.resumable) {
    state.map = {
      ...structuredClone(map),
      status: "PARTIAL",
      termination_reason: "MAX_PAGES_REACHED",
      coverage: {
        discovery_catalog: {
          mode: "deep",
          areas: [
            {
              id: "dashboard",
              label: "Dashboard",
              kind: "authenticated",
              state_fingerprints: ["dashboard"],
              selectable: true,
            },
          ],
          modules: [],
          selected_areas: ["dashboard"],
          selected_modules: [],
        },
      },
      discovery_checkpoint: {
        version: 1,
        configuration: {
          mode: "deep",
          selected_areas: ["dashboard"],
          selected_modules: [],
          max_pages: 20,
          max_depth: 3,
          max_duration_seconds: 60,
          worker_limit: 2,
          automatic_limits: false,
        },
        pending_nodes: [{}],
        failed_nodes: [],
        in_progress_nodes: [],
        completed_nodes: ["login", "dashboard"],
      },
    };
  }
  if (options.generationCoverage && state.map) {
    state.map.project_test_generation_coverage = { r1: ["login"] };
  }
  if (options.existing && !options.approved)
    state.approvals = [
      {
        id: "a1",
        target_id: "r1",
        target_type: "requirement",
        status: "PENDING",
        decided_by: null,
        decided_at: null,
      },
    ];
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/v1", "");
    const post = request.method() === "POST";
    const body = post ? request.postDataJSON() : null;
    let result: unknown;
    let status = 200;
    if (path === "/projects" && post) {
      expect(body).toEqual({
        name: "Customer portal",
        application_url: "https://portal.example.test",
      });
      state.projects = [structuredClone(project)];
      result = state.projects[0];
      status = 201;
    } else if (path === "/projects") result = state.projects;
    else if (path === "/projects/p1")
      result = { ...state.projects[0], has_application_map: !!state.map };
    else if (path === "/requirements/projects/p1" && post) {
      state.analysis++;
      if (options.failAnalysis && state.analysis === 1) {
        status = 502;
        result = { detail: "Requirement extraction temporarily unavailable" };
      } else {
        expect(body.raw_text).toContain("sign in");
        state.requirements = [structuredClone(requirement)];
        state.approvals = [
          {
            id: "a1",
            target_id: "r1",
            target_type: "requirement",
            status: "PENDING",
            decided_by: null,
            decided_at: null,
          },
        ];
        result = state.requirements[0];
        status = 201;
      }
    } else if (path === "/requirements/projects/p1")
      result = state.requirements;
    else if (path === "/requirements/r1/clarifications") {
      expect(body.expected_version).toBe(1);
      expect(body.resolutions).toEqual([
        { ambiguity_index: 0, decision: "Within two seconds" },
      ]);
      if (options.conflict && !state.conflicted) {
        state.conflicted = true;
        status = 409;
        result = { detail: "Requirement version changed; reload it first" };
      } else {
        state.requirements = [
          {
            ...state.requirements[0],
            version: 2,
            status: "PENDING_APPROVAL",
            ambiguities: [],
          },
        ];
        state.approvals = [
          {
            id: "a2",
            target_id: "r1",
            target_type: "requirement",
            status: "PENDING",
            decided_by: null,
            decided_at: null,
          },
        ];
        result = state.requirements[0];
        status = 201;
      }
    } else if (path === "/requirements/r1/revisions") {
      state.requirements = [
        {
          ...state.requirements[0],
          version: state.requirements[0].version + 1,
          status: "PENDING_APPROVAL",
          description: body.raw_text,
          ambiguities: [],
        },
      ];
      state.approvals = [
        {
          id: "a3",
          target_id: "r1",
          target_type: "requirement",
          status: "PENDING",
          decided_by: null,
          decided_at: null,
        },
      ];
      result = state.requirements[0];
      status = 201;
    } else if (path === "/approvals") result = state.approvals;
    else if (/^\/approvals\/.+\/approve$/.test(path)) {
      expect(body.decided_by).toBe("QA Reviewer");
      state.requirements[0].status = "APPROVED";
      result = {
        ...state.approvals[0],
        status: "APPROVED",
        decided_by: body.decided_by,
      };
      state.approvals = [];
    } else if (/^\/approvals\/.+\/reject$/.test(path)) {
      expect(body.reason).toBeTruthy();
      result = { ...state.approvals[0], status: "REJECTED" };
      state.approvals = [];
    } else if (path === "/projects/p1/credentials") {
      expect(body.username).toBe("qa@example.test");
      expect(body.password).toBe("test-password");
      state.projects[0].credential_ref = "cred:test";
      result = { credential_ref: "cred:test" };
      status = 201;
    } else if (path === "/application-maps/projects/p1/discover") {
      state.discovers++;
      expect(body.focus_requirements).toEqual([]);
      if (body.resume_application_map_id) {
        expect(body.resume_application_map_id).toBe("m1");
        expect(body.max_pages).toBe(30);
      } else if (!options.resumable) {
        expect(body.discovery_mode).toBe("inventory");
      }
      state.polls = 0;
      result = { job_id: "job-1" };
      status = 202;
    } else if (path === "/application-maps/jobs/expired") {
      status = 404;
      result = { detail: "Discovery job not found" };
    } else if (path === "/application-maps/jobs/job-1") {
      state.polls++;
      if (options.failedJob && state.discovers === 1) {
        state.map = {
          ...structuredClone(map),
          status: "FAILED",
          termination_reason: "AUTHENTICATION_OR_CRAWL_ERROR",
        };
        result = {
          job_id: "job-1",
          status: "complete",
          result: { status: "FAILED", errors: ["Unable to connect"] },
        };
      } else if (state.polls < 3) {
        result = { job_id: "job-1", status: "in_progress", result: null };
      } else {
        state.map = structuredClone(map);
        result = {
          job_id: "job-1",
          status: "complete",
          result: { status: "SUCCESS" },
        };
      }
    } else if (path === "/application-maps/projects/p1") {
      result = state.map;
      if (!result) {
        status = 404;
        result = { detail: "No application map yet" };
      }
    } else if (path === "/test-cases/projects/p1/generate") {
      expect(body).toEqual({
        requirement_id: "r1",
        application_map_id: "m1",
        generation_scope: "all",
        selected_area_ids: [],
        selected_module_ids: [],
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
      state.tests = [structuredClone(testCase)];
      result = {
        generated: 1,
        test_cases: state.tests,
        uncovered_acs: ["AC-2"],
        partial_pairing_acs: [],
        needs_review_test_cases: [],
      };
    } else if (path === "/test-cases/projects/p1") result = state.tests;
    else {
      status = 404;
      result = { detail: "Unexpected test endpoint " + path };
      errors.push(path);
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(result),
    });
  });
  return { state, errors };
}
test("complete journey: create, clarify, approve, discover, map, generate, inspect", async ({
  page,
}, testInfo) => {
  const { state, errors } = await fixture(page);
  await page.goto("/");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page.getByLabel("Project name").fill("Customer portal");
  await page
    .getByLabel("Application URL", { exact: true })
    .fill("https://portal.example.test");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await page
    .getByLabel("Requirement description")
    .fill("Customers can sign in securely.");
  await page
    .getByRole("button", { name: "Analyze requirement", exact: true })
    .click();
  await expect(
    page.getByText("Your input is needed", { exact: true }),
  ).toBeVisible();
  await page
    .getByPlaceholder("Describe the intended behavior…")
    .fill("Within two seconds");
  await page.getByLabel("Your name", { exact: true }).fill("QA Reviewer");
  await page.getByRole("button", { name: "Save clarifications" }).click();
  await page.getByLabel("Reviewer name").fill("QA Reviewer");
  await page
    .getByRole("button", { name: "Approve requirement", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm approval" }).click();
  await expect(
    page.getByRole("heading", { name: "Meet your application" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add test account" }).click();
  await page.getByLabel("Username", { exact: true }).fill("qa@example.test");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page
    .getByRole("button", { name: "Save test account", exact: true })
    .click();
  await expect(
    page.getByText("Credentials configured", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Start discovery", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Exploring your application" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Review application map" }),
  ).toBeVisible({ timeout: 15000 });
  expect(state.discovers).toBe(1);
  await page.getByRole("button", { name: "Review application map" }).click();
  await expect(
    page.getByRole("heading", { name: "Your application, mapped" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Inspect STATE-001", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `test-results/map-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Continue to test generation" })
    .click();
  await page
    .getByRole("button", { name: "Generate test cases", exact: true })
    .click();
  await expect(
    page.getByText("Generation needs review", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open TC-001" }).click();
  await expect(
    page.getByRole("heading", { name: "Requirement traceability" }),
  ).toBeVisible();
  await expect(
    page.getByText("Dashboard is visible.", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByLabel("Search test cases").fill("no-match");
  await expect(
    page.getByRole("heading", { name: "No tests match these filters" }),
  ).toBeVisible();
  await page.getByLabel("Search test cases").fill("");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  expect((await download).suggestedFilename()).toBe("test-cases.json");
  const excelDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Excel" }).click();
  const excelDownload = await excelDownloadPromise;
  expect(excelDownload.suggestedFilename()).toMatch(
    /^qa-complete-report-\d{4}-\d{2}-\d{2}\.xlsx$/,
  );
  const excelPath = await excelDownload.path();
  expect(excelPath).toBeTruthy();
  const excelBytes = await readFile(excelPath!);
  expect(excelBytes.subarray(0, 2).toString("ascii")).toBe("PK");
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    "test-password",
  );
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `test-results/tests-${testInfo.project.name}.png`,
    fullPage: true,
  });
});
test("failed analysis keeps text and retries without duplicate writes", async ({
  page,
}) => {
  const { state, errors } = await fixture(page, {
    existing: true,
    failAnalysis: true,
  });
  state.requirements = [];
  await page.goto("/projects/p1");
  await page
    .getByLabel("Requirement description")
    .fill("Customers can sign in securely.");
  await page
    .getByRole("button", { name: "Analyze requirement", exact: true })
    .click();
  await expect(
    page.getByText("Requirement extraction temporarily unavailable"),
  ).toBeVisible();
  await expect(page.getByLabel("Requirement description")).toHaveValue(
    "Customers can sign in securely.",
  );
  expect(state.analysis).toBe(1);
  await page
    .getByRole("button", { name: "Analyze requirement", exact: true })
    .click();
  await expect(
    page.getByText("Your input is needed", { exact: true }),
  ).toBeVisible();
  expect(state.analysis).toBe(2);
  expect(errors).toEqual([]);
});
test("failed worker result is actionable and retries discovery", async ({
  page,
}) => {
  const { state } = await fixture(page, {
    existing: true,
    approved: true,
    failedJob: true,
  });
  await page.goto("/projects/p1");
  await page
    .getByRole("button", { name: "Start discovery", exact: true })
    .click();
  await expect(
    page.getByText("Discovery failed", { exact: true }),
  ).toBeVisible();
  await page.getByText("View details", { exact: true }).click();
  await expect(
    page.getByText("Unable to connect", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Retry discovery", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your application, mapped" }),
  ).toBeVisible({ timeout: 15000 });
  expect(state.discovers).toBe(2);
});
test("partial discovery can continue with revised safety limits or restart", async ({
  page,
}) => {
  const { state } = await fixture(page, {
    existing: true,
    approved: true,
    resumable: true,
  });
  await page.goto("/projects/p1");
  await page
    .getByRole("button", { name: "Application discovery", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Continue Discovery", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start from Scratch", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Maximum pages").fill("30");
  await page
    .getByRole("button", { name: "Continue Discovery", exact: true })
    .click();
  expect(state.discovers).toBe(1);
});
test("test generation offers whole graph or only newly discovered states", async ({
  page,
}) => {
  await fixture(page, {
    existing: true,
    approved: true,
    map: true,
    generationCoverage: true,
  });
  await page.goto("/projects/p1?requirement=r1&stage=4");
  await expect(
    page.getByRole("button", { name: "Generate for whole graph", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Generate only for new graph part (1)",
      exact: true,
    }),
  ).toBeVisible();
});
test("rejected approval leads to a revision and a new approval", async ({
  page,
}) => {
  const { state } = await fixture(page, { existing: true });
  state.requirements[0].ambiguities = [];
  state.requirements[0].status = "PENDING_APPROVAL";
  await page.goto("/projects/p1");
  await page.getByLabel("Reviewer name").fill("QA Reviewer");
  await page
    .getByLabel("Review note")
    .fill("Specify account lockout behavior.");
  await page
    .getByRole("button", { name: "Request revision", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Revise requirement", exact: true })
    .click();
  await page
    .getByLabel("Requirement description")
    .fill("Customers can sign in. Lock the account after five failures.");
  await page
    .getByRole("button", { name: "Analyze revision", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Make the intent official" }),
  ).toBeVisible();
  expect(state.requirements[0].version).toBe(2);
});
test("expired discovery job can be cleared to recover", async ({ page }) => {
  await fixture(page, { existing: true, approved: true });
  await page.addInitScript(() => localStorage.setItem("arc:job:p1", "expired"));
  await page.goto("/projects/p1");
  await expect(
    page.getByText("Discovery job not found", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Clear expired job", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Start discovery", exact: true }),
  ).toBeEnabled();
});
test("historical tests retain version context and low-confidence filters work", async ({
  page,
}) => {
  const { state } = await fixture(page, {
    existing: true,
    approved: true,
    map: true,
    tests: true,
  });
  state.requirements[0].version = 3;
  state.tests[0].current.confidence = 0.6;
  await page.goto("/projects/p1?stage=5");
  await expect(
    page.getByText("Earlier requirement or map version"),
  ).toBeVisible();
  await page.getByLabel("Filter confidence").selectOption("high");
  await expect(
    page.getByRole("heading", { name: "No tests match these filters" }),
  ).toBeVisible();
  await page.getByLabel("Filter confidence").selectOption("low");
  await page.getByRole("button", { name: "Open TC-001" }).click();
  await expect(
    page.getByText(
      "Historical requirement version. Current text may have changed.",
    ),
  ).toBeVisible();
});
test("API errors and missing project are rendered, not replaced with demo data", async ({
  page,
}) => {
  await page.route("**/api/v1/**", (r) =>
    r.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Database unavailable" }),
    }),
  );
  await page.goto("/");
  await expect(
    page.getByText("Database unavailable", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});
test("reduced motion and keyboard drawer behavior", async ({ page }) => {
  await fixture(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await expect(page.getByLabel("Project name")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "New project", exact: true }),
  ).toBeFocused();
});

test("no map requests before discovery, including refresh and approval", async ({
  page,
}) => {
  const { state } = await fixture(page, { existing: true });
  const mapRequests: string[] = [];
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === "/api/v1/application-maps/projects/p1"
    )
      mapRequests.push(request.url());
  });
  await page.goto("/projects/p1");
  await expect(
    page.getByText("Your input is needed", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Refresh workspace" }).click();
  await page
    .getByPlaceholder(/^Describe the intended behavior/)
    .fill("Within two seconds");
  await page.getByLabel("Your name", { exact: true }).fill("QA Reviewer");
  await page.getByRole("button", { name: "Save clarifications" }).click();
  await expect(
    page.getByRole("heading", { name: "Make the intent official" }),
  ).toBeVisible();
  await page.reload();
  await page.getByLabel("Reviewer name").fill("QA Reviewer");
  await page
    .getByRole("button", { name: "Approve requirement", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm approval" }).click();
  await expect(
    page.getByRole("heading", { name: "Meet your application" }),
  ).toBeVisible();
  expect(mapRequests).toHaveLength(0);
  await page
    .getByRole("button", { name: "Start discovery", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Review application map" }),
  ).toBeVisible({ timeout: 15000 });
  expect(state.discovers).toBe(1);
  expect(mapRequests.length).toBeGreaterThan(0);
});

test("existing map is restored without browser-local discovery history", async ({
  page,
}) => {
  await fixture(page, { existing: true, approved: true, map: true });
  await page.goto("/projects/p1");
  await expect(
    page.getByRole("heading", { name: "Your application, mapped" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Inspect STATE-001", exact: true }),
  ).toBeVisible();
});
