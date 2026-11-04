import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TestDataReadiness from "../src/features/project-data/TestDataReadiness";
import ProjectData from "../src/features/project-data/ProjectData";
import "../src/app/styles.css";

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <BrowserRouter><Routes>
      <Route path="/projects/p/data" element={<ProjectData projectId="p" />} />
      <Route path="*" element={<main style={{padding: 24}}><TestDataReadiness projectId="p" revision="v1" generation="generation-1" busy={false} /></main>} />
    </Routes></BrowserRouter>
  </QueryClientProvider>,
);
