import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Play, Download, Square } from "lucide-react";
import { api, ApiError } from "../../api/client";
import { activeJob } from "../../utils/workflow";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  ProgressIndicator,
  StatusBadge,
} from "../../components/ui";
import type {
  AutomationList,
  ExecutionEvidence,
  ExecutionResult,
  ExecutionRun,
} from "../../types/api";
import { flowNameForCase, groupByFlow, isRunnableReview } from "../automation/flows";

const CHANNELS = [
  "screenshot",
  "video",
  "trace",
  "console_log",
  "network_log",
] as const;

const startingSuites = new Set<string>();

function FlowCheck({
  checked,
  partial,
  disabled,
  onChange,
  label,
  detail,
}: {
  checked: boolean;
  partial: boolean;
  disabled?: boolean;
  onChange: () => void;
  label: string;
  detail: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = partial && !checked;
  }, [partial, checked]);
  return (
    <label className="flow-head">
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
    </label>
  );
}

function selectionStorageKey(projectId: string, generationId: string) {
  return `execution-picked:${projectId}:${generationId}`;
}

function readPicked(projectId: string, generationId: string, runnableIds: string[]): string[] | null {
  if (!generationId) return null;
  const raw = sessionStorage.getItem(selectionStorageKey(projectId, generationId));
  if (raw == null) return null;
  try {
    const saved = JSON.parse(raw) as unknown;
    if (!Array.isArray(saved)) return null;
    const allowed = new Set(runnableIds);
    return saved.filter((id): id is string => typeof id === "string" && allowed.has(id));
  } catch {
    return null;
  }
}

function latestResults(runs: ExecutionRun[]): Array<ExecutionResult & { runId: string }> {
  const seen = new Set<string>();
  const rows: Array<ExecutionResult & { runId: string }> = [];
  const ordered = [...runs].sort((left, right) =>
    (right.created_at || "").localeCompare(left.created_at || ""),
  );
  for (const run of ordered) {
    for (const result of run.results || []) {
      const key = result.automation_script_id || result.spec_path || result.id;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ ...result, runId: run.id });
    }
  }
  rows.sort((left, right) =>
    (left.title || left.spec_path).localeCompare(right.title || right.spec_path),
  );
  return rows;
}

function countResults(rows: { status: string }[]) {
  const summary = { passed: 0, failed: 0, skipped: 0, error: 0 };
  for (const row of rows) {
    const key = row.status.toLowerCase();
    if (key === "passed" || key === "failed" || key === "skipped" || key === "error") {
      summary[key] += 1;
    }
  }
  return summary;
}

function caseMark(
  scriptId: string,
  reviewStatus: string,
  executed: Map<string, string>,
  latestIds: Set<string>,
) {
  const review = reviewStatus.replaceAll("_", " ");
  const status = executed.get(scriptId);
  if (!status) return `${review} · Pending`;
  if (latestIds.has(scriptId)) return `${review} · Latest run · ${status}`;
  return `${review} · Executed · ${status}`;
}

function caseMarkClass(scriptId: string, executed: Map<string, string>, latestIds: Set<string>) {
  if (!executed.has(scriptId)) return "case-pending";
  if (latestIds.has(scriptId)) return "case-latest";
  return "case-executed";
}

function runButtonLabel(flowNames: string[], everyFlow: boolean, hasHistory: boolean, count: number) {
  if (count === 0) return hasHistory ? "Run again" : "Run suite";
  if (everyFlow) return hasHistory ? "Run again" : "Run suite";
  if (flowNames.length === 1) return `Run ${flowNames[0]}`;
  return `Run selected (${count})`;
}

