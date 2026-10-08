/** Wire types for the QA Platform API. */

export interface Project {
  has_application_map?: boolean;
  id: string;
  name: string;
  application_url: string | null;
  /** Kept for backward-compat — the default account's ref. */
  credential_ref: string | null;
  /** All named accounts for this project. */
  accounts?: ProjectAccount[];
}

/** A named test account attached to a project (backend CredentialCreateResponse shape). */
export interface ProjectAccount {
  /** Stable key stored backend-side, e.g. "cred:<uuid>" */
  credential_ref: string;
  /** Human-readable label, e.g. "Admin", "Customer", "Manager" (maps to backend `label`) */
  label: string;
  /** Role string — same value as label in current implementation */
  role: string;
  /** Whether this is the default account for discovery */
  is_default: boolean;
  /** ISO timestamp */
  created_at: string;
}

export interface Requirement {
  id: string;
  project_id: string;
  req_code: string;
  version: number;
  status: string;
  title: string;
  description: string;
  acceptance_criteria: { id: string; text: string; source: string }[];
  ambiguities: {
    field: string;
    issue: string;
    requires_clarification: boolean;
  }[];
  domain_tags: string[];
}

export interface Approval {
  id: string;
  target_type: string;
  target_id: string;
  target_version?: number | null;
  status: string;
  decided_by: string | null;
  decided_at: string | null;
}

export interface AppState {
  id?: string;
  state_code: string;
  url_pattern: string;
  fingerprint: string;
  reached_via: string[];
  elements: Record<string, unknown>[];
  evidence_ref?: string | null;
}

export interface AppMap {
  id: string;
  project_id: string;
  version: number;
  base_url: string;
  status: string;
  termination_reason: string | null;
  coverage: Record<string, unknown>;
  /** Which account role was used for this crawl */
  discovered_as_role?: string | null;
  states: AppState[];
  /** Populated when status is FAILED or PARTIAL */
  diagnostic_evidence?: DiscoveryDiagnostic | null;
  discovery_checkpoint?: DiscoveryCheckpoint | null;
  test_generation_coverage?: Record<string, string[]>;
  project_test_generation_coverage?: Record<string, string[]>;
}

export interface DiscoveryCheckpoint {
  progress?: Record<string, string | number>;
  live_view?: {
    url?: string;
    label?: string;
    screenshot_ref?: string | null;
    fingerprint?: string | null;
    action?: string;
  } | null;
  version: number;
  configuration: {
    mode:
      | "entry_points"
      | "auth_flow"
      | "modules"
      | "inventory"
      | "deep"
      | "complete"
      | "targeted"
      | "full";
    selected_auth_flow?: string | null;
    selected_auth_flows?: string[];
    selected_areas: string[];
    selected_modules: string[];
    max_pages: number;
    max_depth: number;
    max_duration_seconds: number;
    worker_limit: number;
    automatic_limits: boolean;
  };
  pending_nodes: Record<string, unknown>[];
  failed_nodes: Record<string, unknown>[];
  in_progress_nodes: Record<string, unknown>[];
  completed_nodes: string[];
  input_requests?: DiscoveryInputRequest[];
}

export interface DiscoveryInputField {
  key: string;
  role: string;
  name: string;
  input_type?: string;
  required?: boolean;
  options?: string[] | null;
}

export interface DiscoveryInputRequest {
  id: string;
  status: string;
  kind: string;
  page_url?: string;
  page_title?: string;
  screenshot_ref?: string | null;
  fields: DiscoveryInputField[];
  submit?: { role?: string; name?: string } | null;
}

export interface DiscoveryArea {
  id: string;
  label: string;
  kind: "public" | "authentication" | "authenticated";
  state_fingerprints: string[];
  selectable: boolean;
}

export interface DiscoveryModule {
  id: string;
  label: string;
  area_id: string;
  auth_flow_id?: string | null;
  state_fingerprints: string[];
  entry_action?: { role?: string; name?: string; url?: string | null };
}

export interface DiscoveryAuthenticationFlow {
  id: string;
  label: string;
  kind: "login" | "registration" | "recovery" | "authentication";
  url_pattern: string;
  state_fingerprint: string;
  selectable: boolean;
}

/** Structured failure evidence — tells the developer exactly what went wrong. */
export interface DiscoveryDiagnostic {
  auth_attempted: boolean;
  auth_succeeded: boolean;
  /** Human-readable login failure message if auth failed */
  login_error: string | null;
  /** Path to the screenshot taken at time of failure */
  screenshot_ref: string | null;
  /** Console errors and warnings captured from the browser */
  console_errors?: { level: string; text: string }[];
  /** Non-2xx network responses observed during crawl */
  network_errors?: { method: string; url: string; status: string }[];
  /** Actions that threw exceptions during replay */
  failed_actions?: {
    action?: string;
    phase?: string;
    error: string;
    detail?: string;
    screenshot_ref?: string | null;
  }[];
  /** The target stopped at an anti-bot interstitial before app UI was available. */
  security_verification_required?: boolean;
  /** Human-readable explanation of why discovery ended */
  termination_detail: string | null;
}

