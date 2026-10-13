import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Button, Card, ErrorState } from "../../components/ui";

export default function ExecutionInputs({
  projectId,
  runId,
}: {
  projectId: string;
  runId: string;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [empty, setEmpty] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<unknown>();
  const requests = useQuery({
    queryKey: ["execution-inputs", projectId, runId],
    queryFn: ({ signal }) => api.executionInputs(projectId, runId, signal),
    refetchInterval: 1000,
  });
  const visible =
    requests.data?.requests.filter(
      (item) =>
        item.status === "RESOLVING_INPUT" ||
        item.status === "WAITING_FOR_INPUT",
    ) ?? [];
  if (requests.error) return <ErrorState error={requests.error} />;
  if (!visible.length) return null;
  return (
    <Card>
      <h2>Execution inputs</h2>
      <p>
        Inputs are resolved automatically for each case. Enter data below when
        the run needs your help.
      </p>
      {visible.map((item) => (
        <div key={item.id} className="input-request">
          <strong>
            {item.case_code} · {item.category} · {item.field}
          </strong>
          <p>{item.objective}</p>
          {item.status === "RESOLVING_INPUT" ? (
            <p>Resolving input automatically…</p>
          ) : (
            <>
              <p>
                {item.reason || "Enter the required test data to continue."}
              </p>
              <label className="field">
                <span>{item.field}</span>
                <input
                  type={item.sensitive ? "password" : "text"}
                  autoComplete="off"
                  value={values[item.id] ?? ""}
                  disabled={empty[item.id] || busy === item.id}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [item.id]: event.target.value,
                    }))
                  }
                />
              </label>
              {item.allow_empty && (
                <label>
                  <input
                    type="checkbox"
                    checked={empty[item.id] ?? false}
                    onChange={(event) =>
                      setEmpty((current) => ({
                        ...current,
                        [item.id]: event.target.checked,
                      }))
                    }
                  />{" "}
                  Leave empty
                </label>
              )}
              <Button
                busy={busy === item.id}
                disabled={!empty[item.id] && !(values[item.id] ?? "").length}
                onClick={async () => {
                  setBusy(item.id);
                  setError(undefined);
                  try {
                    await api.answerExecutionInput(projectId, runId, item.id, {
                      mode: empty[item.id] ? "empty" : "value",
                      value: empty[item.id] ? "" : (values[item.id] ?? ""),
                    });
                    setValues((current) => {
                      const next = { ...current };
                      delete next[item.id];
                      return next;
                    });
                    await requests.refetch();
                  } catch (err) {
                    setError(err);
                  } finally {
                    setBusy(undefined);
                  }
                }}
              >
                Submit and continue
              </Button>
            </>
          )}
        </div>
      ))}
      {!!error && <ErrorState error={error} />}
    </Card>
  );
}
