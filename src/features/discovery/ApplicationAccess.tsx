/**
 * ApplicationAccess — multi-role test account manager.
 *
 * Shows all named accounts (Admin, Customer, Manager, …) in a list.
 * Lets the user:
 *   - Add a new named account (with optional custom login selectors)
 *   - Set any account as the default for discovery
 *   - Edit / replace credentials for an existing account
 *   - Delete an account
 *   - Select which account to use for the current discovery run
 *
 * Credentials flow:
 *   - Saved to backend encrypted storage
 *   - Only username + role_name surface in the UI — password never echoed
 *   - credential_ref (opaque key) is what the discovery payload carries
 */

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  KeyRound,
  Plus,
  Check,
  Star,
  Trash2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  ShieldCheck,
  UserCircle,
  AlertCircle,
  Pencil,
  Upload,
  Download,
  X,
} from "lucide-react";
import { api, ApiError } from "../../api/client";
import { Button, ErrorState } from "../../components/ui";
import type { FormTestFixture, ImportSummary, ProjectAccount } from "../../types/api";

/* ── helpers ──────────────────────────────────────────────────── */

const ROLE_SUGGESTIONS = ["Employee", "Admin", "Kitchen", "Manager", "Customer", "Viewer", "Editor"];

function roleColor(role: string): string {
  const map: Record<string, string> = {
    admin: "bad",
    manager: "warn",
    customer: "good",
    viewer: "",
    editor: "",
  };
  return map[role.toLowerCase()] ?? "";
}

/* ── Account form ─────────────────────────────────────────────── */

interface AccountFormProps {
  projectId: string;
  existing?: ProjectAccount;
  onDone: (saved?: ProjectAccount) => void;
  running: boolean;
  isFirstAccount: boolean;
}

