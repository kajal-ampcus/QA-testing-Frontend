import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Radar, RefreshCw, Square, X } from "lucide-react";
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
} from "../../components/ui";
import { ApplicationAccess } from "./ApplicationAccess";
import { InputRequests } from "./InputRequests";
import LiveDiscoveryGraph from "./LiveDiscoveryGraph";
import type { ApplicationGraphData } from "../application-map/graphLayout";
import { DiscoveryDiagnosticPanel } from "./DiscoveryDiagnosticPanel";
import { loginFailureNotice } from "../application-map/ApplicationMap";
import { DiscoveryPaths } from "./DiscoveryPaths";
import { explorerRoles, readExplorerState, selectPaths } from "./explorerModel";
import { RoleSelector } from "./RoleSelector";
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
  const queryClient = useQueryClient();
  const [url, setUrl] = useState(project.application_url || "");
  const [mode, setMode] = useState<"guided" | "complete">(
    map?.discovery_checkpoint &&
      map.discovery_checkpoint.configuration.mode !== "guided"
      ? "complete"
      : "guided",
  );
  const accounts = useQuery({
    queryKey: ["accounts", project.id],
    queryFn: () => api.accounts(project.id),
  });
  const storageKey = `discovery-explorer:${project.id}:${map?.id ?? "new"}`;
  const fallbackRole =
    map?.discovery_checkpoint?.configuration.credential_ref ??
    project.credential_ref ??
    "public";
  const readState = () => {
    try {
      return readExplorerState(localStorage.getItem(storageKey), fallbackRole);
    } catch {
      return readExplorerState(null, fallbackRole);
    }
  };
  const [stored, setStored] = useState(() => ({
    key: storageKey,
    value: readState(),
  }));
  const explorer = stored.key === storageKey ? stored.value : readState();
  const roles = explorerRoles(
    map?.discovery_checkpoint,
    accounts.data ?? project.accounts ?? [],
  );
  const role = roles.find((item) => item.id === explorer.active) ??
    roles.find((item) => item.id === fallbackRole) ??
    roles[0] ?? {
      id: "public",
      label: "Application entry",
      ref: null,
      paths: [],
      configured: true,
      choice: undefined,
    };
  const branches = (explorer.selections[role.id] ?? []).filter((key) =>
    role.paths.some((path) => path.key === key),
  );
  const updateExplorer = (value: typeof explorer) => {
    setStored({ key: storageKey, value });
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      /* Keep in-memory state. */
    }
  };
  const setBranches = (keys: string[]) => {
    updateExplorer(selectPaths(explorer, role.id, keys));
    setConfirmation(null);
  };
  const selectedRef = role.ref;
  const setSelectedRef = (ref: string | null) => {
    updateExplorer({ ...explorer, active: ref ?? "public" });
    setConfirmation(null);
  };
  const [confirmation, setConfirmation] = useState<{
    roleId: string;
    label: string;
    ref: string | null;
    keys: string[];
    scratch: boolean;
  } | null>(null);
  const confirmationRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (confirmation) {
      confirmationRef.current?.focus({ preventScroll: true });
      confirmationRef.current?.scrollIntoView({ block: "center" });
    }
  }, [confirmation]);
  const guidedMap = map?.discovery_checkpoint?.configuration.mode === "guided";
  const [restartingMapId, setRestartingMapId] = useState<string | null>(null);
  const awaitingFreshMap =
    restartingMapId !== null && map?.id === restartingMapId;
  const savedBranches = awaitingFreshMap ? [] : role.paths;
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
  const [savedBadge, setSavedBadge] = useState(!!project.credential_ref);
  const [accessOpen, setAccessOpen] = useState(false);

  useEffect(() => {
    if (!accessOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccessOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [accessOpen]);
  const switchingAccount =
    !!guidedMap &&
    (map?.discovery_checkpoint?.configuration.credential_ref ?? null) !==
      selectedRef;

  useEffect(() => {
    setConfirmation(null);
  }, [url, mode, pages, depth, duration, workerLimit, map?.id]);

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
    credential_ref: selectedRef,
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
    async () => {
      setRestartingMapId(map?.id ?? null);

      try {
        return await api.discover(project.id, {
          ...discoveryBody(false, !!map),
          credential_ref: null,
        });
      } catch (error) {
        setRestartingMapId(null);
        throw error;
      }
    },
    (data) => {
      setConfirmation(null);
      onStarted(data.job_id);
    },
  );
  const continueAccount = useAction(
    project.id,
    async (selection: NonNullable<typeof confirmation>) => {
      const chosen = roles.find((item) => item.id === selection.roleId);
      let ref = selection.ref;
      let keys = selection.keys;
      if (chosen?.choice && map) {
        const response = await api.submitDiscoveryInput(
          map.id,
          chosen.choice.requestId,
          [],
          { choice_id: chosen.choice.choiceId },
        );
        if (response.job_id) return { job_id: response.job_id };
        ref = response.credential_ref ?? null;
        keys = response.selected_branches ?? [];
        refreshMap();
      }
      return api.discover(project.id, {
        ...discoveryBody(true),
        credential_ref: ref,
        selected_branches: keys,
      });
    },
    (data) => {
      setConfirmation(null);
      onStarted(data.job_id);
    },
  );
  const requestRun = (keys: string[], scratch = false) =>
    setConfirmation({
      roleId: role.id,
      label: scratch || !map ? "Application entry" : role.label,
      ref: scratch || !map ? null : role.ref,
      keys: [...keys],
      scratch,
    });
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
      continueAccount.isPending);

  const failed =
    job?.status === "failed" ||
    job?.result?.status === "FAILED" ||
    (!running && map?.status === "FAILED");

  const partial =
    !running &&
    (job?.result?.status === "PARTIAL" || map?.status === "PARTIAL");
  const resumable =
    ["PARTIAL", "COMPLETE"].includes(map?.status ?? "") &&
    !!map?.discovery_checkpoint;

  /**
   * Derive the role name shown in the "Discovered as" badge on the map.
   * Falls back to the map's recorded role if the user switches accounts
   * after a run.
   */
  const discoveredRole = map?.discovered_as_role ?? null;

  return (
    <div className="two-column discovery-layout">
      {/* ── Left: discovery card ─────────────────────────────────────── */}
      <Card>
        <div className="card-heading">
          <div className="heading-icon">
            <Radar size={21} />
          </div>
          <div>
            <h2>Explore your application</h2>
            <p>
              Choose pages to explore and build tests from what you find.
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

        <RoleSelector
          roles={awaitingFreshMap ? [] : roles}
          active={role.id}
          selectedCount={branches.length}
          runningRef={
            running
              ? (map?.discovery_checkpoint?.configuration.credential_ref ??
                "public")
              : undefined
          }
          onSelect={(active) => {
            updateExplorer({ ...explorer, active });
            setConfirmation(null);
          }}
        />
        {accounts.isPending && <p role="status">Loading saved roles…</p>}
        {accounts.error && (
          <ErrorState
            error={accounts.error}
            retry={() => void accounts.refetch()}
          />
        )}
        {guidedMap && !awaitingFreshMap && (
          <DiscoveryPaths
            key={role.id}
            paths={savedBranches}
            selected={branches}
            onSelect={setBranches}
            disabled={false}
            onRunAgain={(key) => requestRun([key])}
            executionDisabled={running || !!jobError}
          />
        )}
        {confirmation && (
          <section
            className="notice"
            aria-label="Confirm discovery"
            ref={confirmationRef}
            tabIndex={-1}
          >
            <h3>Confirm discovery for {confirmation.label}</h3>
            <p>
              {confirmation.scratch
                ? "Start from the application URL and discover its login options again. The current map remains in history."
                : "Continue the combined map. Saved discoveries for every role are retained."}
            </p>
            <p>
              {confirmation.ref
                ? "Use this role’s saved account and isolated browser session."
                : "Discovery will ask for login details when needed."}
            </p>
            <ul>
              {confirmation.keys.map((key) => (
                <li key={key}>
                  {role.paths
                    .find((path) => path.key === key)
                    ?.path.map((step) => step.name || step.url || step.role)
                    .join(" / ") ?? key}
                </li>
              ))}
            </ul>
            {!confirmation.keys.length && <p>Explore the role’s entry page.</p>}
            <Button
              type="button"
              disabled={running || !!jobError}
              onClick={() =>
                confirmation.scratch || !map?.discovery_checkpoint
                  ? discover.mutate()
                  : continueAccount.mutate(confirmation)
              }
            >
              Confirm and start discovery
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setConfirmation(null)}
            >
              Cancel
            </Button>
            {continueAccount.error && (
              <ErrorState error={continueAccount.error} />
            )}
          </section>
        )}

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
              flowGraph={
                (
                  map?.discovery_checkpoint as
                    { graph?: ApplicationGraphData } | undefined
                )?.graph ??
                (map?.coverage?.app_flow_graph as
                  ApplicationGraphData | undefined)
              }
              states={map?.states ?? []}
              jobStatus={job?.status}
              stateCount={map?.states.length ?? 0}
              elementCount={
                map?.states.reduce((n, s) => n + s.elements.length, 0) ?? 0
              }
              liveView={map?.discovery_checkpoint?.live_view}
              actionLog={map?.discovery_checkpoint?.action_log}
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

        {awaitingFreshMap && (
          <p className="discovery-inline-status" role="status">Starting a fresh map…</p>
        )}
        {!awaitingFreshMap &&
          selectedRef ===
            (map?.discovery_checkpoint?.configuration.credential_ref ?? null) &&
          (role.configured || role.choice) &&
          map?.discovery_checkpoint?.input_requests && (
            <InputRequests
              mapId={map.id}
              projectId={project.id}
              requests={map.discovery_checkpoint.input_requests.filter(
                (request) => request.kind !== "login_choice",
              )}
              running={running}
              onSubmitted={() => {
                refreshMap();
                void queryClient.invalidateQueries({
                  queryKey: ["accounts", project.id],
                });
                void queryClient.invalidateQueries({
                  queryKey: ["saved-inputs", project.id],
                });
                void queryClient.invalidateQueries({
                  queryKey: ["workspace", project.id],
                });
              }}
              onResumed={onStarted}
              onContinue={async (selectedBranches, credentialRef) => {
                const nextRef =
                  credentialRef !== undefined
                    ? credentialRef
                    : (map.discovery_checkpoint?.configuration.credential_ref ??
                      null);
                setSelectedRef(nextRef);
                const response = await api.discover(project.id, {
                  ...discoveryBody(true),
                  credential_ref: nextRef,
                  selected_branches: selectedBranches,
                });
                onStarted(response.job_id);
              }}
            />
          )}

        {map && (
          <details className="discovery-details">
            <summary>Map details</summary>
            <div className="discovery-detail-stats">
              <span><strong>{map.states.length}</strong> screens</span>
              <span><strong>{map.states.reduce((n, s) => n + s.elements.length, 0)}</strong> controls</span>
              <span><strong>v{map.version}</strong> map</span>
              {discoveredRole && <span><strong>{discoveredRole}</strong> role</span>}
            </div>
            {map.discovery_checkpoint?.progress && (
              <dl className="metrics" aria-label="Discovery progress" aria-live="polite">
                {Object.entries(map.discovery_checkpoint.progress).map(([key, value]) => (
                  <div key={key}><dt>{human(key)}</dt><dd>{String(value)}</dd></div>
                ))}
              </dl>
            )}
          </details>
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
                  ? "Saved discoveries for every role are kept. Select a role and continue from its saved paths."
                  : map?.diagnostic_evidence?.termination_detail ||
                    "Check the application URL, browser access, and credentials before retrying."}
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
              requestRun([], !!map);
            }}
          >
            <label>
              Exploration mode
              <select
                value={mode}
                onChange={(e) =>
                  setMode(e.target.value as "guided" | "complete")
                }
              >
                <option value="guided">Guided — choose each next page</option>
                <option value="complete">
                  Automatic — explore safe reachable paths
                </option>
              </select>
            </label>
            {map && !guidedMap && mode === "guided" && (
              <p className="notice">
                This map was created in automatic mode. Start a new guided map
                below to choose paths after each page. The previous map remains
                stored as history; this starts again from the application URL.
              </p>
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

            <div className="discovery-run-context">
              <span className={`badge ${selectedRef ? "good" : "warn"}`}>
                <i /> {selectedRef ? "Test account selected" : "Login on demand"}
              </span>
              <span title={requirement.title}>
                {requirement.req_code} · {requirement.title}
              </span>
            </div>

            <details className="discovery-details discovery-advanced">
              <summary>Advanced settings</summary>
              <div className="form-grid three">
                <label>
                  Maximum pages
                  <input type="number" min={1} required value={pages} onChange={(e) => setPages(+e.target.value)} />
                </label>
                <label>
                  Maximum depth
                  <input type="number" min={0} required value={depth} onChange={(e) => setDepth(+e.target.value)} />
                </label>
                <label>
                  Time limit (seconds)
                  <input type="number" min={1} required value={duration} onChange={(e) => setDuration(+e.target.value)} />
                </label>
              </div>
              <label>
                Parallel browser workers
                <input type="number" min={1} max={5} required value={workerLimit} onChange={(e) => setWorkerLimit(+e.target.value)} />
              </label>
            </details>

            {(discover.error || continueAccount.error) && (
              <ErrorState error={discover.error || continueAccount.error} />
            )}

            <div className="actions discovery-action-bar">
              {resumable && (mode === "guided" ? guidedMap : !guidedMap) && (
                <Button
                  type="button"
                  busy={continueAccount.isPending}
                  disabled={
                    awaitingFreshMap ||
                    !!jobError ||
                    (!role.configured && !role.choice) ||
                    (mode === "guided" &&
                      !switchingAccount &&
                      !role.choice &&
                      branches.length === 0)
                  }
                  onClick={() => requestRun(branches)}
                >
                  <RefreshCw size={16} />
                  {mode === "guided"
                    ? switchingAccount
                      ? "Discover selected account"
                      : "Explore selected paths"
                    : "Continue Discovery"}
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
                {map && mode === "guided"
                  ? "Start guided map from scratch"
                  : resumable
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
        {map &&
          !running &&
          (map.diagnostic_evidence || loginFailureNotice(map)) && (
            <DiscoveryDiagnosticPanel
              waitingForInput={map.termination_reason === "WAITING_FOR_INPUT"}
              waitingForLoginChoice={map.discovery_checkpoint?.input_requests?.some(
                (request) =>
                  request.kind === "login_choice" &&
                  request.status === "pending",
              )}
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
              awaitingSelection={
                map.termination_reason === "AWAITING_BRANCH_SELECTION"
              }
              status={map.status}
              mapId={map.id}
            />
          )}

      </Card>

      {/* ── Right: sidebar ───────────────────────────────────────────── */}
      <aside>
        <SavedInputs projectId={project.id} />
      </aside>

      <button
        type="button"
        className="application-access-launcher"
        onClick={() => setAccessOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={accessOpen}
      >
        <KeyRound size={17} />
        <span>Application access</span>
        {savedBadge && <span className="application-access-configured">Configured</span>}
      </button>

      {accessOpen && (
        <div
          className="application-access-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setAccessOpen(false);
          }}
        >
          <section
            className="application-access-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Application access"
          >
            <button
              type="button"
              className="application-access-close"
              onClick={() => setAccessOpen(false)}
              aria-label="Close application access"
            >
              <X size={18} />
            </button>
            <ApplicationAccess
              projectId={project.id}
              running={running}
              savedBadge={savedBadge}
              promptUpdate={Boolean(
                selectedRef ===
                  map?.discovery_checkpoint?.configuration.credential_ref &&
                map?.discovery_checkpoint?.credential_update_required,
              )}
              selectedRef={selectedRef}
              onSelectRef={(ref) => {
                setSelectedRef(ref);
                setSavedBadge(!!ref);
              }}
            />
          </section>
        </div>
      )}
    </div>
  );
}
