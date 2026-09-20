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

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
} from "lucide-react";
import { api, ApiError } from "../../api/client";
import { Button, ErrorState } from "../../components/ui";
import type { ProjectAccount } from "../../types/api";

/* ── helpers ──────────────────────────────────────────────────── */

const ROLE_SUGGESTIONS = ["Admin", "Manager", "Customer", "Viewer", "Editor"];

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
  onDone: () => void;
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
  const [roleName, setRoleName] = useState(existing?.label ?? "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [isDefault, setIsDefault] = useState(
    existing?.is_default ?? isFirstAccount,
  );
  const [showSelectors, setShowSelectors] = useState(false);
  const [selectors, setSelectors] = useState({
    login_url: "",
    username_selector: "",
    password_selector: "",
    submit_selector: "",
  });

  const save = useMutation({
    mutationFn: () => {
      const base = {
        role_name: roleName.trim() || "Default",
        is_default: isDefault,
        ...(selectors.login_url ? { login_url: selectors.login_url } : {}),
        ...(selectors.username_selector ? { username_selector: selectors.username_selector } : {}),
        ...(selectors.password_selector ? { password_selector: selectors.password_selector } : {}),
        ...(selectors.submit_selector ? { submit_selector: selectors.submit_selector } : {}),
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
    onSuccess: async () => {
      await client.invalidateQueries({
        queryKey: ["accounts", projectId],
      });
      onDone();
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
      {/* Role name */}
      <label>
        Role name
        <div style={{ position: "relative" }}>
          <input
            value={roleName}
            onChange={(e) => setRoleName(e.target.value)}
            placeholder="e.g. Admin, Customer, Manager"
            required
            maxLength={60}
            autoFocus={!isEdit}
            list="role-suggestions"
          />
          <datalist id="role-suggestions">
            {ROLE_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <span className="field-hint">
          Used to label this account in discovery runs and generated tests.
        </span>
      </label>

      {/* Username */}
      <label>
        Email / Username
        <input
          type="email"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="test@example.com"
          required
          autoComplete="off"
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
      <label style={{ flexDirection: "row", alignItems: "center", gap: "10px" }}>
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
        onToggle={(e) => setShowSelectors((e.target as HTMLDetailsElement).open)}
      >
        <summary>Custom login selectors (optional)</summary>
        <div className="form-grid" style={{ marginTop: "16px" }}>
          {(
            [
              ["login_url", "Login page URL", "https://…/login"],
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
        <Button variant="secondary" type="button" onClick={onDone}>
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
}: {
  account: ProjectAccount;
  projectId: string;
  running: boolean;
  selected: boolean;
  onSelect: (ref: string) => void;
}) {
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);

  const setDefault = useMutation({
    mutationFn: () => api.setDefaultAccount(projectId, account.credential_ref),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["accounts", projectId] }),
  });

  const del = useMutation({
    mutationFn: () => api.deleteAccount(projectId, account.credential_ref),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["accounts", projectId] }),
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
          onDone={() => setEditing(false)}
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
          <div className="heading-icon" style={{ width: "32px", height: "32px" }}>
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
            className="icon-button"
            title="Delete account"
            disabled={running || del.isPending || account.is_default}
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

      {del.error && (
        <div
          style={{ marginTop: "8px" }}
          onClick={(e) => e.stopPropagation()}
        >
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
}) {
  const client = useQueryClient();
  const accounts = useQuery({
    queryKey: ["accounts", projectId],
    queryFn: () => api.accounts(projectId),
  });

  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(true);

  const list: ProjectAccount[] = accounts.data ?? [];
  const hasAccounts = list.length > 0 || savedBadge;

  // Auto-select the default account when the list loads and nothing is selected
  if (accounts.isSuccess && !selectedRef && list.length > 0) {
    const def = list.find((a) => a.is_default) ?? list[0];
    onSelectRef(def.credential_ref);
  }

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
          <p style={{ margin: "4px 0 0", fontSize: "11px", color: "var(--muted)" }}>
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
          <p className="muted" style={{ fontSize: "12px", marginBottom: "16px" }}>
            Add a test account for each role you want to discover. Select which
            account to use before starting discovery — its role will be recorded
            on the application map and generated test cases.
          </p>

          {/* Error loading accounts */}
          {accounts.error && !(accounts.error instanceof ApiError && accounts.error.status === 404) && (
            <ErrorState error={accounts.error} retry={() => accounts.refetch()} />
          )}

          {/* Account list */}
          {list.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "16px" }}>
              {list.map((account) => (
                <AccountRow
                  key={account.credential_ref}
                  account={account}
                  projectId={projectId}
                  running={running}
                  selected={selectedRef === account.credential_ref}
                  onSelect={(ref) =>
                    onSelectRef(selectedRef === ref ? null : ref)
                  }
                />
              ))}
            </div>
          )}

          {/* No accounts yet */}
          {list.length === 0 && !adding && (
            <div className="notice" style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "2px" }} />
              <div>
                <strong>No test accounts yet</strong>
                <p style={{ margin: "4px 0 0", fontSize: "12px" }}>
                  Add at least one account so the discovery crawler can log in
                  and explore authenticated pages.
                </p>
              </div>
            </div>
          )}

          {/* Add account form */}
          {adding ? (
            <div className="card" style={{ margin: "0", border: "1px solid #c5d9b5", background: "#fafdf7" }}>
              <div style={{ marginBottom: "18px" }}>
                <h3 style={{ margin: "0 0 4px" }}>Add test account</h3>
                <p className="muted" style={{ margin: 0, fontSize: "12px" }}>
                  Credentials are encrypted by the backend and never stored in
                  browser storage or sent to the AI.
                </p>
              </div>
              <AccountForm
                projectId={projectId}
                onDone={() => {
                  setAdding(false);
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
