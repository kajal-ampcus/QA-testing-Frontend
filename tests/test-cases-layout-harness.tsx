import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TestCases from "../src/features/test-cases/TestCases";
import type { Requirement, AppMap, Generation } from "../src/types/api";
import "../src/app/styles.css";
const title = "VeryLongRequirementName".repeat(20);
const requirements = [1, 2].map(n => ({ id: `r${n}`, req_code: `REQ-00${n}`, title, version: 1, acceptance_criteria: [{id: "AC-1", text: "Validate behavior"}], domain_tags: [] })) as unknown as Requirement[];
const map = { id: "map", version: 1, states: [] } as unknown as AppMap;
const multi = location.search.includes("multi");
const clean = location.search.includes("clean");
const result = { generated: 0, test_cases: [], needs_review_test_cases: [], generation_gaps: [{ ac_id: "AC-1", status: "unsupported", reason: title }] } as unknown as Generation;
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={new QueryClient()}><BrowserRouter>
<div style={{padding: 16}}><TestCases projectId="p" tests={[]} requirements={requirements} map={map} requirement={multi || clean ? undefined : requirements[0]} result={clean ? undefined : result} onCompleteCoverage={() => {}} /></div>
</BrowserRouter></QueryClientProvider>);
