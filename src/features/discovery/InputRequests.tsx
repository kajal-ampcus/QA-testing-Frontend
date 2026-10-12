import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  const inputType = (field.input_type || "").toLowerCase();
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
  const type = /password/i.test(field.input_type || field.name)
    ? "password"
    : ["email", "number", "date", "file"].includes(inputType)
      ? inputType
      : "text";
  if (inputType === "textarea") {
    return <textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} />;
  }
  if (["checkbox", "radio"].includes(inputType)) {
    return (
      <input
        id={id}
        type={inputType}
        checked={value === "true"}
        onChange={(event) => onChange(event.target.checked ? "true" : "")}
      />
    );
  }
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
  projectId,
  requests,
  running,
  onSubmitted,
  onResumed,
  onContinue,
}: {
  mapId: string;
  projectId: string;
  requests: DiscoveryInputRequest[];
  running: boolean;
  onSubmitted: () => void;
  onResumed: (jobId: string) => void;
  onContinue: (branches: string[], credentialRef?: string | null) => Promise<void>;
}) {
  const visible = requests.filter((request) => request.status === "pending");
  const [values, setValues] = useState<Record<string, Record<string, string>>>({});
  const [error, setError] = useState<unknown>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [saveAccount, setSaveAccount] = useState<Record<string, boolean>>({});
  const [account, setAccount] = useState<Record<string, string>>({});
  const accounts = useQuery({ queryKey: ["accounts", projectId], queryFn: () => api.accounts(projectId) });

  if (visible.length === 0) return null;

  const submit = async (request: DiscoveryInputRequest) => {
    const current = values[request.id] || {};
    const target = request.submit?.name || "this form";
    if (request.kind !== "login_choice" && !window.confirm(
      request.kind === "login" ? `Sign in using ${request.login_label || "this login"} and continue discovery?` :
      `Submit ${target} on the live website? This can send the entered data to the website owner.`,
    )) return;
    setSavingId(request.id);
    setError(null);
    try {
      const response = await api.submitDiscoveryInput(
        mapId,
        request.id,
        account[request.id] ? [] : request.fields.filter((field) => current[field.key]).map((field) => ({
          key: field.key,
          value: current[field.key] || "",
        })),
        { choice_id: choices[request.id], save_account: !!saveAccount[request.id], credential_ref: account[request.id] || undefined },
      );
      setValues((previous) => ({ ...previous, [request.id]: {} }));
      onSubmitted();
      if (response.job_id) onResumed(response.job_id);
      else if (response.selected_branches?.length) await onContinue(response.selected_branches, response.credential_ref);
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
        Discovery found a live form that it can test. Enter test values below;
        the form will not be submitted until you explicitly approve it.
        {running
          ? " Other pages keep being explored while you fill them in."
          : " Approve the submission, then continue discovery so it can be tested."}
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
            {request.validation_error && <p className="error">{request.validation_error}</p>}
          </div>
          {request.status === "pending" ? (
            <>
              {request.kind === "login_choice" && (
                <label className="field"><span>Which login do you want to discover?</span>
                  <select required value={choices[request.id] || ""} onChange={(event) => setChoices({ ...choices, [request.id]: event.target.value })}>
                    <option value="">Select a login</option>
                    {request.choices?.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
                  </select>
                </label>
              )}
              {request.kind === "login" && <label className="field"><span>Login group: {request.login_label || "Sign in"}</span>
                <select value={account[request.id] || ""} onChange={(event) => setAccount({ ...account, [request.id]: event.target.value })}>
                  <option value="">Enter credentials</option>
                  {accounts.data?.filter((item) => item.login_group === request.login_group).map((item) => <option key={item.credential_ref} value={item.credential_ref}>{item.label}</option>)}
                </select>
              </label>}
              {!account[request.id] && request.fields.map((field) => (
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
              {request.kind === "login" && !account[request.id] && <label>
                <input type="checkbox" checked={!!saveAccount[request.id]} onChange={(event) => setSaveAccount({ ...saveAccount, [request.id]: event.target.checked })} /> Save this account in this login group for future tests
                <span className="field-hint">Unchecked: credentials expire after 24 hours. One-time codes are never saved as reusable credentials.</span>
              </label>}
              <div className="actions">
                <Button type="submit" busy={savingId === request.id} disabled={running}>
                  {request.kind === "login_choice" ? "Select and inspect login" : request.kind === "login" ? "Sign in and continue discovery" : "Review and approve submission"}
                </Button>
              </div>
            </>
          ) : (
            <p className="field-hint">Approved. Discovery may submit this form once during testing.</p>
          )}
        </form>
      ))}
      {error ? <ErrorState error={error} /> : null}
    </div>
  );
}
