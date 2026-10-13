import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ExecutionInputs from "../src/features/execution/ExecutionInputs";
import ExecutionInputDraft from "../src/features/execution/ExecutionInputDraft";

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    <ExecutionInputDraft projectId="p1" generationId="g1" />
    <ExecutionInputs projectId="p1" runId="run1" />
  </QueryClientProvider>,
);
