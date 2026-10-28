import test from "node:test";
import assert from "node:assert/strict";
import {
  explorerRoles,
  readExplorerState,
  selectPaths,
  uniquePaths,
} from "./explorerModel.ts";
import type { DiscoveryCheckpoint, ProjectAccount } from "../../types/api.ts";

test("failed entry pages can be selected without changing the saved job", () => {
  const entry = { key: "root", status: "failed", path: [] };
  const paths = uniquePaths([entry]);
  assert.equal(paths[0].key, "root");
  assert.equal(paths[0].path[0].name, "Entry page");
  assert.deepEqual(entry.path, []);
});

test("completed entry remains visible while observed login choices await selection", () => {
  const entry = { key: "root", status: "completed", path: [] };
  const roles = explorerRoles({
    configuration: { credential_ref: null, mode: "guided" },
    jobs: [entry],
    input_requests: [{ id: "choose-login", kind: "login_choice", status: "pending", fields: [],
      choices: [{ id: "member", label: "Member" }, { id: "staff", label: "Staff" }] }],
  } as unknown as DiscoveryCheckpoint, []);
  const root = roles.find((role) => role.id === "public")?.paths[0];
  assert.equal(root?.status, "completed");
  assert.equal(root?.path[0].name, "Entry page");
  assert.deepEqual(roles.filter((role) => role.choice).map((role) => role.label), ["Member", "Staff"]);
  assert.deepEqual(entry.path, []);
});

const job = (key: string, status = "available") => ({
  key,
  status,
  path: [{ role: "link", name: "Dashboard" }],
});
const accounts = ["Employee", "Admin", "Kitchen"].map(
  (label) =>
    ({
      label,
      role: label,
      credential_ref: `cred:${label}`,
      is_default: false,
      created_at: "",
    }) satisfies ProjectAccount,
);
const checkpoint = {
  configuration: { credential_ref: "cred:Admin", mode: "guided" },
  jobs: [job("admin")],
  account_contexts: {
    "cred:Employee": { jobs: [job("employee", "completed")] },
    "cred:Admin": { jobs: [job("stale-admin")] },
    "cred:Kitchen": { jobs: [job("kitchen", "failed")] },
  },
} as DiscoveryCheckpoint;

test("active frontier overrides its saved snapshot without mixing account jobs", () => {
  const roles = explorerRoles(checkpoint, accounts);
  assert.deepEqual(
    roles.find((r) => r.id === "cred:Admin")?.paths.map((j) => j.key),
    ["admin"],
  );
  assert.equal(
    roles.find((r) => r.id === "cred:Employee")?.paths[0].status,
    "completed",
  );
  assert.equal(
    roles.find((r) => r.id === "cred:Kitchen")?.paths[0].status,
    "failed",
  );
});

test("Employee selections survive Admin and Kitchen switching and reload", () => {
  let state = readExplorerState(null, "cred:Employee");
  state = selectPaths(state, state.active, ["employee"]);
  state = { ...state, active: "cred:Admin" };
  state = selectPaths(state, state.active, ["admin"]);
  state = { ...state, active: "cred:Kitchen" };
  state = selectPaths(state, state.active, ["kitchen"]);
  state = readExplorerState(JSON.stringify(state), "public");
  assert.equal(state.active, "cred:Kitchen");
  assert.deepEqual(state.selections["cred:Employee"], ["employee"]);
  state = selectPaths(state, "cred:Admin", []);
  assert.deepEqual(state.selections["cred:Employee"], ["employee"]);
  assert.deepEqual(state.selections["cred:Kitchen"], ["kitchen"]);
});

test("same labels on distinct routes are retained; duplicate job keys are removed", () => {
  assert.deepEqual(
    uniquePaths([job("a"), job("a"), job("b")]).map((j) => j.key),
    ["a", "b"],
  );
});

test("roles contain observed logins without invented placeholders", () => {
  const roles = explorerRoles(
    {
      ...checkpoint,
      input_requests: [
        {
          id: "roles",
          kind: "login_choice",
          status: "applied",
          fields: [],
          choices: [{ id: "supplier", label: "Supplier" }],
        },
      ],
    },
    [],
  );
  assert.deepEqual(
    roles.map((r) => r.label),
    ["Supplier"],
  );
  assert.deepEqual(roles.find((r) => r.label === "Supplier")?.choice, {
    requestId: "roles",
    choiceId: "supplier",
  });
  assert.deepEqual(readExplorerState("broken", "public"), {
    active: "public",
    selections: {},
  });
});

test("fresh discovery does not list old saved accounts", () => {
  assert.deepEqual(explorerRoles(undefined, accounts), []);
  assert.deepEqual(
    explorerRoles(
      {
        configuration: { credential_ref: null },
        jobs: [],
      } as unknown as DiscoveryCheckpoint,
      accounts,
    ),
    [],
  );
});

test("three observed logins remain three options even with account suffixes and unnamed sessions", () => {
  const roles = explorerRoles(
    {
      ...checkpoint,
      configuration: {
        ...checkpoint.configuration,
        credential_ref: "cred:Employee",
      },
      jobs: [job("employee")],
      input_requests: [
        {
          id: "login-choices",
          kind: "login_choice",
          status: "applied",
          fields: [],
          choices: ["Employee", "Admin", "Kitchen"].map((label) => ({
            id: label.toLowerCase(),
            label,
          })),
        },
      ],
      account_contexts: {
        ...checkpoint.account_contexts,
        "session-login:old": { jobs: [] },
      },
    },
    accounts.map((account) => ({
      ...account,
      label: `${account.label} account`,
      login_group: account.role.toLowerCase(),
    })),
  );
  assert.deepEqual(
    roles.map((role) => role.label),
    ["Employee", "Admin", "Kitchen"],
  );
  assert.equal(roles[0].ref, "cred:Employee");
  assert.deepEqual(
    roles[0].paths.map((path) => path.key),
    ["employee"],
  );
});
