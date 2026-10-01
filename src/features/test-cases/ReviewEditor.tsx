import { useState } from "react";
import type { TestCase } from "../../types/api";
import { api } from "../../api/client";
import { Button, ErrorState } from "../../components/ui";

function lines(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function revisionBody(
  test: TestCase,
  draft: {
    title: string;
    objective: string;
    expected: string;
    preconditions: string;
    category: "POSITIVE" | "NEGATIVE" | "EDGE_CASE";
    stepExpected: string[];
    stepValue: string[];
  },
) {
  const steps = test.current.steps.map((step, index) => {
    const target: TestCase["current"]["steps"][number]["target"] = {
      state_code: step.target.state_code,
    };
    if (step.target.element_code)
      target.element_code = step.target.element_code;
    if (step.target.element_name)
      target.element_name = step.target.element_name;
    if (step.target.element_role)
      target.element_role = step.target.element_role;
    const expected = (draft.stepExpected[index] ?? step.expected ?? "").trim();
    const value = (draft.stepValue[index] ?? step.value ?? "").trim();
    return {
      step_number: index + 1,
      action: step.action,
      target,
      value: value || undefined,
      expected: expected || undefined,
    };
  });
  const expectedResult = draft.expected.trim();
  if (!steps.length || steps[steps.length - 1].action !== "assert") {
    steps.push({
      step_number: steps.length + 1,
      action: "assert",
      target: { state_code: steps[0]?.target.state_code || "STATE-001" },
      value: undefined,
      expected: expectedResult,
    });
  } else if (!steps[steps.length - 1].expected) {
    steps[steps.length - 1].expected = expectedResult;
  }
  return {
    expected_version: test.current_version,
    title: draft.title.trim(),
    objective: draft.objective.trim(),
    expected_result: expectedResult,
    category: draft.category,
    traceability: test.current.traceability,
    preconditions: lines(draft.preconditions),
    steps,
    test_data: test.current.test_data,
  };
}

export default function ReviewEditor({
  test,
  onCancel,
  onSaved,
  save,
}: {
  test: TestCase;
  onCancel: () => void;
  onSaved: (updated: TestCase) => void;
  save: (
    test: TestCase,
    body: Parameters<typeof api.reviseTest>[1],
  ) => Promise<TestCase>;
}) {
  const [title, setTitle] = useState(test.current.title);
  const [objective, setObjective] = useState(test.current.objective);
  const [expected, setExpected] = useState(test.current.expected_result);
  const [preconditions, setPreconditions] = useState(
    test.current.preconditions.join("\n"),
  );
  const [category, setCategory] = useState<
    "POSITIVE" | "NEGATIVE" | "EDGE_CASE"
  >(
    test.current.category === "NEGATIVE" ||
      test.current.category === "EDGE_CASE"
      ? test.current.category
      : "POSITIVE",
  );
  const [stepExpected, setStepExpected] = useState(
    test.current.steps.map((step) => step.expected || ""),
  );
  const [stepValue, setStepValue] = useState(
    test.current.steps.map((step) => step.value || ""),
  );
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);

  return (
    <div className="review-editor">
      <div className="form-grid">
        <label>
          Title
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
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
            <option value="POSITIVE">Positive</option>
            <option value="NEGATIVE">Negative</option>
            <option value="EDGE_CASE">Edge case</option>
          </select>
        </label>
      </div>
      <label>
        Objective
        <textarea
          rows={2}
          value={objective}
          onChange={(event) => setObjective(event.target.value)}
        />
      </label>
      <label>
        Preconditions
        <textarea
          rows={2}
          value={preconditions}
          onChange={(event) => setPreconditions(event.target.value)}
        />
      </label>
      <ol className="review-steps">
        {test.current.steps.map((step, index) => (
          <li key={`${step.step_number}-${index}`}>
            <strong>
              {step.action} {step.target.element_name || step.target.state_code}
            </strong>
            <span className="mono">
              {step.target.state_code}
              {step.target.element_code ? ` / ${step.target.element_code}` : ""}
            </span>
            {step.action === "fill" && (
              <label>
                Value
                <input
                  value={stepValue[index] || ""}
                  onChange={(event) =>
                    setStepValue((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? event.target.value : item,
                      ),
                    )
                  }
                />
              </label>
            )}
            <label>
              Expected
              <input
                value={stepExpected[index] || ""}
                onChange={(event) =>
                  setStepExpected((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? event.target.value : item,
                    ),
                  )
                }
              />
            </label>
          </li>
        ))}
      </ol>
      <label>
        Expected result
        <textarea
          rows={2}
          value={expected}
          onChange={(event) => setExpected(event.target.value)}
        />
      </label>
      {!!error && <ErrorState error={error} />}
      <div className="actions">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          busy={busy}
          disabled={!title.trim() || !objective.trim() || !expected.trim()}
          onClick={async () => {
            setBusy(true);
            setError(undefined);
            try {
              const updated = await save(
                test,
                revisionBody(test, {
                  title,
                  objective,
                  expected,
                  preconditions,
                  category,
                  stepExpected,
                  stepValue,
                }),
              );
              onSaved(updated);
            } catch (next) {
              setError(next);
            } finally {
              setBusy(false);
            }
          }}
        >
          Save edits
        </Button>
      </div>
    </div>
  );
}
