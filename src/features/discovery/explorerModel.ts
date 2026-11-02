import type { AppState, DiscoveryCheckpoint, ProjectAccount } from "../../types/api.ts";

export type Branch = NonNullable<DiscoveryCheckpoint["jobs"]>[number];

export function observedForm(branch: Branch, states: AppState[], baseURL: string) {
  if (branch.status !== "completed") return [];
  const route = (value: string) => {
    try { const url = new URL(value, baseURL); return url.origin + url.pathname.replace(/\/$/, "") + url.search + url.hash; }
    catch { return value; }
  };
  const destination = branch.path.at(-1)?.url;
  const capturedFields = branch.observed_form?.fields;
  const matching: Array<{ elements: Record<string, unknown>[] }> = capturedFields ? [{ elements: capturedFields.map((field) => ({ ...field, element_code: field.key })) }] : branch.result_fingerprint
    ? states.filter((state) => state.fingerprint === branch.result_fingerprint)
    : destination ? states.filter((state) => route(state.url_pattern) === route(destination)) : [];
  const fields = new Map<string, { code: string; name: string; type: string; required: boolean; options: string[] }>();
  for (const state of matching) for (const element of state.elements) {
    const scope = String(element.locator_scope || element.landmark || "");
    if (/\b(header|footer|nav|banner|contentinfo|navigation|search)\b/i.test(scope)) continue;
    const role = String(element.role || "");
    const type = String(element.input_type || element.type || role);
    if (!["textbox", "input", "combobox", "checkbox", "radio", "spinbutton"].includes(role) && type !== "file") continue;
    const name = String(element.name || element.element_code || "Input");
    if (!scope && /^search$/i.test(name.trim())) continue;
    const validation = element.validation as Record<string, unknown> | undefined;
    fields.set(`${role}/${name}`, { code: String(element.element_code || name), name, type,
      required: Boolean(element.required || validation?.required || /[*?]\s*$/.test(name)),
      options: Array.isArray(element.options) ? element.options.filter((option): option is string => typeof option === "string") : [] });
  }
  return [...fields.values()];
}
export type ExplorerRole = {
  id: string;
  label: string;
  ref: string | null;
  paths: Branch[];
  choice?: { requestId: string; choiceId: string };
  configured: boolean;
};

export function uniquePaths(paths: Branch[] = []): Branch[] {
  const unique = [...new Map(paths.map((path) => [path.key, path])).values()];
  const sameStep = (left: Branch["path"][number], right: Branch["path"][number]) =>
    left.role === right.role && left.name === right.name && left.url === right.url && left.value === right.value;
  // Old checkpoints can contain the same landing navigation under every page.
  // Match destinations and ancestor paths, never labels alone or other roles.
  const redundant = unique.filter((branch) => {
    const last = branch.path.at(-1);
    if (last?.role !== "link" || !last.url || branch.path.length < 2) return false;
    return unique.some((ancestor) => {
      const target = ancestor.path.at(-1);
      return ancestor.key.split("|")[0] === branch.key.split("|")[0]
        && ancestor.path.length < branch.path.length
        && target?.role === "link" && target.url === last.url
        && ancestor.path.slice(0, -1).every((step, index) => sameStep(step, branch.path[index]));
    });
  });
  return unique.filter((branch) => !redundant.some((parent) => parent.key === branch.key)).map((path) => path.path.length ? path : { ...path, path: [{ role: "page", name: "Entry page" }] });
}

