import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Button, DetailDrawer, ErrorState } from "../../components/ui";
import { useAction } from "../../hooks/useAction";
import type { Requirement } from "../../types/api";

export function useDiscoveryCoverage(projectId: string, mapId: string, codes: string[]) {
  return useQuery({ queryKey: ["requirement-coverage", projectId, mapId, [...codes].sort().join(",")],
    queryFn: ({ signal }) => api.discoveryCoverage(projectId, mapId, codes, signal), enabled: codes.length > 0 });
}

export default function DiscoveryCoverage({ projectId, mapId, requirement, requirements, coverage, onChoose, onPrepared }: {
  projectId: string; mapId: string; requirement: Requirement; requirements: Requirement[];
  coverage: Pick<ReturnType<typeof useDiscoveryCoverage>, "data" | "isError" | "error" | "refetch" | "isPending">;
  onChoose: (id: string, codes: string[]) => void;
  onPrepared: (requirement: Requirement, codes: string[]) => void;
}) {
  const [draft, setDraft] = useState<{ title: string; description: string; criteria: string; exploratory: boolean; codes: string[]; upgrade: boolean; requiresOutcome: boolean; outcome: string }>();
  const [linkId, setLinkId] = useState("");
  const pages = coverage.data?.pages ?? [];
  const approvedIds = new Set(requirements.filter(req => req.status === "APPROVED").map(req => req.id));
  const uncovered = pages.filter(page => !page.requirements.some(req => approvedIds.has(req.id) && req.status === "APPROVED"));
  const codes = uncovered.map(page => page.state_code);
  const behaviorPages = pages.filter(page => page.requirements.some(req => req.id === requirement.id && req.form_behavior_missing));
  const preview = useAction(projectId, async ({ exploratory, upgrade = false }: { exploratory: boolean; upgrade?: boolean }) => {
    const selected = upgrade ? behaviorPages.map(page => page.state_code) : codes;
    const result = await api.discoveryRequirementDraft(projectId, { application_map_id: mapId, state_codes: selected, exploratory,
      behavioral: !exploratory, ...(upgrade ? { existing_requirement_id: requirement.id, expected_version: requirement.version } : {}) });
    if (!result.draft) throw new Error("No draft was returned");
    setDraft({ ...result.draft, criteria: result.draft.acceptance_criteria.map(ac => ac.text).join("\n"), exploratory, codes: selected,
      upgrade, requiresOutcome: !!result.requires_success_outcome, outcome: "" });
  });
  const save = useAction(projectId, async () => {
    if (!draft) throw new Error("Review a draft first");
    const result = await api.discoveryRequirementDraft(projectId, { application_map_id: mapId, state_codes: draft.codes,
      save: true, exploratory: draft.exploratory, title: draft.title, description: draft.description,
      behavioral: !draft.exploratory, ...(draft.outcome.trim() ? { success_outcome: draft.outcome.trim() } : {}),
      ...(draft.upgrade ? { existing_requirement_id: requirement.id, expected_version: requirement.version } : {}),
      criteria: draft.criteria.split("\n").map(text => text.trim()).filter(Boolean) });
    if (!result.requirement) throw new Error("The requirement was not saved");
    return result.requirement;
  }, saved => { if (draft) onPrepared(saved, draft.codes); });
  const link = useAction(projectId, async () => {
    const target = requirements.find(req => req.id === linkId);
    if (!target) throw new Error("Choose a requirement");
    return api.linkDiscoveryRequirement(projectId, target, mapId, codes);
  }, saved => onPrepared(saved, codes));
  if (coverage.isError) return <ErrorState error={coverage.error} retry={() => { void coverage.refetch(); }} />;
  if (coverage.isPending) return <p role="status">Checking requirement coverage…</p>;
  return <section className="notice" aria-label="Requirement coverage">
    <strong>Generation scope: selected pages and their approved requirements</strong>
    <p>{pages.length - uncovered.length} selected pages match approved requirements; {uncovered.length} need a requirement link or review.</p>
    <p>Matching approved requirements are reused together. Adding a new requirement keeps the existing requirements and their acceptance criteria.</p>
    <ul aria-label="Approved requirement assignments">{pages.filter(page => page.requirements.some(req => approvedIds.has(req.id) && req.status === "APPROVED")).map(page =>
      <li key={page.state_code}>{page.url} — {page.requirements.filter(req => approvedIds.has(req.id) && req.status === "APPROVED").map(req => {
        const saved = requirements.find(item => item.id === req.id)!;
        return `${saved.req_code}: ${saved.title}`;
      }).join("; ")}</li>)}</ul>
    <p className="muted">Suggested matches use page names and headings. Review the ACs before generation; matching a page does not prove every behavior is specified.</p>
    {behaviorPages.length > 0 && <div role="status"><strong>Form behavior coverage is missing</strong>
      <p>The approved ACs cover display only. Functional submission and negative validation rules have not been specified.</p>
      <Button busy={preview.isPending} onClick={() => preview.mutate({ exploratory: false, upgrade: true })}>Add functional and negative requirements</Button>
      {!!preview.error && <ErrorState error={preview.error} />}
    </div>}
    {uncovered.length > 0 && <>
      <ul>{uncovered.map(page => <li key={page.state_code}>{page.url} — no approved requirement match
        {page.requirements.filter(req => req.id !== requirement.id && requirements.some(item => item.id === req.id)).map(req => <Button key={req.id} variant="secondary"
          onClick={() => req.status === "APPROVED" ? onChoose(req.id, [page.state_code])
            : onPrepared(requirements.find(item => item.id === req.id)!, [page.state_code])}>
          {req.status === "APPROVED" ? "Use" : "Review"} {req.title}</Button>)}
      </li>)}</ul>
      <div className="actions"><Button busy={preview.isPending} onClick={() => preview.mutate({ exploratory: false })}>Draft requirements from discovery</Button>
        <Button variant="secondary" busy={preview.isPending} onClick={() => preview.mutate({ exploratory: true })}>Draft exploratory checks</Button></div>
      <p>Drafts describe observed controls. Business outcomes need confirmation. Both draft types go through the existing requirement approval.</p>
      <label>Link an existing requirement<select value={linkId} onChange={event => setLinkId(event.target.value)}>
        <option value="">Choose a requirement</option>{requirements.map(req => <option key={req.id} value={req.id}>{req.req_code} — {req.title}</option>)}
      </select></label>
      <p className="muted">Linking creates a requirement revision for approval. Tests pinned to an earlier requirement version follow the existing outdated-version rules.</p>
      <Button variant="secondary" disabled={!linkId} busy={link.isPending} onClick={() => link.mutate(undefined)}>Link pages and review</Button>
      {!!preview.error && <ErrorState error={preview.error} />}{!!link.error && <ErrorState error={link.error} />}
    </>}
    {draft && <DetailDrawer title={draft.exploratory ? "Review exploratory scope" : "Review discovered-feature requirements"} onClose={() => setDraft(undefined)}>
      <label>Title<input value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
      <label>Description<textarea rows={4} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
      <label>Acceptance criteria — one per line<textarea rows={10} value={draft.criteria} onChange={event => setDraft({ ...draft, criteria: event.target.value })} /></label>
      {draft.requiresOutcome && <label>Expected successful submission result<textarea required rows={3} value={draft.outcome}
        onChange={event => setDraft({ ...draft, outcome: event.target.value })} placeholder="Describe the confirmed confirmation, navigation, or saved result." /></label>}
      {!draft.exploratory && <p>Review inferred mandatory-field and option-group rules. Asterisks suggest required inputs but do not establish native HTML validation. Behavior tests remain manual until an outcome oracle is observed.</p>}
      <p>Confirm intended behavior. Discovery does not establish submission success, persistence, or notifications.</p>
      {!!save.error && <ErrorState error={save.error} />}
      <Button disabled={draft.title.trim().length < 3 || draft.description.trim().length < 3 || !draft.criteria.trim() || (draft.requiresOutcome && draft.outcome.trim().length < 3)}
        busy={save.isPending} onClick={() => save.mutate(undefined)}>Save draft and review approval</Button>
    </DetailDrawer>}
  </section>;
}
