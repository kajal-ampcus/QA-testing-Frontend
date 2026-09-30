import { lazy, Suspense, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { ArrowRight, Plus, RefreshCw, ExternalLink } from "lucide-react";
import { api, ApiError } from "../api/client";
import { useAction } from "../hooks/useAction";
import { activeJob, nextStage, stages } from "../utils/workflow";
import { Shell } from "../features/projects/Projects";
import { WorkflowStepper } from "../components/workflow/WorkflowStepper";
import {
  Button,
  PageHeader,
  ErrorState,
  LoadingState,
  Card,
  EmptyState,
} from "../components/ui";
import type { Requirement } from "../types/api";
const Requirements = lazy(
  () => import("../features/requirements/Requirements"),
);
const Approvals = lazy(() => import("../features/approvals/Approvals"));
const Discovery = lazy(() => import("../features/discovery/Discovery"));
const ApplicationMap = lazy(
  () => import("../features/application-map/ApplicationMap"),
);
const TestCases = lazy(() => import("../features/test-cases/TestCases"));
const Generate = lazy(() =>
  import("../features/test-cases/TestCases").then((m) => ({
    default: m.Generate,
  })),
);
function readStored(key: string) {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}
function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Storage can be disabled. In-memory operation still works. */
  }
}
export default function Workspace({ id }: { id: string }) {
  const [params, setParams] = useSearchParams();
  const key = ["workspace", id];
  const [jobId, setJobId] = useState(() => readStored(`arc:job:${id}`));
  const [reviewed, setReviewed] = useState(() =>
    readStored(`arc:reviewed:${id}`),
  );
  const job = useQuery({
    queryKey: [...key, "job", jobId],
    queryFn: ({ signal }) => api.job(jobId, signal),
    enabled: !!jobId,
    refetchInterval: (q) =>
      q.state.error
        ? false
        : activeJob(q.state.data?.status) || !q.state.data
          ? 2000
          : false,
    retry: (failCount, err) => {
      // Never retry a 404 — the arq job has expired from Redis.
      // Let the useEffect below clear it automatically.
      if (err instanceof ApiError && err.status === 404) return false;
      return failCount < 2;
    },
  });

  // Auto-clear an expired job (404) from localStorage so the user doesn't
  // have to manually click "Clear expired job" every time they return to
  // a project whose last discovery job has aged out of Redis.
  useEffect(() => {
    if (job.error instanceof ApiError && job.error.status === 404) {
      setJobId("");
      writeStored(`arc:job:${id}`, "");
    }
  }, [job.error, id]);


  const running =
    !!jobId && !job.error && (!job.data || activeJob(job.data.status));
  const project = useQuery({
    queryKey: [...key, "project"],
    queryFn: ({ signal }) => api.project(id, signal),
    refetchInterval: (q) =>
      running && !q.state.data?.has_application_map ? 2000 : false,
  });
  const requirements = useQuery({
    queryKey: [...key, "requirements"],
    queryFn: ({ signal }) => api.requirements(id, signal),
  });
  const approvals = useQuery({
    queryKey: [...key, "approvals"],
    queryFn: ({ signal }) => api.approvals(id, signal),
  });
  const tests = useQuery({
    queryKey: [...key, "tests"],
    queryFn: ({ signal }) => api.tests(id, signal),
  });
  const mapEnabled =
    project.isSuccess &&
    (project.data.has_application_map ??
      (!!jobId || !!reviewed || !!tests.data?.length));
  const map = useQuery({
    enabled: mapEnabled,
    queryKey: [...key, "map"],
    queryFn: ({ signal }) => api.map(id, signal),
    refetchInterval: (q) =>
      running || q.state.data?.status === "RUNNING" ? 2500 : false,
  });
  useEffect(() => {
    if (job.data && !activeJob(job.data.status)) {
      void project.refetch();
      if (mapEnabled) void map.refetch();
    }
  }, [job.data?.status, job.data?.job_id]);
  const all = requirements.data || [];
  const requested = params.get("requirement");
  const r =
    requested === "new"
      ? undefined
      : all.find((r) => r.id === requested) ||
        all.find((r) => r.status !== "APPROVED") ||
        all[0];
  const available = !r
    ? 0
    : r.ambiguities.length
      ? 0
      : r.status !== "APPROVED"
        ? 1
        : ["COMPLETE", "PARTIAL"].includes(map.data?.status || "") && !running
          ? 5
          : map.data
            ? 3
            : 2;
  const inferred =
    running && r?.status === "APPROVED"
      ? 2
      : nextStage(r, map.data, tests.data);
  const desired = params.get("stage");
  const parsed = desired === null ? inferred : Number(desired);
  const stage = Math.max(
    0,
    Math.min(Number.isInteger(parsed) ? parsed : inferred, available),
  );
  const navigateStage = (n: number) => {
    setParams((p) => {
      p.set("stage", String(n));
      return p;
    });
  };
  const generation = useAction(
    id,
    (selection: {
      scope: "all" | "ungenerated";
      areaIds: string[];
      moduleIds: string[];
    }) =>
      api.generate(
        id,
        r!.id,
        map.data!.id,
        undefined,
        selection.scope,
        selection.areaIds,
        selection.moduleIds,
      ),
    () => navigateStage(5),
  );
  const coverageGeneration = useAction(
    id,
    () => {
      const source = coverageGeneration.data || generation.data;
      const targets: Record<string, string[]> = {};
      for (const acId of source?.uncovered_acs || []) {
        targets[acId] = ["POSITIVE", "NEGATIVE"];
      }
      for (const gap of source?.partial_pairing_acs || []) {
        const [acId, missing] = gap.split(": missing ");
        if (acId && missing) {
          targets[acId] = [...new Set([...(targets[acId] || []), ...missing.split("/")])];
        }
      }
      return api.generate(id, r!.id, map.data!.id, targets);
    },
  );
  useEffect(() => {
    if (!generation.isPending && !coverageGeneration.isPending) return;
    const timer = window.setInterval(() => {
      void tests.refetch();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [generation.isPending, coverageGeneration.isPending, tests.refetch]);
  useEffect(() => {
    if (!generation.isPending) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [generation.isPending]);
  const select = (value: string) => {
    generation.reset();
    coverageGeneration.reset();
    setParams({ requirement: value });
  };
  const onSaved = (saved: Requirement) => {
    setParams({
      requirement: saved.id,
      stage: String(saved.ambiguities.length ? 0 : 1),
    });
  };
  const error =
    project.error ||
    requirements.error ||
    approvals.error ||
    tests.error ||
    map.error;
  const loading =
    project.isPending ||
    requirements.isPending ||
    approvals.isPending ||
    tests.isPending ||
    (mapEnabled && map.isPending);
  const currentTests =
    r && map.data
      ? (tests.data || []).filter(
          (t) =>
            t.requirement_id === r.id &&
            t.requirement_version === r.version &&
            t.application_map_id === map.data!.id,
        )
      : [];
  const complete = [
    !!r && !r.ambiguities.length,
    r?.status === "APPROVED",
    ["COMPLETE", "PARTIAL"].includes(map.data?.status || "") && !running,
    !!map.data && (reviewed === map.data.id || currentTests.length > 0),
    currentTests.length > 0,
    currentTests.length > 0,
  ];
  return (
    <Shell
      project={project.data?.name || "Project"}
      action={
        <button
          className="icon-button"
          title="Refresh workspace"
          aria-label="Refresh workspace"
          onClick={() => {
            void project.refetch();
            void requirements.refetch();
            void approvals.refetch();
            void tests.refetch();
            if (mapEnabled) void map.refetch();
            if (jobId) void job.refetch();
          }}
        >
          <RefreshCw size={15} />
        </button>
      }
    >
      <PageHeader
        eyebrow="PROJECT WORKSPACE"
        title={project.data?.name || "Your project"}
        description="One connected journey, from requirement to test confidence."
        action={
          project.data?.application_url &&
          /^https?:\/\//.test(project.data.application_url) ? (
            <a
              className="button secondary"
              href={project.data.application_url}
              target="_blank"
              rel="noreferrer"
            >
              Open application <ExternalLink size={14} />
            </a>
          ) : undefined
        }
      />
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState
          error={error}
          retry={() => {
            void project.refetch();
            void requirements.refetch();
            void approvals.refetch();
            void tests.refetch();
            if (mapEnabled) void map.refetch();
          }}
        />
      ) : (
        <>
          <div className="workspace-controls">
            <label>
              REQUIREMENT
              <select
                aria-label="Active requirement"
                value={r?.id || "new"}
                disabled={generation.isPending}
                onChange={(e) => select(e.target.value)}
              >
                <option value="new">New requirement</option>
                {all.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.req_code} · {r.title}
                  </option>
                ))}
              </select>
            </label>
            <Button
              variant="ghost"
              onClick={() => select("new")}
              disabled={generation.isPending}
            >
              <Plus size={15} />
              Add requirement
            </Button>
            <span className="workspace-progress">
              {complete.filter(Boolean).length} of 6 stages complete
            </span>
          </div>
          <WorkflowStepper
            stage={stage}
            available={generation.isPending ? -1 : available}
            completed={complete}
            running={generation.isPending ? 4 : running ? 2 : undefined}
            onChange={navigateStage}
          />
          <div className="stage-heading">
            <span className="eyebrow">
              STEP {String(stage + 1).padStart(2, "0")} / 06
            </span>
            <span>{stages[stage]}</span>
            <span className="stage-line" />
            <span className="muted">
              {generation.isPending
                ? "Test design in progress"
                : running
                  ? "Discovery is running"
                  : "Your journey continues here"}
              <ArrowRight size={13} />
            </span>
          </div>
          <div className="stage-content" key={`${stage}-${r?.id || "new"}`}>
            <Suspense fallback={<LoadingState />}>
              {stage === 0 && (
                <Requirements
                  key={`${r?.id}-${r?.version}`}
                  projectId={id}
                  requirement={r}
                  onSaved={onSaved}
                  onNext={() => navigateStage(1)}
                />
              )}{" "}
              {stage === 1 && r && (
                <Approvals
                  projectId={id}
                  requirement={r}
                  approval={approvals.data?.find(
                    (a) =>
                      a.target_type === "requirement" && a.target_id === r.id,
                  )}
                  onNext={() => navigateStage(2)}
                  onRevise={() => navigateStage(0)}
                />
              )}{" "}
              {stage === 2 && r && project.data && (
                <Discovery
                  project={project.data}
                  requirement={r}
                  map={map.data}
                  job={
                    job.data ||
                    (jobId
                      ? { job_id: jobId, status: "queued", result: null }
                      : undefined)
                  }
                  jobError={job.error}
                  refreshJob={() => {
                    void job.refetch();
                  }}
                  clearJob={() => {
                    setJobId("");
                    writeStored(`arc:job:${id}`, "");
                  }}
                  onStopped={() => {
                    setJobId("");
                    writeStored(`arc:job:${id}`, "");
                    void project.refetch();
                    void map.refetch();
                  }}
                  onStarted={(job) => {
                    setJobId(job);
                    writeStored(`arc:job:${id}`, job);
                  }}
                  onNext={() => navigateStage(3)}
                />
              )}{" "}
              {stage === 3 && map.data && (
                <ApplicationMap
                  map={map.data}
                  onNext={() => {
                    setReviewed(map.data!.id);
                    writeStored(`arc:reviewed:${id}`, map.data!.id);
                    navigateStage(4);
                  }}
                  onRetry={() => navigateStage(2)}
                />
              )}{" "}
              {stage === 4 && r && map.data && ["COMPLETE", "PARTIAL"].includes(map.data.status) && (
                <Generate
                  requirement={r}
                  map={map.data}
                  pending={generation.isPending}
                  savedCount={currentTests.length}
                  error={generation.error}
                  result={generation.data}
                  onGenerate={(scope, areaIds, moduleIds) =>
                    generation.mutate({ scope, areaIds, moduleIds })
                  }
                  onReview={() => navigateStage(5)}
                />
              )}{" "}
              {stage === 5 && (
                <TestCases
                  projectId={id}
                  tests={tests.data || []}
                  requirements={all}
                  map={map.data}
                  result={coverageGeneration.data || generation.data}
                  completingCoverage={coverageGeneration.isPending}
                  coverageError={coverageGeneration.error}
                  onCompleteCoverage={() => coverageGeneration.mutate()}
                />
              )}{" "}
              {stage === 3 && !map.data && (
                <Card>
                  <EmptyState
                    title="Discovery comes first"
                    description="Run discovery to build your application map."
                  />
                </Card>
              )}
            </Suspense>
          </div>
          <footer className="workspace-footer">
            <span>
              <span className="dot" />
              Grounded in your requirements and observed application data
            </span>
            <span>ARC / QUALITY ENGINEERING</span>
          </footer>
        </>
      )}
    </Shell>
  );
}