export function explorerRoles(
  checkpoint: DiscoveryCheckpoint | null | undefined,
  accounts: ProjectAccount[],
): ExplorerRole[] {
  const current = checkpoint?.configuration.credential_ref ?? "public";
  const contexts = {
    ...checkpoint?.account_contexts,
    ...(checkpoint ? { [current]: checkpoint } : {}),
  };
  if (!checkpoint) return [];
  const normalize = (label: string) =>
    label
      .trim()
      .toLowerCase()
      .replace(/\s+account$/, "");
  const choices = new Map<
    string,
    { id: string; label: string; requestId: string }
  >();
  for (const context of Object.values(contexts)) {
    for (const request of context.input_requests ?? []) {
      if (request.kind !== "login_choice") continue;
      for (const choice of request.choices ?? [])
        choices.set(choice.id, { ...choice, requestId: request.id });
    }
  }
  const roles: ExplorerRole[] = [];
  const usedRefs = new Set<string>();
  for (const choice of choices.values()) {
    const matchesLogin = (
      request: NonNullable<DiscoveryCheckpoint["input_requests"]>[number],
    ) =>
      request.kind === "login" &&
      (request.login_group === choice.id ||
        (!request.login_group &&
          normalize(request.login_label ?? "") === normalize(choice.label)));
    const matchingAccounts = accounts.filter(
      (account) =>
        account.login_group === choice.id ||
        (!account.login_group &&
          normalize(account.role || account.label) === normalize(choice.label)),
    );
    const account =
      matchingAccounts.find((account) => account.credential_ref === current) ??
      matchingAccounts.find((account) => contexts[account.credential_ref]) ??
      matchingAccounts[0];
    const saved = Object.entries(contexts).find(
      ([ref, context]) =>
        ref !== "public" && context.input_requests?.some(matchesLogin),
    );
    const ref = account?.credential_ref ?? saved?.[0] ?? null;
    const publicLogin = contexts.public?.input_requests?.some(matchesLogin);
    const context = ref
      ? contexts[ref]
      : publicLogin
        ? contexts.public
        : undefined;
    if (ref) usedRefs.add(ref);
    roles.push({
      id: ref ?? "choice:" + choice.id,
      label: choice.label,
      ref,
      paths: uniquePaths(context?.jobs),
      configured: !!ref || !!publicLogin,
      choice:
        !ref && !publicLogin
          ? { requestId: choice.requestId, choiceId: choice.id }
          : undefined,
    });
  }
  // Legacy/single-login checkpoints may not contain an explicit login-choice
  // request. Only show accounts actually observed in this map, never the whole
  // credential directory or invented role placeholders.
  for (const [ref, context] of Object.entries(contexts)) {
    if (usedRefs.has(ref)) continue;
    const login = context.input_requests?.find(
      (request) => request.kind === "login" && request.login_label,
    );
    const account = accounts.find((account) => account.credential_ref === ref);
    const label =
      login?.login_label ??
      (ref !== "public" ? account?.role || account?.label : undefined);
    if (
      !label ||
      roles.some((role) => normalize(role.label) === normalize(label))
    )
      continue;
    roles.push({
      id: ref,
      label: label.replace(/\s+account$/i, ""),
      ref: ref === "public" ? null : ref,
      configured: true,
      paths: uniquePaths(context.jobs),
    });
  }
  // Public-only applications may have no login form or role selector. Their
  // guided paths still live in the checkpoint frontier and must be selectable
  // even when discovery never found an authentication flow.
  const publicContext = contexts.public;
  if (
    publicContext?.jobs?.length &&
    !roles.some((role) => role.id === "public")
  ) {
    roles.unshift({
      id: "public",
      label: "Public pages",
      ref: null,
      configured: true,
      paths: uniquePaths(publicContext.jobs),
    });
  }
  return roles;
}

export interface ExplorerState {
  active: string;
  selections: Record<string, string[]>;
}
export function selectPaths(
  state: ExplorerState,
  role: string,
  paths: string[],
): ExplorerState {
  return {
    ...state,
    selections: { ...state.selections, [role]: [...new Set(paths)] },
  };
}
export function readExplorerState(
  value: string | null,
  fallback: string,
): ExplorerState {
  try {
    const parsed = JSON.parse(value ?? "null");
    if (
      parsed &&
      typeof parsed.active === "string" &&
      parsed.selections &&
      Object.values(parsed.selections).every(
        (keys) =>
          Array.isArray(keys) && keys.every((key) => typeof key === "string"),
      )
    )
      return parsed;
  } catch {
    /* Storage can be unavailable or contain an older format. */
  }
  return { active: fallback, selections: {} };
}
