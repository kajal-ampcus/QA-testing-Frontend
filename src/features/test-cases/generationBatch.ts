import type { Generation } from "../../types/api.ts";

export type GenerationTarget = { requirementId: string; stateCodes: string[]; requirementCode?: string };

export function generationTargets(pages: Array<{ state_code: string; requirements: Array<{ id: string; status: string }> }>, approvedIds: string[]): GenerationTarget[] {
  const allowed = new Set(approvedIds);
  const groups = new Map<string, Set<string>>();
  for (const page of pages) for (const req of page.requirements) {
    if (req.status !== "APPROVED" || !allowed.has(req.id)) continue;
    const codes = groups.get(req.id) ?? new Set<string>();
    codes.add(page.state_code);
    groups.set(req.id, codes);
  }
  return [...groups].map(([requirementId, codes]) => ({ requirementId, stateCodes: [...codes] }));
}

export async function generateBatch(targets: GenerationTarget[], generate: (target: GenerationTarget) => Promise<Generation>): Promise<Generation> {
  if (!targets.length) throw new Error("Select pages with approved requirements before generating.");
  if (targets.length === 1) return { ...await generate(targets[0]), requirement_ids: [targets[0].requirementId] };
  const result: Generation = { generated: 0, test_cases: [], uncovered_acs: [], partial_pairing_acs: [],
    needs_review_test_cases: [], validation_issues: [], ac_evidence: [], generation_gaps: [], pairing_gaps: [], duplicates_skipped: 0,
    requirement_ids: targets.map(target => target.requirementId) };
  let completed = 0;
  const failures: string[] = [];
  // Preserve the existing per-requirement transactions and approval checks.
  for (const target of targets) {
    const label = target.requirementCode ?? target.requirementId;
    const qualify = (ac: string) => `${label}/${ac}`;
    try {
      const batch = await generate(target);
      completed++;
      result.generated += batch.generated;
      result.test_cases.push(...batch.test_cases);
      result.uncovered_acs.push(...batch.uncovered_acs.map(qualify));
      result.partial_pairing_acs.push(...batch.partial_pairing_acs.map(qualify));
      result.needs_review_test_cases.push(...batch.needs_review_test_cases);
      result.validation_issues!.push(...(batch.validation_issues ?? []).map(issue => `${label}: ${issue}`));
      result.ac_evidence!.push(...(batch.ac_evidence ?? []).map(row => ({ ...row, ac_id: qualify(row.ac_id) })));
      result.generation_gaps!.push(...(batch.generation_gaps ?? []).map(row => ({ ...row, ac_id: qualify(row.ac_id) })));
      result.pairing_gaps!.push(...(batch.pairing_gaps ?? []).map(row => ({ ...row, ac_id: qualify(row.ac_id) })));
      result.duplicates_skipped! += batch.duplicates_skipped ?? 0;
    } catch (error) {
      failures.push(`${label}: ${error instanceof Error ? error.message : "Generation failed"}`);
    }
  }
  if (!completed) throw new Error(failures.join("; "));
  result.validation_issues!.push(...failures);
  result.message = `Processed ${completed} of ${targets.length} approved requirements. ${result.generated} test cases generated.`
    + (failures.length ? ` ${failures.length} failed; successful cases were saved. Review the errors before retrying.` : "");
  result.outcome = result.generated ? "generated" : "no_supported_cases";
  return result;
}
