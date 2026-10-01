import { useEffect, useState } from "react";
import {
  Sparkles,
  ArrowRight,
  Search,
  ListChecks,
  Download,
  ChevronRight,
  Plus,
  Pencil,
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
import ReviewEditor from "./ReviewEditor";

function lines(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function ReviewableRows({
  test,
  requirementLabel,
  stale,
  canReview,
  showSelect,
  selected,
  editing,
  onToggle,
  onOpen,
  onEdit,
  onCancelEdit,
  onSaved,
  projectId,
}: {
  test: TestCase;
  requirementLabel: string;
  stale: boolean;
  canReview: boolean;
  showSelect: boolean;
  selected: boolean;
  editing: boolean;
  onToggle: (checked: boolean) => void;
  onOpen: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaved: () => void;
  projectId: string;
}) {
  const revise = useAction(
    projectId,
    (body: Parameters<typeof api.reviseTest>[1]) =>
      api.reviseTest(test.id, body),
  );
  return (
    <>
      <tr className={editing ? "review-row-open" : ""}>
        {showSelect && (
          <td className="review-check-col">
            {canReview ? (
              <input
                type="checkbox"
                aria-label={`Select ${test.tc_code}`}
                checked={selected}
                onChange={(event) => onToggle(event.target.checked)}
              />
            ) : null}
          </td>
        )}
        <td className="test-title-col">
          <button className="test-title" onClick={onOpen}>
            <span className="mono">{test.tc_code}</span>
            <strong>{test.current.title}</strong>
            {stale && (
              <small className="stale">
                Earlier requirement or map version
              </small>
            )}
          </button>
        </td>
        <td>
          <span className={`category ${test.current.category.toLowerCase()}`}>
            {human(test.current.category)}
          </span>
        </td>
        <td>
          <StatusBadge status={test.status} />
        </td>
        <td>
          <div className="confidence">
            <span
              className={test.current.confidence < 0.7 ? "low" : ""}
              style={{
                width: `${Math.max(0, Math.min(1, test.current.confidence)) * 100}%`,
              }}
            />
          </div>
          <small>{Math.round(test.current.confidence * 100)}%</small>
        </td>
        <td>
          <span className="mono">
            {requirementLabel} · v{test.requirement_version}
          </span>
          <small className="ac-list">
            {test.current.traceability.join(" · ")}
          </small>
        </td>
        <td className="review-actions">
          {canReview && (
            <button
              className="icon-button"
              aria-label={`Edit ${test.tc_code}`}
              onClick={onEdit}
            >
              <Pencil size={15} />
            </button>
          )}
          <button
            className="icon-button"
            aria-label={`Open ${test.tc_code}`}
            onClick={onOpen}
          >
            <ChevronRight size={17} />
          </button>
        </td>
      </tr>
      {editing && (
        <tr className="review-edit-row">
          <td colSpan={showSelect ? 7 : 6}>
            <ReviewEditor
              test={test}
              onCancel={onCancelEdit}
              onSaved={onSaved}
              save={(_item, body) => revise.mutateAsync(body)}
            />
          </td>
        </tr>
      )}
    </>
  );
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
    (body: Parameters<typeof api.createTest>[1]) =>
      api.createTest(projectId, body),
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
          <Button onClick={() => onGenerate("all", [], [])} busy={pending}>
            <Sparkles size={16} />
            {hasPreviousGeneration
              ? "Generate for whole graph"
              : "Generate test cases"}
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
            This map is partial. Generated tests will use the states discovered
            so far; you can continue discovery and generate only for newly added
            states later.
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
  const [editingId, setEditingId] = useState<string>();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkReviewer, setBulkReviewer] = useState("");
  const reviewable = tests.filter((test) =>
    ["DRAFT", "PENDING_APPROVAL", "REJECTED"].includes(test.status),
  );
  useEffect(() => {
    setSelectedIds(new Set(reviewable.map((test) => test.id)));
  }, [tests]);
  const remove = useAction(
    projectId,
    (testCase: TestCase) => api.deleteTest(testCase.id),
    () => setSelected(undefined),
  );
  const bulkReview = useAction(
    projectId,
    () =>
      api.bulkReviewTests(projectId, {
        decided_by: bulkReviewer.trim(),
        test_case_ids: [...selectedIds].filter((id) =>
          reviewable.some((test) => test.id === id),
        ),
      }),
    () => {
      setEditingId(undefined);
      setSelected(undefined);
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
              <strong>Review the generated drafts below</strong>
              {result.uncovered_acs.length > 0 && (
                <p>
                  {result.uncovered_acs.length} acceptance criteria still have
                  no test: {result.uncovered_acs.join(", ")}
                </p>
              )}
              {result.partial_pairing_acs.length > 0 && (
                <p>
                  {result.partial_pairing_acs.length} criteria need both a
                  positive and a negative case:{" "}
                  {result.partial_pairing_acs.join(", ")}
                </p>
              )}
              {result.needs_review_test_cases.length > 0 && (
                <p>
                  {result.needs_review_test_cases.length} generated case
                  {result.needs_review_test_cases.length === 1
                    ? " is"
                    : "s are"}{" "}
                  low confidence. Edit them in the list, then approve the batch.
                </p>
              )}
              {!!result.duplicates_skipped && (
                <p>
                  {result.duplicates_skipped} duplicate draft
                  {result.duplicates_skipped === 1 ? " was" : "s were"} not
                  saved again.
                </p>
              )}
              {(result.uncovered_acs.length > 0 ||
                result.partial_pairing_acs.length > 0) &&
                onCompleteCoverage && (
                  <Button
                    onClick={onCompleteCoverage}
                    busy={completingCoverage}
                  >
                    <Sparkles size={16} />
                    Review and generate missing test cases
                  </Button>
                )}
            </div>
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
        {!!reviewable.length && (
          <div className="bulk-review-bar">
            <label className="review-select-all">
              <input
                type="checkbox"
                aria-label="Select all reviewable test cases"
                checked={
                  reviewable.length > 0 &&
                  reviewable.every((test) => selectedIds.has(test.id))
                }
                onChange={(event) => {
                  setSelectedIds(
                    event.target.checked
                      ? new Set(reviewable.map((test) => test.id))
                      : new Set(),
                  );
                }}
              />
              {selectedIds.size} selected
            </label>
            <label>
              Reviewer name
              <input
                value={bulkReviewer}
                onChange={(event) => setBulkReviewer(event.target.value)}
                placeholder="Your name"
              />
            </label>
            {bulkReview.error && <ErrorState error={bulkReview.error} />}
            <Button
              type="button"
              busy={bulkReview.isPending}
              disabled={!bulkReviewer.trim() || selectedIds.size === 0}
              onClick={() => bulkReview.mutate()}
            >
              Approve selected ({selectedIds.size})
            </Button>
          </div>
        )}
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
                  {reviewable.length > 0 && (
                    <th className="review-check-col">
                      <span className="sr-only">Select</span>
                    </th>
                  )}
                  <th>Test case</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Confidence</th>
                  <th>Traceability</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const r = requirements.find((r) => r.id === t.requirement_id);
                  const stale =
                    r?.version !== t.requirement_version ||
                    map?.id !== t.application_map_id;
                  const canReview = [
                    "DRAFT",
                    "PENDING_APPROVAL",
                    "REJECTED",
                  ].includes(t.status);
                  return (
                    <ReviewableRows
                      key={t.id}
                      test={t}
                      requirementLabel={r?.req_code || "Requirement"}
                      stale={stale}
                      canReview={canReview}
                      showSelect={reviewable.length > 0}
                      selected={selectedIds.has(t.id)}
                      editing={editingId === t.id}
                      onToggle={(checked) => {
                        setSelectedIds((current) => {
                          const next = new Set(current);
                          if (checked) next.add(t.id);
                          else next.delete(t.id);
                          return next;
                        });
                      }}
                      onOpen={() => setSelected(t)}
                      onEdit={() => setEditingId(t.id)}
                      onCancelEdit={() => setEditingId(undefined)}
                      onSaved={() => setEditingId(undefined)}
                      projectId={projectId}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="table-footer">
          {filtered.length} of {tests.length} test cases
          {reviewable.length > 0 ? (
            <span>Select, edit if needed, then approve the batch</span>
          ) : null}
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
          {remove.error && <ErrorState error={remove.error} />}
          <div className="actions">
            {selected.status !== "APPROVED" && (
              <Button
                type="button"
                onClick={() => {
                  setEditingId(selected.id);
                  setSelected(undefined);
                }}
              >
                <Pencil size={15} />
                Edit in list
              </Button>
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
