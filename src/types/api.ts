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
  status: string;
  decided_by: string | null;
  decided_at: string | null;
}

export interface AppState {
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
  version: number;
  configuration: {
    mode: "entry_points" | "auth_flow" | "modules" | "inventory" | "deep" | "complete";
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
  needs_review_test_cases: string[];
}
