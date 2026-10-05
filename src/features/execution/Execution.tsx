import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, Download, Square } from "lucide-react";
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
  ExecutionRun,
} from "../../types/api";

const CHANNELS = [
  "screenshot",
  "video",
  "trace",
  "console_log",
  "network_log",
] as const;

const startingSuites = new Set<string>();

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
  const beginRun = async (generation: string, runDestructiveFlag = false) => {
    const key = `${projectId}:${generation}`;
    if (startingSuites.has(key)) return;
    startingSuites.add(key);
    setBooting(true);
    setAutoError(null);
    setOpenedId(null);
    setJobId("");
    try {
      const data = await api.startExecution(projectId, {
        generation_id: generation,
        run_destructive: runDestructiveFlag,
      });
      setJobId(data.job_id);
      setOpenedId(data.run_id);
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
  const detail = useQuery({
    queryKey: ["workspace", projectId, "execution-run", selectedId],
    queryFn: ({ signal }) => api.executionRun(projectId, selectedId, signal),
    enabled: !!selectedId,
    refetchInterval: running ? 2000 : false,
  });
  const selected = generations.find((item) => item.generation_id === generationId);
  const canDestroy =
    selected?.risk_level === "DESTRUCTIVE" && selected.review_status === "APPROVED";
  const run = detail.data;
  const liveRun = history.data?.runs.find(
    (item) => item.status === "QUEUED" || item.status === "RUNNING",
  );
  const showLive = liveOwner.data?.project_id === projectId;
  const projectBusy = booting || running || !!liveRun;

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
                After the suite is generated, this step runs that Playwright code
                on the server. Run suite starts it again.
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
              <div className="actions">
                <Button
                  busy={booting || running}
                  disabled={!generationId || projectBusy}
                  onClick={() => void beginRun(generationId, canDestroy && runDestructive)}
                >
                  Run suite
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
          {(booting || running) && (
            <ProgressIndicator
              label={showLive ? "Running Playwright" : "Execution queued"}
              description={
                showLive
                  ? "Chromium for this project is shown below. Results appear here as each check finishes."
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
            <iframe
              className="execution-live"
              title="Live browser"
              src="/live/vnc.html?autoconnect=1&resize=scale&path=live/websockify"
            />
          </Card>
        )}
        {run && <RunDetail projectId={projectId} run={run} />}
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
              {history.data?.runs.map((item) => (
                <li key={item.id}>
                  <button type="button" onClick={() => setOpenedId(item.id)}>
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
}: {
  projectId: string;
  run: ExecutionRun;
}) {
  const results = run.results || [];
  return (
    <Card>
      <p className="automation-banner">
        {run.status === "COMPLETED"
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
        While the run is in progress, the live browser above follows Chromium.
        After it finishes, use video and trace to replay any step.
      </p>
      <dl className="automation-counts">
        <div>
          <dt>Passed</dt>
          <dd>{run.summary.passed ?? 0}</dd>
        </div>
        <div>
          <dt>Failed</dt>
          <dd>{run.summary.failed ?? 0}</dd>
        </div>
        <div>
          <dt>Skipped</dt>
          <dd>{run.summary.skipped ?? 0}</dd>
        </div>
        <div>
          <dt>Error</dt>
          <dd>{run.summary.error ?? 0}</dd>
        </div>
      </dl>
      {run.log && <pre className="source-preview">{run.log}</pre>}
      {results.length === 0 ? (
        <p className="muted">Results appear when the worker finishes.</p>
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
                      runId={run.id}
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