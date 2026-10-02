import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Code2, Download, FolderTree, ArrowRight } from "lucide-react";

import { api } from "../../api/client";
import { useAction } from "../../hooks/useAction";

import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  ProgressIndicator,
  StatusBadge,
  NextAction,
} from "../../components/ui";

import type {
  AppMap,
  AutomationGeneration,
  Requirement,
  TestCase,
} from "../../types/api";


function ineligibleReason(
  test: TestCase,
  requirement?: Requirement,
  map?: AppMap | null,
) {
  if (test.status === "OUTDATED") {
    return "Outdated. Revise the case and approve the new version.";
  }

  if (test.status !== "APPROVED") {
    return `${test.status.replaceAll("_", " ")} cases cannot generate automation.`;
  }

  if (
    requirement &&
    test.requirement_id === requirement.id &&
    test.requirement_version !== requirement.version
  ) {
    return "Stale: the requirement version changed after this case was approved.";
  }

  if (map && test.application_map_id !== map.id) {
    return "This case uses a different application map.";
  }

  return null;
}


export default function Automation({
  projectId,
  tests,
  map,
  requirement,
  onNext,
}: {
  projectId: string;
  tests: TestCase[];
  map?: AppMap | null;
  requirement?: Requirement;
  onNext?: () => void;
}) {
  const rows = useMemo(
    () =>
      tests.map((test) => ({
        test,
        reason: ineligibleReason(test, requirement, map),
      })),
    [tests, requirement, map],
  );

  const eligible = rows.filter((row) => !row.reason);
  const blockedHere = rows.filter((row) => row.reason);

  const [selected, setSelected] = useState<string[]>(() =>
    eligible.map((row) => row.test.id),
  );

  const [file, setFile] = useState<string>("");
  const [openedId, setOpenedId] = useState<string | null>(null);

  const generate = useAction(
    projectId,
    (ids: string[]) => api.generateAutomation(projectId, ids),
    (data) => {
      setOpenedId(data.generation_id);
      if (!data.execution_job_id) return;
      sessionStorage.setItem(
        `execution-job:${projectId}`,
        JSON.stringify({
          job_id: data.execution_job_id,
          run_id: data.execution_run_id,
          generation_id: data.generation_id,
        }),
      );
      onNext?.();
    },
  );

  const history = useQuery({
    queryKey: ["workspace", projectId, "automation"],
    queryFn: ({ signal }) => api.automation(projectId, signal),
  });

  const opened = useQuery({
    queryKey: ["workspace", projectId, "automation", openedId],
    queryFn: ({ signal }) =>
      api.automationGeneration(projectId, openedId || "", signal),
    enabled: !!openedId && openedId !== generate.data?.generation_id,
  });

  const latestId = history.data?.generations[0]?.generation_id ?? null;

  useEffect(() => {
    if (generate.data) {
      setOpenedId(generate.data.generation_id);
    }
  }, [generate.data]);

  useEffect(() => {
    if (!openedId && latestId) {
      setOpenedId(latestId);
    }
  }, [latestId, openedId]);

  const result =
    generate.data && generate.data.generation_id === openedId
      ? generate.data
      : opened.data;

  const preview = result?.sources.find(
    (item) => item.path === file,
  )?.content;

  const toggle = (id: string) => {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  return (
    <div className="two-column">
      <div className="stack">
        <Card>
          <div className="card-heading">
            <div className="heading-icon">
              <Code2 size={20} />
            </div>

            <div>
              <h2>
                Automation <span className="count">{eligible.length}</span>
              </h2>

              <p>
                Approved cases become a reviewed Playwright suite. Run it on
                the next step.
              </p>
            </div>
          </div>

          {eligible.length === 0 ? (
            <EmptyState
              title="No approved cases yet"
              description="Approve a test case on the previous step before generating automation."
            />
          ) : (
            <ul className="automation-cases">
              {eligible.map(({ test }) => (
                <li key={test.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selected.includes(test.id)}
                      onChange={() => toggle(test.id)}
                    />

                    <span>
                      <strong>
                        {test.tc_code} · {test.current.title}
                      </strong>

                      <small>Version {test.current_version}</small>
                    </span>
                  </label>

                  <StatusBadge status={test.status} />
                </li>
              ))}
            </ul>
          )}

          {blockedHere.length > 0 && (
            <div className="automation-blocked">
              <h3>Not eligible</h3>

              <ul>
                {blockedHere.map(({ test, reason }) => (
                  <li key={test.id}>
                    <strong>{test.tc_code}</strong>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="actions">
            <Button
              busy={generate.isPending}
              disabled={!selected.length}
              onClick={() => generate.mutate(selected)}
            >
              Generate Playwright suite
            </Button>

            {onNext && (history.data?.generations.length ?? 0) > 0 && (
              <Button variant="secondary" onClick={onNext}>
                Continue to Execution
                <ArrowRight size={15} />
              </Button>
            )}
          </div>

          {generate.isPending && (
            <ProgressIndicator
              label="Writing the suite"
              description="The server writes the Playwright code, then starts the execution agent."
            />
          )}

          {generate.error && <ErrorState error={generate.error} />}
          {opened.error && <ErrorState error={opened.error} />}
        </Card>

        {result && (
          <Result
            result={result}
            projectId={projectId}
            file={file}
            preview={preview}
            onFile={setFile}
            onNext={onNext}
          />
        )}
      </div>

      <aside>
        <Card className="guide-card">
          <div className="eyebrow">
            {result?.executed ? "REVIEWED AND RUNNABLE" : "REVIEWED"}
          </div>

          <h3>
            {result?.executed
              ? "Suite generated — already executed"
              : "Generated and reviewed — run next"}
          </h3>

          <p>
            After the suite is written, the execution agent runs
            npx playwright test on the server. You do not need to run that
            command yourself. Destructive flows stay skipped until
            RUN_DESTRUCTIVE is true.
          </p>
        </Card>

        <Card>
          <div className="card-heading">
            <div>
              <h2>Earlier suites</h2>
            </div>
          </div>

          {(history.data?.generations.length ?? 0) === 0 ? (
            <p className="muted">
              No suite has been generated for this project yet.
            </p>
          ) : (
            <ul className="automation-history">
              {history.data?.generations.map((item) => (
                <li key={item.generation_id}>
                  <button
                    type="button"
                    onClick={() => setOpenedId(item.generation_id)}
                  >
                    <span>{item.review_status}</span>

                    <small>
                      {item.script_count} scripts · {item.verification_status}
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


/**
 * Actions available for an already generated automation suite.
 *
 * FIX:
 * `result` is explicitly accepted here because this component uses
 * result.generation_id and result.vscode_url.
 */
function SuiteActions({
  projectId,
  result,
}: {
  projectId: string;
  result: AutomationGeneration;
}) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  return (
    <>
      <div className="actions">
        <Button
          variant="secondary"
          busy={downloading}
          onClick={() => {
            setDownloadError("");
            setDownloading(true);

            void api
              .downloadAutomation(projectId, result.generation_id)
              .catch((error: unknown) => {
                setDownloadError(
                  error instanceof Error
                    ? error.message
                    : "Download failed.",
                );
              })
              .finally(() => setDownloading(false));
          }}
        >
          <Download size={15} />
          Download ZIP
        </Button>

        {result.vscode_url && (
          <a
            className="button secondary"
            href={result.vscode_url}
          >
            Open in VS Code
          </a>
        )}
      </div>

      {downloadError && (
        <ErrorState error={new Error(downloadError)} />
      )}
    </>
  );
}


/**
 * Displays the generated automation result.
 *
 * FIX:
 * `onNext` is explicitly accepted because this component renders
 * the Continue to Execution action.
 */
function Result({
  projectId,
  result,
  file,
  preview,
  onFile,
  onNext,
}: {
  projectId: string;
  result: AutomationGeneration;
  file: string;
  preview?: string;
  onFile: (path: string) => void;
  onNext?: () => void;
}) {
  return (
    <Card>
      <div className="automation-result-head">
        <p className="automation-banner">{result.label}</p>

        <SuiteActions
          projectId={projectId}
          result={result}
        />
      </div>

      <div className="automation-status">
        <StatusBadge status={result.review_status} />
        <StatusBadge status={result.risk_level} />
        <StatusBadge status={result.verification.status} />

        {result.approval_required && (
          <span className="muted">
            Tester approval required
          </span>
        )}
      </div>

      {result.blocked.length > 0 && (
        <div className="automation-blocked">
          <h3>Blocked during generation</h3>

          <ul>
            {result.blocked.map((item) => (
              <li key={item.test_case_id}>
                <strong>{item.test_case_code}</strong>
                <span>{item.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <dl className="automation-counts">
        <div>
          <dt>Sleep</dt>
          <dd>{result.lint.hardcoded_sleep}</dd>
        </div>

        <div>
          <dt>XPath</dt>
          <dd>{result.lint.xpath_fallback}</dd>
        </div>

        <div>
          <dt>Secrets</dt>
          <dd>{result.lint.literal_credentials}</dd>
        </div>

        <div>
          <dt>test.only</dt>
          <dd>{result.lint.test_only}</dd>
        </div>

        <div>
          <dt>Missing await</dt>
          <dd>{result.lint.missing_await}</dd>
        </div>

        <div>
          <dt>Traceability</dt>
          <dd>{result.lint.missing_traceability}</dd>
        </div>

        <div>
          <dt>Blocked selectors</dt>
          <dd>{result.lint.unsupported_blocked_selectors}</dd>
        </div>

        <div>
          <dt>Destructive skip</dt>
          <dd>{result.lint.destructive_not_skipped}</dd>
        </div>
      </dl>

      <p className="muted">
        Verification: {result.verification.status}. Type check{" "}
        {result.verification.tsc}. List{" "}
        {result.verification.playwright_list}.
        {result.verification.detail
          ? ` ${result.verification.detail}`
          : ""}
      </p>

      <div className="automation-files">
        <div>
          <h3>
            <FolderTree size={14} /> Files
          </h3>

          <ul className="file-tree">
            {result.file_tree.map((path) => (
              <li key={path}>
                <button
                  type="button"
                  onClick={() => onFile(path)}
                  aria-current={file === path}
                >
                  {path}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <pre className="source-preview">
          {preview || "Select a file to preview its source."}
        </pre>
      </div>

      {onNext && (
        <NextAction
          title="Run the suite against the application"
          description="Execution captures pass/fail from assertions plus screenshots, video, traces, console, and network logs."
          label="Continue to Execution"
          onClick={onNext}
        />
      )}
    </Card>
  );
}