import { useState } from "react";
import { Radar, RefreshCw } from "lucide-react";
import { api, ApiError } from "../../api/client";
import { useAction } from "../../hooks/useAction";
import { activeJob, human } from "../../utils/workflow";
import type { Project, Requirement, AppMap, Job } from "../../types/api";
import {
  Button,
  Card,
  StatusBadge,
  ErrorState,
  ProgressIndicator,
  NextAction,
  Timeline,
} from "../../components/ui";
import { ApplicationAccess } from "./ApplicationAccess";
import LiveDiscoveryGraph from "./LiveDiscoveryGraph";

export default function Discovery({
  project,
  requirement,
  map,
  job,
  jobError,
  onStarted,
  onNext,
  refreshJob,
  clearJob,
}: {
  project: Project;
  requirement: Requirement;
  map?: AppMap | null;
  job?: Job;
  jobError: unknown;
  onStarted: (id: string) => void;
  onNext: () => void;
  refreshJob: () => void;
  clearJob: () => void;
}) {
  const [url, setUrl] = useState(project.application_url || "");
  const [pages, setPages] = useState(150);
  const [depth, setDepth] = useState(6);
  const [duration, setDuration] = useState(900);

  /**
   * credential_ref of the account chosen for this run.
   * Null means "not selected yet" — the ApplicationAccess panel auto-selects
   * the default account when accounts load.
   */
  const [selectedRef, setSelectedRef] = useState<string | null>(
    project.credential_ref ?? null,
  );

  /** Whether any account has been saved (for the "Configured" badge) */
  const [savedBadge, setSavedBadge] = useState(!!project.credential_ref);

  const discover = useAction(
    project.id,
    () =>
      api.discover(project.id, {
        url,
        focus_requirements: [`${requirement.id}@v${requirement.version}`],
        max_pages: pages,
        max_depth: depth,
        max_duration_seconds: duration,
        credential_ref: selectedRef ?? undefined,
      }),
    (data) => onStarted(data.job_id),
  );

  const running =
    !jobError &&
    (activeJob(job?.status) || map?.status === "RUNNING" || discover.isPending);

  const failed =
    job?.status === "failed" ||
    job?.result?.status === "FAILED" ||
    (!running && map?.status === "FAILED");

  const partial =
    !running &&
    (job?.result?.status === "PARTIAL" || map?.status === "PARTIAL");

  /**
   * Derive the role name shown in the "Discovered as" badge on the map.
   * Falls back to the map's recorded role if the user switches accounts
   * after a run.
   */
  const discoveredRole = map?.discovered_as_role ?? null;

  return (
    <div className="two-column">
      {/* ── Left: discovery card ─────────────────────────────────────── */}
      <Card>
        <div className="card-heading">
          <div className="heading-icon">
            <Radar size={21} />
          </div>
          <div>
            <h2>Meet your application</h2>
            <p>Explore real pages, states, and interactive elements.</p>
          </div>
          <StatusBadge
            status={
              running
                ? job?.status || "queued"
                : failed
                  ? "FAILED"
                  : partial
                    ? "PARTIAL"
                    : map?.status || "Ready"
            }
          />
        </div>

        {/* Job error */}
        {jobError ? (
          <>
            <ErrorState error={jobError} retry={refreshJob} />
            {jobError instanceof ApiError && jobError.status === 404 && (
              <Button variant="secondary" onClick={clearJob}>
                Clear expired job
              </Button>
            )}
          </>
        ) : running ? (
          <>
            <ProgressIndicator
              label={
                job?.status === "in_progress"
                  ? "Exploring your application"
                  : "Waiting for the discovery worker"
              }
              description={
                job?.status === "in_progress"
                  ? "The browser is discovering application states. Observations appear as they are saved."
                  : "Discovery has been queued. This page updates automatically."
              }
            />
            <LiveDiscoveryGraph
              states={map?.states ?? []}
              jobStatus={job?.status}
              stateCount={map?.states.length ?? 0}
              elementCount={map?.states.reduce((n, s) => n + s.elements.length, 0) ?? 0}
            />
          </>
        ) : null}

        {/* Map metrics */}
        {map && (
          <div className="metrics">
            <div>
              <strong>{map.states.length}</strong>
              <span>Observed states</span>
            </div>
            <div>
              <strong>
                {map.states.reduce((n, s) => n + s.elements.length, 0)}
              </strong>
              <span>Observed elements</span>
            </div>
            <div>
              <strong>v{map.version}</strong>
              <span>Application map</span>
            </div>
            {discoveredRole && (
              <div>
                <strong style={{ fontSize: "16px" }}>{discoveredRole}</strong>
                <span>Discovered as</span>
              </div>
            )}
          </div>
        )}

        {/* Failure / partial notice */}
        {(failed || partial) && (
          <div className={failed ? "error" : "notice"} role="status">
            <div>
              <strong>
                {failed
                  ? "Discovery failed"
                  : "Discovery produced a partial map"}
              </strong>
              <p>
                {map?.termination_reason
                  ? human(map.termination_reason)
                  : "The worker could not complete discovery."}
              </p>
              <p>
                {partial
                  ? "You can inspect the observations. A complete map is required for test generation."
                  : "Check the application access settings and credentials before retrying."}
              </p>
              <details>
                <summary>View details</summary>
                <pre>
                  {JSON.stringify(job?.result || map?.coverage || {}, null, 2)}
                </pre>
              </details>
            </div>
          </div>
        )}

        {/* Discovery form — only when not running */}
        {!running && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              discover.mutate();
            }}
          >
            <label>
              Application URL
              <input
                type="url"
                pattern="https?://.*"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </label>

            {/* Selected account summary */}
            {selectedRef ? (
              <div className="focus-requirement">
                <span className="badge good">
                  <i />
                  Test account
                </span>
                <span style={{ fontSize: "11px" }}>
                  Running as{" "}
                  <strong>
                    {/* role name will be filled by ApplicationAccess below */}
                    {selectedRef.split(":").pop() ?? selectedRef}
                  </strong>
                </span>
              </div>
            ) : (
              <div className="focus-requirement">
                <span className="badge warn">
                  <i />
                  No account selected
                </span>
                <span style={{ fontSize: "11px" }}>
                  Add a test account in Application access to enable
                  authenticated discovery.
                </span>
              </div>
            )}

            {/* Approved requirement focus */}
            <div className="focus-requirement">
              <span className="badge good">
                <i />
                Approved focus
              </span>
              <span>
                {requirement.req_code} · v{requirement.version} ·{" "}
                {requirement.title}
              </span>
            </div>

            {/* Crawl limits */}
            <details>
              <summary>Discovery limits</summary>
              <div className="form-grid three">
                <label>
                  Maximum pages
                  <input
                    type="number"
                    min={1}
                    required
                    value={pages}
                    onChange={(e) => setPages(+e.target.value)}
                  />
                </label>
                <label>
                  Maximum depth
                  <input
                    type="number"
                    min={0}
                    required
                    value={depth}
                    onChange={(e) => setDepth(+e.target.value)}
                  />
                </label>
                <label>
                  Time limit (seconds)
                  <input
                    type="number"
                    min={1}
                    required
                    value={duration}
                    onChange={(e) => setDuration(+e.target.value)}
                  />
                </label>
              </div>
            </details>

            {discover.error && <ErrorState error={discover.error} />}

            <div className="actions">
              <Button
                type="submit"
                busy={discover.isPending}
                disabled={!!jobError}
              >
                {failed || partial ? (
                  <RefreshCw size={16} />
                ) : (
                  <Radar size={16} />
                )}
                {failed || partial
                  ? "Retry discovery"
                  : map
                    ? "Run discovery again"
                    : "Start discovery"}
              </Button>
            </div>
          </form>
        )}

        {/* Next action */}
        {map && !running && (
          <NextAction
            title={
              map.status === "COMPLETE"
                ? "Your application, connected"
                : "Inspect the observations"
            }
            description="Explore the discovered states and their navigation paths."
            label="Review application map"
            onClick={onNext}
          />
        )}
      </Card>

      {/* ── Right: sidebar ───────────────────────────────────────────── */}
      <aside>
        {/* Multi-role application access panel */}
        <ApplicationAccess
          projectId={project.id}
          running={running}
          savedBadge={savedBadge}
          selectedRef={selectedRef}
          onSelectRef={(ref) => {
            setSelectedRef(ref);
            if (ref) setSavedBadge(true);
          }}
        />

        {/* Journey context card */}
        <Card className="guide-card">
          <span className="eyebrow">OBSERVE BEFORE YOU TEST</span>
          <Timeline
            items={[
              {
                title: "Approved intent",
                detail: `${requirement.req_code} · Version ${requirement.version}`,
                done: true,
              },
              {
                title: job ? human(job.status) : "Application discovery",
                detail: running
                  ? "Live worker status"
                  : selectedRef
                    ? "Ready to discover"
                    : "Add a test account first",
                done: !running && map?.status === "COMPLETE",
              },
              {
                title: "A map grounded in evidence",
                detail: "Real states and observed elements.",
                done: !running && map?.status === "COMPLETE",
              },
            ]}
          />
          {discoveredRole && (
            <p
              className="field-hint"
              style={{ marginTop: "16px", borderTop: "1px solid #e0e8d8", paddingTop: "14px" }}
            >
              Last map discovered as role:{" "}
              <strong>{discoveredRole}</strong>. Run again with a different
              account to capture role-specific states.
            </p>
          )}
        </Card>
      </aside>
    </div>
  );
}
