import assert from "node:assert/strict";
import { test } from "node:test";
import { nextStage, stages } from "./workflow.ts";

test("automation follows test cases", () => {
  assert.equal(stages.at(-1), "Automation");
  assert.equal(stages.indexOf("Automation"), stages.indexOf("Test cases") + 1);
  assert.equal(stages.length, 7);
  const between = stages.slice(
    stages.indexOf("Test cases") + 1,
    stages.indexOf("Automation"),
  );
  assert.deepEqual(between, []);
});

test("approved cases still land on test cases", () => {
  const stage = nextStage(
    {
      id: "req",
      project_id: "project",
      req_code: "REQ-001",
      version: 1,
      status: "APPROVED",
      title: "Login",
      description: "",
      acceptance_criteria: [],
      ambiguities: [],
      domain_tags: [],
    },
    {
      id: "map",
      project_id: "project",
      version: 1,
      base_url: "https://example.test",
      status: "COMPLETE",
      termination_reason: null,
      coverage: {},
      states: [],
    },
    [
      {
        id: "case",
        tc_code: "TC-001",
        project_id: "project",
        requirement_id: "req",
        requirement_version: 1,
        application_map_id: "map",
        status: "APPROVED",
        current_version: 1,
        current: {
          version: 1,
          title: "Login",
          objective: "",
          category: "POSITIVE",
          preconditions: [],
          steps: [],
          expected_result: "",
          test_data: {},
          traceability: [],
          confidence: 1,
        },
      },
    ],
  );
  assert.equal(stages[stage], "Test cases");
});
