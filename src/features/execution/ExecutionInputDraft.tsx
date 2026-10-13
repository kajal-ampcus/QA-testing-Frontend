import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Button, Card, ErrorState } from "../../components/ui";

type Answer = { mode: string; value: string };

export default function ExecutionInputDraft({
  projectId,
  generationId,
}: {
  projectId: string;
  generationId: string;
}) {
  const [edits, setEdits] = useState<Record<string, Answer | null>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const draft = useQuery({
    queryKey: ["execution-input-draft", projectId, generationId],
    queryFn: ({ signal }) =>
      api.executionInputDraft(projectId, generationId, signal),
  });
  if (draft.error) return <ErrorState error={draft.error} />;
  if (!draft.data) return null;
  if (!draft.data.supported)
    return (
      <Card>
        <p>
          Generate automation again to enable automatic input checkpoints and
          manual overrides.
        </p>
      </Card>
    );
  if (!draft.data.bindings.length) return null;
  return (
    <Card>
      <details>
        <summary>Optional input overrides</summary>
        <p>
          Inputs resolve automatically for positive and negative cases. Saved
          overrides take priority for the next run. Changes during a run apply
          to the next run.
        </p>
        {draft.data.bindings.map((item) => {
          const answer =
            item.key in edits ? edits[item.key] : draft.data?.values[item.key];
          return (
            <div className="input-request" key={item.key}>
              <label>
                <input
                  type="checkbox"
                  checked={!!answer}
                  disabled={busy}
                  onChange={(event) =>
                    setEdits((current) => ({
                      ...current,
                      [item.key]: event.target.checked
                        ? { mode: "value", value: "" }
                        : null,
                    }))
                  }
                />
                Override {item.case_code} · {item.category} · {item.field}
              </label>
              {answer && (
                <>
                  <input
                    aria-label={`${item.case_code} ${item.field} override`}
                    type={item.sensitive ? "password" : "text"}
                    autoComplete="off"
                    placeholder={
                      item.sensitive && !(item.key in edits)
                        ? "Saved override (hidden)"
                        : "Enter input"
                    }
                    value={answer.value}
                    disabled={busy || answer.mode === "empty"}
                    onChange={(event) =>
                      setEdits((current) => ({
                        ...current,
                        [item.key]: {
                          mode: "value",
                          value: event.target.value,
                        },
                      }))
                    }
                  />
                  {item.allow_empty && (
                    <label>
                      <input
                        type="checkbox"
                        checked={answer.mode === "empty"}
                        disabled={busy}
                        onChange={(event) =>
                          setEdits((current) => ({
                            ...current,
                            [item.key]: {
                              mode: event.target.checked ? "empty" : "value",
                              value: "",
                            },
                          }))
                        }
                      />{" "}
                      Leave empty
                    </label>
                  )}
                </>
              )}
            </div>
          );
        })}
        <Button
          busy={busy}
          disabled={!Object.keys(edits).length}
          onClick={async () => {
            setBusy(true);
            setError(undefined);
            try {
              await api.saveExecutionInputDraft(projectId, generationId, {
                expected_revision: draft.data!.revision,
                values: edits,
              });
              setEdits({});
              await draft.refetch();
            } catch (err) {
              setError(err);
            } finally {
              setBusy(false);
            }
          }}
        >
          Save input overrides
        </Button>
        {!!error && <ErrorState error={error} />}
      </details>
    </Card>
  );
}