export default function Execution({
  projectId,
  generations,
  onNext,
}: {
  projectId: string;
  generations: AutomationList["generations"];
  onNext?: () => void;
}) {
  const [generationId, setGenerationId] = useState(generations[0]?.generation_id || "");
  const [runDestructive, setRunDestructive] = useState(false);
  const [jobId, setJobId] = useState("");
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [resultsMode, setResultsMode] = useState<"latest" | "all">("latest");
  const [booting, setBooting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [autoError, setAutoError] = useState<unknown>(null);
  const client = useQueryClient();
  const history = useQuery({
    queryKey: ["workspace", projectId, "executions"],
    queryFn: ({ signal }) => api.executions(projectId, signal),
    refetchInterval: (query) =>
      query.state.data?.runs.some(
        (item) => item.status === "QUEUED" || item.status === "RUNNING",
      )
        ? 2000
        : false,
  });
  const suite = useQuery({
    queryKey: ["workspace", projectId, "automation", generationId],
    queryFn: ({ signal }) => api.automationGeneration(projectId, generationId, signal),
    enabled: !!generationId,
  });
  const tests = useQuery({
    queryKey: ["workspace", projectId, "tests"],
    queryFn: ({ signal }) => api.tests(projectId, signal),
  });
  const map = useQuery({
    queryKey: ["workspace", projectId, "map"],
    queryFn: ({ signal }) => api.map(projectId, signal),
  });
  const liveOwner = useQuery({
    queryKey: ["execution-live-owner"],
    queryFn: ({ signal }) => api.executionLive(signal),
    refetchInterval: 2000,
  });
  const job = useQuery({
    queryKey: ["workspace", projectId, "execution-job", jobId],
    queryFn: ({ signal }) => api.executionJob(jobId, signal),
    enabled: !!jobId,
    refetchInterval: (query) =>
      query.state.error
        ? false
        : activeJob(query.state.data?.status) || !query.state.data
          ? 2000
          : false,
    retry: (failCount, err) => {
      if (err instanceof ApiError && err.status === 404) return false;
      return failCount < 2;
    },
  });
  const running = !!jobId && !job.error && (!job.data || activeJob(job.data.status));
  const beginRun = async (
    generation: string,
    runDestructiveFlag = false,
    scriptIds: string[] = [],
  ) => {
    const key = `${projectId}:${generation}`;
    if (startingSuites.has(key)) return;
    startingSuites.add(key);
    setBooting(true);
    setAutoError(null);
    setOpenedId(null);
    setResultsMode("latest");
    setJobId("");
    try {
      const data = await api.startExecution(projectId, {
        generation_id: generation,
        run_destructive: runDestructiveFlag,
        script_ids: scriptIds,
      });
      setJobId(data.job_id);
      setOpenedId(data.run_id);
      setPinnedId(data.run_id);
      setResultsMode("latest");
      await client.invalidateQueries({ queryKey: ["workspace", projectId, "executions"] });
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        const fresh = await api.executions(projectId);
        const active = fresh.runs.find(
          (item) =>
            item.generation_id === generation &&
            (item.status === "QUEUED" || item.status === "RUNNING") &&
            item.job_id,
        );
        if (active?.job_id) {
          setJobId(active.job_id);
          setOpenedId(active.id);
          return;
        }
      }
      setAutoError(err);
    } finally {
      startingSuites.delete(key);
      setBooting(false);
    }
  };
  const stopRun = async () => {
    setStopping(true);
    setAutoError(null);
    try {
      await api.stopExecution(projectId);
      setJobId("");
      await client.invalidateQueries({ queryKey: ["workspace", projectId, "executions"] });
      await client.invalidateQueries({ queryKey: ["workspace", projectId, "execution-job"] });
      await client.invalidateQueries({ queryKey: ["workspace", projectId, "execution-run"] });
      await client.invalidateQueries({ queryKey: ["execution-live-owner"] });
    } catch (err: unknown) {
      setAutoError(err);
    } finally {
      setStopping(false);
    }
  };
  useEffect(() => {
    setJobId("");
    setOpenedId(null);
    setPinnedId(null);
    setAutoError(null);
    setGenerationId(generations[0]?.generation_id || "");
  }, [projectId]);
  useEffect(() => {
    const first = generations[0]?.generation_id;
    if (!first) return;
    setGenerationId((current) =>
      generations.some((item) => item.generation_id === current) ? current : first,
    );
  }, [generations]);
  useEffect(() => {
    if (history.isPending) return;
    const raw = sessionStorage.getItem(`execution-job:${projectId}`);
    let saved: { job_id?: string; run_id?: string; generation_id?: string } | null = null;
    if (raw) {
      sessionStorage.removeItem(`execution-job:${projectId}`);
      try {
        saved = JSON.parse(raw) as { job_id?: string; run_id?: string; generation_id?: string };
      } catch {
        saved = null;
      }
    }
    const live = history.data?.runs.find(
      (item) =>
        (item.status === "QUEUED" || item.status === "RUNNING") && item.job_id,
    );
    if (live?.job_id) {
      if (live.generation_id) setGenerationId(live.generation_id);
      setJobId(live.job_id);
      setOpenedId((current) => current || live.id);
      return;
    }
    if (!saved?.job_id) return;
    const savedJobId = saved.job_id;
    const savedRunId = saved.run_id;
    const savedGeneration = saved.generation_id;
    void api
      .executionJob(savedJobId)
      .then((job) => {
        if (!activeJob(job.status)) return;
        if (savedGeneration) setGenerationId(savedGeneration);
        setJobId(savedJobId);
        if (savedRunId) setOpenedId(savedRunId);
      })
      .catch(() => undefined);
  }, [projectId, history.isPending, history.data]);
  const selectedId =
    openedId || job.data?.run_id || (booting ? "" : history.data?.runs[0]?.id || "");
  const suiteRunning = (history.data?.runs ?? []).some(
    (item) => item.status === "QUEUED" || item.status === "RUNNING",
  );
  const detail = useQuery({
    queryKey: ["workspace", projectId, "execution-run", selectedId],
    queryFn: ({ signal }) => api.executionRun(projectId, selectedId, signal),
    enabled: !!selectedId,
    refetchInterval: running || suiteRunning ? 2000 : false,
  });
  const selected = generations.find((item) => item.generation_id === generationId);
  const canDestroy =
    selected?.risk_level === "DESTRUCTIVE" && selected.review_status === "APPROVED";
  const run = detail.data;
  const liveRun = history.data?.runs.find(
    (item) => item.status === "QUEUED" || item.status === "RUNNING",
  );
  const showLive = liveOwner.data?.project_id === projectId;
  const activityLines = (showLive ? liveOwner.data?.activity || "" : "")
    .replaceAll("\r", "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const currentStep = activityLines.at(-1) || "";
  const projectBusy = booting || running || !!liveRun;
  const flowScripts = useMemo(() => {
    const byCase = new Map((tests.data ?? []).map((test) => [test.id, test]));
    return (suite.data?.scripts ?? [])
      .map((script) => {
        const test = byCase.get(script.test_case_id);
        return {
          scriptId: script.script_id,
          code: script.test_case_code,
          title: test?.current.title || script.test_case_code,
          reviewStatus: script.review_status,
          runnable: isRunnableReview(script.review_status),
          flow: flowNameForCase(test, map.data),
        };
      })
      .sort((left, right) => left.code.localeCompare(right.code));
  }, [suite.data, tests.data, map.data]);
  const runnableKey = flowScripts
    .filter((script) => script.runnable)
    .map((script) => script.scriptId)
    .join(",");
  const [picked, setPicked] = useState<string[]>([]);
  const [closedFlows, setClosedFlows] = useState<Set<string>>(new Set());
  const appliedKey = useRef("");
  useEffect(() => {
    const key = `${projectId}|${generationId}|${runnableKey}`;
    if (appliedKey.current === key) return;
    appliedKey.current = key;
    const runnableIds = runnableKey ? runnableKey.split(",") : [];
    const saved = readPicked(projectId, generationId, runnableIds);
    setPicked(saved ?? runnableIds);
    setClosedFlows(new Set());
  }, [projectId, generationId, runnableKey]);
  const flowGroups = useMemo(
    () => groupByFlow(flowScripts, (script) => script.flow),
    [flowScripts],
  );
  const pickedSet = useMemo(() => new Set(picked), [picked]);
  const selectedFlowNames = flowGroups
    .filter((group) => {
      const runnable = group.items.filter((script) => script.runnable);
      return runnable.length > 0 && runnable.every((script) => pickedSet.has(script.scriptId));
    })
    .map((group) => group.flow);
  const flowsWithCases = flowGroups.filter((group) => group.items.some((script) => script.runnable));
  const everyFlow =
    flowsWithCases.length > 0 && flowsWithCases.every((group) => selectedFlowNames.includes(group.flow));
  const partialFlow = flowGroups.some((group) => {
    const runnable = group.items.filter((script) => script.runnable);
    const chosen = runnable.filter((script) => pickedSet.has(script.scriptId)).length;
    return chosen > 0 && chosen < runnable.length;
  });
  const singleFlow = !everyFlow && !partialFlow && selectedFlowNames.length === 1;
  const buttonLabel = runButtonLabel(
    singleFlow ? selectedFlowNames : [],
    everyFlow,
    (history.data?.runs.length ?? 0) > 0,
    picked.length,
  );
  const toggleScripts = (ids: string[], checked: boolean) => {
    setPicked((current) => {
      const without = current.filter((id) => !ids.includes(id));
      const next = checked ? [...without, ...ids] : without;
      if (generationId) {
        sessionStorage.setItem(selectionStorageKey(projectId, generationId), JSON.stringify(next));
      }
      return next;
    });
  };
  const generationRuns = useMemo(
    () => (history.data?.runs ?? []).filter((item) => item.generation_id === generationId),
    [history.data, generationId],
  );
  const runQueries = useQueries({
    queries: generationRuns.map((item) => ({
      queryKey: ["workspace", projectId, "execution-run", item.id],
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        api.executionRun(projectId, item.id, signal),
      refetchInterval:
        item.status === "QUEUED" || item.status === "RUNNING" ? 2000 : false,
    })),
  });
  const loadedRuns = runQueries
    .map((query) => query.data)
    .filter((item): item is ExecutionRun => !!item);
  const combinedRows = latestResults(loadedRuns);
  const latestRunId = openedId || generationRuns[0]?.id || "";
  const latestLoaded = loadedRuns.find((item) => item.id === latestRunId);
  const latestScriptIds = new Set(
    (latestLoaded?.results || [])
      .map((result) => result.automation_script_id)
      .filter((id): id is string => !!id),
  );
  const executedStatus = new Map<string, string>();
  for (const row of combinedRows) {
    if (row.automation_script_id) executedStatus.set(row.automation_script_id, row.status);
  }
  const pendingIds = flowScripts
    .filter((script) => script.runnable && !executedStatus.has(script.scriptId))
    .map((script) => script.scriptId);
  const latestIds = flowScripts
    .filter((script) => script.runnable && latestScriptIds.has(script.scriptId))
    .map((script) => script.scriptId);
  const replacePicked = (ids: string[]) => {
    setPicked(ids);
    if (generationId) {
      sessionStorage.setItem(selectionStorageKey(projectId, generationId), JSON.stringify(ids));
    }
  };
  const pinnedRun = pinnedId ? loadedRuns.find((item) => item.id === pinnedId) : undefined;
  const showCombined = resultsMode === "all" && !pinnedId;

  return (
    <div className="two-column">
      <div className="stack">
        <Card>
          <div className="card-heading">
            <div className="heading-icon">
              <Play size={20} />
            </div>
            <div>
              <h2>Execution</h2>
              <p>
                Check Login to run every login spec in the suite, including
                cases added in an earlier generate. Check every flow to run
                the whole suite.
              </p>
            </div>
          </div>
          {generations.length === 0 ? (
            <EmptyState
              title="Generate automation first"
              description="Create a Playwright suite on the previous step before running it."
            />
          ) : (
            <>
              <label className="field">
                <span>Suite</span>
                <select
                  value={generationId}
                  onChange={(event) => setGenerationId(event.target.value)}
                >
                  {generations.map((item) => (
                    <option key={item.generation_id} value={item.generation_id}>
                      {item.generation_id.slice(0, 8)} · {item.script_count} scripts ·{" "}
                      {item.review_status}
                      {item.executed ? " · executed" : ""}
                    </option>
                  ))}
                </select>
              </label>
              {canDestroy && (
                <label className="execution-destructive">
                  <input
                    type="checkbox"
                    checked={runDestructive}
                    onChange={(event) => setRunDestructive(event.target.checked)}
                  />
                  Include approved destructive flows (RUN_DESTRUCTIVE)
                </label>
              )}
              {selected?.risk_level === "DESTRUCTIVE" && !canDestroy && (
                <p className="muted">
                  Destructive scripts stay skipped until a tester approves them.
                </p>
              )}
              {suite.isPending ? (
                <p className="muted">Loading flows from this suite.</p>
              ) : suite.error ? (
                <ErrorState error={suite.error} />
              ) : flowGroups.length === 0 ? (
                <p className="muted">This suite has no scripts yet.</p>
              ) : (
                <ul className="automation-cases flow-picker">
                  {flowGroups.map((group) => {
                    const runnable = group.items.filter((script) => script.runnable);
                    const runnableIds = runnable.map((script) => script.scriptId);
                    const chosen = runnableIds.filter((id) => pickedSet.has(id)).length;
                    const open = !closedFlows.has(group.flow);
                    return (
                      <li key={group.flow} className="flow-group">
                        <div className="flow-group-bar">
                          <button
                            type="button"
                            className="flow-toggle"
                            aria-expanded={open}
                            onClick={() =>
                              setClosedFlows((current) => {
                                const next = new Set(current);
                                if (next.has(group.flow)) next.delete(group.flow);
                                else next.add(group.flow);
                                return next;
                              })
                            }
                          >
                            <ChevronRight size={14} className={open ? "chevron open" : "chevron"} />
                          </button>
                          <FlowCheck
                            checked={runnableIds.length > 0 && chosen === runnableIds.length}
                            partial={chosen > 0}
                            disabled={runnableIds.length === 0}
                            onChange={() =>
                              toggleScripts(runnableIds, chosen !== runnableIds.length)
                            }
                            label={group.flow}
                            detail={`${chosen} selected · ${
                              runnable.filter((script) => !executedStatus.has(script.scriptId)).length
                            } pending · ${
                              runnable.filter((script) => executedStatus.has(script.scriptId)).length
                            } executed`}
                          />
                        </div>
                        {open && (
                          <ul>
                            {group.items.map((script) => (
                              <li key={script.scriptId}>
                                <label>
                                  <input
                                    type="checkbox"
                                    checked={script.runnable && pickedSet.has(script.scriptId)}
                                    disabled={!script.runnable}
                                    onChange={() =>
                                      toggleScripts(
                                        [script.scriptId],
                                        !pickedSet.has(script.scriptId),
                                      )
                                    }
                                  />
                                  <span>
                                    <strong>
                                      {script.code} · {script.title}
                                    </strong>
                                    <small className={caseMarkClass(script.scriptId, executedStatus, latestScriptIds)}>
                                      {caseMark(script.scriptId, script.reviewStatus, executedStatus, latestScriptIds)}
                                    </small>
                                  </span>
                                </label>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="actions">
                <Button
                  variant="secondary"
                  disabled={pendingIds.length === 0 || projectBusy}
                  onClick={() => replacePicked(pendingIds)}
                >
                  Select pending
                </Button>
                <Button
                  variant="secondary"
                  disabled={latestIds.length === 0 || projectBusy}
                  onClick={() => replacePicked(latestIds)}
                >
                  Select latest run
                </Button>
                <Button
                  busy={booting || running}
                  disabled={!generationId || projectBusy || picked.length === 0}
                  onClick={() =>
                    void beginRun(generationId, canDestroy && runDestructive, picked)
                  }
                >
                  {buttonLabel}
                </Button>
                {projectBusy && (
                  <Button
                    type="button"
                    className="danger"
                    busy={stopping}
                    onClick={() => void stopRun()}
                  >
                    <Square size={14} />
                    Stop execution
                  </Button>
                )}
                {onNext && (
                  <Button variant="secondary" onClick={onNext}>
                    Continue to report
                  </Button>
                )}
              </div>
            </>
          )}
          {projectBusy && (
            <ProgressIndicator
              label={showLive ? "Running Playwright" : "Execution queued"}
              description={
                showLive
                  ? currentStep ||
                    "Playwright is running. The test name appears under the live browser."
                  : "This project is waiting. The live browser appears here only while this project is executing."
              }
            />
          )}
          {autoError ? <ErrorState error={autoError} /> : null}
          {job.error && <ErrorState error={job.error} />}
          {detail.error && <ErrorState error={detail.error} />}
        </Card>
        {showLive && (
          <Card>
            <div className="card-heading">
              <div>
                <h2>Live browser</h2>
                <p>Chromium for this project, following this run.</p>
              </div>
            </div>
            <div className="execution-now">
              <span>Now</span>
              <strong>{currentStep || "Starting the suite"}</strong>
            </div>
            {activityLines.length > 0 && (
              <pre className="execution-activity">{activityLines.slice(-12).join("\n")}</pre>
            )}
            <iframe
              className="execution-live"
              title="Live browser"
              src="/live/vnc.html?autoconnect=1&resize=scale&path=live/websockify"
            />
          </Card>
        )}
        {(() => {
          const latestRun = loadedRuns.find((item) => item.id === latestRunId) || run;
          const shown = pinnedRun || (showCombined ? latestRun || loadedRuns[0] : latestRun || loadedRuns[0]);
          if (!shown) return null;
          return (
            <RunDetail
              projectId={projectId}
              run={shown}
              rows={showCombined && combinedRows.length > 0 ? combinedRows : undefined}
              combined={showCombined && combinedRows.length > 0}
              latest={!showCombined && (!pinnedId || pinnedId === latestRunId)}
            />
          );
        })()}
      </div>
      <aside>
        <Card className="guide-card">
          <div className="eyebrow">DETERMINISTIC</div>
          <h3>No LLM on this path</h3>
          <p>
            Status is expected versus actual from Playwright. After a run,
            download video or trace to replay the browser session step by step.
            Console and network logs show what the page did.
          </p>
        </Card>
        <Card>
          <div className="card-heading">
            <div>
              <h2>Earlier runs</h2>
            </div>
          </div>
          {(history.data?.runs.length ?? 0) === 0 ? (
            <p className="muted">No suite has been executed for this project yet.</p>
          ) : (
            <ul className="automation-history">
              <li>
                <button
                  type="button"
                  aria-current={
                    resultsMode === "latest" && (!pinnedId || pinnedId === latestRunId)
                      ? "true"
                      : undefined
                  }
                  onClick={() => {
                    setPinnedId(null);
                    setResultsMode("latest");
                  }}
                >
                  <span>Latest run</span>
                  <small>Only the cases executed most recently</small>
                </button>
                <button
                  type="button"
                  aria-current={!pinnedId && resultsMode === "all" ? "true" : undefined}
                  onClick={() => {
                    setPinnedId(null);
                    setResultsMode("all");
                  }}
                >
                  <span>All cases so far</span>
                  <small>Login and later flows stay together</small>
                </button>
              </li>
              {history.data?.runs.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-current={pinnedId === item.id ? "true" : undefined}
                    onClick={() => {
                      setPinnedId(item.id);
                      setResultsMode("latest");
                    }}
                  >
                    <span>{item.status}</span>
                    <small>
                      {(Number(item.summary.passed) || 0) +
                        (Number(item.summary.failed) || 0) +
                        (Number(item.summary.skipped) || 0) +
                        (Number(item.summary.error) || 0) || item.result_count}{" "}
                      results
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </aside>
    </div>
  );
}

function RunDetail({
  projectId,
  run,
  rows,
  combined = false,
  latest = false,
}: {
  projectId: string;
  run: ExecutionRun;
  rows?: Array<ExecutionResult & { runId: string }>;
  combined?: boolean;
  latest?: boolean;
}) {
  const results = rows ?? (run.results || []).map((result) => ({ ...result, runId: run.id }));
  const summary = combined ? countResults(results) : run.summary;
  return (
    <Card>
      <p className="automation-banner">
        {combined
          ? "Each case keeps its latest result, including flows you ran earlier."
          : latest
            ? "These are the cases from the latest execution."
            : run.status === "COMPLETED"
            ? "Suite executed against the application"
            : run.status === "FAILED"
              ? "Execution finished with failures"
              : `Run ${run.status.toLowerCase()}`}
      </p>
      <div className="automation-status">
        <StatusBadge status={run.status} />
        {run.run_destructive && <span className="muted">Destructive enabled</span>}
      </div>
      {run.detail && <p className="notice error">{run.detail}</p>}
      <p className="muted">
        {run.status === "RUNNING" || run.status === "QUEUED"
          ? "Finished tests are listed below as soon as each one completes."
          : "Use video and trace to replay any step."}
      </p>
      <dl className="automation-counts">
        <div>
          <dt>Passed</dt>
          <dd>{summary.passed ?? 0}</dd>
        </div>
        <div>
          <dt>Failed</dt>
          <dd>{summary.failed ?? 0}</dd>
        </div>
        <div>
          <dt>Skipped</dt>
          <dd>{summary.skipped ?? 0}</dd>
        </div>
        <div>
          <dt>Error</dt>
          <dd>{summary.error ?? 0}</dd>
        </div>
      </dl>
      {run.log && <pre className="source-preview">{run.log}</pre>}
      {results.length === 0 ? (
        <p className="muted">
          {run.status === "RUNNING" || run.status === "QUEUED"
            ? "Waiting for the first test to finish."
            : "This run has no test results."}
        </p>
      ) : (
        <div className="table-scroll">
          <table className="execution-results">
            <thead>
              <tr>
                <th>Spec</th>
                <th>Status</th>
                <th>Expected</th>
                <th>Actual</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result) => (
                <tr key={result.id}>
                  <td>
                    <strong>{result.title || result.spec_path}</strong>
                    {result.title && (
                      <small className="muted">{result.spec_path}</small>
                    )}
                    {result.category && (
                      <small className={`category ${result.category.toLowerCase()}`}>
                        {result.category.replaceAll("_", " ")}
                      </small>
                    )}
                    {(result.inputs?.length ?? 0) > 0 && (
                      <ul className="execution-inputs">
                        {result.inputs?.map((field) => (
                          <li key={`${result.id}-${field.name}`}>
                            <span>{field.name}</span>
                            <code>{field.value || "empty"}</code>
                          </li>
                        ))}
                      </ul>
                    )}
                    {result.cause && <small>{result.cause}</small>}
                    {result.recommendation && (
                      <small className="muted">{result.recommendation}</small>
                    )}
                    {result.error_message && (
                      <small className="muted">{result.error_message}</small>
                    )}
                  </td>
                  <td>
                    <StatusBadge status={result.status} />
                  </td>
                  <td>{result.assertion.expected}</td>
                  <td>{result.assertion.actual}</td>
                  <td>
                    <EvidenceLinks
                      projectId={projectId}
                      runId={result.runId}
                      resultId={result.id}
                      evidence={result.evidence}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

const PREVIEWABLE = new Set(["screenshot", "video", "console_log", "network_log"]);

function EvidenceLinks({
  projectId,
  runId,
  resultId,
  evidence,
}: {
  projectId: string;
  runId: string;
  resultId: string;
  evidence: ExecutionEvidence;
}) {
  const [busy, setBusy] = useState<string>("");
  const [preview, setPreview] = useState<{
    channel: string;
    url: string;
    text: string;
  } | null>(null);
  const available = CHANNELS.filter((channel) => evidence[channel]);
  if (!available.length) {
    return <span className="muted">None</span>;
  }
  const openPreview = (channel: string) => {
    setBusy(channel);
    void api
      .fetchEvidence(projectId, runId, resultId, channel)
      .then(async (blob) => {
        if (preview?.url) URL.revokeObjectURL(preview.url);
        const text =
          channel === "console_log" || channel === "network_log"
            ? await blob.text()
            : "";
        setPreview({
          channel,
          url: URL.createObjectURL(blob),
          text,
        });
      })
      .finally(() => setBusy(""));
  };
  return (
    <div className="execution-evidence">
      {available.map((channel) => (
        <span key={channel} className="execution-evidence-actions">
          {PREVIEWABLE.has(channel) && (
            <button
              type="button"
              className="link-button"
              disabled={busy === channel}
              onClick={() => openPreview(channel)}
            >
              {channel.replace("_", " ")}
            </button>
          )}
          <button
            type="button"
            className="link-button"
            disabled={busy === `download-${channel}`}
            onClick={() => {
              setBusy(`download-${channel}`);
              void api
                .downloadEvidence(projectId, runId, resultId, channel)
                .finally(() => setBusy(""));
            }}
          >
            <Download size={12} />
            {PREVIEWABLE.has(channel) ? "Download" : channel.replace("_", " ")}
          </button>
        </span>
      ))}
      {preview && (
        <div className="execution-preview">
          {preview.channel === "screenshot" && (
            <img src={preview.url} alt="Failure screenshot" />
          )}
          {preview.channel === "video" && (
            <video src={preview.url} controls />
          )}
          {(preview.channel === "console_log" || preview.channel === "network_log") && (
            <pre>{preview.text || "Empty log."}</pre>
          )}
        </div>
      )}
    </div>
  );
}