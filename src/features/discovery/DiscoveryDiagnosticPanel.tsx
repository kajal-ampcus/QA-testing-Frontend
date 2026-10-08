/**
 * DiscoveryDiagnosticPanel
 *
 * Shown in the Discovery card when status is FAILED or PARTIAL.
 * Displays structured evidence so a developer can understand exactly
 * what went wrong without re-running discovery.
 *
 * Sections:
 *   1. Summary banner  — what happened, in plain English
 *   2. Login / auth    — was auth attempted? did it succeed? what error?
 *   3. Screenshot      — last browser screenshot (if captured)
 *   4. Console errors  — JS errors and warnings from the browser
 *   5. Network errors  — non-2xx responses (4xx/5xx) observed during crawl
 *   6. Failed actions  — navigation steps that threw exceptions
 *   7. Download report — single JSON file containing everything above
 */

import { useState } from "react";
import {
  AlertTriangle,
  ShieldOff,
  ShieldCheck,
  Terminal,
  Wifi,
  MousePointerClick,
  Image,
  Download,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import type { DiscoveryDiagnostic } from "../../types/api";
import { Button } from "../../components/ui";

/* ── helpers ──────────────────────────────────────────────────────── */

function statusColor(status: string): string {
  const code = parseInt(status, 10);
  if (isNaN(code)) return "";
  if (code >= 500) return "bad";
  if (code >= 400) return "warn";
  return "";
}

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Sub-section wrapper ──────────────────────────────────────────── */

function Section({
  icon,
  title,
  count,
  defaultOpen = false,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="diag-section">
      <button
        className="diag-section-header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="diag-section-icon">{icon}</span>
        <span className="diag-section-title">{title}</span>
        {count !== undefined && (
          <span
            className={`badge ${count > 0 ? (title.toLowerCase().includes("console") || title.toLowerCase().includes("network") || title.toLowerCase().includes("failed") ? "bad" : "warn") : "good"}`}
            style={{ marginLeft: "auto", marginRight: "8px" }}
          >
            {count}
          </span>
        )}
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && <div className="diag-section-body">{children}</div>}
    </div>
  );
}

/* ── Main component ───────────────────────────────────────────────── */

