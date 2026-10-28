import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Discovery from "../src/features/discovery/Discovery";
import type { AppMap, Requirement } from "../src/types/api";
import "../src/app/styles.css";

const path = (key: string, name: string, status = "available") => ({
  key,
  status,
  path: [{ role: "link", name }],
});
const map = {
  id: "map1",
  project_id: "p1",
  version: 1,
  base_url: "https://sample.test",
  status: "PARTIAL",
  termination_reason: "AWAITING_BRANCH_SELECTION",
  coverage: {},
  states: [],
  discovered_as_role: "Employee",
  discovery_checkpoint: {
    version: 1,
    configuration: {
      mode: "guided",
      credential_ref: "cred:Employee",
      max_pages: 150,
      max_depth: 6,
      max_duration_seconds: 900,
      worker_limit: 1,
      automatic_limits: false,
      selected_areas: [],
      selected_modules: [],
    },
    jobs: [
      path("employee", "Payslips"),
      path("employee-done", "Employee home", "completed"),
    ],
    pending_nodes: [],
    failed_nodes: [],
    in_progress_nodes: [],
    completed_nodes: [],
    account_contexts: {
      "cred:Admin": { jobs: [path("admin", "Manage users", "failed")] },
      "cred:Kitchen": { jobs: [path("kitchen", "Orders")] },
    },
  },
} satisfies AppMap;
function Harness() {
  const [running, setRunning] = useState(false);
  const choosingLogin = new URLSearchParams(location.search).has("login-choice");
  const activeMap: AppMap = choosingLogin ? {
    ...map,
    termination_reason: "WAITING_FOR_INPUT",
    discovered_as_role: null,
    discovery_checkpoint: {
      ...map.discovery_checkpoint,
      configuration: { ...map.discovery_checkpoint.configuration, credential_ref: null },
      jobs: [{ key: "root", status: "completed", path: [] }],
      account_contexts: {},
      input_requests: [{ id: "choose-login", kind: "login_choice", status: "pending", fields: [],
        choices: [{ id: "member", label: "Member" }, { id: "staff", label: "Staff" }] }],
    },
  } : map;
  return (
    <main style={{ padding: 20 }}>
      <Discovery
        project={{
          id: "p1",
          name: "Test",
          application_url: "https://sample.test",
          credential_ref: choosingLogin ? null : "cred:Employee",
        }}
        requirement={
          { req_code: "REQ-1", version: 1, title: "Test" } as Requirement
        }
        map={activeMap}
        job={
          running ? ({ id: "job1", status: "in_progress" } as never) : undefined
        }
        jobError={null}
        onStarted={() => setRunning(true)}
        onNext={() => {}}
        refreshJob={() => {}}
        clearJob={() => {}}
        onStopped={() => setRunning(false)}
        refreshMap={() => {}}
      />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    <Harness />
  </QueryClientProvider>,
);
