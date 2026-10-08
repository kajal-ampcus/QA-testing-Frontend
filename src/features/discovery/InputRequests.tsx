import { useState } from "react";
import { api } from "../../api/client";
import type { DiscoveryInputRequest } from "../../types/api";
import { Button, ErrorState } from "../../components/ui";

function fieldControl(
  request: DiscoveryInputRequest,
  field: DiscoveryInputRequest["fields"][number],
  value: string,
  onChange: (next: string) => void,
) {
  const id = `${request.id}-${field.key}`;
  if (field.options && field.options.length > 0) {
    return (
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select</option>
        {field.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }
  const type = /password/i.test(field.input_type || field.name) ? "password" : "text";
  return (
    <input
      id={id}
      type={type}
      value={value}
      autoComplete="off"
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function InputRequests({
  mapId,
  requests,
  running,
  onSubmitted,
}: {
  mapId: string;
  requests: DiscoveryInputRequest[];
  running: boolean;
  onSubmitted: () => void;
}) {
  const visible = requests.filter((request) => request.status !== "applied");
  const [values, setValues] = useState<Record<string, Record<string, string>>>({});
  const [error, setError] = useState<unknown>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  if (visible.length === 0) return null;

  const submit = async (request: DiscoveryInputRequest) => {
    const current = values[request.id] || {};
    setSavingId(request.id);
    setError(null);
    try {
      await api.submitDiscoveryInput(
        mapId,
        request.id,
        request.fields.map((field) => ({
          key: field.key,
          value: (current[field.key] || "").trim(),
        })),
      );
      onSubmitted();
    } catch (caught) {
      setError(caught);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="input-requests">
      <h3>Values this application needs</h3>
      <p>
        Discovery found these fields on the live page. They are not predefined
        for this website.
        {running
          ? " Other pages keep being explored while you fill them in."
          : " Save the values, then continue discovery so they can be applied."}
      </p>
      {visible.map((request) => (
        <form
          key={request.id}
          className="input-request"
          onSubmit={(event) => {
            event.preventDefault();
            void submit(request);
          }}
        >
          <div>
            <strong>{request.page_title || (request.kind === "login" ? "Sign in" : "Form")}</strong>
            {request.page_url && <span className="field-hint">{request.page_url}</span>}
          </div>
          {request.screenshot_ref && (
            <a href={request.screenshot_ref} target="_blank" rel="noreferrer">
              <img src={request.screenshot_ref} alt="" />
            </a>
          )}
          {request.status === "pending" ? (
            <>
              {request.fields.map((field) => (
                <label className="field" key={field.key}>
                  <span>
                    {field.name}
                    {field.required === false ? "" : " *"}
                  </span>
                  {fieldControl(request, field, values[request.id]?.[field.key] || "", (next) =>
                    setValues((current) => ({
                      ...current,
                      [request.id]: { ...current[request.id], [field.key]: next },
                    })),
                  )}
                </label>
              ))}
              <div className="actions">
                <Button type="submit" busy={savingId === request.id}>
                  Save values
                </Button>
              </div>
            </>
          ) : (
            <p className="field-hint">Saved. Discovery will use these values on this page.</p>
          )}
        </form>
      ))}
      {error ? <ErrorState error={error} /> : null}
    </div>
  );
}