function AccountForm({
  projectId,
  existing,
  onDone,
  running,
  isFirstAccount,
}: AccountFormProps) {
  const client = useQueryClient();
  const [labelName, setLabelName] = useState(existing?.label ?? "");
  const [roleName, setRoleName] = useState(existing?.role ?? "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginUrl, setLoginUrl] = useState(existing?.login_route ?? "");
  const [testType, setTestType] = useState<"positive" | "negative" | "edge">(existing?.test_type ?? "positive");
  const [tags, setTags] = useState((existing?.tags ?? []).join(", "));
  const [showPw, setShowPw] = useState(false);
  const [isDefault, setIsDefault] = useState(
    existing?.is_default ?? isFirstAccount,
  );
  const [showSelectors, setShowSelectors] = useState(false);
  const [selectors, setSelectors] = useState({
    username_selector: "",
    password_selector: "",
    submit_selector: "",
  });

  const save = useMutation({
    mutationFn: () => {
      const base = {
        label: labelName.trim(),
        role_name: roleName.trim(),
        is_default: isDefault,
        login_url: loginUrl.trim(),
        test_type: testType,
        tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        ...(selectors.username_selector
          ? { username_selector: selectors.username_selector }
          : {}),
        ...(selectors.password_selector
          ? { password_selector: selectors.password_selector }
          : {}),
        ...(selectors.submit_selector
          ? { submit_selector: selectors.submit_selector }
          : {}),
      };
      if (existing) {
        return api.updateAccount(projectId, existing.credential_ref, {
          ...base,
          ...(username.trim() ? { username: username.trim() } : {}),
          ...(password ? { password } : {}),
        });
      }
      return api.saveAccount(projectId, {
        ...base,
        username: username.trim(),
        password,
      });
    },
    onSuccess: async (saved) => {
      await client.invalidateQueries({
        queryKey: ["accounts", projectId],
      });
      onDone(saved);
    },
  });

  const isEdit = !!existing;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <label>
        Credential label
        <input
          required
          value={labelName}
          onChange={(e) => setLabelName(e.target.value)}
          placeholder="e.g. Admin valid account"
          maxLength={120}
          autoFocus={!isEdit}
        />
        <span className="field-hint">A name to recognize this saved login.</span>
      </label>

      {/* Application role */}
      <label>
        Application role
        <div style={{ position: "relative" }}>
          <input
            required
            value={roleName}
            onChange={(e) => setRoleName(e.target.value)}
            placeholder="e.g. Admin, Customer, Manager"
            maxLength={120}
            list="role-suggestions"
          />
          <datalist id="role-suggestions">
            {ROLE_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <span className="field-hint">
          The role this account represents during discovery.
        </span>
      </label>

      <label>
        Login page URL
        <input
          type="url"
          value={loginUrl}
          onChange={(e) => setLoginUrl(e.target.value)}
          placeholder="https://example.com/login"
        />
      </label>

      {/* Username */}
      <label>
        Email / Username
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="test@example.com"
          required={!isEdit}
          autoComplete="off"
        />
      </label>

      <label>
        Scenario type
        <select value={testType} onChange={(e) => setTestType(e.target.value as typeof testType)}>
          <option value="positive">Positive — valid login</option>
          <option value="negative">Negative — invalid login</option>
          <option value="edge">Edge case</option>
        </select>
      </label>

      <label>
        Tags
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="admin, smoke (comma separated)"
        />
      </label>

      {/* Password */}
      <label>
        Password
        <div style={{ position: "relative" }}>
          <input
            type={showPw ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isEdit ? "Leave blank to keep existing" : "••••••••"}
            required={!isEdit}
            autoComplete="new-password"
            style={{ paddingRight: "40px" }}
          />
          <button
            type="button"
            className="icon-button"
            aria-label={showPw ? "Hide password" : "Show password"}
            onClick={() => setShowPw((v) => !v)}
            style={{
              position: "absolute",
              right: "6px",
              top: "50%",
              transform: "translateY(-50%)",
            }}
          >
            {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      </label>

      {/* Default toggle */}
      <label
        style={{ flexDirection: "row", alignItems: "center", gap: "10px" }}
      >
        <input
          type="checkbox"
          style={{ width: "auto" }}
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
        />
        Use as default account for new discovery runs
      </label>

      {/* Custom login selectors */}
      <details
        open={showSelectors}
        onToggle={(e) =>
          setShowSelectors((e.target as HTMLDetailsElement).open)
        }
      >
        <summary>Custom login selectors (optional)</summary>
        <div className="form-grid" style={{ marginTop: "16px" }}>
          {(
            [
              ["username_selector", "Username field label", "email"],
              ["password_selector", "Password field label", "password"],
              ["submit_selector", "Submit button label", "log in"],
            ] as const
          ).map(([key, label, placeholder]) => (
            <label key={key}>
              {label}
              <input
                value={selectors[key]}
                onChange={(e) =>
                  setSelectors((prev) => ({ ...prev, [key]: e.target.value }))
                }
                placeholder={placeholder}
              />
            </label>
          ))}
        </div>
      </details>

      {save.error && <ErrorState error={save.error} />}

      <div className="actions">
        <Button variant="secondary" type="button" onClick={() => onDone()}>
          Cancel
        </Button>
        <Button type="submit" busy={save.isPending} disabled={running}>
          <ShieldCheck size={15} />
          {isEdit ? "Update account" : "Save account"}
        </Button>
      </div>
    </form>
  );
}

/* ── Account row ──────────────────────────────────────────────── */

function AccountRow({
  account,
  projectId,
  running,
  selected,
  onSelect,
  promptUpdate = false,
}: {
  account: ProjectAccount;
  projectId: string;
  running: boolean;
  selected: boolean;
  onSelect: (ref: string) => void;
  promptUpdate?: boolean;
}) {
  const client = useQueryClient();
  const [editing, setEditing] = useState(promptUpdate);
  const [detailsOpen, setDetailsOpen] = useState(false);
  useEffect(() => {
    if (promptUpdate) setEditing(true);
  }, [promptUpdate]);

  const setDefault = useMutation({
    mutationFn: () => api.setDefaultAccount(projectId, account.credential_ref),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["accounts", projectId] }),
  });

  const del = useMutation({
    mutationFn: () => api.deleteAccount(projectId, account.credential_ref),
    onSuccess: async () => {
      client.setQueryData<ProjectAccount[]>(["accounts", projectId], (current) =>
        current?.filter((item) => item.credential_ref !== account.credential_ref),
      );
      await Promise.all([
        client.invalidateQueries({ queryKey: ["accounts", projectId] }),
        client.invalidateQueries({ queryKey: ["workspace", projectId] }),
        client.invalidateQueries({ queryKey: ["projects"] }),
      ]);
    },
  });

  if (editing) {
    return (
      <div
        className="card"
        style={{ margin: "0", borderColor: "#b0c9a0", background: "#fafdf7" }}
      >
        <AccountForm
          projectId={projectId}
          existing={account}
          onDone={(saved) => {
            setEditing(false);
            if (saved?.credential_ref) onSelect(saved.credential_ref);
          }}
          running={running}
          isFirstAccount={false}
        />
      </div>
    );
  }

  return (
    <div
      className={`card ${selected ? "highlighted" : ""}`}
      style={{
        margin: "0",
        padding: "16px 20px",
        cursor: "pointer",
        border: selected ? "1.5px solid #7aad63" : undefined,
        background: selected ? "#f6fbf2" : undefined,
        transition: "border-color 0.15s, background 0.15s",
      }}
      onClick={() => onSelect(account.credential_ref)}
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onSelect(account.credential_ref)}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        {/* Role icon + name */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flex: 1,
            minWidth: 0,
          }}
        >
          <div
            className="heading-icon"
            style={{ width: "32px", height: "32px" }}
          >
            <UserCircle size={17} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "7px",
                flexWrap: "wrap",
              }}
            >
              <strong style={{ fontSize: "13px" }}>{account.label}</strong>
              <span className={`badge ${roleColor(account.label)}`}>
                <i />
                {account.label.toLowerCase()}
              </span>
              {account.is_default && (
                <span className="badge good">
                  <Star size={9} />
                  Default
                </span>
              )}
              {selected && (
                <span className="badge good">
                  <Check size={9} />
                  Selected for this run
                </span>
              )}
            </div>
            <p
              className="muted"
              style={{ margin: "3px 0 0", fontSize: "11px" }}
            >
              {account.role}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div
          style={{ display: "flex", gap: "6px", alignItems: "center" }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="icon-button"
            title={detailsOpen ? "Hide account details" : "View account details"}
            aria-expanded={detailsOpen}
            onClick={() => setDetailsOpen((value) => !value)}
          >
            <Eye size={15} />
          </button>
          {!account.is_default && (
            <button
              className="icon-button"
              title="Set as default"
              disabled={running || setDefault.isPending}
              onClick={() => setDefault.mutate()}
            >
              <Star size={15} />
            </button>
          )}
          <button
            className="icon-button"
            title="Edit account"
            disabled={running}
            onClick={() => setEditing(true)}
          >
            <Pencil size={15} />
          </button>
          <button
            type="button"
            className="icon-button"
            title="Delete account"
            aria-label={`Delete ${account.label} account`}
            disabled={running || del.isPending}
            onClick={() => {
              if (
                confirm(
                  `Delete the "${account.label}" account? This cannot be undone.`,
                )
              )
                del.mutate();
            }}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {detailsOpen && (
        <div className="account-detail-panel" onClick={(event) => event.stopPropagation()}>
          <span><strong>Role:</strong> {account.role}</span>
          <span><strong>Scenario:</strong> {account.test_type || "positive"}</span>
          {account.login_route && <span><strong>Login page:</strong> {account.login_route}</span>}
          {!!account.tags?.length && <span><strong>Tags:</strong> {account.tags.join(", ")}</span>}
          <small>Username and password are encrypted and never shown here.</small>
        </div>
      )}

      {del.error && (
        <div style={{ marginTop: "8px" }} onClick={(e) => e.stopPropagation()}>
          <ErrorState error={del.error} />
        </div>
      )}
    </div>
  );
}

