import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet } from "lucide-react";
import { api } from "../../api/client";
import { finishedExecution } from "../../utils/workflow";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  StatusBadge,
} from "../../components/ui";
import {
  durationLabel,
  exportExecutionExcelReport,
} from "./exportExecutionExcel";

export default function ExecutionReport({ projectId }: { projectId: string }) {
  const history = useQuery({
    queryKey: ["workspace", projectId, "executions"],
    queryFn: ({ signal }) => api.executions(projectId, signal),
  });
  const finished = (history.data?.runs || []).filter((run) =>
    finishedExecution(run.status),
  );
  const [runId, setRunId] = useState("");
  const [exporting, setExporting] = useState(false);
  const latestId = finished[0]?.id || "";
  useEffect(() => {
    if (!runId && latestId) setRunId(latestId);
  }, [runId, latestId]);
  const report = useQuery({
    queryKey: ["workspace", projectId, "execution-report", runId],
    queryFn: ({ signal }) => api.executionReport(projectId, runId, signal),
    enabled: !!runId,
  });
  const data = report.data;

  return (
    <Card>
      <div className="card-heading">
        <div className="heading-icon">
          <FileSpreadsheet size={20} />
        </div>
        <div>
          <h2>Execution report</h2>
          <p>
            Pass and fail come from the Playwright run. This is not the discovery
            map or the test-case workbook.
          </p>
        </div>
      </div>
      {history.isPending ? (
        <LoadingState />
      ) : history.error ? (
        <ErrorState error={history.error} />
      ) : finished.length === 0 ? (
        <EmptyState
          title="No finished execution yet"
          description="Run the Playwright suite on the previous step. The report appears after that run finishes."
        />
      ) : (
        <>
          <label className="field">
            <span>Run</span>
            <select
              aria-label="Execution run"
              value={runId}
              onChange={(event) => setRunId(event.target.value)}
            >
              {finished.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.status} · {run.base_url || "application"} ·{" "}
                  {(run.finished_at || run.created_at || "").slice(0, 16)}
                </option>
              ))}
            </select>
          </label>
          {report.isPending && <LoadingState />}
          {report.error && <ErrorState error={report.error} />}
          {data && (
            <>
              <div className="automation-status">
                <StatusBadge status={data.status} />
                <span className="muted">{data.environment}</span>
                {data.base_url && <span className="muted">{data.base_url}</span>}
              </div>
              <dl className="automation-counts">
                <div>
                  <dt>Total</dt>
                  <dd>{data.counts.total}</dd>
                </div>
                <div>
                  <dt>Passed</dt>
                  <dd>{data.counts.passed}</dd>
                </div>
                <div>
                  <dt>Failed</dt>
                  <dd>{data.counts.failed}</dd>
                </div>
                <div>
                  <dt>Skipped</dt>
                  <dd>{data.counts.skipped}</dd>
                </div>
                <div>
                  <dt>Error</dt>
                  <dd>{data.counts.error}</dd>
                </div>
                <div>
                  <dt>Pass rate</dt>
                  <dd>{data.counts.pass_rate}%</dd>
                </div>
                <div>
                  <dt>Duration</dt>
                  <dd>{durationLabel(data.counts.duration_ms) || "0 ms"}</dd>
                </div>
              </dl>
              <div className="actions">
                <Button
                  variant="secondary"
                  busy={exporting}
                  onClick={() => {
                    setExporting(true);
                    void exportExecutionExcelReport(data).finally(() =>
                      setExporting(false),
                    );
                  }}
                >
                  <Download size={15} />
                  Download Excel
                </Button>
              </div>
              {data.results.length === 0 ? (
                <p className="muted">This run has no result rows.</p>
              ) : (
                <div className="table-scroll">
                  <table className="execution-results">
                    <thead>
                      <tr>
                        <th>Test case</th>
                        <th>Title</th>
                        <th>Requirement</th>
                        <th>Status</th>
                        <th>Expected</th>
                        <th>Actual</th>
                        <th>Duration</th>
                        <th>Error</th>
                        <th>Evidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.results.map((row) => (
                        <tr key={row.id}>
                          <td>
                            <strong>{row.test_case_code}</strong>
                          </td>
                          <td>{row.title}</td>
                          <td>{row.requirement_code || "—"}</td>
                          <td>
                            <StatusBadge status={row.status} />
                          </td>
                          <td>{row.expected}</td>
                          <td>{row.actual}</td>
                          <td>{durationLabel(row.duration_ms)}</td>
                          <td>{row.error_message || ""}</td>
                          <td>{row.evidence.length ? row.evidence.join(", ") : "None"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}
    </Card>
  );
}
