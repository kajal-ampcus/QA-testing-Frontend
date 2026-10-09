import { useEffect, useState } from "react";
import { Radar, RefreshCw, Square } from "lucide-react";
import { api, ApiError } from "../../api/client";
import { useAction } from "../../hooks/useAction";
import { activeJob, human } from "../../utils/workflow";
import type {
  Project,
  Requirement,
  AppMap,
  Job,
} from "../../types/api";
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
import { InputRequests } from "./InputRequests";
import LiveDiscoveryGraph from "./LiveDiscoveryGraph";
import type { ApplicationGraphData } from "../application-map/graphLayout";
import { DiscoveryDiagnosticPanel } from "./DiscoveryDiagnosticPanel";
import { loginFailureNotice } from "../application-map/ApplicationMap";
import { DiscoveryPaths } from "./DiscoveryPaths";
import { SavedInputs } from "./SavedInputs";

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
  onStopped,
  refreshMap,
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
  onStopped: () => void;
  refreshMap: () => void;
}) {
  const [url, setUrl] = useState(project.application_url || "");
  const [mode, setMode] = useState<"guided" | "complete">("guided");
  const [branches, setBranches] = useState<string[]>([]);
  const [submittedMode, setSubmittedMode] = useState<"guided" | "complete" | null>(null);
  const guidedMap = map?.discovery_checkpoint?.configuration.mode === "guided";
  const savedBranches = map?.discovery_checkpoint?.jobs?.filter((item) => item.path.length > 0) ?? [];
  const [pages, setPages] = useState(
    map?.discovery_checkpoint?.configuration.max_pages ?? 150,
  );
  const [depth, setDepth] = useState(
    map?.discovery_checkpoint?.configuration.max_depth ?? 6,
  );
  const [duration, setDuration] = useState(
    map?.discovery_checkpoint?.configuration.max_duration_seconds ?? 900,
  );
  const [workerLimit, setWorkerLimit] = useState(
    map?.discovery_checkpoint?.configuration.worker_limit ?? 1,
  );
  // Optional pre-discovery account. Leaving this empty uses the dynamic
  // credential request when the live login form is reached.
  const [selectedRef, setSelectedRef] = useState<string | null>(
    project.credential_ref ?? null,
  );
  const [savedBadge, setSavedBadge] = useState(!!project.credential_ref);

  /**
   * credential_ref of the account chosen for this run.
   * Null means "not selected yet" — the ApplicationAccess panel auto-selects
   * the default account when accounts load.
   */

  useEffect(() => {
    const configuration = map?.discovery_checkpoint?.configuration;
    if (!configuration || map?.status !== "PARTIAL") return;
    setPages(configuration.max_pages);
    setDepth(configuration.max_depth);
    setDuration(configuration.max_duration_seconds);
    setWorkerLimit(configuration.worker_limit);
  }, [map?.id, map?.status, map?.discovery_checkpoint]);
  const discoveryBody = (resume: boolean, startFromScratch = false) => ({
    url,
    focus_requirements: [],
    max_pages: pages,
    max_depth: depth,
    max_duration_seconds: duration,
    worker_limit: workerLimit,
    automatic_limits: false,
    credential_ref: selectedRef ?? undefined,
    discovery_mode: mode,
    selected_branches: resume && mode === "guided" ? branches : [],
    selected_auth_flow: null,
    selected_auth_flows: [],
    selected_areas: [],
    selected_modules: [],
    start_from_scratch: startFromScratch,
    ...(resume && map ? { resume_application_map_id: map.id } : {}),
  });

  const discover = useAction(
    project.id,
    () => api.discover(
      project.id,
      discoveryBody(
        false,
        !!map && (mode === "guided" || (map.status === "PARTIAL" && !!map.discovery_checkpoint)),
      ),
    ),
    (data) => { setSubmittedMode(mode); setBranches([]); onStarted(data.job_id); },
  );
  const continueDiscovery = useAction(
    project.id,
    (selected: string[] | undefined) => api.discover(project.id, {
      ...discoveryBody(true),
      selected_branches: selected ?? branches,
    }),
    (data) => { setSubmittedMode(mode); setBranches([]); onStarted(data.job_id); },
  );
  const stopDiscovery = useAction(
    project.id,
    () => api.stopDiscovery(project.id),
    onStopped,
  );

  const terminalJob = ["complete", "failed", "cancelled"].includes(
    job?.status ?? "",
  );
  const running =
    !jobError &&
    (activeJob(job?.status) ||
      (!terminalJob && map?.status === "RUNNING") ||
      discover.isPending ||
      continueDiscovery.isPending);

  const failed =
    job?.status === "failed" ||
    job?.result?.status === "FAILED" ||
    (!running && map?.status === "FAILED");

  const partial =
    !running &&
    (job?.result?.status === "PARTIAL" || map?.status === "PARTIAL");
  const resumable = (partial || !!guidedMap) && !!map?.discovery_checkpoint;
  const activeGuided = submittedMode ? submittedMode === "guided" : guidedMap;

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
            <h2>Explore your application</h2>
            <p>
              Discover a page, choose its next paths, and generate tests from the observed screens.
            </p>
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

        <div className="notice" role="status">
          <strong>
            {running
              ? activeGuided ? "Guided discovery is running" : "Automatic discovery is running"
              : mode === "guided" ? "Guided discovery: you choose the next path" : "Automatic discovery selected"}
          </strong>
          <p>
            {running && !activeGuided
              ? "This run uses the previous automatic mode and will continue beyond login. Stop discovery, then start a guided map to choose each next page."
              : !running && mode === "complete"
                ? "Automatic mode follows safe reachable paths without asking you to select each page. Choose Guided for step-by-step exploration."
              : "Each selected page is inspected once. After login, discovery pauses on the landing page and shows its available paths below. It waits for your selection before following them."}
          </p>
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
                  ? "Inspecting the selected scope and saving available navigation paths."
                  : "Discovery has been queued. This page updates automatically."
              }
            />
            <LiveDiscoveryGraph
              flowGraph={(map?.discovery_checkpoint as { graph?: ApplicationGraphData } | undefined)?.graph ?? map?.coverage?.app_flow_graph as ApplicationGraphData | undefined}
              states={map?.states ?? []}
              jobStatus={job?.status}
              stateCount={map?.states.length ?? 0}
              elementCount={map?.states.reduce((n, s) => n + s.elements.length, 0) ?? 0}
              liveView={map?.discovery_checkpoint?.live_view}
            />
            <div className="actions">
              <Button
                type="button"
                variant="secondary"
                busy={stopDiscovery.isPending}
                onClick={() => stopDiscovery.mutate()}
              >
                <Square size={15} />
                Stop discovery
              </Button>
            </div>
            {stopDiscovery.error && <ErrorState error={stopDiscovery.error} />}
          </>
        ) : null}

        {map?.discovery_checkpoint?.input_requests && (
          <InputRequests
            mapId={map.id}
            requests={map.discovery_checkpoint.input_requests}
            running={running}
            onSubmitted={refreshMap}
            onResumed={onStarted}
          />
        )}

        {/* Map metrics */}
        {map?.discovery_checkpoint?.progress && (
          <dl className="metrics" aria-label="Discovery progress" aria-live="polite">
            {Object.entries(map.discovery_checkpoint.progress).map(([key, value]) => (
              <div key={key}><dt>{human(key)}</dt><dd>{String(value)}</dd></div>
            ))}
          </dl>
        )}
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
                  : map?.termination_reason === "AWAITING_BRANCH_SELECTION"
                    ? "Choose what to explore next"
                    : "Discovery produced a partial map"}
              </strong>
              <p>
                {map?.termination_reason
                  ? human(map.termination_reason)
                  : "The worker could not complete discovery."}
              </p>
              <p>
                {partial
                  ? "The graph already discovered is kept. Continue from where it stopped, or start from scratch."
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
              Exploration mode
              <select value={mode} onChange={(e) => setMode(e.target.value as "guided" | "complete")}>
                <option value="guided">Guided — choose each next page</option>
                <option value="complete">Automatic — explore safe reachable paths</option>
              </select>
            </label>
            {map && !guidedMap && mode === "guided" && (
              <p className="notice">
                This map was created in automatic mode. Start a new guided map below to choose paths after each page.
                The previous map remains stored as history; this starts again from the application URL.
              </p>
            )}
            {guidedMap && mode === "guided" && (
              <DiscoveryPaths paths={savedBranches} selected={branches} onSelect={setBranches}
                disabled={!!jobError || continueDiscovery.isPending}
                onRunAgain={(key) => continueDiscovery.mutate([key])} />
            )}
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

            {selectedRef ? (
              <div className="focus-requirement">
                <span className="badge good"><i /> Test account</span>
                <span style={{ fontSize: "11px" }}>A saved account will sign in before discovery.</span>
              </div>
            ) : (
              <div className="focus-requirement">
                <span className="badge warn"><i /> No account selected</span>
                <span style={{ fontSize: "11px" }}>Discovery will ask for login values only if the application requires them.</span>
              </div>
            )}

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
            <label>
              Parallel browser workers
              <input
                type="number"
                min={1}
                max={5}
                required
                value={workerLimit}
                onChange={(e) => setWorkerLimit(+e.target.value)}
              />
            </label>
            <p className="field-hint">
              Guided discovery starts with the landing page and waits for your next selection.
              Return to any saved path later, or review the map to generate tests.
              Inspecting a page does not establish that its functionality passes tests.
            </p>

            {(discover.error || continueDiscovery.error) && (
              <ErrorState error={discover.error || continueDiscovery.error} />
            )}

            <div className="actions">
              {resumable && (mode === "guided" ? guidedMap : !guidedMap) && (
                <Button
                  type="button"
                  busy={continueDiscovery.isPending}
                  disabled={!!jobError || (mode === "guided" && (!guidedMap || branches.length === 0))}
                  onClick={() => continueDiscovery.mutate(undefined)}
                >
                  <RefreshCw size={16} />
                  {mode === "guided" ? "Explore selected paths" : "Continue Discovery"}
                </Button>
              )}
              <Button
                type="submit"
                busy={discover.isPending}
                disabled={!!jobError}
              >
                {resumable || failed || partial ? (
                  <RefreshCw size={16} />
                ) : (
                  <Radar size={16} />
                )}
                {map && mode === "guided" ? "Start guided map from scratch" : resumable
                  ? "Start from Scratch"
                  : failed || partial
                    ? "Retry discovery"
                    : "Start discovery"}
              </Button>
              {map && !running && (
                <Button type="button" variant="secondary" onClick={onNext}>
                  Review application map
                </Button>
              )}
            </div>
          </form>
        )}

        {/* Next action */}
        {map && !running && (map.diagnostic_evidence || loginFailureNotice(map)) && (
          <DiscoveryDiagnosticPanel
            diagnostic={
              map.diagnostic_evidence ?? {
                auth_attempted: true,
                auth_succeeded: false,
                login_error: loginFailureNotice(map),
                screenshot_ref: null,
                termination_detail:
                  "Login was attempted and did not succeed, so pages after login were not discovered.",
                failed_actions: [],
              }
            }
            awaitingSelection={map.termination_reason === "AWAITING_BRANCH_SELECTION"}
            status={map.status}
            mapId={map.id}
          />
        )}

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
        <SavedInputs projectId={project.id} />
        <ApplicationAccess
          projectId={project.id}
          running={running}
          savedBadge={savedBadge}
          promptUpdate={Boolean(map?.discovery_checkpoint?.credential_update_required)}
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
                  : "Ready to discover",
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
