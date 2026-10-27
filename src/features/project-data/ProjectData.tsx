import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, KeyRound, Pencil, Plus, Search, Shield, Trash2, Upload, X } from "lucide-react";
import { api, ApiError } from "../../api/client";
import { Button, Card, DetailDrawer, ErrorState, LoadingState, PageHeader } from "../../components/ui";
import { Shell } from "../projects/Projects";
import type { FormTestFixture, ImportSummary, Project, ProjectAccount, ScenarioType, TestCase } from "../../types/api";

type Section = "credentials" | "forms";
const scenarioOptions: ScenarioType[] = ["positive", "negative", "validation", "edge"];
const credentialScenarios = scenarioOptions.filter((item) => item !== "validation") as Array<"positive" | "negative" | "edge">;
const tagsOf = (value: string) => value.split(",").map((tag) => tag.trim()).filter(Boolean);

export default function ProjectData({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [section, setSection] = useState<Section>("forms");
  const [search, setSearch] = useState("");
  const [scenario, setScenario] = useState("all");
  const [editingAccount, setEditingAccount] = useState<ProjectAccount | null | false>(false);
  const [editingFixture, setEditingFixture] = useState<FormTestFixture | null | false>(false);
  const [notice, setNotice] = useState("");
  const [importResult, setImportResult] = useState<ImportSummary | null>(null);

  const project = useQuery({ queryKey: ["project-data", projectId, "project"], queryFn: ({ signal }) => api.project(projectId, signal) });
  const accounts = useQuery({ queryKey: ["accounts", projectId], queryFn: ({ signal }) => api.accounts(projectId, signal) });
  const fixtures = useQuery({ queryKey: ["project-data", projectId, "fixtures"], queryFn: ({ signal }) => api.formTestData(projectId, signal) });
  const tests = useQuery({ queryKey: ["workspace", projectId, "tests"], queryFn: ({ signal }) => api.tests(projectId, signal) });
  const refresh = () => Promise.all([
    client.invalidateQueries({ queryKey: ["accounts", projectId] }),
    client.invalidateQueries({ queryKey: ["project-data", projectId, "fixtures"] }),
    client.invalidateQueries({ queryKey: ["workspace", projectId, "tests"] }),
    client.invalidateQueries({ queryKey: ["workspace", projectId, "project"] }),
  ]);

  const deactivateAccount = useMutation({ mutationFn: (ref: string) => api.deleteAccount(projectId, ref), onSuccess: refresh });
  const setDefault = useMutation({ mutationFn: (ref: string) => api.setDefaultAccount(projectId, ref), onSuccess: refresh });
  const deactivateFixture = useMutation({ mutationFn: (id: string) => api.deactivateFormTestData(projectId, id), onSuccess: refresh });
  const importAccounts = useMutation({ mutationFn: (file: File) => api.importAccounts(projectId, file), onSuccess: (result) => { setImportResult(result); void refresh(); } });
  const importFixtures = useMutation({ mutationFn: (file: File) => api.importFormTestData(projectId, file), onSuccess: (result) => { setImportResult(result); void refresh(); } });
  const accountRows = useMemo(() => (accounts.data || []).filter((item) => {
    const q = search.toLowerCase();
    return (!q || `${item.label} ${item.role} ${(item.tags || []).join(" ")}`.toLowerCase().includes(q)) && (scenario === "all" || (item.test_type || "positive") === scenario);
  }), [accounts.data, search, scenario]);
  const fixtureRows = useMemo(() => (fixtures.data || []).filter((item) => {
    const q = search.toLowerCase();
    return (!q || `${item.label} ${item.form_group} ${item.tags.join(" ")} ${item.expected_result || ""}`.toLowerCase().includes(q)) && (scenario === "all" || item.test_type === scenario);
  }), [fixtures.data, search, scenario]);
  const loading = project.isPending || accounts.isPending || fixtures.isPending || tests.isPending;
  const error = project.error || accounts.error || fixtures.error || tests.error;

  async function saveAccount(values: {
    role_name: string; username: string; password: string; is_default: boolean;
    login_url: string; test_type: "positive" | "negative" | "edge"; tags: string[];
  }) {
    if (editingAccount) {
      await api.updateAccount(projectId, editingAccount.credential_ref, {
        role_name: values.role_name,
        is_default: values.is_default,
        ...(values.login_url ? { login_url: values.login_url } : {}),
        test_type: values.test_type,
        tags: values.tags,
        ...(values.username && values.password ? { username: values.username, password: values.password } : {}),
      });
    } else {
      await api.saveAccount(projectId, values);
    }
    setEditingAccount(false);
    setNotice("Login credential saved. Secret values remain encrypted on the backend.");
    await refresh();
  }

  async function saveFixture(values: Omit<FormTestFixture, "id" | "project_id" | "active" | "created_at">) {
    if (editingFixture) await api.updateFormTestData(projectId, editingFixture.id, values);
    else await api.createFormTestData(projectId, values);
    setEditingFixture(false);
    setNotice("Form test data saved.");
    await refresh();
  }

  return (
    <Shell project={project.data?.name || "Project"} action={<button className="icon-button" onClick={() => navigate(`/projects/${projectId}?stage=2`)} title="Back to project" aria-label="Back to project"><ArrowLeft size={16} /></button>}>
      <PageHeader eyebrow="PROJECT DATA" title="Login & Form Test Data" description="View and manage this project’s login accounts and form fixtures." action={<Button variant="secondary" onClick={() => navigate(`/projects/${projectId}?stage=2`)}><ArrowLeft size={15} /> Project workspace</Button>} />
      {loading ? <LoadingState label="Loading project data…" /> : error ? <ErrorState error={error} retry={() => { void project.refetch(); void accounts.refetch(); void fixtures.refetch(); void tests.refetch(); }} /> : <>
        <div className="data-tabs" role="tablist" aria-label="Project data sections">
          <button role="tab" aria-selected={section === "credentials"} className={section === "credentials" ? "active" : ""} onClick={() => { setSection("credentials"); setSearch(""); setScenario("all"); }}><KeyRound size={16} /> Login Credentials <span>{accounts.data?.length || 0}</span></button>
          <button role="tab" aria-selected={section === "forms"} className={section === "forms" ? "active" : ""} onClick={() => { setSection("forms"); setSearch(""); setScenario("all"); }}><Shield size={16} /> Form Test Data <span>{fixtures.data?.length || 0}</span></button>
        </div>
        <Card className="project-data-card">
          <div className="data-toolbar">
            <label className="data-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={section === "credentials" ? "Search label, role or tag" : "Search fixture, form or tag"} /></label>
            <select aria-label="Filter by scenario" value={scenario} onChange={(event) => setScenario(event.target.value)}><option value="all">All scenarios</option>{scenarioOptions.map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select>
            <label className="button secondary upload-button"><Upload size={15} /> Import Excel<input type="file" accept=".xlsx" onChange={(event) => { const file = event.target.files?.[0]; if (file) (section === "credentials" ? importAccounts : importFixtures).mutate(file); event.currentTarget.value = ""; }} /></label>
            <Button onClick={() => { setNotice(""); section === "credentials" ? setEditingAccount(null) : setEditingFixture(null); }}><Plus size={15} /> Add {section === "credentials" ? "credential" : "test data"}</Button>
          </div>
          <p className="data-import-hint">Excel columns: {section === "credentials" ? "label, role, username, password; optional login_url, test_type, tags." : "label, form_group, test_type, test_data (JSON object); optional expected_result, tags, test_case_id."}</p>
          {(importAccounts.isPending || importFixtures.isPending) && <p className="data-notice">Importing rows…</p>}
          {(importAccounts.error || importFixtures.error) && <p className="data-error" role="alert">{(importAccounts.error || importFixtures.error) instanceof ApiError ? (importAccounts.error || importFixtures.error)?.message : "Import failed. Check the workbook and try again."}</p>}
          {(deactivateAccount.error || deactivateFixture.error || setDefault.error) && <p className="data-error" role="alert">{(deactivateAccount.error || deactivateFixture.error || setDefault.error)?.message || "The change could not be saved."}</p>}
          {importResult && <ImportSummaryView result={importResult} onClose={() => setImportResult(null)} />}
          {notice && <p className="data-notice" role="status">{notice}<button aria-label="Dismiss" onClick={() => setNotice("")}><X size={14} /></button></p>}
          {section === "credentials" ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Credential</th><th>Scenario</th><th>Tags</th><th>Default</th><th>Actions</th></tr></thead><tbody>
            {accountRows.map((item) => <tr key={item.credential_ref}><td><strong>{item.label}</strong><small>{item.role}{item.login_route ? ` · ${item.login_route.replace(/^https?:\/\/[^/]+/, "") || "/"}` : ""}</small></td><td><ScenarioPill type={item.test_type || "positive"} /></td><td>{(item.tags || []).length ? <span className="data-tags">{(item.tags || []).map((tag) => <i key={tag}>{tag}</i>)}</span> : <span className="muted">—</span>}</td><td>{item.is_default ? <span className="default-tag"><Check size={13} /> Default</span> : <button className="text-action" onClick={() => setDefault.mutate(item.credential_ref)}>Set default</button>}</td><td className="data-actions"><button className="icon-button" aria-label={`Edit ${item.label}`} onClick={() => setEditingAccount(item)}><Pencil size={15} /></button><button className="icon-button danger" aria-label={`Deactivate ${item.label}`} onClick={() => { if (window.confirm(`Deactivate ${item.label}?`)) deactivateAccount.mutate(item.credential_ref); }}><Trash2 size={15} /></button></td></tr>)}
            {!accountRows.length && <tr><td colSpan={5} className="data-empty">No login credentials match these filters.</td></tr>}
          </tbody></table></div> : <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Fixture</th><th>Form</th><th>Scenario</th><th>Assigned test case</th><th>Tags</th><th>Actions</th></tr></thead><tbody>
            {fixtureRows.map((item) => <tr key={item.id}><td><strong>{item.label}</strong><small>{Object.keys(item.test_data).length} fields{item.expected_result ? ` · ${item.expected_result}` : ""}</small></td><td>{item.form_group}</td><td><ScenarioPill type={item.test_type} /></td><td>{tests.data?.find((test) => test.id === item.test_case_id)?.tc_code || <span className="muted">Unassigned</span>}</td><td>{item.tags.length ? <span className="data-tags">{item.tags.map((tag) => <i key={tag}>{tag}</i>)}</span> : <span className="muted">—</span>}</td><td className="data-actions"><button className="icon-button" aria-label={`Edit ${item.label}`} onClick={() => setEditingFixture(item)}><Pencil size={15} /></button><button className="icon-button danger" aria-label={`Deactivate ${item.label}`} onClick={() => { if (window.confirm(`Deactivate ${item.label}?`)) deactivateFixture.mutate(item.id); }}><Trash2 size={15} /></button></td></tr>)}
            {!fixtureRows.length && <tr><td colSpan={6} className="data-empty">No form fixtures match these filters.</td></tr>}
          </tbody></table></div>}
          <div className="data-footnote">Credential passwords are never returned to the browser. Form fixtures are used only by their assigned test case.</div>
        </Card>
      </>}
      {editingAccount !== false && <CredentialDrawer project={project.data} account={editingAccount || undefined} onClose={() => setEditingAccount(false)} onSave={saveAccount} />}
      {editingFixture !== false && <FixtureDrawer fixture={editingFixture || undefined} tests={tests.data || []} onClose={() => setEditingFixture(false)} onSave={saveFixture} />}
    </Shell>
  );
}

function ScenarioPill({ type }: { type: string }) { return <span className={`scenario-pill ${type}`}>{type}</span>; }

function ImportSummaryView({ result, onClose }: { result: ImportSummary; onClose: () => void }) {
  return <div className="import-summary" role="status"><button className="icon-button" aria-label="Dismiss import summary" onClick={onClose}><X size={14} /></button><strong>Imported {result.imported_count} row{result.imported_count === 1 ? "" : "s"}</strong><span>{result.error_count} row errors</span>{result.errors.length > 0 && <ul>{result.errors.map((item) => <li key={`${item.row}-${item.error}`}>Row {item.row}: {item.error}</li>)}</ul>}</div>;
}

function CredentialDrawer({ project, account, onClose, onSave }: { project?: Project; account?: ProjectAccount; onClose: () => void; onSave: (value: { role_name: string; username: string; password: string; is_default: boolean; login_url: string; test_type: "positive" | "negative" | "edge"; tags: string[] }) => Promise<void> }) {
  const [role, setRole] = useState(account?.role || "Employee");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [url, setUrl] = useState(account?.login_route || project?.application_url || "");
  const [type, setType] = useState<"positive" | "negative" | "edge">(account?.test_type || "positive");
  const [tags, setTags] = useState((account?.tags || []).join(", "));
  const [defaultAccount, setDefaultAccount] = useState(account?.is_default || false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setBusy(true);
    try { await onSave({ role_name: role.trim(), username: username.trim(), password, is_default: defaultAccount, login_url: url.trim(), test_type: type, tags: tagsOf(tags) }); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not save credential."); } finally { setBusy(false); }
  };
  return <DetailDrawer title={account ? "Edit login credential" : "Add login credential"} onClose={onClose}><form className="data-form" onSubmit={submit}>
    <p className="muted">The secret is encrypted by the backend. Leave username and password blank when editing to keep the current secret.</p>
    <label>Label / role<input required maxLength={120} value={role} onChange={(event) => setRole(event.target.value)} placeholder="Employee" /></label>
    <label>Login URL<input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/login" /></label>
    <div className="data-form-grid"><label>Username{!account && <b>*</b>}<input autoComplete="off" value={username} onChange={(event) => setUsername(event.target.value)} required={!account} /></label><label>Password{!account && <b>*</b>}<input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required={!account} /></label></div>
    <label>Scenario type<select value={type} onChange={(event) => setType(event.target.value as typeof type)}>{credentialScenarios.map((item) => <option key={item}>{item}</option>)}</select></label>
    <label>Tags<input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="admin, smoke (comma separated)" /></label>
    <label className="data-checkbox"><input type="checkbox" checked={defaultAccount} onChange={(event) => setDefaultAccount(event.target.checked)} /> Use as project default login</label>
    {error && <p className="data-error" role="alert">{error}</p>}<div className="actions"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" busy={busy}>Save credential</Button></div>
  </form></DetailDrawer>;
}

function FixtureDrawer({ fixture, tests, onClose, onSave }: { fixture?: FormTestFixture; tests: TestCase[]; onClose: () => void; onSave: (value: Omit<FormTestFixture, "id" | "project_id" | "active" | "created_at">) => Promise<void> }) {
  const [label, setLabel] = useState(fixture?.label || "");
  const [group, setGroup] = useState(fixture?.form_group || "");
  const [type, setType] = useState<ScenarioType>(fixture?.test_type || "positive");
  const [json, setJson] = useState(JSON.stringify(fixture?.test_data || {}, null, 2));
  const [expected, setExpected] = useState(fixture?.expected_result || "");
  const [tags, setTags] = useState((fixture?.tags || []).join(", "));
  const [testCase, setTestCase] = useState(fixture?.test_case_id || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    let values: Record<string, unknown>;
    try { values = JSON.parse(json); if (!values || Array.isArray(values) || typeof values !== "object") throw new Error("Use a JSON object."); }
    catch { setError("Test data must be a valid JSON object."); return; }
    setBusy(true);
    try { await onSave({ label: label.trim(), form_group: group.trim(), test_type: type, test_data: values, expected_result: expected.trim() || null, tags: tagsOf(tags), test_case_id: testCase || null }); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not save test data."); } finally { setBusy(false); }
  };
  return <DetailDrawer title={fixture ? "Edit form test data" : "Add form test data"} onClose={onClose}><form className="data-form" onSubmit={submit}>
    <label>Fixture name<input required maxLength={120} value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Valid contact request" /></label>
    <div className="data-form-grid"><label>Form group<input required maxLength={120} value={group} onChange={(event) => setGroup(event.target.value)} placeholder="Contact form" /></label><label>Scenario type<select value={type} onChange={(event) => setType(event.target.value as ScenarioType)}>{scenarioOptions.map((item) => <option key={item}>{item}</option>)}</select></label></div>
    <label>Assign to test case<select value={testCase} onChange={(event) => setTestCase(event.target.value)}><option value="">Keep as library fixture</option>{tests.map((item) => <option key={item.id} value={item.id}>{item.tc_code} · {item.current.title}</option>)}</select><small>Assigned fixtures replace test data only for this case during code generation.</small></label>
    <label>Field values (JSON)<textarea required rows={8} spellCheck={false} value={json} onChange={(event) => setJson(event.target.value)} /></label>
    <label>Expected result<input value={expected} onChange={(event) => setExpected(event.target.value)} placeholder="Validation message is shown" /></label>
    <label>Tags<input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="required, contact (comma separated)" /></label>
    {error && <p className="data-error" role="alert">{error}</p>}<div className="actions"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" busy={busy}>Save test data</Button></div>
  </form></DetailDrawer>;
}
