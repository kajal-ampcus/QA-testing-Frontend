import { useState } from "react";
import {
  Sparkles,
  ArrowRight,
  Search,
  ListChecks,
  Download,
  ChevronRight,
} from "lucide-react";
import type {
  Requirement,
  AppMap,
  TestCase,
  Generation,
} from "../../types/api";
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
export function Generate({
  requirement: r,
  map,
  pending,
  error,
  result,
  onGenerate,
  onReview,
}: {
  requirement: Requirement;
  map: AppMap;
  pending: boolean;
  error: unknown;
  result?: Generation;
  onGenerate: () => void;
  onReview: () => void;
}) {
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
              title: "Complete application map available",
              detail: `${map.states.length} states with observed elements.`,
              done: true,
            },
          ]}
        />
        {pending && (
          <ProgressIndicator
            label="Designing your test cases"
            description="The AI is processing your requirement and application map. Results will appear when generation finishes. Keep this workspace open."
          />
        )}
        {!!error && <ErrorState error={error} />}
        <div className="actions">
          <Button onClick={onGenerate} busy={pending}>
            <Sparkles size={16} />
            {result ? "Generate another set" : "Generate test cases"}
          </Button>
        </div>
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
  tests,
  requirements,
  map,
  result,
}: {
  tests: TestCase[];
  requirements: Requirement[];
  map?: AppMap | null;
  result?: Generation;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [confidence, setConfidence] = useState("");
  const [reqId, setReqId] = useState("");
  const [selected, setSelected] = useState<TestCase>();
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
          <Button
            variant="secondary"
            onClick={exportTests}
            disabled={!filtered.length}
          >
            <Download size={15} />
            Export JSON
          </Button>
        </div>
        {result &&
          (result.uncovered_acs.length > 0 ||
            result.partial_pairing_acs.length > 0 ||
            result.needs_review_test_cases.length > 0) && (
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
                : "Complete discovery and generate tests for an approved requirement."
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
        </DetailDrawer>
      )}
    </>
  );
}
