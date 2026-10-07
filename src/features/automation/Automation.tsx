import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ChevronRight,
  Code2,
  Download,
  File,
  Folder,
  FolderOpen,
  FolderTree,
} from "lucide-react";

import { api } from "../../api/client";
import { useAction } from "../../hooks/useAction";

import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  ProgressIndicator,
  StatusBadge,
} from "../../components/ui";

import type {
  AppMap,
  AutomationGeneration,
  Requirement,
  TestCase,
} from "../../types/api";
import { flowNameForCase, groupByFlow } from "./flows";

const WRITABLE_LANGUAGE = "typescript";
const WRITABLE_FRAMEWORK = "playwright";


function LoginAccount({ projectId }: { projectId: string }) {
  const accounts = useQuery({
    queryKey: ["workspace", projectId, "accounts"],
    queryFn: ({ signal }) => api.accounts(projectId, signal),
  });
  const account = accounts.data?.find((item) => item.is_default) ?? accounts.data?.[0];
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const save = useAction(
    projectId,
    () =>
      account
        ? api.updateAccount(projectId, account.credential_ref, {
            role_name: account.role || account.label || "Default",
            username,
            password,
            is_default: true,
          })
        : api.saveAccount(projectId, {
            role_name: "Default",
            username,
            password,
            is_default: true,
          }),
    () => {
      setUsername("");
      setPassword("");
      setOpen(false);
    },
  );
  return (
    <div className="automation-account">
      <p>
        {account
          ? `Using the discovery account ${account.label} (${account.role}). The password stays in encrypted storage and is not written into the Playwright files.`
          : "No discovery account is saved yet. Add the login here and it will be used for generation and execution."}
      </p>
      {!open ? (
        <div className="actions">
          <Button variant="secondary" onClick={() => setOpen(true)}>
            {account ? "Edit login" : "Add login"}
          </Button>
        </div>
      ) : (
        <>
          <label className="field">
            <span>Username</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="off" />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
            />
          </label>
          <div className="actions">
            <Button
              busy={save.isPending}
              disabled={!username.trim() || !password}
              onClick={() => save.mutate(undefined)}
            >
              Save login
            </Button>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
          {save.error && <ErrorState error={save.error} />}
        </>
      )}
    </div>
  );
}

function ineligibleReason(
  test: TestCase,
  requirement?: Requirement,
  map?: AppMap | null,
) {
  if (test.status === "OUTDATED") {
    return "Outdated. Revise the case and approve the new version.";
  }

  if (test.status !== "APPROVED") {
    return `${test.status.replaceAll("_", " ")} cases cannot generate automation.`;
  }

  if (
    requirement &&
    test.requirement_id === requirement.id &&
    test.requirement_version !== requirement.version
  ) {
    return "Stale: the requirement version changed after this case was approved.";
  }

  if (map && test.application_map_id !== map.id) {
    return "This case uses a different application map.";
  }

  return null;
}

function FlowCheck({
  checked,
  partial,
  disabled,
  onChange,
  label,
  detail,
}: {
  checked: boolean;
  partial: boolean;
  disabled?: boolean;
  onChange: () => void;
  label: string;
  detail: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = partial && !checked;
  }, [partial, checked]);
  return (
    <label className="flow-head">
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
    </label>
  );
}

function caseCount(count: number): string {
  return `${count} case${count === 1 ? "" : "s"}`;
}


