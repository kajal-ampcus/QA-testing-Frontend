import type {
  Project,
  ProjectAccount,
  Requirement,
  Approval,
  AppMap,
  Job,
  TestCase,
  Generation,
} from "../types/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
  method?: "GET" | "POST" | "DELETE",
): Promise<T> {
  const response = await fetch(
    `${(import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(/\/$/, "")}${path}`,
    {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers:
        body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    },
  );
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = data?.detail;
    throw new ApiError(
      response.status,
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((d: { msg: string }) => d.msg).join("; ")
          : `Request failed (${response.status}). Please try again.`,
    );
  }
  return data as T;
}

export const api = {
  // ── Projects ──────────────────────────────────────────────
  projects: (signal?: AbortSignal) =>
    request<Project[]>("/projects", undefined, signal),

  project: (id: string, signal?: AbortSignal) =>
    request<Project>(`/projects/${id}`, undefined, signal),

  createProject: (body: { name: string; application_url: string }) =>
    request<Project>("/projects", body),

  deleteProject: (id: string) =>
    request<void>(`/projects/${id}`, undefined, undefined, "DELETE"),

  // ── Requirements ──────────────────────────────────────────
  requirements: (id: string, signal?: AbortSignal) =>
    request<Requirement[]>(`/requirements/projects/${id}`, undefined, signal),

  createRequirement: (id: string, raw_text: string) =>
    request<Requirement>(`/requirements/projects/${id}`, { raw_text }),

  revise: (id: string, raw_text: string) =>
    request<Requirement>(`/requirements/${id}/revisions`, { raw_text }),

  clarify: (r: Requirement, resolved_by: string, decisions: string[]) =>
    request<Requirement>(`/requirements/${r.id}/clarifications`, {
      expected_version: r.version,
      resolved_by,
      resolutions: decisions.map((decision, ambiguity_index) => ({
        decision,
        ambiguity_index,
      })),
    }),

  // ── Approvals ─────────────────────────────────────────────
  approvals: (id: string, signal?: AbortSignal) =>
    request<Approval[]>(
      `/approvals?project_id=${encodeURIComponent(id)}`,
      undefined,
      signal,
    ),

  decide: (
    id: string,
    action: "approve" | "reject",
    decided_by: string,
    reason: string,
  ) =>
    request<Approval>(`/approvals/${id}/${action}`, {
      decided_by,
      reason: reason || null,
    }),

  // ── Application map ───────────────────────────────────────
  map: async (id: string, signal?: AbortSignal) => {
    try {
      return await request<AppMap>(
        `/application-maps/projects/${id}`,
        undefined,
        signal,
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  },

  // ── Discovery ─────────────────────────────────────────────
  discover: (
    id: string,
    body: {
      url: string;
      focus_requirements: string[];
      max_pages: number;
      max_depth: number;
      max_duration_seconds: number;
      worker_limit?: number;
      automatic_limits?: boolean;
      /** credential_ref for the account to use for this crawl */
      credential_ref?: string | null;
    },
  ) =>
    request<{ job_id: string }>(
      `/application-maps/projects/${id}/discover`,
      body,
    ),

  job: (id: string, signal?: AbortSignal) =>
    request<Job>(
      `/application-maps/jobs/${encodeURIComponent(id)}`,
      undefined,
      signal,
    ),

  cancelDiscovery: (id: string) =>
    request<{ job_id: string; status: string }>(
      `/application-maps/jobs/${encodeURIComponent(id)}`,
      undefined,
      undefined,
      "DELETE",
    ),

  // ── Credentials (multi-account) ───────────────────────────
  /**
   * Save a new named test account.
   * role_name maps to the backend `role` field.
   * is_default maps to `set_as_project_default`.
   */
  saveAccount: (
    projectId: string,
    body: {
      role_name: string;
      username: string;
      password: string;
      is_default: boolean;
      login_url?: string;
      username_selector?: string;
      password_selector?: string;
      submit_selector?: string;
    },
  ) =>
    request<ProjectAccount>(`/projects/${projectId}/credentials`, {
      label: body.role_name,
      role: body.role_name,
      username: body.username,
      password: body.password,
      set_as_project_default: body.is_default,
      ...(body.login_url ? { login_url: body.login_url } : {}),
      ...(body.username_selector ? { username_selector: body.username_selector } : {}),
      ...(body.password_selector ? { password_selector: body.password_selector } : {}),
      ...(body.submit_selector ? { submit_selector: body.submit_selector } : {}),
    }),

  /** Legacy single-account compat — wraps saveAccount with role=Default */
  credentials: (projectId: string, body: Record<string, string>) =>
    api.saveAccount(projectId, {
      role_name: body.role_name || "Default",
      username: body.username,
      password: body.password,
      is_default: true,
      login_url: body.login_url,
      username_selector: body.username_selector,
      password_selector: body.password_selector,
      submit_selector: body.submit_selector,
    }),

  /** List all active accounts for a project (no passwords returned). */
  accounts: (projectId: string, signal?: AbortSignal) =>
    request<ProjectAccount[]>(
      `/projects/${projectId}/credentials`,
      undefined,
      signal,
    ),

  /**
   * Update an existing account via the revisions endpoint.
   * credential_ref identifies which account to revise.
   */
  updateAccount: (
    projectId: string,
    credential_ref: string,
    body: {
      role_name: string;
      username?: string;
      password?: string;
      is_default: boolean;
      login_url?: string;
      username_selector?: string;
      password_selector?: string;
      submit_selector?: string;
    },
  ) =>
    request<ProjectAccount>(
      `/projects/${projectId}/credentials/${encodeURIComponent(credential_ref)}/revisions`,
      {
        label: body.role_name,
        role: body.role_name,
        set_as_project_default: body.is_default,
        ...(body.username ? { username: body.username } : {}),
        ...(body.password ? { password: body.password } : {}),
        ...(body.login_url ? { login_url: body.login_url } : {}),
        ...(body.username_selector ? { username_selector: body.username_selector } : {}),
        ...(body.password_selector ? { password_selector: body.password_selector } : {}),
        ...(body.submit_selector ? { submit_selector: body.submit_selector } : {}),
      },
    ),

  /** Set a different account as the project default. */
  setDefaultAccount: (projectId: string, credential_ref: string) =>
    request<ProjectAccount>(
      `/projects/${projectId}/credentials/${encodeURIComponent(credential_ref)}/default`,
      {},
    ),

  /**
   * Soft-delete an account by revising it with active=false.
   * Backend marks old row inactive via the revisions endpoint with a
   * sentinel payload — for now we keep the row but the UI hides it.
   * If the backend gains a DELETE route, swap this out.
   */
  deleteAccount: async (projectId: string, credential_ref: string) => {
    // There is no DELETE endpoint yet — throw a clear error
    throw new Error(
      `Deleting account ${credential_ref} is not yet supported by the backend.`,
    );
  },

  // ── Test cases ────────────────────────────────────────────
  tests: (id: string, signal?: AbortSignal) =>
    request<TestCase[]>(`/test-cases/projects/${id}`, undefined, signal),

  generate: (
    id: string,
    requirement_id: string,
    application_map_id: string,
    target_categories?: Record<string, string[]>,
  ) =>
    request<Generation>(`/test-cases/projects/${id}/generate`, {
      requirement_id,
      application_map_id,
      ...(target_categories ? { target_categories } : {}),
    }),
};