/* ── Main component ───────────────────────────────────────────── */

export function ApplicationAccess({
  projectId,
  running,
  savedBadge,
  selectedRef,
  onSelectRef,
  promptUpdate = false,
}: {
  projectId: string;
  /** Discovery is currently running — disable destructive actions */
  running: boolean;
  /** Show a "Credentials configured" badge even before accounts reload */
  savedBadge: boolean;
  /** credential_ref chosen for the upcoming discovery run */
  selectedRef: string | null;
  /** Callback when user picks an account for the run */
  onSelectRef: (ref: string | null) => void;
  /** Saved credentials were rejected. Ask for an update instead of retrying. */
  promptUpdate?: boolean;
}) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const accounts = useQuery({
    queryKey: ["accounts", projectId],
    queryFn: () => api.accounts(projectId),
  });

  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(true);
  const [importResult, setImportResult] = useState<ImportSummary | null>(null);
  const [importError, setImportError] = useState("");
  const [templateBusy, setTemplateBusy] = useState(false);
  const [showFormData, setShowFormData] = useState(false);
  const formData = useQuery({
    queryKey: ["project-data", projectId, "fixtures"],
    queryFn: () => api.formTestData(projectId),
    enabled: showFormData,
  });
  const importAccounts = useMutation({
    mutationFn: (file: File) => api.importAccounts(projectId, file),
    onSuccess: async (result) => {
      setImportError("");
      setImportResult(result);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["accounts", projectId] }),
        client.invalidateQueries({ queryKey: ["projects"] }),
        client.invalidateQueries({ queryKey: ["workspace", projectId] }),
      ]);
    },
    onError: (error) => setImportError(error instanceof Error ? error.message : "Could not import credentials."),
  });

  const list: ProjectAccount[] = accounts.data ?? [];
  const hasAccounts = accounts.isSuccess ? list.length > 0 : savedBadge;

  // Saved checkpoints can refer to session accounts or retired credentials.
  // Never silently replace their role with the default account. Saving an
  // edited account explicitly selects the replacement through onDone above.

  return (
    <div className="card">
      {/* Header */}
      <div
        className="card-heading"
        style={{ cursor: "pointer", marginBottom: open ? "20px" : "0" }}
        onClick={() => setOpen((v) => !v)}
      >
        <div className="heading-icon">
          <KeyRound size={18} />
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0 }}>Application access</h3>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: "11px",
              color: "var(--muted)",
            }}
          >
            {list.length > 0
              ? `${list.length} test account${list.length > 1 ? "s" : ""} configured`
              : "No test accounts yet"}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {hasAccounts && (
            <span className="badge good">
              <ShieldCheck size={10} />
              Configured
            </span>
          )}
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {open && (
        <>
          {promptUpdate && (
            <div className="notice" role="alert">
              <strong>Saved credentials were rejected</strong>
              <p>Update the selected account. Discovery will not keep retrying these credentials.</p>
            </div>
          )}
          <p
            className="muted"
            style={{ fontSize: "12px", marginBottom: "16px" }}
          >
            Add accounts here or import them from Excel. If this application
            requires login, choose a saved account for discovery; public sites
            can be explored without credentials.
          </p>

          {/* Error loading accounts */}
          {accounts.error &&
            !(
              accounts.error instanceof ApiError &&
              accounts.error.status === 404
            ) && (
              <ErrorState
                error={accounts.error}
                retry={() => accounts.refetch()}
              />
            )}

          <div className="credential-import-actions">
            <label className="button secondary upload-button">
              <Upload size={15} /> Import Excel
              <input
                type="file"
                accept=".xlsx"
                disabled={running || importAccounts.isPending}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) importAccounts.mutate(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <Button
              variant="secondary"
              disabled={running || templateBusy}
              onClick={async () => {
                setTemplateBusy(true);
                try {
                  const blob = await api.downloadCredentialTemplate(projectId);
                  const href = URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.href = href;
                  link.download = "login-credentials-template.xlsx";
                  link.click();
                  URL.revokeObjectURL(href);
                } catch (error) {
                  setImportError(error instanceof Error ? error.message : "Could not download the template.");
                } finally {
                  setTemplateBusy(false);
                }
              }}
            >
              <Download size={15} /> Sample template
            </Button>
          </div>
          {importAccounts.isPending && <p className="field-hint" role="status">Importing login credentials…</p>}
          {importError && <p className="data-error" role="alert">{importError}</p>}
          {importResult && (
            <div className="import-summary" role="status">
              <button className="icon-button" aria-label="Dismiss import summary" onClick={() => setImportResult(null)}><X size={14} /></button>
              <strong>Imported {importResult.imported_count} account{importResult.imported_count === 1 ? "" : "s"}</strong>
              <span>{importResult.error_count} row errors</span>
              {!!importResult.errors.length && <ul>{importResult.errors.map((item) => <li key={`${item.row}-${item.error}`}>Row {item.row}: {item.error}</li>)}</ul>}
            </div>
          )}

          <section className="saved-form-data">
            <button
              type="button"
              className="saved-form-data-toggle"
              aria-expanded={showFormData}
              onClick={() => setShowFormData((value) => !value)}
            >
              <span>Saved form test data</span>
              <span className="badge">{formData.data?.length ?? "View"}</span>
              {showFormData ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
            {showFormData && (
              <div className="saved-form-data-content">
                {formData.isPending && <p className="field-hint">Loading saved form data…</p>}
                {formData.error && <ErrorState error={formData.error} retry={() => void formData.refetch()} />}
                {formData.isSuccess && formData.data.length === 0 && <p className="field-hint">No form test data has been added for this project yet.</p>}
                {formData.data?.map((fixture: FormTestFixture) => (
                  <details className="saved-form-fixture" key={fixture.id}>
                    <summary>
                      <strong>{fixture.label}</strong>
                      <span>{fixture.form_group} · {fixture.test_type}</span>
                    </summary>
                    <dl>
                      <dt>Field values</dt>
                      <dd><pre>{JSON.stringify(fixture.test_data, null, 2)}</pre></dd>
                      {fixture.expected_result && <><dt>Expected result</dt><dd>{fixture.expected_result}</dd></>}
                      {fixture.test_case_id && <><dt>Assigned test case</dt><dd>{fixture.test_case_id}</dd></>}
                      {!!fixture.tags.length && <><dt>Tags</dt><dd>{fixture.tags.join(", ")}</dd></>}
                    </dl>
                  </details>
                ))}
                <Button variant="secondary" onClick={() => navigate(`/projects/${projectId}/data`)}>
                  View or manage form test data
                </Button>
              </div>
            )}
          </section>

          {/* Account list */}
          {list.length > 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                marginBottom: "16px",
              }}
            >
              {list.map((account) => (
                <div key={account.credential_ref}>
                {account.login_group && <p className="field-hint">Login group: {account.role} · {account.login_route}</p>}
                <AccountRow
                  key={account.credential_ref}
                  account={account}
                  projectId={projectId}
                  running={running}
                  selected={selectedRef === account.credential_ref}
                  promptUpdate={promptUpdate && selectedRef === account.credential_ref}
                  onSelect={(ref) =>
                    onSelectRef(selectedRef === ref ? null : ref)
                  }
                />
                </div>
              ))}
            </div>
          )}

          {/* No accounts yet */}
          {list.length === 0 && !adding && (
            <div
              className="notice"
              style={{ display: "flex", gap: "10px", marginBottom: "16px" }}
            >
              <AlertCircle
                size={16}
                style={{ flexShrink: 0, marginTop: "2px" }}
              />
              <div>
                <strong>No saved login account</strong>
                <p style={{ margin: "4px 0 0", fontSize: "12px" }}>
                  You can add one now, or continue without credentials for a
                  public application. Login details can also be requested during discovery.
                </p>
              </div>
            </div>
          )}

          {/* Add account form */}
          {adding ? (
            <div
              className="card"
              style={{
                margin: "0",
                border: "1px solid #c5d9b5",
                background: "#fafdf7",
              }}
            >
              <div style={{ marginBottom: "18px" }}>
                <h3 style={{ margin: "0 0 4px" }}>Add test account</h3>
                <p className="muted" style={{ margin: 0, fontSize: "12px" }}>
                  Credentials are encrypted by the backend and never stored in
                  browser storage or sent to the AI.
                </p>
              </div>
              <AccountForm
                projectId={projectId}
                onDone={(saved) => {
                  setAdding(false);
                  if (saved?.credential_ref) onSelectRef(saved.credential_ref);
                  void accounts.refetch();
                }}
                running={running}
                isFirstAccount={list.length === 0}
              />
            </div>
          ) : (
            <Button
              variant="secondary"
              disabled={running}
              onClick={() => {
                setAdding(true);
              }}
            >
              <Plus size={15} />
              {list.length === 0 ? "Add test account" : "Add another account"}
            </Button>
          )}

          {list.length > 0 && selectedRef && (
            <p className="field-hint" style={{ marginTop: "12px" }}>
              <strong>
                {list.find((a) => a.credential_ref === selectedRef)?.label ??
                  "Selected account"}
              </strong>{" "}
              will be used for the next discovery run. Tap a different account
              to switch.
            </p>
          )}
        </>
      )}
    </div>
  );
}