export interface Job {
  job_id: string;
  status: string;
  result: { status?: string; error?: string; [key: string]: unknown } | null;
}

export interface TestCase {
  id: string;
  tc_code: string;
  project_id: string;
  requirement_id: string;
  requirement_version: number;
  application_map_id: string;
  status: string;
  current_version: number;
  /** Which role this test case was generated for */
  role_name?: string | null;
  current: {
    version: number;
    title: string;
    objective: string;
    category: string;
    preconditions: string[];
    steps: {
      step_number: number;
      action: string;
      target: {
        state_code?: string;
        element_code?: string;
        element_name?: string;
        element_role?: string;
      };
      value?: string;
      expected?: string;
    }[];
    expected_result: string;
    test_data: Record<string, unknown>;
    traceability: string[];
    confidence: number;
  };
}

export interface Generation {
  generated: number;
  test_cases: TestCase[];
  uncovered_acs: string[];
  partial_pairing_acs: string[];
  pairing_gaps?: { ac_id: string; missing: string[] }[];
  needs_review_test_cases: string[];
  duplicates_skipped?: number;
}

export interface BulkReviewResult {
  approved: number;
  skipped: number;
  failed: { test_case_id: string; tc_code?: string | null; error: string }[];
  test_cases: TestCase[];
}

export interface AutomationScript {
  script_id: string;
  script_code: string;
  test_case_id: string;
  test_case_code: string;
  test_case_version: number;
  requirement_id: string | null;
  requirement_version: number | null;
  application_map_id: string;
  application_map_version: number;
  framework: string;
  file_path: string;
  risk_level: string;
  review_status: string;
  blocked_reason: string | null;
  selector_strategy: Record<string, unknown>[];
}

export interface AutomationSource {
  path: string;
  content: string;
}

export interface AutomationLint {
  hardcoded_sleep: number;
  literal_credentials: number;
  xpath_fallback: number;
  missing_traceability: number;
  unsupported_blocked_selectors: number;
  test_only: number;
  missing_await: number;
  destructive_not_skipped: number;
  findings: { path: string; line: number; rule: string; message: string }[];
}

export interface AutomationVerification {
  status: string;
  tsc: string;
  playwright_list: string;
  detail: string;
}

export interface AutomationGeneration {
  generation_id: string;
  created_at: string | null;
  scripts: AutomationScript[];
  blocked: {
    test_case_id: string;
    test_case_code: string;
    test_case_version: number;
    reason: string;
  }[];
  file_tree: string[];
  selector_summary: Record<string, number>;
  lint: AutomationLint;
  risk_level: string;
  review_status: string;
  approval_required: boolean;
  approval_ids: string[];
  verification: AutomationVerification;
  download_url: string;
  language?: string;
  framework?: string;
  vscode_url: string | null;
  cursor_url: string | null;
  executed: boolean;
  label: string;
  execution_job_id?: string | null;
  execution_run_id?: string | null;
  sources: AutomationSource[];
}

export interface AutomationList {
  generations: {
    generation_id: string;
    created_at: string | null;
    risk_level: string;
    review_status: string;
    verification_status: string;
    script_count: number;
    blocked_count: number;
    approval_required: boolean;
    executed?: boolean;
  }[];
}

export interface ExecutionTrigger {
  job_id: string;
  run_id: string;
  status: string;
}

export interface ExecutionJob {
  job_id: string;
  status: string;
  run_id: string | null;
  result: {
    status?: string;
    summary?: Record<string, number>;
    error?: string;
  } | null;
}

export interface ExecutionAssertion {
  expected: string;
  actual: string;
  source: string;
}

export interface ExecutionEvidence {
  screenshot: string | null;
  video: string | null;
  trace: string | null;
  console_log: string | null;
  network_log: string | null;
}

export interface ExecutionInput {
  name: string;
  value: string;
}

export interface ExecutionResult {
  id: string;
  automation_script_id: string | null;
  spec_path: string;
  status: string;
  assertion: ExecutionAssertion;
  evidence: ExecutionEvidence;
  duration_ms: number | null;
  error_message: string | null;
  category?: string;
  title?: string;
  inputs?: ExecutionInput[];
  cause?: string;
  recommendation?: string;
}

export interface ExecutionRun {
  id: string;
  generation_id: string;
  job_id: string | null;
  environment: string;
  base_url: string | null;
  run_destructive: boolean;
  status: string;
  summary: Record<string, number>;
  log?: string | null;
  detail?: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string | null;
  result_count: number;
  results?: ExecutionResult[];
}

export interface ExecutionList {
  runs: ExecutionRun[];
}

export interface ExecutionReportCounts {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  error: number;
  pass_rate: number;
  duration_ms: number;
}

export interface ExecutionReportResult {
  id: string;
  test_case_code: string;
  title: string;
  requirement_code: string;
  status: string;
  expected: string;
  actual: string;
  duration_ms: number | null;
  error_message: string | null;
  evidence: string[];
}

export interface ExecutionReport {
  run_id: string;
  project_id: string;
  generation_id: string;
  environment: string;
  base_url: string | null;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  counts: ExecutionReportCounts;
  results: ExecutionReportResult[];
}
