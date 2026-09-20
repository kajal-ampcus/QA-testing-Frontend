import type { AppMap, Requirement, TestCase } from "../types/api";
export const stages = [
  "Requirement",
  "Approval",
  "Discovery",
  "Application map",
  "Test generation",
  "Test cases",
] as const;
export function nextStage(
  requirement?: Requirement,
  map?: AppMap | null,
  tests: TestCase[] = [],
) {
  if (!requirement || requirement.ambiguities.length) return 0;
  if (requirement.status !== "APPROVED") return 1;
  if (!map || !["COMPLETE", "PARTIAL"].includes(map.status)) return 2;
  if (
    tests.some(
      (t) =>
        t.requirement_id === requirement.id &&
        t.requirement_version === requirement.version &&
        t.application_map_id === map.id,
    )
  )
    return 5;
  return 3;
}
export const human = (value: string) =>
  value.toLowerCase().replaceAll("_", " ");
export const activeJob = (status?: string) =>
  !!status && ["queued", "deferred", "in_progress"].includes(status);
