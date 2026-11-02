import test from "node:test";
import assert from "node:assert/strict";
import {
  explorerRoles,
  observedForm,
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


test("shared landing routes do not repeat beneath Feedback", () => {
  const contact = { role: "link", name: "Contact", url: "https://site.test/contact" };
  const feedback = { role: "link", name: "Feedback", url: "https://site.test/feedback" };
  const paths = uniquePaths([
    { key: "public|contact", status: "available", path: [contact] },
    { key: "public|feedback", status: "completed", path: [feedback] },
    { key: "public|feedback/contact", status: "available", path: [feedback, { ...contact, name: "Contact us" }] },
    { key: "public|feedback/help", status: "available", path: [feedback, { ...contact, url: "https://site.test/feedback/help" }] },
    { key: "public|feedback/preview", status: "available", path: [feedback, { role: "button", name: "Preview" }] },
  ]);
  assert.deepEqual(paths.map((path) => path.key), ["public|contact", "public|feedback", "public|feedback/help", "public|feedback/preview"]);
});


test("completed Feedback shows observed fields without navigation or entered values", () => {
  const branch = { key: "public|feedback", status: "completed", result_fingerprint: "feedback", path: [{ role: "link", name: "Feedback", url: "https://site.test/en/feedback" }] };
  const states = [{ state_code: "S1", fingerprint: "feedback", url_pattern: "/en/feedback", reached_via: [], elements: [
    { element_code: "E0", role: "searchbox", name: "Search", locator_scope: "header" },
    { element_code: "E1", role: "textbox", name: "Name", required: true, value: "private-entered-name" },
    { element_code: "E2", role: "textbox", name: "Message", validation: { required: true } },
    { element_code: "E3", role: "button", name: "Attach Document", input_type: "file" },
    { element_code: "E4", role: "link", name: "Contact", url: "/contact" },
  ] }];
  const fields = observedForm(branch, states, "https://site.test");
  assert.deepEqual(fields.map((field) => field.name), ["Name", "Message", "Attach Document"]);
  assert.equal(fields[1].required, true);
  assert.ok(!JSON.stringify(fields).includes("private-entered-name"));
  assert.deepEqual(observedForm({ ...branch, status: "available" }, states, "https://site.test"), []);
});

test("legacy path form matching resolves relative routes and keeps login state separate", () => {
  const branch = { key: "public|login", status: "completed", path: [{ role: "link", name: "Login", url: "https://site.test/login" }] };
  const state = { state_code: "S1", fingerprint: "login", url_pattern: "/login", reached_via: [], elements: [{ role: "textbox", name: "Password", input_type: "password" }] };
  assert.equal(observedForm(branch, [state], "https://site.test").length, 1);
  assert.deepEqual(observedForm({ ...branch, result_fingerprint: "another-account" }, [state], "https://site.test"), []);
});


test("path form metadata stays visible without a matching application-map state", () => {
  const branch = { key: "public|feedback", status: "completed", result_fingerprint: "deduplicated-state", path: [{ role: "link", name: "Feedback", url: "https://site.test/feedback" }], observed_form: { fields: [
    { key: "textbox:name", role: "textbox", name: "Name", input_type: "text", required: true },
    { key: "textbox:message", role: "textbox", name: "Message", input_type: "text", required: true },
  ], actions: [{ role: "button", name: "Submit" }] } };
  assert.deepEqual(observedForm(branch, [], "https://site.test").map((field) => field.name), ["Name", "Message"]);
});

test("removing a repeated menu edge preserves deeper observed page paths", () => {
  const contact = { role: "link", name: "Contact", url: "https://site.test/contact" };
  const feedback = { role: "link", name: "Feedback", url: "https://site.test/feedback" };
  const paths = uniquePaths([
    { key: "public|contact", status: "available", path: [contact] },
    { key: "public|feedback/contact", status: "available", path: [feedback, contact] },
    { key: "public|feedback/contact/details", status: "completed", path: [feedback, contact, { role: "button", name: "Details" }] },
  ]);
  assert.deepEqual(paths.map((path) => path.key), ["public|contact", "public|feedback/contact/details"]);
});
