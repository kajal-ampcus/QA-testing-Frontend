import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Execution from "../src/features/execution/Execution";
import "../src/app/styles.css";

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <main style={{ padding: 16 }}>
      <Execution projectId="layout" generations={[{
        generation_id: "g1", created_at: null, risk_level: "SAFE",
        review_status: "REVIEWED", verification_status: "PASSED",
        script_count: 30, blocked_count: 0, approval_required: false,
      }]} />
    </main>
  </QueryClientProvider>,
);
