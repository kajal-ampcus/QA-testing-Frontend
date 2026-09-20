import { Component, Suspense, lazy, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  useParams,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "../api/client";
import { LoadingState, ErrorState } from "../components/ui";
import "./styles.css";
const Projects = lazy(() => import("../features/projects/Projects"));
const Workspace = lazy(() => import("./Workspace"));
const client = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15000,
      retry: (count, e) =>
        !(e instanceof ApiError && e.status < 500) && count < 1,
    },
    mutations: { retry: false },
  },
});
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    return this.state.error ? (
      <main className="main">
        <ErrorState error={this.state.error} />
        <a href="/">Return to projects</a>
      </main>
    ) : (
      this.props.children
    );
  }
}
function ProjectRoute() {
  const { id } = useParams();
  return <Workspace key={id} id={id!} />;
}
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <Suspense fallback={<LoadingState />}>
          <Routes>
            <Route path="/" element={<Projects />} />
            <Route path="/projects/:id" element={<ProjectRoute />} />
            <Route
              path="*"
              element={
                <main className="main">
                  <h1>Page not found</h1>
                  <Link to="/">Back to projects</Link>
                </main>
              }
            />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  </ErrorBoundary>,
);
