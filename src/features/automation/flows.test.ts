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
  assert.equal(flowNameFromUrl("/en"), "Homepage");
});

test("old-map login cases use explicit starting preconditions instead of reused IDs", () => {
  const testCase = {
    application_map_id: "old-map",
    current: { preconditions: ["Browser is on /en/login"], steps: [
      { action: "navigate", target: { state_code: "STATE-002" } },
    ] },
  } as TestCase;
  const map = { id: "new-map", states: [{ state_code: "STATE-002", url_pattern: "/en/about" }] } as never;
  assert.equal(flowNameForCase(testCase, map), "Login");
  assert.equal(flowNameForCase(testCase), "Login");
});

test("an unknown state is not classified from its title or final dashboard assertion", () => {
  const testCase = { current: { title: "Login test", preconditions: [], steps: [
    { action: "navigate", target: { state_code: "UNKNOWN" } },
    { action: "assert", target: { state_code: "DASH" } },
  ] } } as TestCase;
  const map = { id: "map", states: [{ state_code: "DASH", url_pattern: "/dashboard" }] } as never;
  assert.equal(flowNameForCase(testCase, map), "Other");
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
