import type { AppMap, TestCase } from "../../types/api";
import { flowNameForCase } from "../automation/flows";
import { generationStateName } from "../application-map/graphLayout";

export function caseSource(test: TestCase): string {
  if (test.source === "requirement") return "Requirement";
  if (test.source === "discovery") return "Discovery";
  if (test.source === "manual") return "Manual";
  if (test.source === "excel_import") return "Imported";
  if (test.current.traceability.length) return "Requirement-linked";
  if (/^Verify observed controls on /i.test(test.current.title)) return "Discovery-derived";
  return "Source unknown";
}

export function caseReadiness(test: TestCase, map?: AppMap | null) {
  const issues = new Set<string>();
  const steps = test.current.steps;
  if (!steps.some(step => step.action === "assert")) issues.add("Expected result needs an assertion");
  for (const step of steps) {
    if (step.action === "assert" && (!step.assertion?.kind || step.assertion.kind === "manual")) issues.add("Expected result needs an automated assertion");
    if (["click", "fill", "select"].includes(step.action) && !step.target.element_code) issues.add("An action needs an observed locator");
    if (step.action === "assert" && step.assertion?.kind !== "url" && !step.target.element_code) issues.add("Assertion needs an observed target");
    if (step.target.state_code && map && test.application_map_id === map.id && !map.states.some(s => s.state_code === step.target.state_code)) issues.add("Referenced page is missing from the map");
    if (step.target.element_code && map && test.application_map_id === map.id) {
      const state = map.states.find(s => s.state_code === step.target.state_code);
      if (state && !state.elements.some(item => item.element_code === step.target.element_code)) issues.add("Referenced control is missing from the page");
    }
    if (["fill", "select"].includes(step.action)) {
      const key = /^\{([^{}]+)\}$/.exec(step.value || "")?.[1];
      if (key?.startsWith("credential:") && !test.credential_ref) issues.add("A test account is needed");
      else if (key && !key.startsWith("credential:") && !key.startsWith("discovery:")) {
        const data = test.current.test_data;
        const nested = key.split(".").reduce<unknown>((value, part) => value && typeof value === "object" ? (value as Record<string, unknown>)[part] : undefined, data);
        if (!(key in data) && nested === undefined) issues.add(`Test data needed: ${key}`);
      }
    }
  }
  const scan = (value: unknown) => {
    if (typeof value === "string" && /^(MATCHING_FILTER_FIXTURE|VALID_TEST_FIXTURE|INVALID_TEST_FIXTURE):/.test(value)) issues.add("Configured test data needed");
    else if (Array.isArray(value)) value.forEach(scan);
    else if (value && typeof value === "object") Object.values(value).forEach(scan);
  };
  scan(test.current.test_data);
  if (steps.some(step => step.assertion?.kind === "table_column_values")) {
    const fixture = test.current.test_data.filter_fixture as Record<string, unknown> | undefined;
    if (!fixture || !fixture.record_id || !fixture.status) issues.add("Matching record and status fixture needed");
  }
  const text = `${test.current.title} ${test.current.objective} ${test.current.preconditions.join(" ")}`;
  if (/\b(network failure|network unavailable|simulate (?:an? )?(?:api|network) failure)\b/i.test(text)) issues.add("Network-failure setup needed");
  if (/\b(cross[- ]account|another (?:user|recruiter|account)|multiple (?:users|recruiters|accounts))\b/i.test(text)) issues.add("Multiple-account setup needed");
  return { label: issues.size ? "Review needed" : "Automation not assessed", issues: [...issues] };
}

export function caseScenario(test: TestCase, map?: AppMap | null): string {
  const text = `${test.current.title} ${test.current.objective}`;
  const interaction = test.current.steps.find(step => ["fill", "select"].includes(step.action));
  if (/\b(filter|search)\b/i.test(text) && interaction) {
    const state = map?.id === test.application_map_id ? map.states.find(item => item.state_code === interaction.target.state_code) : undefined;
    const control = state?.elements.find(item => item.element_code === interaction.target.element_code);
    const name = String(control?.field_label || interaction.target.element_name || "").trim();
    if (name) return /\bfilter\b/i.test(name) ? name : `${name} filter`;
  }
  if (/^Verify observed controls on /i.test(test.current.title)) return "Page smoke check";
  return "Other scenarios";
}

export function casePage(test: TestCase, map?: AppMap | null): string {
  const code = test.primary_state_code || test.current.steps[0]?.target.state_code;
  const state = map && map.id === test.application_map_id ? map.states.find(item => item.state_code === code) : undefined;
  if (state) return generationStateName(state);
  return flowNameForCase(test, map);
}
