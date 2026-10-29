import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
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
  NextAction,
} from "../../components/ui";
import { human } from "../../utils/workflow";
import { exportCompleteExcelReport } from "./exportExcel";
import ReviewEditor from "./ReviewEditor";
import { flowNameForCase, groupByFlow } from "../automation/flows";

function savedCoverageGaps(
  requirement: Requirement | undefined,
  tests: TestCase[],
) {
  const uncovered: string[] = [];
  const partial: string[] = [];
  const targets: Record<string, string[]> = {};
  if (!requirement) return { uncovered, partial, targets };
  const relevant = tests.filter(
    (test) =>
      test.requirement_id === requirement.id &&
      test.requirement_version === requirement.version &&
      test.status !== "OUTDATED" &&
      test.status !== "REJECTED",
  );
  const categoriesByAc = new Map<string, Set<string>>();
  for (const test of relevant) {
    for (const acId of test.current.traceability) {
      const categories = categoriesByAc.get(acId) ?? new Set<string>();
      categories.add(test.current.category);
      categoriesByAc.set(acId, categories);
    }
  }
  for (const criterion of requirement.acceptance_criteria) {
    const categories = categoriesByAc.get(criterion.id);
    if (!categories) {
      uncovered.push(criterion.id);
      targets[criterion.id] = [];
    }
  }
  return { uncovered, partial, targets };
}

