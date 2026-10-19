import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { DiscoveryInputRequest } from "../../types/api";
import { Button, ErrorState } from "../../components/ui";

function FieldControl({
  request,
  field,
  value,
  onChange,
}: {
  request: DiscoveryInputRequest;
  field: DiscoveryInputRequest["fields"][number];
  value: string;
  onChange: (next: string) => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const id = `${request.id}-${field.key}`;
  const inputType = (field.input_type || "").toLowerCase();
  if (field.options && field.options.length > 0) {
    return (
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Select</option>
        {field.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }
  const type = /password/i.test(`${field.input_type || ""} ${field.name}`)
    ? "password"
    : ["email", "number", "date", "file"].includes(inputType)
      ? inputType
      : "text";
  if (inputType === "textarea") {
    return (
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    );
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
  if (type === "password") {
    return (
      <div style={{ position: "relative" }}>
        <input
          id={id}
          type={showPassword ? "text" : "password"}
          value={value}
          autoComplete="off"
          style={{ paddingRight: "40px" }}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="icon-button"
          aria-label={showPassword ? "Hide password" : "Show password"}
          aria-pressed={showPassword}
          aria-controls={id}
          onClick={() => setShowPassword((shown) => !shown)}
          style={{
            position: "absolute",
            right: "6px",
            top: "50%",
            transform: "translateY(-50%)",
          }}
        >
          {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
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
  onContinue: (
    branches: string[],
    credentialRef?: string | null,
  ) => Promise<void>;
}) {
  const visible = requests.filter(
    (request) =>
      request.status === "pending" || request.kind === "login_choice",
  );
  const [values, setValues] = useState<Record<string, Record<string, string>>>(
    {},
  );
  const [error, setError] = useState<unknown>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [account, setAccount] = useState<Record<string, string>>({});
  const accounts = useQuery({
    queryKey: ["accounts", projectId],
    queryFn: () => api.accounts(projectId),
  });

  if (visible.length === 0) return null;

  const submit = async (request: DiscoveryInputRequest) => {
    const current = values[request.id] || {};
    const target = request.submit?.name || "this form";
    if (
      request.kind !== "login_choice" &&
      !window.confirm(
        request.kind === "login"
          ? `Sign in using ${request.login_label || "this login"} and continue discovery?`
          : `Submit ${target} on the live website? This can send the entered data to the website owner.`,
      )
    )
      return;
    setSavingId(request.id);
    setError(null);
    try {
      const response = await api.submitDiscoveryInput(
        mapId,
        request.id,
        account[request.id]
          ? []
          : request.fields
              .filter((field) => current[field.key])
              .map((field) => ({
                key: field.key,
                value: current[field.key] || "",
              })),
        {
          choice_id: choices[request.id],
          save_account: true,
          credential_ref: account[request.id] || undefined,
        },
      );
      setValues((previous) => ({ ...previous, [request.id]: {} }));
      onSubmitted();
      if (response.job_id) onResumed(response.job_id);
      else if (response.selected_branches?.length)
        await onContinue(response.selected_branches, response.credential_ref);
    } catch (caught) {
      setError(caught);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="input-requests" id="discovery-inputs">
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
            <strong>
              {request.page_title ||
                (request.kind === "login" ? "Sign in" : "Form")}
            </strong>
            {request.page_url && (
              <span className="field-hint">{request.page_url}</span>
            )}
            {request.validation_error && (
              <p className="error">{request.validation_error}</p>
            )}
          </div>
          {request.status === "pending" || request.kind === "login_choice" ? (
            <>
              {request.kind === "login_choice" && (
                <label className="field">
                  <span>
                    {request.status === "applied"
                      ? "Discover another login — existing results are kept"
                      : "Which login do you want to discover?"}
                  </span>
                  <select
                    required
                    value={choices[request.id] || ""}
                    onChange={(event) =>
                      setChoices({
                        ...choices,
                        [request.id]: event.target.value,
                      })
                    }
                  >
                    <option value="">Select a login</option>
                    {request.choices?.map((choice) => (
                      <option key={choice.id} value={choice.id}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {request.kind === "login" && (
                <label className="field">
                  <span>Login group: {request.login_label || "Sign in"}</span>
                  <select
                    value={account[request.id] || ""}
                    onChange={(event) =>
                      setAccount({
                        ...account,
                        [request.id]: event.target.value,
                      })
                    }
                  >
                    <option value="">Enter credentials</option>
                    {accounts.data
                      ?.filter(
                        (item) => item.login_group === request.login_group,
                      )
                      .map((item) => (
                        <option
                          key={item.credential_ref}
                          value={item.credential_ref}
                        >
                          {item.label}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              {!account[request.id] &&
                request.fields.map((field) => (
                  <label className="field" key={field.key}>
                    <span>
                      {field.name}
                      {field.required === false ? "" : " *"}
                    </span>
                    <FieldControl
                      request={request}
                      field={field}
                      value={values[request.id]?.[field.key] || ""}
                      onChange={(next) =>
                        setValues((current) => ({
                          ...current,
                          [request.id]: {
                            ...current[request.id],
                            [field.key]: next,
                          },
                        }))
                      }
                    />
                  </label>
                ))}
              {request.kind === "login" && !account[request.id] && (
                <p className="field-hint">
                  This test account is encrypted and stored with the project for
                  future discovery and automation. One-time codes are never
                  saved as reusable credentials.
                </p>
              )}
              <div className="actions">
                <Button
                  type="submit"
                  busy={savingId === request.id}
                  disabled={running}
                >
                  {request.kind === "login_choice"
                    ? "Select and inspect login"
                    : request.kind === "login"
                      ? "Sign in and continue discovery"
                      : "Review and approve submission"}
                </Button>
              </div>
            </>
          ) : (
            <p className="field-hint">
              Approved. Discovery may submit this form once during testing.
            </p>
          )}
        </form>
      ))}
      {error ? <ErrorState error={error} /> : null}
    </div>
  );
}
