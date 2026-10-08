import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Button, ErrorState } from "../../components/ui";

export function SavedInputs({ projectId }: { projectId: string }) {
  const client = useQueryClient();
  const inputs = useQuery({
    queryKey: ["saved-inputs", projectId],
    queryFn: () => api.savedInputs(projectId),
  });
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [error, setError] = useState<unknown>(null);
  const rows = inputs.data || [];
  if (inputs.isLoading || rows.length === 0) return null;

  const save = async (id: string, keys: string[]) => {
    const current = drafts[id] || {};
    const fields = keys
      .map((key) => ({ key, value: (current[key] || "").trim() }))
      .filter((field) => field.value);
    if (fields.length === 0) return;
    setError(null);
    try {
      await api.updateSavedInput(projectId, id, fields);
      setDrafts((existing) => ({ ...existing, [id]: {} }));
      await client.invalidateQueries({ queryKey: ["saved-inputs", projectId] });
    } catch (caught) {
      setError(caught);
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await api.deleteSavedInput(projectId, id);
      await client.invalidateQueries({ queryKey: ["saved-inputs", projectId] });
    } catch (caught) {
      setError(caught);
    }
  };

  return (
    <div className="saved-inputs">
      <h3>Saved application inputs</h3>
      <p>Reusable values for this application. Passwords stay masked. One-time codes are not kept.</p>
      {rows.map((row) => (
        <form
          key={row.id}
          className="input-request"
          onSubmit={(event) => {
            event.preventDefault();
            void save(row.id, row.fields.map((field) => field.key));
          }}
        >
          <strong>{row.page_key}</strong>
          {row.fields.map((field) => (
            <label className="field" key={field.key}>
              <span>
                {field.name}
                {field.sensitive ? " (saved)" : `: ${field.preview}`}
              </span>
              <input
                type={field.sensitive ? "password" : "text"}
                autoComplete="off"
                placeholder={field.sensitive ? "••••" : "Update value"}
                value={drafts[row.id]?.[field.key] || ""}
                onChange={(event) =>
                  setDrafts((current) => ({
                    ...current,
                    [row.id]: { ...current[row.id], [field.key]: event.target.value },
                  }))
                }
              />
            </label>
          ))}
          <div className="actions">
            <Button type="submit">Update</Button>
            <Button type="button" variant="secondary" onClick={() => void remove(row.id)}>
              Delete
            </Button>
          </div>
        </form>
      ))}
      {error ? <ErrorState error={error} /> : null}
    </div>
  );
}
