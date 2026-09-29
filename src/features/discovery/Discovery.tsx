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
  DiscoveryModule,
  DiscoveryAuthenticationFlow,
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
import LiveDiscoveryGraph from "./LiveDiscoveryGraph";
import type { ApplicationGraphData } from "../application-map/graphLayout";
import { DiscoveryDiagnosticPanel } from "./DiscoveryDiagnosticPanel";

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
}) {
  const [url, setUrl] = useState(project.application_url || "");
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
    map?.discovery_checkpoint?.configuration.worker_limit ?? 3,
  );
  const [automaticLimits, setAutomaticLimits] = useState(true);
  const [selectedDiscoveryMode, setSelectedDiscoveryMode] = useState<"targeted" | "full">(
    map?.discovery_checkpoint?.configuration.mode === "full" ? "full" : "targeted",
  );
  const [selectedAreas, setSelectedAreas] = useState<string[]>(() => {
    const saved = map?.coverage?.discovery_catalog as
      | { selected_areas?: string[] }
      | undefined;
    return saved?.selected_areas ?? [];
  });
  const [selectedModules, setSelectedModules] = useState<string[]>(() => {
    const saved = map?.coverage?.discovery_catalog as
      | { selected_modules?: string[] }
      | undefined;
    return saved?.selected_modules ?? [];
  });
  const [selectedAuthFlows, setSelectedAuthFlows] = useState<string[]>(() => {
    const saved = map?.coverage?.discovery_catalog as
      | { selected_auth_flows?: string[]; selected_auth_flow?: string | null }
      | undefined;
    return (
      saved?.selected_auth_flows ??
      (saved?.selected_auth_flow ? [saved.selected_auth_flow] : [])
    );
  });

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
  const catalog = map?.coverage?.discovery_catalog as
    | {
        mode?: string;
        stage?: string;
        modules?: DiscoveryModule[];
        authentication_flows?: DiscoveryAuthenticationFlow[];
        module_inventory_flows?: string[];
        selected_auth_flows?: string[];
        selected_auth_flow?: string | null;
      }
    | undefined;
  const modules = catalog?.modules ?? [];
  const authenticationFlows = catalog?.authentication_flows ?? [];
  const selectedLoginFlow = authenticationFlows.find(
    (flow) => selectedAuthFlows.includes(flow.id) && flow.kind === "login",
  );
  const selectedAuthFlow = selectedLoginFlow?.id ?? selectedAuthFlows[0] ?? null;
  const chosenAuthFlow = authenticationFlows.find((flow) => flow.id === selectedAuthFlow);
  const hasEntryInventory = authenticationFlows.length > 0;
  const visibleModules = modules.filter(
    (module) => !module.auth_flow_id || selectedAuthFlows.includes(module.auth_flow_id),
  );
  const hasModuleInventory = selectedAuthFlows.length === 1 && !!selectedAuthFlow && (
    catalog?.module_inventory_flows?.includes(selectedAuthFlow) ?? false
  );
  const discoveryPhase = !hasEntryInventory
    ? "entry_points" as const
    : selectedAuthFlows.length > 1
      ? selectedLoginFlow
        ? "complete" as const
        : "auth_flow" as const
      : chosenAuthFlow?.kind === "login"
        ? hasModuleInventory
          ? "deep" as const
          : "modules" as const
        : "auth_flow" as const;

  useEffect(() => {
    const configuration = map?.discovery_checkpoint?.configuration;
    if (!configuration || map?.status !== "PARTIAL") return;
    setPages(configuration.max_pages);
    setDepth(configuration.max_depth);
    setDuration(configuration.max_duration_seconds);
    setWorkerLimit(configuration.worker_limit);
    setSelectedAreas(configuration.selected_areas ?? []);
    setSelectedModules(configuration.selected_modules ?? []);
  }, [map?.id, map?.status, map?.discovery_checkpoint]);
  const discoveryBody = (resume: boolean, startFromScratch = false) => ({
    url,
    focus_requirements: [],
    max_pages: pages,
    max_depth: depth,
    max_duration_seconds: duration,
    worker_limit: workerLimit,
    automatic_limits: resume ? false : automaticLimits,
    credential_ref: selectedRef ?? undefined,
    discovery_mode: startFromScratch
      ? "entry_points" as const
      : selectedDiscoveryMode === "full"
        ? "complete" as const
        : discoveryPhase,
    selected_auth_flow: startFromScratch ? null : selectedAuthFlow,
    selected_auth_flows: startFromScratch ? [] : selectedAuthFlows,
    selected_areas: startFromScratch ? [] : selectedAreas,
    selected_modules: startFromScratch || selectedDiscoveryMode === "full" ? [] : selectedModules,
    start_from_scratch: startFromScratch,
    ...(resume && map ? { resume_application_map_id: map.id } : {}),
  });

  const discover = useAction(
    project.id,
    () => api.discover(
      project.id,
      discoveryBody(
        false,
        map?.status === "PARTIAL" && !!map.discovery_checkpoint,
      ),
    ),
    (data) => onStarted(data.job_id),
  );
  const continueDiscovery = useAction(
    project.id,
    () => api.discover(project.id, discoveryBody(true)),
    (data) => onStarted(data.job_id),
  );
  const stopDiscovery = useAction(
    project.id,
    () => api.cancelDiscovery(job!.job_id),
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
  const resumable = partial && !!map?.discovery_checkpoint;

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
              flowGraph={(map?.discovery_checkpoint as { graph?: ApplicationGraphData } | undefined)?.graph ?? map?.coverage?.app_flow_graph as ApplicationGraphData | undefined}
              states={map?.states ?? []}
              jobStatus={job?.status}
              stateCount={map?.states.length ?? 0}
              elementCount={map?.states.reduce((n, s) => n + s.elements.length, 0) ?? 0}
            />
            <div className="actions">
              <Button
                type="button"
                variant="secondary"
                busy={stopDiscovery.isPending}
                disabled={!job?.job_id}
                onClick={() => stopDiscovery.mutate()}
              >
                <Square size={15} />
                Stop discovery
              </Button>
            </div>
            {stopDiscovery.error && <ErrorState error={stopDiscovery.error} />}
          </>
        ) : null}

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
                  : "Discovery produced a partial map"}
              </strong>
              <p>
                {map?.termination_reason
                  ? human(map.termination_reason)
                  : "The worker could not complete discovery."}
              </p>
              <p>
                {partial
                  ? "You can generate tests from observed states and continue discovery later."
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

            <fieldset>
              <legend>Discovery mode</legend>
              <label><input type="radio" name="discovery-mode" checked={selectedDiscoveryMode === "targeted"} onChange={() => setSelectedDiscoveryMode("targeted")} />Targeted Discovery</label>
              <p>Select dynamically discovered application paths.</p>
              <label><input type="radio" name="discovery-mode" checked={selectedDiscoveryMode === "full"} onChange={() => setSelectedDiscoveryMode("full")} />Full Application Discovery</label>
              <p>Discover the complete reachable application automatically using parallel workers.</p>
            </fieldset>
            {selectedDiscoveryMode === "targeted" && authenticationFlows.length > 0 && (
              <section className="discovery-scope" aria-labelledby="discovery-scope-title">
                <h3 id="discovery-scope-title">Choose authentication flows</h3>
                <p className="field-hint">
                  These entry points were observed from the application. Select one or more flows to include.
                </p>
                {selectedAuthFlows.length > 1 && (
                  <p className="field-hint">
                    {selectedLoginFlow
                      ? "Selected entry pages and authenticated modules will be crawled."
                      : "Selected entry pages will be crawled. Select a login flow to include authenticated modules."}
                  </p>
                )}
                <div className="authentication-flow-options" aria-labelledby="discovery-scope-title">
                  {authenticationFlows.map((flow) => (
                    <label
                      key={flow.id}
                      className={`authentication-flow-option${selectedAuthFlows.includes(flow.id) ? " is-selected" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedAuthFlows.includes(flow.id)}
                        onChange={(event) => {
                          setSelectedAuthFlows((current) =>
                            event.target.checked
                              ? [...current, flow.id]
                              : current.filter((id) => id !== flow.id),
                          );
                          setSelectedModules([]);
                        }}
                      />
                      <span className="authentication-flow-copy">
                        <strong>{flow.label}</strong>
                        <span className="field-hint">{human(flow.kind)}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {selectedAuthFlows.length === 1 && chosenAuthFlow?.kind === "login" && hasModuleInventory && (
                  <fieldset>
                    <legend>Choose functional areas</legend>
                    <p className="field-hint">
                      These modules were discovered from the authenticated landing page and navigation.
                    </p>
                    {visibleModules.length === 0 && (
                      <p className="field-hint">No separate navigation modules were observed for this flow.</p>
                    )}
                    {visibleModules.map((module) => (
                      <label key={module.id}>
                        <input
                          type="checkbox"
                          checked={selectedModules.includes(module.id)}
                          onChange={(event) => setSelectedModules((current) =>
                            event.target.checked
                              ? [...current, module.id]
                              : current.filter((id) => id !== module.id),
                          )}
                        />
                        {module.label}
                      </label>
                    ))}
                  </fieldset>
                )}
              </section>
            )}

            {/* Crawl limits */}
            <details>
              <summary>Discovery settings</summary>
              <label>
                <input
                  type="checkbox"
                  checked={automaticLimits}
                  onChange={(e) => setAutomaticLimits(e.target.checked)}
                />
                Automatic discovery (recommended)
              </label>
              <p className="field-hint">
                Continues until no new unique pages or actions remain. Internal
                circuit breakers and Stop discovery still protect the worker.
              </p>
              {(!automaticLimits || resumable) && (
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
              )}
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
            </details>

            {(discover.error || continueDiscovery.error) && (
              <ErrorState error={discover.error || continueDiscovery.error} />
            )}

            <div className="actions">
              {resumable && (
                <Button
                  type="button"
                  busy={continueDiscovery.isPending}
                  disabled={!!jobError}
                  onClick={() => continueDiscovery.mutate()}
                >
                  <RefreshCw size={16} />
                  Continue Discovery
                </Button>
              )}
              <Button
                type="submit"
                busy={discover.isPending}
                disabled={
                  !!jobError ||
                  (!resumable && authenticationFlows.length > 0 && selectedAuthFlows.length === 0) ||
                  (selectedDiscoveryMode === "targeted" && !resumable && authenticationFlows.length > 0 && selectedAuthFlows.length === 0) ||
                  (selectedDiscoveryMode === "targeted" && !resumable && discoveryPhase === "modules" && !selectedRef) ||
                  (selectedDiscoveryMode === "targeted" && !resumable && discoveryPhase === "complete" && !!selectedLoginFlow && !selectedRef) ||
                  (selectedDiscoveryMode === "targeted" && !resumable && discoveryPhase === "deep" && selectedModules.length === 0)
                }
              >
                {failed || partial ? (
                  <RefreshCw size={16} />
                ) : (
                  <Radar size={16} />
                )}
                {resumable
                  ? "Start from Scratch"
                  : failed || partial
                    ? "Retry discovery"
                  : hasEntryInventory
                    ? selectedDiscoveryMode === "full"
                      ? "Discover full application"
                      : discoveryPhase === "entry_points"
                      ? "Start discovery"
                      : discoveryPhase === "modules"
                        ? "Discover application modules"
                        : discoveryPhase === "deep"
                          ? catalog?.stage === "deep"
                            ? "Discover More"
                            : "Discover selected modules"
                          : "Discover selected flow"
                    : "Start discovery"}
              </Button>
              {map && !running && (
                <Button type="button" variant="secondary" onClick={onNext}>
                  Finish
                </Button>
              )}
            </div>
          </form>
        )}

        {/* Next action */}
        {map?.diagnostic_evidence && !running && (
          <DiscoveryDiagnosticPanel
            diagnostic={map.diagnostic_evidence}
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
