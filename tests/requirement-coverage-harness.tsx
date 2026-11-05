import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Generate } from "../src/features/test-cases/TestCases";
import type { AppMap, Requirement } from "../src/types/api";
import { generateBatch } from "../src/features/test-cases/generationBatch";
import { api } from "../src/api/client";
import "../src/app/styles.css";

const login = { id: "login", project_id: "p", req_code: "REQ-001", title: "Login", version: 1, status: "APPROVED",
  acceptance_criteria: [{ id: "AC-1", text: "Login accepts valid credentials" }], ambiguities: [] } as unknown as Requirement;
const map = { id: "map", version: 6, status: "COMPLETE", states: [
  { state_code: "S1", url_pattern: "/en/login", fingerprint: "login" },
  { state_code: "S2", url_pattern: "/en/feedback", fingerprint: "feedback" },
] } as AppMap;
function Harness() {
  const [output, setOutput] = useState("");
  const feedback = window.location.search.includes("feedback");
  const multi = window.location.search.includes("multi");
  const feedbackRequirement = { ...login, id: "feedback", title: "Feedback", req_code: "REQ-002",
    domain_tags: ["discovery-route:/en/feedback"], acceptance_criteria: [{ id: "AC-1", text: 'Observed control "Name" with role textbox is visible on "/en/feedback".', source: "OBSERVED_DOM" }] };
  const selected = feedback || multi ? feedbackRequirement : login;
  const selectedMap = multi ? { ...map, states: [...map.states, { state_code: "S3", url_pattern: "/en", fingerprint: "home" }] } as AppMap : map;
  return <><Generate requirement={selected} requirements={multi ? [login, feedbackRequirement] : [selected]} map={selectedMap} pending={false} error={null}
    initialStateCodes={multi ? ["S1", "S2", "S3"] : feedback ? ["S2"] : []}
    onGenerate={async (_scope, _areas, _modules, codes, _regenerate, targets) => {
      if (multi) {
        const result = await generateBatch(targets!, target => api.generate("p", target.requirementId, "map", undefined, "all", [], [], [], false, target.stateCodes));
        setOutput(`Generated: ${result.generated} cases across ${result.requirement_ids!.length} requirements`);
      } else setOutput("Generated: " + codes.join(","));
    }}
    onReview={ids => setOutput(`Review: ${ids?.join(",")}`)} onRequirementPrepared={(req, codes) => setOutput(`Approval: ${req.id} ${codes.join(",")}`)} />
    <output>{output}</output></>;
}
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
  <BrowserRouter><Harness /></BrowserRouter></QueryClientProvider>);