export default function Automation({
  projectId,
  tests,
  map,
  requirement,
  onNext,
}: {
  projectId: string;
  tests: TestCase[];
  map?: AppMap | null;
  requirement?: Requirement;
  onNext?: () => void;
}) {
  const rows = useMemo(
    () =>
      tests.map((test) => ({
        test,
        reason: ineligibleReason(test, requirement, map),
      })),
    [tests, requirement, map],
  );

  const eligible = rows.filter((row) => !row.reason);
  const blockedHere = rows.filter((row) => row.reason);

  const [selected, setSelected] = useState<string[]>([]);

  const [file, setFile] = useState<string>("");
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [language, setLanguage] = useState(WRITABLE_LANGUAGE);
  const [framework, setFramework] = useState(WRITABLE_FRAMEWORK);
  const canWrite = language === WRITABLE_LANGUAGE && framework === WRITABLE_FRAMEWORK;

  const generate = useAction(
    projectId,
    (body: { ids: string[]; language: string; framework: string }) =>
      api.generateAutomation(projectId, body.ids, body.language, body.framework),
    (data) => {
      setOpenedId(data.generation_id);
    },
  );

  const history = useQuery({
    queryKey: ["workspace", projectId, "automation"],
    queryFn: ({ signal }) => api.automation(projectId, signal),
  });

  const opened = useQuery({
    queryKey: ["workspace", projectId, "automation", openedId],
    queryFn: ({ signal }) =>
      api.automationGeneration(projectId, openedId || "", signal),
    enabled: !!openedId,
    refetchInterval: 3000,
  });

  const latestId = history.data?.generations[0]?.generation_id ?? null;

  useEffect(() => {
    if (generate.data) {
      setOpenedId(generate.data.generation_id);
    }
  }, [generate.data]);

  useEffect(() => {
    if (!openedId && latestId) {
      setOpenedId(latestId);
    }
  }, [latestId, openedId]);

  const result =
    opened.data && opened.data.generation_id === openedId
      ? opened.data
      : generate.data && generate.data.generation_id === openedId
        ? generate.data
        : opened.data;

  const preview = result?.sources.find(
    (item) => item.path === file,
  )?.content;

  const inSuiteIds = useMemo(
    () => (result?.scripts ?? []).map((script) => script.test_case_id).sort().join(","),
    [result],
  );
  const inSuite = useMemo(() => new Set(inSuiteIds ? inSuiteIds.split(",") : []), [inSuiteIds]);
  useEffect(() => {
    setSelected((current) => current.filter((id) => !inSuite.has(id)));
  }, [inSuite]);
  const flowGroups = useMemo(
    () =>
      groupByFlow(eligible, ({ test }) => flowNameForCase(test, map)).map((group) => ({
        ...group,
        fresh: group.items.filter(({ test }) => !inSuite.has(test.id)),
      })),
    [eligible, map, inSuite],
  );
  const toWrite = selected.filter((id) => !inSuite.has(id));
  const suiteExists = (result?.scripts.length ?? 0) > 0;

  const toggle = (id: string) => {
    if (inSuite.has(id)) return;
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };
  const toggleFlow = (ids: string[], checked: boolean) => {
    setSelected((current) => {
      const without = current.filter((id) => !ids.includes(id));
      return checked ? [...without, ...ids] : without;
    });
  };

  return (
    <div className="two-column">
      <div className="stack">
        <Card>
          <div className="card-heading">
            <div className="heading-icon">
              <Code2 size={20} />
            </div>

            <div>
              <h2>
                Automation <span className="count">{eligible.length}</span>
              </h2>

              <p>
                Check the cases to write. A later generate adds only the new
                cases and leaves the existing Playwright files in place. Cases
                for the same page stay in one flow, such as Login or Dashboard.
              </p>
            </div>
          </div>
          <LoginAccount projectId={projectId} />

          {eligible.length === 0 ? (
            <EmptyState
              title="No approved cases yet"
              description="Approve a test case on the previous step before generating automation."
            />
          ) : (
            <ul className="automation-cases flow-picker">
              {flowGroups.map((group) => {
                const freshIds = group.fresh.map(({ test }) => test.id);
                const checked =
                  freshIds.length > 0 && freshIds.every((id) => selected.includes(id));
                const partial = freshIds.some((id) => selected.includes(id));
                const inSuiteCount = group.items.length - group.fresh.length;
                return (
                  <li key={group.flow} className="flow-group">
                    <FlowCheck
                      checked={checked}
                      partial={partial}
                      disabled={freshIds.length === 0}
                      onChange={() => toggleFlow(freshIds, !checked)}
                      label={group.flow}
                      detail={
                        inSuiteCount
                          ? `${caseCount(group.items.length)} · ${inSuiteCount} in suite`
                          : caseCount(group.items.length)
                      }
                    />
                    <ul>
                      {group.items.map(({ test }) => {
                        const written = inSuite.has(test.id);
                        return (
                          <li key={test.id}>
                            <label>
                              <input
                                type="checkbox"
                                checked={!written && selected.includes(test.id)}
                                disabled={written}
                                onChange={() => toggle(test.id)}
                              />
                              <span>
                                <strong>
                                  {test.tc_code} · {test.current.title}
                                </strong>
                                <small>
                                  {written ? "In suite" : `Version ${test.current_version}`}
                                </small>
                              </span>
                            </label>
                            <StatusBadge status={test.status} />
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}

          {blockedHere.length > 0 && (
            <div className="automation-blocked">
              <h3>Not eligible</h3>

              <ul>
                {blockedHere.map(({ test, reason }) => (
                  <li key={test.id}>
                    <strong>{test.tc_code}</strong>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="stack-choice">
            <label className="field">
              <span>Language</span>
              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
              >
                <option value="typescript">TypeScript</option>
                <option value="python" disabled>
                  Python — not available yet
                </option>
                <option value="java" disabled>
                  Java — not available yet
                </option>
              </select>
            </label>
            <label className="field">
              <span>Framework</span>
              <select
                value={framework}
                onChange={(event) => setFramework(event.target.value)}
              >
                <option value="playwright">Playwright</option>
                <option value="selenium" disabled>
                  Selenium — not available yet
                </option>
              </select>
            </label>
          </div>
          <p className="muted">
            This app writes and runs TypeScript with Playwright. Python, Java,
            and Selenium stay closed until a writer exists.
          </p>

          <div className="actions">
            <Button
              busy={generate.isPending}
              disabled={!toWrite.length || !canWrite}
              onClick={() => {
                if (!canWrite) return;
                generate.mutate({
                  ids: toWrite,
                  language: WRITABLE_LANGUAGE,
                  framework: WRITABLE_FRAMEWORK,
                });
              }}
            >
              {toWrite.length === 0
                ? "Generate cases"
                : suiteExists
                  ? `Add ${caseCount(toWrite.length)}`
                  : `Generate ${caseCount(toWrite.length)}`}
            </Button>

            {onNext && (history.data?.generations.length ?? 0) > 0 && (
              <Button variant="secondary" onClick={onNext}>
                Continue to Execution
                <ArrowRight size={15} />
              </Button>
            )}
          </div>

          {generate.isPending && (
            <ProgressIndicator
              label="Writing the suite"
              description="The server writes the suite and leaves it here for review."
            />
          )}

          {generate.error && <ErrorState error={generate.error} />}
          {opened.error && <ErrorState error={opened.error} />}
        </Card>

        {result && (
          <Result
            result={result}
            projectId={projectId}
            file={file}
            preview={preview}
            onFile={setFile}
          />
        )}
      </div>

      <aside>
        <Card className="guide-card">
          <div className="eyebrow">
            {result?.executed ? "REVIEWED AND RUNNABLE" : "REVIEWED"}
          </div>

          <h3>
            {result?.executed
              ? "Suite generated — already executed"
              : "Generated and reviewed — run next"}
          </h3>

          <p>
            After the suite is written, the execution agent runs
            npx playwright test on the server. You do not need to run that
            command yourself. Destructive flows stay skipped until
            RUN_DESTRUCTIVE is true.
          </p>
        </Card>

        <Card>
          <div className="card-heading">
            <div>
              <h2>Earlier suites</h2>
            </div>
          </div>

          {(history.data?.generations.length ?? 0) === 0 ? (
            <p className="muted">
              No suite has been generated for this project yet.
            </p>
          ) : (
            <ul className="automation-history">
              {history.data?.generations.map((item) => (
                <li key={item.generation_id}>
                  <button
                    type="button"
                    onClick={() => setOpenedId(item.generation_id)}
                  >
                    <span>{item.review_status}</span>

                    <small>
                      {item.script_count} scripts · {item.verification_status}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </aside>
    </div>
  );
}


/**
 * Actions available for an already generated automation suite.
 *
 * FIX:
 * `result` is explicitly accepted here because this component uses
 * result.generation_id and result.vscode_url.
 */
function SuiteActions({
  projectId,
  result,
}: {
  projectId: string;
  result: AutomationGeneration;
}) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  return (
    <>
      <div className="actions">
        <Button
          variant="secondary"
          busy={downloading}
          onClick={() => {
            setDownloadError("");
            setDownloading(true);

            void api
              .downloadAutomation(projectId, result.generation_id)
              .catch((error: unknown) => {
                setDownloadError(
                  error instanceof Error
                    ? error.message
                    : "Download failed.",
                );
              })
              .finally(() => setDownloading(false));
          }}
        >
          <Download size={15} />
          Download ZIP
        </Button>

        {result.vscode_url && (
          <a
            className="button secondary"
            href={result.vscode_url}
          >
            Open in VS Code
          </a>
        )}
      </div>

      {downloadError && (
        <ErrorState error={new Error(downloadError)} />
      )}
    </>
  );
}


type SuiteFile = { name: string; path: string };
type SuiteFolder = {
  name: string;
  path: string;
  folders: SuiteFolder[];
  files: SuiteFile[];
};

function suiteTree(paths: string[]): SuiteFolder {
  const root: SuiteFolder = { name: "", path: "", folders: [], files: [] };
  for (const path of paths) {
    const parts = path.replaceAll("\\", "/").split("/").filter(Boolean);
    let cursor = root;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const name = parts[index];
      const folderPath = parts.slice(0, index + 1).join("/");
      let next = cursor.folders.find((item) => item.name === name);
      if (!next) {
        next = { name, path: folderPath, folders: [], files: [] };
        cursor.folders.push(next);
      }
      cursor = next;
    }
    const name = parts[parts.length - 1];
    if (name) cursor.files.push({ name, path });
  }
  const sortFolder = (folder: SuiteFolder) => {
    folder.folders.sort((left, right) => left.name.localeCompare(right.name));
    folder.files.sort((left, right) => left.name.localeCompare(right.name));
    folder.folders.forEach(sortFolder);
  };
  sortFolder(root);
  return root;
}

function FolderRows({
  folder,
  depth,
  file,
  onFile,
  closed,
  toggle,
}: {
  folder: SuiteFolder;
  depth: number;
  file: string;
  onFile: (path: string) => void;
  closed: Set<string>;
  toggle: (path: string) => void;
}) {
  return (
    <>
      {folder.folders.map((child) => {
        const open = !closed.has(child.path);
        return (
          <li key={child.path}>
            <button
              type="button"
              className="file-node folder"
              aria-expanded={open}
              onClick={() => toggle(child.path)}
              style={{ paddingLeft: 8 + depth * 14 }}
            >
              <ChevronRight size={13} className={open ? "chevron open" : "chevron"} />
              {open ? <FolderOpen size={14} /> : <Folder size={14} />}
              <span>{child.name}</span>
            </button>
            {open && (
              <ul>
                <FolderRows
                  folder={child}
                  depth={depth + 1}
                  file={file}
                  onFile={onFile}
                  closed={closed}
                  toggle={toggle}
                />
              </ul>
            )}
          </li>
        );
      })}
      {folder.files.map((item) => (
        <li key={item.path}>
          <button
            type="button"
            className="file-node"
            aria-current={file === item.path ? "true" : undefined}
            title={item.path}
            onClick={() => onFile(item.path)}
            style={{ paddingLeft: 26 + depth * 14 }}
          >
            <File size={13} />
            <span>{item.name}</span>
          </button>
        </li>
      ))}
    </>
  );
}

function SuiteFiles({
  paths,
  file,
  onFile,
}: {
  paths: string[];
  file: string;
  onFile: (path: string) => void;
}) {
  const tree = useMemo(() => suiteTree(paths), [paths]);
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    setClosed(new Set());
  }, [paths]);
  const toggle = (path: string) => {
    setClosed((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };
  return (
    <ul className="file-tree">
      <FolderRows
        folder={tree}
        depth={0}
        file={file}
        onFile={onFile}
        closed={closed}
        toggle={toggle}
      />
    </ul>
  );
}

/**
 * Displays the generated automation result.
 *
 * FIX:
 * `onNext` is explicitly accepted because this component renders
 * the Continue to Execution action.
 */
function Result({
  projectId,
  result,
  file,
  preview,
  onFile,
}: {
  projectId: string;
  result: AutomationGeneration;
  file: string;
  preview?: string;
  onFile: (path: string) => void;
}) {
  return (
    <Card>
      <div className="automation-result-head">
        <p className="automation-banner">{result.label}</p>

        <SuiteActions projectId={projectId} result={result} />
      </div>

      <div className="automation-status">
        <StatusBadge status={result.review_status} />
        <StatusBadge status={result.risk_level} />
        <StatusBadge status={result.verification.status} />
        <span className="muted">
          {(result.language ?? "typescript")} · {(result.framework ?? "playwright")}
        </span>

        {result.approval_required && (
          <span className="muted">
            Tester approval required
          </span>
        )}
      </div>

      {result.blocked.length > 0 && (
        <div className="automation-blocked">
          <h3>Blocked during generation</h3>

          <ul>
            {result.blocked.map((item) => (
              <li key={item.test_case_id}>
                <strong>{item.test_case_code}</strong>
                <span>{item.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <dl className="automation-counts">
        <div>
          <dt>Sleep</dt>
          <dd>{result.lint.hardcoded_sleep}</dd>
        </div>

        <div>
          <dt>XPath</dt>
          <dd>{result.lint.xpath_fallback}</dd>
        </div>

        <div>
          <dt>Secrets</dt>
          <dd>{result.lint.literal_credentials}</dd>
        </div>

        <div>
          <dt>test.only</dt>
          <dd>{result.lint.test_only}</dd>
        </div>

        <div>
          <dt>Missing await</dt>
          <dd>{result.lint.missing_await}</dd>
        </div>

        <div>
          <dt>Traceability</dt>
          <dd>{result.lint.missing_traceability}</dd>
        </div>

        <div>
          <dt>Blocked selectors</dt>
          <dd>{result.lint.unsupported_blocked_selectors}</dd>
        </div>

        <div>
          <dt>Destructive skip</dt>
          <dd>{result.lint.destructive_not_skipped}</dd>
        </div>
      </dl>

      <p className="muted">
        Verification: {result.verification.status}. Type check{" "}
        {result.verification.tsc}. List{" "}
        {result.verification.playwright_list}.
        {result.verification.detail
          ? ` ${result.verification.detail}`
          : ""}
      </p>

      <div className="automation-files">
        <div className="suite-explorer">
          <div className="suite-explorer-head">
            <FolderTree size={14} />
            Explorer
          </div>
          <SuiteFiles paths={result.file_tree} file={file} onFile={onFile} />
        </div>

        <pre className="source-preview">
          {preview || "Select a file to preview its source."}
        </pre>
      </div>

      <p className="muted">
        {(result.language ?? "typescript") === "typescript" &&
        (result.framework ?? "playwright") === "playwright"
          ? "Review the files above, then approve the suite. Execution starts after approval and runs every script in this generation."
          : "Review and download this suite. Execution is not available for this language and framework yet."}
      </p>
    </Card>
  );
}