export function DiscoveryDiagnosticPanel({
  diagnostic,
  status,
  mapId,
  awaitingSelection = false,
}: {
  diagnostic: DiscoveryDiagnostic;
  status: string;
  mapId: string;
  awaitingSelection?: boolean;
}) {
  const isFailed = status === "FAILED";
  const consoleErrors = diagnostic.console_errors ?? [];
  const networkErrors = diagnostic.network_errors ?? [];
  const failedActions = diagnostic.failed_actions ?? [];
  const securityVerificationRequired =
    diagnostic.security_verification_required ?? false;

  const totalIssues =
    (securityVerificationRequired ? 1 : 0) +
    (diagnostic.login_error ? 1 : 0) +
    consoleErrors.length +
    networkErrors.length +
    failedActions.length;

  if (awaitingSelection && totalIssues === 0 && !isFailed) {
    return <div className="notice" role="status"><strong>Selected pages discovered successfully</strong>
      <p>Choose another path or generate tests for a completed path above. Unexplored paths are saved for later.</p>
    </div>;
  }

  return (
    <div className="diag-panel">
      {/* ── 1. Summary banner ───────────────────────────────────── */}
      <div className={`diag-banner ${isFailed ? "diag-banner--fail" : "diag-banner--partial"}`}>
        <div className="diag-banner-icon">
          <AlertTriangle size={20} />
        </div>
        <div className="diag-banner-body">
          <strong>
            {securityVerificationRequired
              ? "Discovery paused - security verification required"
              : isFailed
              ? "Discovery failed — application was not mapped"
              : "Discovery completed with issues — map may be incomplete"}
          </strong>
          {diagnostic.termination_detail && (
            <p>{diagnostic.termination_detail}</p>
          )}
          <p className="diag-banner-hint">
            {securityVerificationRequired ? (
              <>The target blocked the discovery browser before application content loaded. Configure test access as described below, then continue discovery.</>
            ) : (
              <>
            Review each section below, fix the issues, update credentials if
            needed, and retry discovery. Share the diagnostic report with your
            developer if the issue is in the application itself.
              </>
            )}
          </p>
        </div>
        <div className="diag-banner-stats">
          <span>{totalIssues}</span>
          <small>issue{totalIssues !== 1 ? "s" : ""} found</small>
        </div>
      </div>

      {/* ── 2. Authentication ────────────────────────────────────── */}
      {securityVerificationRequired && (
        <Section
          icon={<ShieldOff size={15} />}
          title="Security verification"
          defaultOpen
        >
          <p className="diag-fix-hint">
            The page shown is an anti-bot verification interstitial and is not
            part of the application map. Discovery deliberately did not click
            or bypass it.
          </p>
          <div className="diag-fix-hint" style={{ marginTop: "12px" }}>
            <strong>How to continue:</strong> create a Cloudflare skip rule or
            allowlist for the discovery worker on the test/staging hostname.
            Once the application opens without the verification page, choose
            <strong> Continue Discovery</strong>. The blocked page remains in
            the checkpoint and will be retried.
          </div>
        </Section>
      )}

      <Section
        icon={
          diagnostic.auth_succeeded ? (
            <ShieldCheck size={15} />
          ) : (
            <ShieldOff size={15} />
          )
        }
        title="Authentication"
        defaultOpen={!!diagnostic.login_error || !diagnostic.auth_succeeded}
      >
        <div className="diag-auth-row">
          <span className="diag-auth-label">Auth attempted</span>
          <span className={`badge ${diagnostic.auth_attempted ? "" : "warn"}`}>
            {securityVerificationRequired ? (
              <><XCircle size={10} /> Not reached - verification blocked access</>
            ) : diagnostic.auth_attempted ? (
              <><CheckCircle2 size={10} /> Yes</>
            ) : (
              <>Not attempted in this discovery step</>
            )}
          </span>
        </div>
        <div className="diag-auth-row">
          <span className="diag-auth-label">Auth succeeded</span>
          <span className={`badge ${diagnostic.auth_succeeded ? "good" : diagnostic.auth_attempted ? "bad" : ""}`}>
            {securityVerificationRequired ? (
              <><XCircle size={10} /> Not reached</>
            ) : diagnostic.auth_succeeded ? (
              <><CheckCircle2 size={10} /> Yes — logged in successfully</>
            ) : !diagnostic.auth_attempted ? (
              <>Not evaluated</>
            ) : (
              <><XCircle size={10} /> No — login failed</>
            )}
          </span>
        </div>

        {diagnostic.login_error && (
          <div className="diag-error-block">
            <div className="diag-error-label">Login error</div>
            <pre className="diag-pre">{diagnostic.login_error}</pre>
            <div className="diag-fix-hint">
              <strong>How to fix:</strong> Check that your stored credential has
              the correct username, password, and login URL. If the form fields
              have unusual names, add custom selectors (username_selector,
              password_selector, submit_selector) when saving the credential.
            </div>
          </div>
        )}

        {diagnostic.auth_attempted && !diagnostic.auth_succeeded && !diagnostic.login_error && (
          <div className="diag-fix-hint" style={{ marginTop: "12px" }}>
            Authentication was attempted but no specific error was captured.
            The crawler may have timed out waiting for the page to stabilise
            after submission. Check your application's login response time.
          </div>
        )}
      </Section>

      {/* ── 3. Screenshot ────────────────────────────────────────── */}
      {diagnostic.screenshot_ref && (
        <Section
          icon={<Image size={15} />}
          title="Last captured screenshot"
          defaultOpen={isFailed}
        >
          <p className="diag-fix-hint">
            Screenshot taken at the moment discovery ended.
            Artifact reference:{" "}
            <code className="diag-code">{diagnostic.screenshot_ref}</code>
          </p>
          <p className="diag-fix-hint">Open the screenshot gallery to view this capture.</p>
        </Section>
      )}

      {/* ── 4. Console errors ────────────────────────────────────── */}
      <Section
        icon={<Terminal size={15} />}
        title="Browser console"
        count={consoleErrors.length}
        defaultOpen={consoleErrors.length > 0}
      >
        {consoleErrors.length === 0 ? (
          <p className="diag-empty">No console errors or warnings captured.</p>
        ) : (
          <div className="diag-list">
            {consoleErrors.map((msg, i) => (
              <div key={i} className={`diag-list-row ${msg.level === "error" ? "diag-list-row--error" : "diag-list-row--warn"}`}>
                <span className={`badge ${msg.level === "error" ? "bad" : "warn"}`} style={{ flexShrink: 0 }}>
                  {msg.level}
                </span>
                <code className="diag-code diag-code--wrap">{msg.text}</code>
              </div>
            ))}
          </div>
        )}
        {consoleErrors.length > 0 && (
          <div className="diag-fix-hint" style={{ marginTop: "12px" }}>
            <strong>Action:</strong> Share these errors with your developer.
            JavaScript errors often indicate broken API calls, missing
            resources, or unhandled exceptions that may prevent pages from
            loading correctly.
          </div>
        )}
      </Section>

      {/* ── 5. Network errors ────────────────────────────────────── */}
      <Section
        icon={<Wifi size={15} />}
        title="Network — failed requests"
        count={networkErrors.length}
        defaultOpen={networkErrors.length > 0}
      >
        {networkErrors.length === 0 ? (
          <p className="diag-empty">No failed network requests captured.</p>
        ) : (
          <div className="diag-table-wrap">
            <table className="diag-table">
              <thead>
                <tr>
                  <th>Method</th>
                  <th>Status</th>
                  <th>URL</th>
                </tr>
              </thead>
              <tbody>
                {networkErrors.map((req, i) => (
                  <tr key={i}>
                    <td>
                      <span className="badge">{req.method}</span>
                    </td>
                    <td>
                      <span className={`badge ${statusColor(req.status)}`}>
                        {req.status}
                      </span>
                    </td>
                    <td>
                      <code className="diag-code diag-code--wrap">{req.url}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {networkErrors.length > 0 && (
          <div className="diag-fix-hint" style={{ marginTop: "12px" }}>
            <strong>Action:</strong> 401/403 responses usually mean the login
            session was not established. 404 responses may indicate broken
            API endpoints. 5xx responses indicate server errors in the
            application under test.
          </div>
        )}
      </Section>

      {/* ── 6. Failed actions ────────────────────────────────────── */}
      <Section
        icon={<MousePointerClick size={15} />}
        title="Failed navigation actions"
        count={failedActions.length}
        defaultOpen={failedActions.length > 0}
      >
        {failedActions.length === 0 ? (
          <p className="diag-empty">No navigation actions failed.</p>
        ) : (
          <div className="diag-list">
            {failedActions.map((fa, i) => (
              <div key={i} className="diag-list-row diag-list-row--error">
                <div style={{ flex: 1, minWidth: 0 }}>
                  {fa.action && (
                    <code className="diag-code">{fa.action}</code>
                  )}
                  {fa.phase && (
                    <span className="badge" style={{ marginLeft: "8px" }}>
                      {fa.phase} phase
                    </span>
                  )}
                  <p style={{ margin: "6px 0 0", fontSize: "11px", color: "var(--danger)" }}>
                    {fa.error}{fa.detail ? `: ${fa.detail}` : ""}
                  </p>
                  {fa.screenshot_ref && (
                    <p className="diag-fix-hint">Screenshot available in the gallery.</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {failedActions.length > 0 && (
          <div className="diag-fix-hint" style={{ marginTop: "12px" }}>
            <strong>Action:</strong> These elements existed in the DOM but
            caused errors when the crawler tried to interact with them.
            This often means the element moved or disappeared between
            snapshot and click (flaky UI), or requires authentication that
            was not established.
          </div>
        )}
      </Section>

      {/* ── 7. Download report ───────────────────────────────────── */}
      <div className="diag-footer">
        <p className="diag-fix-hint" style={{ margin: 0 }}>
          Download this report and share it with your developer to get these
          issues fixed before retrying discovery.
        </p>
        <Button
          variant="secondary"
          onClick={() =>
            downloadJson(
              {
                map_id: mapId,
                status,
                generated_at: new Date().toISOString(),
                diagnostic,
              },
              `discovery-diagnostic-${mapId.slice(0, 8)}.json`,
            )
          }
        >
          <Download size={14} />
          Download diagnostic report
        </Button>
      </div>
    </div>
  );
}
