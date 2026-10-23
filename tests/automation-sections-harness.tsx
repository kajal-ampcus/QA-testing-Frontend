import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Automation from "../src/features/automation/Automation";
import type { AppMap, Requirement, TestCase } from "../src/types/api";
import "../src/app/styles.css";
const tests = Array.from({length: 60}, (_, i) => ({
  id: `case-${i}`, tc_code: `TC-${i}`, status: "APPROVED", requirement_id: "req", requirement_version: 1,
  current_version: 1, current: { title: `Check item ${i}`, steps: [{target: {state_code: i < 30 ? "about" : "contact"}}] },
})) as TestCase[];
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>
<main style={{padding:16}}><Automation projectId="sections" tests={tests}
  requirements={[{id:"req", status:"APPROVED", version:1} as Requirement]}
  map={{states:[{state_code:"about", url_pattern:"/en/about"},{state_code:"contact",url_pattern:"/en/contact"}]} as AppMap} />
</main></QueryClientProvider>);
