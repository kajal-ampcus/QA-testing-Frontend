import { useState } from "react";
import {
  Sparkles,
  ArrowRight,
  Search,
  ListChecks,
  Download,
  ChevronRight,
  Plus,
} from "lucide-react";
import type {
  Approval,
  Requirement,
  AppMap,
  TestCase,
  Generation,
} from "../../types/api";
import { api } from "../../api/client";
import { useAction } from "../../hooks/useAction";
import {
  Button,
  Card,
  StatusBadge,
  ProgressIndicator,
  ErrorState,
  Timeline,
  DetailDrawer,
  EmptyState,
} from "../../components/ui";
import { human } from "../../utils/workflow";
import { exportCompleteExcelReport } from "./exportExcel";

function lines(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function CreateEdgeCaseForm({
  projectId,
  requirements,
  map,
  defaultRequirementId,
  onClose,
}: {
  projectId: string;
  requirements: Requirement[];
  map?: AppMap | null;
  defaultRequirementId: string;
  onClose: () => void;
}) {
  const first =
    requirements.find((item) => item.id === defaultRequirementId) ||
    requirements[0];
  const [requirementId, setRequirementId] = useState(first?.id || "");
  const requirement = requirements.find((item) => item.id === requirementId);
  const [acId, setAcId] = useState(
    requirement?.acceptance_criteria[0]?.id || "",
  );
  const [category, setCategory] = useState<
    "POSITIVE" | "NEGATIVE" | "EDGE_CASE"
  >("EDGE_CASE");
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  const [expected, setExpected] = useState("");
  const [preconditions, setPreconditions] = useState("");
  const [stepNotes, setStepNotes] = useState("");
  const [startState, setStartState] = useState(
    map?.states[0]?.state_code || "",
  );
  const create = useAction(
    projectId,
    (body: Parameters<typeof api.createTestCase>[1]) =>
      api.createTestCase(projectId, body),
    onClose,
  );
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!title.trim() || !expected.trim() || !requirementId || !acId) {
          return;
        }
        create.mutate({
          requirement_id: requirementId,
          ...(map?.id ? { application_map_id: map.id } : {}),
          title: title.trim(),
          objective:
            objective.trim() || `Verify this edge case: ${title.trim()}`,
          expected_result: expected.trim(),
          category,
          traceability: [acId],
          preconditions: lines(preconditions),
          step_notes: lines(stepNotes),
          ...(startState ? { start_state_code: startState } : {}),
        });
      }}
    >
      <p>
        Write a custom scenario the generator missed — empty values, limits,
        unusual sequences, or role-specific paths.
      </p>
      <label>
        Requirement
        <select
          required
          value={requirementId}
          onChange={(event) => {
            const nextId = event.target.value;
            setRequirementId(nextId);
            const next = requirements.find((item) => item.id === nextId);
            setAcId(next?.acceptance_criteria[0]?.id || "");
          }}
        >
          {requirements.map((item) => (
            <option value={item.id} key={item.id}>
              {item.req_code} · {item.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        Acceptance criterion
        <select
          required
          value={acId}
          onChange={(event) => setAcId(event.target.value)}
        >
          {(requirement?.acceptance_criteria || []).map((ac) => (
            <option value={ac.id} key={ac.id}>
              {ac.id}: {ac.text}
            </option>
          ))}
        </select>
      </label>
      <label>
        Category
        <select
          value={category}
          onChange={(event) =>
            setCategory(
              event.target.value as "POSITIVE" | "NEGATIVE" | "EDGE_CASE",
            )
          }
        >
          <option value="EDGE_CASE">Edge case</option>
          <option value="NEGATIVE">Negative</option>
          <option value="POSITIVE">Positive</option>
        </select>
      </label>
      <label>
        Title
        <input
          required
          minLength={3}
          placeholder="Login with CAPTCHA at retry limit"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <label>
        What this verifies
        <textarea
          rows={2}
          placeholder="Confirm the application rejects the action at this boundary."
          value={objective}
          onChange={(event) => setObjective(event.target.value)}
        />
      </label>
      {!!map?.states.length && (
        <label>
          Starting page
          <select
            value={startState}
            onChange={(event) => setStartState(event.target.value)}
          >
            {map.states.map((state) => (
              <option value={state.state_code} key={state.state_code}>
                {state.state_code} · {state.url_pattern}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Steps to reproduce
        <span className="field-hint">
          Optional. One action per line. A navigate step is added for you.
        </span>
        <textarea
          rows={4}
          placeholder={"Enter an empty quantity\nSubmit the order"}
          value={stepNotes}
          onChange={(event) => setStepNotes(event.target.value)}
        />
      </label>
      <label>
        Preconditions
        <span className="field-hint">Optional. One condition per line.</span>
        <textarea
          rows={2}
          placeholder="User is signed in as Kitchen"
          value={preconditions}
          onChange={(event) => setPreconditions(event.target.value)}
        />
      </label>
      <label>
        Expected result
        <textarea
          required
          minLength={3}
          rows={3}
          placeholder="The form stays on the same page and shows a quantity validation error."
          value={expected}
          onChange={(event) => setExpected(event.target.value)}
        />
      </label>
      {!!create.error && <ErrorState error={create.error} />}
      <div className="actions">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          busy={create.isPending}
          disabled={!requirementId || !acId || !map}
        >
          <Plus size={15} />
          Save edge case
        </Button>
      </div>
    </form>
  );
}
export function Generate({
  requirement: r,
  map,
  pending,
  savedCount = 0,
  error,
  result,
  onGenerate,
  onReview,
}: {
  requirement: Requirement;
  map: AppMap;
  pending: boolean;
  savedCount?: number;
  error: unknown;
  result?: Generation;
  onGenerate: (
    scope: "all" | "ungenerated",
    areaIds: string[],
    moduleIds: string[],
  ) => void;
  onReview: () => void;
}) {
  const generatedFingerprints = new Set(
    map.project_test_generation_coverage?.[r.id] ?? [],
  );
  const ungeneratedStates = map.states.filter(
    (state) => !generatedFingerprints.has(state.fingerprint),
  );
  const hasPreviousGeneration = generatedFingerprints.size > 0;
  return (
    <div className="two-column">
      <Card>
        <div className="card-heading">
          <div className="heading-icon">
            <Sparkles size={20} />
          </div>
          <div>
            <h2>From evidence to test design</h2>
            <p>Generate scenarios that connect intent to observed behavior.</p>
          </div>
        </div>
        <div className="design-pipeline">
          <div>
            <ListChecks size={24} />
            <strong>{r.req_code}</strong>
            <span>Approved requirement</span>
          </div>
          <ArrowRight size={18} />
          <div>
            <span className="pipeline-count">{map.states.length}</span>
            <strong>Application states</strong>
            <span>Map version {map.version}</span>
          </div>
          <ArrowRight size={18} />
          <div className={pending ? "design-active" : ""}>
            <Sparkles size={26} />
            <strong>AI test design</strong>
            <span>{pending ? "Processing" : "Ready"}</span>
          </div>
        </div>
        <Timeline
          items={[
            {
              title: "Approved requirement",
              detail: `${r.title} · Version ${r.version}`,
              done: true,
            },
            {
              title: `${r.acceptance_criteria.length} acceptance criteria available`,
              detail: "The foundation for requirement traceability.",
              done: true,
            },
            {
              title: `${human(map.status)} application map available`,
              detail: `${map.states.length} observed states are available for grounded generation.`,
              done: true,
            },
          ]}
        />
        {pending && (
          <ProgressIndicator
            label="Designing your test cases"
            description={
              savedCount > 0
                ? `${savedCount} test case${savedCount === 1 ? "" : "s"} already saved. The next batch of acceptance criteria is generating.`
                : `Generating ${r.acceptance_criteria.length} acceptance criteria from the application map in one batch.`
            }
          />
        )}
        {!!error && <ErrorState error={error} />}
        <div className="actions">
          <Button
            onClick={() => onGenerate("all", [], [])}
            busy={pending}
          >
            <Sparkles size={16} />
            {hasPreviousGeneration ? "Generate for whole graph" : "Generate test cases"}
          </Button>
          {hasPreviousGeneration && ungeneratedStates.length > 0 && (
            <Button
              variant="secondary"
              onClick={() => onGenerate("ungenerated", [], [])}
              busy={pending}
            >
              Generate only for new graph part ({ungeneratedStates.length})
            </Button>
          )}
        </div>
        {map.status === "PARTIAL" && (
          <div className="notice">
            This map is partial. Generated tests will use the states discovered so far;
            you can continue discovery and generate only for newly added states later.
          </div>
        )}
        {result && (
          <div className="notice success">
            <strong>{result.generated} test cases generated</strong>
            <p>
              Review scenarios, confidence, and traceability before using them.
            </p>
            <Button onClick={onReview}>
              Review test cases <ArrowRight size={16} />
            </Button>
          </div>
        )}
      </Card>
      <Card className="guide-card">
        <span className="eyebrow">GROUNDED IN YOUR APPLICATION</span>
        <h3>
          More than
          <br />a list of tests.
        </h3>
        <p>
          Positive, negative, and edge-case scenarios are designed against the
          approved intent and observed UI.
        </p>
        <div className="guide-note">
          Generated tests are drafts. Confidence and coverage help you decide
          where human review matters most.
        </div>
      </Card>
    </div>
  );
}
export default function TestCases({
  projectId,
  tests,
  requirements,
  map,
  result,
  completingCoverage,
  coverageError,
  onCompleteCoverage,
  approvals = [],
  requirement,
}: {
  projectId: string;
  tests: TestCase[];
  requirements: Requirement[];
  map?: AppMap | null;
  result?: Generation;
  completingCoverage?: boolean;
  coverageError?: unknown;
  onCompleteCoverage?: () => void;
  approvals?: Approval[];
  requirement?: Requirement;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [confidence, setConfidence] = useState("");
  const [reqId, setReqId] = useState("");
  const [selected, setSelected] = useState<TestCase>();
  const [creating, setCreating] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportError, setExportError] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [reason, setReason] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftObjective, setDraftObjective] = useState("");
  const [draftExpected, setDraftExpected] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [draftTrace, setDraftTrace] = useState("");
  const submit = useAction(
    projectId,
    (testCase: TestCase) => api.submitTest(testCase.id, testCase.current_version),
    (updated) => setSelected(updated),
  );
  const remove = useAction(
    projectId,
    (testCase: TestCase) => api.deleteTest(testCase.id),
    () => setSelected(undefined),
  );
  const decide = useAction(
    projectId,
    (input: { approvalId: string; action: "approve" | "reject" }) =>
      api.decide(input.approvalId, input.action, reviewer.trim(), reason.trim()),
    () => setSelected(undefined),
  );
  const createDraft = useAction(
    projectId,
    () =>
      api.createTest(projectId, {
        requirement_id: requirement!.id,
        application_map_id: map?.id,
        title: draftTitle.trim(),
        objective: draftObjective.trim(),
        expected_result: draftExpected.trim(),
        category: "EDGE_CASE",
        traceability: draftTrace
          .split(/[\s,]+/)
          .map((id) => id.trim())
          .filter(Boolean),
        step_notes: draftNotes
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
      }),
    () => {
      setDraftTitle("");
      setDraftObjective("");
      setDraftExpected("");
      setDraftNotes("");
      setDraftTrace("");
    },
  );
  const filtered = tests.filter(
    (t) =>
      `${t.tc_code} ${t.current.title} ${t.current.traceability.join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (!category || t.current.category === category) &&
      (!status || t.status === status) &&
      (!reqId || t.requirement_id === reqId) &&
      (!confidence ||
        (confidence === "high"
          ? t.current.confidence >= 0.9
          : confidence === "review"
            ? t.current.confidence >= 0.7 && t.current.confidence < 0.9
            : t.current.confidence < 0.7)),
  );
  const req = requirements.find((r) => r.id === selected?.requirement_id);
  const exportTests = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(filtered, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "test-cases.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const exportExcel = async () => {
    setExportError("");
    setExportingExcel(true);
    try {
      await exportCompleteExcelReport({ tests, requirements, map, result });
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : "Excel export failed.",
      );
    } finally {
      setExportingExcel(false);
    }
  };
  return (
    <>
      <Card className="test-card">
        <div className="card-heading">
          <div className="heading-icon">
            <ListChecks size={20} />
          </div>
          <div>
            <h2>
              Test cases <span className="count">{tests.length}</span>
            </h2>
            <p>Traceable scenarios. Clear intent. Ready for your review.</p>
          </div>
          <div className="actions">
            <Button
              onClick={() => {
                setSelected(undefined);
                setCreating(true);
              }}
              disabled={!requirements.length || !map}
            >
              <Plus size={15} />
              Add edge case
            </Button>
            <Button
              variant="secondary"
              onClick={exportTests}
              disabled={!filtered.length}
            >
              <Download size={15} />
              Export JSON
            </Button>
            <Button
              variant="secondary"
              onClick={exportExcel}
              disabled={!tests.length}
              busy={exportingExcel}
            >
              <Download size={15} />
              Export Excel
            </Button>
          </div>
        </div>
        {exportError && <p className="notice error">{exportError}</p>}
        {!!coverageError && <ErrorState error={coverageError} />}
        {result &&
          (result.uncovered_acs.length > 0 ||
            result.partial_pairing_acs.length > 0 ||
            result.needs_review_test_cases.length > 0 ||
            !!result.duplicates_skipped) && (
            <div className="notice">
              <strong>Generation needs review</strong>
              {result.uncovered_acs.length > 0 && (
                <p>
                  Uncovered acceptance criteria:{" "}
                  {result.uncovered_acs.join(", ")}
                </p>
              )}
              {result.partial_pairing_acs.length > 0 && (
                <p>
                  Partial scenario pairing:{" "}
                  {result.partial_pairing_acs.join(", ")}
                </p>
              )}
              {result.needs_review_test_cases.length > 0 && (
                <p>
                  Flagged tests: {result.needs_review_test_cases.join(", ")}
                </p>
              )}
              {!!result.duplicates_skipped && (
                <p>{result.duplicates_skipped} duplicate draft(s) were skipped.</p>
              )}
              {(result.uncovered_acs.length > 0 ||
                result.partial_pairing_acs.length > 0) &&
                onCompleteCoverage && (
                  <Button onClick={onCompleteCoverage} busy={completingCoverage}>
                    <Sparkles size={16} />
                    Review and generate missing test cases
                  </Button>
                )}
            </div>
          )}
        {requirement && map && (
          <details className="notice">
            <summary>Add a tester-authored edge case</summary>
            <div className="form-grid">
              <label>
                Title
                <input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} />
              </label>
              <label>
                Objective
                <input
                  value={draftObjective}
                  onChange={(e) => setDraftObjective(e.target.value)}
                />
              </label>
              <label>
                Expected result
                <input
                  value={draftExpected}
                  onChange={(e) => setDraftExpected(e.target.value)}
                />
              </label>
              <label>
                Acceptance criteria ids
                <input
                  value={draftTrace}
                  onChange={(e) => setDraftTrace(e.target.value)}
                  placeholder="AC-1 AC-2"
                />
              </label>
            </div>
            <label>
              Step notes
              <textarea
                rows={2}
                value={draftNotes}
                onChange={(e) => setDraftNotes(e.target.value)}
              />
            </label>
            {createDraft.error && <ErrorState error={createDraft.error} />}
            <Button
              type="button"
              busy={createDraft.isPending}
              disabled={
                !draftTitle.trim() ||
                !draftObjective.trim() ||
                !draftExpected.trim() ||
                !draftTrace.trim()
              }
              onClick={() => createDraft.mutate()}
            >
              Save draft
            </Button>
          </details>
        )}
        <div className="table-toolbar">
          <label className="search">
            <Search size={16} />
            <input
              aria-label="Search test cases"
              placeholder="Search tests or acceptance criteria…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select
            aria-label="Filter category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {[...new Set(tests.map((t) => t.current.category))].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select
            aria-label="Filter status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            {[...new Set(tests.map((t) => t.status))].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select
            aria-label="Filter confidence"
            value={confidence}
            onChange={(e) => setConfidence(e.target.value)}
          >
            <option value="">All confidence</option>
            <option value="high">High · ≥90%</option>
            <option value="review">Review · 70–89%</option>
            <option value="low">Low · &lt;70%</option>
          </select>
          <select
            aria-label="Filter requirement"
            value={reqId}
            onChange={(e) => setReqId(e.target.value)}
          >
            <option value="">All requirements</option>
            {requirements.map((r) => (
              <option value={r.id} key={r.id}>
                {r.req_code}
              </option>
            ))}
          </select>
        </div>
        {!filtered.length ? (
          <EmptyState
            title={
              tests.length
                ? "No tests match these filters"
                : "Your test cases will appear here"
            }
            description={
              tests.length
                ? "Adjust your search or filters to see more scenarios."
                : "Generate tests, or add a custom edge case from this page."
            }
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Test case</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Confidence</th>
                  <th>Traceability</th>
                  <th>
                    <span className="sr-only">Details</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const r = requirements.find((r) => r.id === t.requirement_id);
                  const stale =
                    r?.version !== t.requirement_version ||
                    map?.id !== t.application_map_id;
                  return (
                    <tr key={t.id}>
                      <td>
                        <button
                          className="test-title"
                          onClick={() => setSelected(t)}
                        >
                          <span className="mono">{t.tc_code}</span>
                          <strong>{t.current.title}</strong>
                          {stale && (
                            <small className="stale">
                              Earlier requirement or map version
                            </small>
                          )}
                        </button>
                      </td>
                      <td>
                        <span
                          className={`category ${t.current.category.toLowerCase()}`}
                        >
                          {human(t.current.category)}
                        </span>
                      </td>
                      <td>
                        <StatusBadge status={t.status} />
                      </td>
                      <td>
                        <div className="confidence">
                          <span
                            className={t.current.confidence < 0.7 ? "low" : ""}
                            style={{
                              width: `${Math.max(0, Math.min(1, t.current.confidence)) * 100}%`,
                            }}
                          />
                        </div>
                        <small>{Math.round(t.current.confidence * 100)}%</small>
                      </td>
                      <td>
                        <span className="mono">
                          {r?.req_code || "Requirement"} · v
                          {t.requirement_version}
                        </span>
                        <small className="ac-list">
                          {t.current.traceability.join(" · ")}
                        </small>
                      </td>
                      <td>
                        <button
                          className="icon-button"
                          aria-label={`Open ${t.tc_code}`}
                          onClick={() => setSelected(t)}
                        >
                          <ChevronRight size={17} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="table-footer">
          {filtered.length} of {tests.length} test cases{" "}
          <span>Drafts are not execution results</span>
        </div>
      </Card>
      {creating && (
        <DetailDrawer
          title="Add custom edge case"
          onClose={() => setCreating(false)}
        >
          <CreateEdgeCaseForm
            projectId={projectId}
            requirements={requirements}
            map={map}
            defaultRequirementId={reqId}
            onClose={() => setCreating(false)}
          />
        </DetailDrawer>
      )}
      {selected && (
        <DetailDrawer
          title={selected.current.title}
          onClose={() => setSelected(undefined)}
        >
          <div className="tags">
            <span className="tag mono">{selected.tc_code}</span>
            <StatusBadge status={selected.status} />
            <span className="tag">
              {Math.round(selected.current.confidence * 100)}% confidence
            </span>
          </div>
          <p>{selected.current.objective}</p>
          <h3>Requirement traceability</h3>
          <Timeline
            items={[
              {
                title: `${req?.req_code || selected.requirement_id} · v${selected.requirement_version}`,
                detail:
                  req?.version === selected.requirement_version
                    ? req.title
                    : "Historical requirement version. Current text may have changed.",
              },
              {
                title: "Acceptance criteria",
                detail: selected.current.traceability
                  .map((id) => {
                    const ac =
                      req?.version === selected.requirement_version
                        ? req.acceptance_criteria.find((a) => a.id === id)
                        : undefined;
                    return ac ? `${id}: ${ac.text}` : id;
                  })
                  .join("\n"),
              },
              {
                title: `${selected.tc_code} · Test version ${selected.current_version}`,
                detail: selected.current.title,
              },
              {
                title: "Application states",
                detail: [
                  ...new Set(
                    selected.current.steps
                      .map((s) => s.target.state_code)
                      .filter(Boolean),
                  ),
                ].join(", "),
              },
              {
                title: "Application elements",
                detail:
                  [
                    ...new Set(
                      selected.current.steps
                        .map((s) =>
                          s.target.element_code
                            ? `${s.target.state_code} / ${s.target.element_code}`
                            : "",
                        )
                        .filter(Boolean),
                    ),
                  ].join(", ") || "Page-level targets",
              },
            ]}
          />
          {map?.id !== selected.application_map_id && (
            <p className="notice">
              This test references an earlier application map. The listed
              targets belong to that saved map.
            </p>
          )}
          <h3>Preconditions</h3>
          <ul>
            {selected.current.preconditions.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
          <h3>Test steps</h3>
          <ol className="test-steps">
            {selected.current.steps.map((s, i) => (
              <li key={i}>
                <strong>
                  {human(s.action)}{" "}
                  {s.target.element_name || s.target.state_code}
                </strong>
                <span className="mono">
                  {s.target.state_code}
                  {s.target.element_code && ` / ${s.target.element_code}`}
                </span>
                {s.value && <p>Value: {s.value}</p>}
                {s.expected && <p>Expected: {s.expected}</p>}
              </li>
            ))}
          </ol>
          <div className="expected">
            <span className="eyebrow">EXPECTED RESULT</span>
            <p>{selected.current.expected_result}</p>
          </div>
          <details>
            <summary>Test data</summary>
            <pre>{JSON.stringify(selected.current.test_data, null, 2)}</pre>
          </details>
          <div className="form-grid">
            <label>
              Reviewer name
              <input
                value={reviewer}
                onChange={(e) => setReviewer(e.target.value)}
                placeholder="Your name"
              />
            </label>
            <label>
              Review note
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Required when requesting a revision"
              />
            </label>
          </div>
          {(submit.error || remove.error || decide.error) && (
            <ErrorState error={submit.error || remove.error || decide.error} />
          )}
          <div className="actions">
            {(selected.status === "DRAFT" || selected.status === "REJECTED") && (
              <Button
                type="button"
                busy={submit.isPending}
                onClick={() => submit.mutate(selected)}
              >
                Submit for approval
              </Button>
            )}
            {selected.status === "PENDING_APPROVAL" &&
              approvals.find(
                (approval) =>
                  approval.target_type === "test_case" &&
                  approval.target_id === selected.id,
              ) && (
                <>
                  <Button
                    variant="secondary"
                    type="button"
                    disabled={!reviewer.trim() || !reason.trim()}
                    busy={decide.isPending}
                    onClick={() =>
                      decide.mutate({
                        approvalId: approvals.find(
                          (approval) =>
                            approval.target_type === "test_case" &&
                            approval.target_id === selected.id,
                        )!.id,
                        action: "reject",
                      })
                    }
                  >
                    Request revision
                  </Button>
                  <Button
                    type="button"
                    disabled={!reviewer.trim()}
                    busy={decide.isPending}
                    onClick={() =>
                      decide.mutate({
                        approvalId: approvals.find(
                          (approval) =>
                            approval.target_type === "test_case" &&
                            approval.target_id === selected.id,
                        )!.id,
                        action: "approve",
                      })
                    }
                  >
                    Approve test case
                  </Button>
                </>
              )}
            {selected.status !== "APPROVED" && (
              <Button
                variant="secondary"
                type="button"
                busy={remove.isPending}
                onClick={() => remove.mutate(selected)}
              >
                Delete draft
              </Button>
            )}
          </div>
        </DetailDrawer>
      )}
    </>
  );
}
