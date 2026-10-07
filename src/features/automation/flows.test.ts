import assert from "node:assert/strict";
import test from "node:test";
import type { TestCase } from "../../types/api";
import { flowNameForCase, flowNameFromUrl, groupByFlow } from "./flows.ts";

test("login and dashboard urls share one flow name across locales", () => {
  assert.equal(flowNameFromUrl("/en/login"), "Login");
  assert.equal(flowNameFromUrl("/login"), "Login");
  assert.equal(flowNameFromUrl("https://cep.example/en/sign-in"), "Login");
  assert.equal(flowNameFromUrl("/sign-up"), "Registration");
  assert.equal(flowNameFromUrl("/dashboard"), "Dashboard");
  assert.equal(flowNameFromUrl("/en/admin/users"), "Users");
  assert.equal(flowNameFromUrl("/orders"), "Orders");
  assert.equal(flowNameFromUrl(""), "Other");
});

test("later login cases join the same Login group", () => {
  const map = {
    id: "map",
    project_id: "project",
    version: 1,
    base_url: "https://example.test",
    status: "COMPLETE",
    termination_reason: null,
    coverage: {},
    states: [
      {
        state_code: "STATE-003",
        url_pattern: "/en/login",
        fingerprint: "a",
        reached_via: [],
        elements: [],
      },
      {
        state_code: "STATE-010",
        url_pattern: "/dashboard",
        fingerprint: "b",
        reached_via: [],
        elements: [],
      },
    ],
  };
  const login = (id: string) =>
    ({
      id,
      current: { steps: [{ step_number: 1, action: "navigate", target: { state_code: "STATE-003" } }] },
    }) as TestCase;
  const dashboard = (id: string) =>
    ({
      id,
      current: { steps: [{ step_number: 1, action: "navigate", target: { state_code: "STATE-010" } }] },
    }) as TestCase;
  const groups = groupByFlow(
    [login("a"), login("b"), dashboard("c"), login("d")],
    (item) => flowNameForCase(item, map),
  );
  assert.deepEqual(
    groups.map((group) => [group.flow, group.items.length]),
    [
      ["Login", 3],
      ["Dashboard", 1],
    ],
  );
});