function lines(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

type ImportedCase = {
  title: string;
  objective: string;
  expectedResult: string;
  category: "POSITIVE" | "NEGATIVE" | "EDGE_CASE";
  preconditions: string[];
  stepNotes: string[];
  inferred: string[];
};

const IMPORT_COLUMNS: Record<string, string[]> = {
  title: ["test scenario", "title", "test case", "test case title", "scenario", "name"],
  objective: ["objective", "description", "module", "what this verifies"],
  expectedResult: ["expected result", "expected", "expected outcome", "result"],
  category: ["category", "type", "test type"],
  preconditions: ["preconditions", "precondition", "prerequisites"],
  steps: ["test steps", "steps", "step", "steps to reproduce", "action"],
  caseKey: ["test case", "test case id", "test case code", "tc code", "id"],
};

function normaliseColumn(value: string) {
  return value.trim().toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ");
}

function readImportCell(row: Record<string, unknown>, column: keyof typeof IMPORT_COLUMNS) {
  // Prefer the most explicit alias (for example, "Title" over the exported
  // workbook's adjacent "Test Case" identifier column).
  for (const alias of IMPORT_COLUMNS[column]) {
    const entry = Object.entries(row).find(([name]) => normaliseColumn(name) === normaliseColumn(alias));
    const value = String(entry?.[1] ?? "").trim();
    if (value) return value;
  }
  return "";
}

function splitImportLines(value: string) {
  return value.split(/\r?\n|;/).map((item) => item.trim()).filter(Boolean);
}

/** Convert common test-case workbooks, including this application's export, into drafts.
 * Empty required cells are filled from the useful information in the same row so no
 * defined scenario is silently lost during import. */
export function parseExcelTestCases(workbook: XLSX.WorkBook): ImportedCase[] {
  const caseSheetName = workbook.SheetNames.find((name) => normaliseColumn(name) === "test cases")
    ?? workbook.SheetNames[0];
  const caseSheet = workbook.Sheets[caseSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(caseSheet, { defval: "" });
  if (!rows.length) throw new Error("The selected workbook has no test-case rows.");

  const stepsByCase = new Map<string, string[]>();
  const stepSheetName = workbook.SheetNames.find((name) => normaliseColumn(name) === "test steps");
  if (stepSheetName) {
    const stepRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[stepSheetName], { defval: "" });
    for (const row of stepRows) {
      const key = readImportCell(row, "caseKey") || readImportCell(row, "title");
      const step = readImportCell(row, "steps");
      if (key && step) stepsByCase.set(key.toLowerCase(), [...(stepsByCase.get(key.toLowerCase()) ?? []), step]);
    }
  }

  return rows.filter((row) => Object.values(row).some((value) => String(value).trim())).map((row, index) => {
    const inferred: string[] = [];
    const rowKey = readImportCell(row, "caseKey");
    const suppliedTitle = readImportCell(row, "title");
    const suppliedObjective = readImportCell(row, "objective");
    const suppliedExpected = readImportCell(row, "expectedResult");
    const inlineSteps = splitImportLines(readImportCell(row, "steps"));
    const linkedSteps = stepsByCase.get((rowKey || suppliedTitle).toLowerCase()) ?? [];
    const stepNotes = inlineSteps.length ? inlineSteps : linkedSteps;
    const rawTitle = suppliedTitle || suppliedObjective || stepNotes[0] || `Imported test case ${index + 1}`;
    const title = rawTitle.length < 3 ? `Test case: ${rawTitle}` : rawTitle;
    if (!suppliedTitle) inferred.push("Title");
    const objective = suppliedObjective.length >= 3
      ? suppliedObjective
      : suppliedObjective ? `Verify ${suppliedObjective}: ${title}` : `Verify: ${title}`;
    if (suppliedObjective.length < 3) inferred.push("Objective");
    const expectedResult = suppliedExpected
      ? suppliedExpected.length < 3 ? `Expected result: ${suppliedExpected}` : suppliedExpected
      : `The application handles the scenario successfully: ${title}.`;
    if (!suppliedExpected) inferred.push("Expected Result");
    const kind = readImportCell(row, "category").toUpperCase();
    return {
      title,
      objective,
      expectedResult,
      category: kind.includes("NEGATIVE") ? "NEGATIVE" : kind.includes("EDGE") ? "EDGE_CASE" : "POSITIVE",
      preconditions: splitImportLines(readImportCell(row, "preconditions")),
      stepNotes,
      inferred,
    };
  });
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
  const [category, setCategory] = useState<
    "POSITIVE" | "NEGATIVE" | "EDGE_CASE"
  >("EDGE_CASE");
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  const [expected, setExpected] = useState("");
  const [duplicateWarning, setDuplicateWarning] = useState("");
  const create = useAction(
    projectId,
    (body: Parameters<typeof api.createTest>[1]) =>
      api.createTest(projectId, body),
    (result) => {
      if (result.already_exists) {
        setDuplicateWarning(`A test case with this scenario is already present: ${result.tc_code} — ${result.current.title}. No new test case was added.`);
      } else {
        onClose();
      }
    },
  );
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setDuplicateWarning("");
        if (title.trim().length < 3 || objective.trim().length < 3 || expected.trim().length < 3 || !requirementId) {
          return;
        }
        create.mutate({
          requirement_id: requirementId,
          ...(map?.id ? { application_map_id: map.id } : {}),
          title: title.trim(),
          objective: objective.trim(),
          expected_result: expected.trim(),
          category,
          traceability: [],
          skip_existing: true,
          manual_entry: true,
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
          required
          minLength={3}
          maxLength={800}
          rows={2}
          placeholder="Confirm the application rejects the action at this boundary."
          value={objective}
          onChange={(event) => setObjective(event.target.value)}
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
      {duplicateWarning && <div className="notice" role="alert"><strong>Test case already present</strong><p>{duplicateWarning}</p></div>}
      <div className="actions">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          busy={create.isPending}
          disabled={!requirementId || !map}
        >
          <Plus size={15} />
          Save test case
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
    stateCodes: string[],
    regenerate: boolean,
  ) => void;
  onReview: () => void;
}) {
  const [scope, setScope] = useState<"all" | "ungenerated" | "selected">("all");
  const [stateCodes, setStateCodes] = useState<string[]>([]);
  const [regenerate, setRegenerate] = useState(false);
  const generatedFingerprints = new Set(
    map.project_test_generation_coverage?.[r.id] ?? [],
  );
  const ungeneratedStates = map.states.filter(
    (state) => !generatedFingerprints.has(state.fingerprint),
  );
  const chosenStates = scope === "all" ? map.states : scope === "ungenerated" ? ungeneratedStates
    : map.states.filter((state) => stateCodes.includes(state.state_code));
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
        <fieldset className="generation-scope" disabled={pending}>
          <legend>Choose graph states</legend>
          <label>
            Generate for
            <select value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}>
              <option value="all">Whole graph ({map.states.length} states)</option>
              <option value="ungenerated">New graph part ({ungeneratedStates.length} states)</option>
              <option value="selected">Selected states</option>
            </select>
          </label>
          <div className="generation-state-list" role="group" aria-label="Graph states">
            {map.states.map((state) => (
              <label key={state.state_code} className="generation-state">
                <input type="checkbox"
                  checked={chosenStates.some((item) => item.state_code === state.state_code)}
                  onChange={(event) => {
                    const selected = chosenStates.map((item) => item.state_code);
                    setStateCodes(event.target.checked ? [...selected, state.state_code] : selected.filter((code) => code !== state.state_code));
                    setScope("selected");
                  }} />
                <span><strong>{state.state_code}</strong><small>{state.url_pattern}</small></span>
                <small>{generatedFingerprints.has(state.fingerprint) ? "Generated" : "New"}</small>
              </label>
            ))}
          </div>
          <p className="muted">{chosenStates.length} states selected. Uncheck states to generate for a specific section.</p>
          <label className="generation-replace">
            <input type="checkbox" checked={regenerate} onChange={(event) => setRegenerate(event.target.checked)} />
            Replace existing cases for the selected states, including approved cases
          </label>
          {regenerate && <p className="notice">Replacement cases start as drafts and need review. Previous cases and their automation are retired when new valid cases are saved; their execution history is retained.</p>}
        </fieldset>
        <div className="actions">
          <Button disabled={chosenStates.length === 0} busy={pending}
            onClick={() => onGenerate(scope === "ungenerated" ? "ungenerated" : "all", [], [],
              scope === "selected" ? stateCodes : [], regenerate)}>
            <Sparkles size={16} />
            {regenerate ? "Regenerate selected scope" : "Generate test cases"}
          </Button>
          <Button variant="secondary" onClick={onReview}>Review saved test cases</Button>
        </div>
        {map.status === "PARTIAL" && (
          <div className="notice">
            This map is partial. Generated tests will use the states discovered
            so far; you can continue discovery and generate only for newly added
            states later.
          </div>
        )}
        {result && (
          <div className={result.generated > 0 ? "notice success" : "notice"}>
            <strong>{result.generated} test cases generated</strong>
            <p>
              {result.message || "Review scenarios, confidence, and traceability before using them."}
            </p>
            {!!result.ac_evidence?.length && <details>
              <summary>Acceptance criteria: {result.ac_evidence.filter((item) => item.status === "partial").length} with scenarios, {result.ac_evidence.filter((item) => item.status === "deferred").length} deferred</summary>
              {result.ac_evidence.map((item) => <p key={item.ac_id}>{item.ac_id}: {item.status} — {item.reason}</p>)}
            </details>}
            {result.validation_issues?.map((issue, index) => <p key={index}>{issue}</p>)}
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
  generatingWholeGraph,
  wholeGraphError,
  onGenerateWholeGraph,
  approvals = [],
  requirement,
  onNext,
}: {
  projectId: string;
  tests: TestCase[];
  requirements: Requirement[];
  map?: AppMap | null;
  result?: Generation;
  completingCoverage?: boolean;
  coverageError?: unknown;
  onCompleteCoverage?: (targets: Record<string, string[]>) => void;
  generatingWholeGraph?: boolean;
  wholeGraphError?: unknown;
  onGenerateWholeGraph?: (regenerate: boolean) => void;
  approvals?: Approval[];
  requirement?: Requirement;
  onNext?: () => void;
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
  const [expandedFlows, setExpandedFlows] = useState<Set<string>>(new Set());
  const [bulkReviewer, setBulkReviewer] = useState("");
  const importInput = useRef<HTMLInputElement>(null);
  const [importMessage, setImportMessage] = useState("");
  const [importWarning, setImportWarning] = useState("");
  // Regeneration retains previous approved cases as audit history but removes
  // them from the active review set. The newly generated cases are DRAFT.
  const activeTests = tests.filter((test) => test.status !== "OUTDATED");
  const reviewable = activeTests.filter((test) =>
    ["DRAFT", "PENDING_APPROVAL", "REJECTED"].includes(test.status),
  );
  const reviewableIds = new Set(reviewable.map((test) => test.id));
  const selectedReviewableIds = [...selectedIds].filter((id) => reviewableIds.has(id));
  const remove = useAction(
    projectId,
    (testCase: TestCase) => api.deleteTest(testCase.id),
    () => setSelected(undefined),
  );
  const importExcel = useAction(projectId, async (file: File) => {
    setImportMessage("");
    setImportWarning("");
    if (!map || !requirement?.acceptance_criteria.length) {
      throw new Error("Select a requirement with acceptance criteria and complete discovery first.");
    }
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const cases = parseExcelTestCases(workbook);
    const acId = requirement.acceptance_criteria[0].id;
    const startState = map.states[0]?.state_code;
    let inferred = 0;
    let imported = 0;
    let skipped = 0;
    for (const item of cases) {
      const result = await api.createTest(projectId, {
        requirement_id: requirement.id, application_map_id: map.id, title: item.title,
        objective: item.objective, expected_result: item.expectedResult, category: item.category,
        traceability: [acId], preconditions: item.preconditions,
        step_notes: item.stepNotes, start_state_code: startState, skip_existing: true,
      });
      if (result.already_exists) {
        skipped++;
        continue;
      }
      imported++;
      inferred += item.inferred.length;
    }
    return { imported, skipped, inferred };
  }, ({ imported, skipped, inferred }) => {
    setImportWarning(skipped
      ? imported === 0
        ? `All ${skipped} test cases in this file are already present. ${skipped} duplicates skipped. 0 test cases added.`
        : `${skipped} of ${imported + skipped} test cases are already present and were skipped. ${imported} new test case${imported === 1 ? " was" : "s were"} added.`
      : "");
    setImportMessage(imported ?
    `${imported} Excel test case${imported === 1 ? "" : "s"} imported as drafts.`
      + (skipped ? ` ${skipped} test case${skipped === 1 ? " is" : "s are"} already present and ${skipped === 1 ? "was" : "were"} skipped.` : "")
      + (inferred ? ` ${inferred} missing field${inferred === 1 ? " was" : "s were"} filled from the row context.` : "")
      : "");
  });
  const bulkReview = useAction(
    projectId,
    () =>
      api.bulkReviewTests(projectId, {
        decided_by: bulkReviewer.trim(),
        test_case_ids: selectedReviewableIds,
      }),
    (result) => {
      setSelectedIds(new Set(result.failed.map((item) => item.test_case_id)));
      setEditingId(undefined);
      setSelected(undefined);
    },
  );
  const filtered = activeTests.filter(
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
  const flowGroups = useMemo(
    () => groupByFlow(filtered, (test) => flowNameForCase(test, map)),
    [filtered, map],
  );
  const allFlowsExpanded = flowGroups.length > 0 && flowGroups.every((group) => expandedFlows.has(group.flow));
  const toggleAllFlows = () => setExpandedFlows(
    allFlowsExpanded ? new Set() : new Set(flowGroups.map((group) => group.flow)),
  );
  const hasApprovedForCurrentMap = activeTests.some(
    (test) => test.status === "APPROVED" && test.application_map_id === map?.id,
  );
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
              Test cases <span className="count">{activeTests.length}</span>
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
                Add Custom Case
            </Button>
            <input ref={importInput} type="file" accept=".xlsx,.xls" className="sr-only"
              onChange={(event) => { const file = event.target.files?.[0]; if (file) importExcel.mutate(file); event.currentTarget.value = ""; }} />
            <Button variant="secondary" onClick={() => importInput.current?.click()} busy={importExcel.isPending}
              disabled={!map || !requirement?.acceptance_criteria.length}>
              <Plus size={15} /> Import Excel
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
              disabled={!activeTests.length}
              busy={exportingExcel}
            >
              <Download size={15} />
              Export Excel
            </Button>
            {onNext && (
              <Button onClick={onNext}>
                Continue to Automation
                <ArrowRight size={15} />
              </Button>
            )}
            {onGenerateWholeGraph && map && (
              <Button
                variant="secondary"
                onClick={() => onGenerateWholeGraph(hasApprovedForCurrentMap)}
                busy={generatingWholeGraph}
              >
                <Sparkles size={15} />
                Choose states / regenerate
              </Button>
            )}
          </div>
        </div>
        {exportError && <p className="notice error">{exportError}</p>}
        {importExcel.error && <ErrorState error={importExcel.error} />}
        {importWarning && <div className="notice" role="alert"><strong>Duplicate test cases skipped</strong><p>{importWarning}</p></div>}
        {importMessage && <p className="notice success">{importMessage}</p>}
        {!!wholeGraphError && <ErrorState error={wholeGraphError} />}
        {!!coverageError && <ErrorState error={coverageError} />}
        {(() => {
          const gaps = savedCoverageGaps(requirement, activeTests);
          const missingCount = gaps.uncovered.length + gaps.partial.length;
          const sessionNotes =
            !!result &&
            (result.needs_review_test_cases.length > 0 ||
              !!result.generation_gaps?.length ||
              !!result.duplicates_skipped);
          if (!missingCount && !sessionNotes) return null;
          return (
            <div className="notice">
              <strong>Review the generated drafts below</strong>
              {gaps.uncovered.length > 0 && (
                <p>
                  {gaps.uncovered.length} acceptance criteria still have no
                  test: {gaps.uncovered.join(", ")}
                </p>
              )}
              {result?.generation_gaps?.map((gap) => (
                <p key={`${gap.ac_id}-${gap.status}`}>
                  {gap.ac_id}: {human(gap.status)} — {gap.reason}
                </p>
              ))}
              {!!result?.needs_review_test_cases.length && (
                <p>
                  {result.needs_review_test_cases.length} generated case
                  {result.needs_review_test_cases.length === 1
                    ? " is"
                    : "s are"}{" "}
                  low confidence. Edit them in the list, then approve the batch.
                </p>
              )}
              {!!result?.duplicates_skipped && (
                <p>
                  {result.duplicates_skipped} duplicate draft
                  {result.duplicates_skipped === 1 ? " was" : "s were"} not
                  saved again.
                </p>
              )}
              {missingCount > 0 && onCompleteCoverage && (
                <Button
                  onClick={() => onCompleteCoverage(gaps.targets)}
                  busy={completingCoverage}
                >
                  <Sparkles size={16} />
                  Review and generate missing test cases
                </Button>
              )}
            </div>
          );
        })()}
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
        {!!flowGroups.length && (
          <div className="test-flow-controls">
            <span>{flowGroups.length} section{flowGroups.length === 1 ? "" : "s"}</span>
            <button type="button" onClick={toggleAllFlows}>
              {allFlowsExpanded ? "Collapse all" : "Expand all"}
            </button>
          </div>
        )}
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
              {selectedReviewableIds.length} selected
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
            {bulkReview.data && <div role="status">
              {bulkReview.data.approved} approved, {bulkReview.data.skipped} already approved.
              {bulkReview.data.failed.map((item) => <p key={item.test_case_id}>{item.tc_code || item.test_case_id}: {item.error}</p>)}
            </div>}
            <Button
              type="button"
              busy={bulkReview.isPending}
              disabled={!bulkReviewer.trim() || selectedReviewableIds.length === 0}
              onClick={() => bulkReview.mutate()}
            >
              Approve selected ({selectedReviewableIds.length})
            </Button>
          </div>
        )}
        {!filtered.length ? (
          <EmptyState
            title={
              activeTests.length
                ? "No tests match these filters"
                : "Your test cases will appear here"
            }
            description={
              activeTests.length
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
              {flowGroups.map((group, groupIndex) => {
                  const groupReviewableIds = group.items
                    .filter((test) => ["DRAFT", "PENDING_APPROVAL", "REJECTED"].includes(test.status))
                    .map((test) => test.id);
                  const groupSelected = groupReviewableIds.length > 0 &&
                    groupReviewableIds.every((id) => selectedIds.has(id));
                  const expanded = expandedFlows.has(group.flow);
                  const groupId = `test-flow-content-${groupIndex}`;
                  return <tbody key={group.flow}>
                  <tr className={`test-flow-row${expanded ? " is-expanded" : ""}`}>
                    <td colSpan={reviewable.length > 0 ? 7 : 6}>
                      <div className="test-flow-header">
                      {groupReviewableIds.length > 0 && (
                        <label className="test-flow-select">
                          <input
                            type="checkbox"
                            aria-label={`Select all ${group.flow} test cases`}
                            checked={groupSelected}
                            onChange={(event) => {
                              setSelectedIds((current) => {
                                const next = new Set(current);
                                for (const id of groupReviewableIds) {
                                  if (event.target.checked) next.add(id);
                                  else next.delete(id);
                                }
                                return next;
                              });
                            }}
                          />
                          <span className="sr-only">Select all {group.flow} test cases</span>
                        </label>
                      )}
                      <button
                        type="button"
                        className="test-flow-toggle"
                        aria-expanded={expanded}
                        aria-controls={groupId}
                        onClick={() => setExpandedFlows((current) => {
                          const next = new Set(current);
                          if (next.has(group.flow)) next.delete(group.flow);
                          else next.add(group.flow);
                          return next;
                        })}
                      >
                        <ChevronRight size={16} aria-hidden="true" />
                        <strong>{group.flow}</strong>
                        <span>{group.items.length} case{group.items.length === 1 ? "" : "s"}</span>
                      </button>
                      </div>
                    </td>
                  </tr>
                  {expanded && group.items.map((t) => {
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
                </tbody>;
                })}
            </table>
          </div>
        )}
        <div className="table-footer">
          {filtered.length} of {tests.length} test cases
          {reviewable.length > 0 ? (
            <span>Select, edit if needed, then approve the batch</span>
          ) : null}
        </div>
        {onNext && (
          <NextAction
            title="Generate the Playwright suite"
            description="Only approved cases for this requirement and map are eligible. Drafts stay listed with the reason they are blocked."
            label="Continue to Automation"
            onClick={onNext}
          />
        )}
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
                  .join("\n") || "Not linked to acceptance criteria",
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
            <Button variant="secondary" type="button" busy={remove.isPending}
              onClick={() => {
                if (window.confirm(`Delete ${selected.tc_code} from active test cases? Its automation will be blocked. Previous execution history will be retained.`)) remove.mutate(selected);
              }}>
              Delete test case
            </Button>
          </div>
        </DetailDrawer>
      )}
    </>
  );
}
