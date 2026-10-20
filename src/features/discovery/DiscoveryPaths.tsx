import { useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { uniquePaths, type Branch } from "./explorerModel";

const stepLabel = (step: Branch["path"][number]) =>
  `${step.name || step.url || step.role}${step.value != null ? ` (${step.value})` : ""}`;
const route = (branch: Branch) =>
  [
    "Landing",
    ...branch.path.map(
      (step) =>
        `${stepLabel(step)}${step.name && step.url ? ` (${step.url})` : ""}`,
    ),
  ].join(" / ");
const groupKey = (branch: Branch) =>
  JSON.stringify([branch.parent_fingerprint, branch.path.slice(0, -1)]);
const statusLabel = (status: string) =>
  status === "completed"
    ? "Complete"
    : status === "failed"
      ? "Failed"
      : status === "in_progress" || status === "pending"
        ? "In Progress"
        : "Not Explored";
const PAGE_SIZE = 100;

export function DiscoveryPaths({
  paths: rawPaths,
  selected,
  onSelect,
  onRunAgain,
  disabled,
  executionDisabled = disabled,
}: {
  paths: Branch[];
  selected: string[];
  onSelect: (keys: string[]) => void;
  onRunAgain: (key: string) => void;
  disabled: boolean;
  executionDisabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [page, setPage] = useState(0);
  const paths = uniquePaths(rawPaths);
  const completed = paths.filter((path) => path.status === "completed").length;
  const matching = paths.filter(
    (path) =>
      (filter === "All" || statusLabel(path.status) === filter) &&
      route(path).toLowerCase().includes(search.toLowerCase()),
  );
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(matching.length / PAGE_SIZE) - 1),
  );
  const groups = new Map<string, { label: string; paths: Branch[] }>();
  const selectableGroups = new Map<string, string[]>();
  for (const branch of matching) {
    if (branch.status === "completed") continue;
    const key = groupKey(branch);
    const keys = selectableGroups.get(key) ?? [];
    keys.push(branch.key);
    selectableGroups.set(key, keys);
  }
  for (const branch of matching.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  )) {
    const key = groupKey(branch);
    const group = groups.get(key) ?? {
      label: route({ ...branch, path: branch.path.slice(0, -1) }),
      paths: [],
    };
    group.paths.push(branch);
    groups.set(key, group);
  }
  return (
    <section className="discovery-paths" aria-label="Saved discovery paths">
      <div className="discovery-paths-heading">
        <div>
          <h3>Paths for this role</h3>
          <p>Select routes to explore or inspect a completed page again.</p>
        </div>
        <span className="badge good">
          {completed} / {paths.length} complete
        </span>
      </div>
      <div className="discovery-paths-tools">
        <label className="discovery-paths-search">
          <Search size={16} aria-hidden="true" />
          <input
            aria-label="Search discovery paths"
            placeholder="Find a page or route"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <select
          aria-label="Filter discovery paths"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(0);
          }}
        >
          {["All", "Not Explored", "In Progress", "Complete", "Failed"].map(
            (value) => (
              <option key={value}>{value}</option>
            ),
          )}
        </select>
      </div>
      <div className="discovery-paths-groups">
        {[...groups].map(([key, group]) => {
          const selectable = selectableGroups.get(key) ?? [];
          const count = selectable.filter((id) => selected.includes(id)).length;
          return (
            <details key={key} className="discovery-path-group" open>
              <summary>
                <ChevronRight size={16} aria-hidden="true" />
                <span>{group.label}</span>
                <span className="discovery-path-count">
                  {group.paths.length} shown
                </span>
              </summary>
              {!!selectable.length && (
                <div className="discovery-path-group-selection">
                  <label>
                    <input
                      type="checkbox"
                      aria-label={`Select all remaining paths in ${group.label}`}
                      disabled={disabled}
                      checked={count === selectable.length}
                      ref={(input) => {
                        if (input)
                          input.indeterminate =
                            count > 0 && count < selectable.length;
                      }}
                      onChange={(event) =>
                        onSelect(
                          event.target.checked
                            ? [...new Set([...selected, ...selectable])]
                            : selected.filter((id) => !selectable.includes(id)),
                        )
                      }
                    />
                    Select all {search || filter !== "All" ? "matching " : ""}
                    remaining paths ({selectable.length})
                  </label>
                </div>
              )}
              <ul>
                {group.paths.map((branch) => (
                  <li
                    key={branch.key}
                    className={`discovery-path-row ${branch.status === "completed" ? "is-complete" : ""} ${selected.includes(branch.key) ? "is-selected" : ""}`}
                  >
                    <label className="discovery-path-name">
                      <input
                        type="checkbox"
                        disabled={disabled}
                        checked={selected.includes(branch.key)}
                        onChange={(event) =>
                          onSelect(
                            event.target.checked
                              ? [...new Set([...selected, branch.key])]
                              : selected.filter((key) => key !== branch.key),
                          )
                        }
                      />
                      <span>
                        {stepLabel(branch.path[branch.path.length - 1])}
                        <small className="discovery-path-context">
                          {route(branch)}
                          {branch.path.at(-1)?.url && (
                            <span>{branch.path.at(-1)?.url}</span>
                          )}
                        </small>
                      </span>
                    </label>
                    <span
                      className={`badge ${branch.status === "completed" ? "good" : branch.status === "failed" ? "bad" : ""}`}
                    >
                      {statusLabel(branch.status)}
                    </span>
                    {branch.status === "completed" && (
                      <button
                        type="button"
                        className="button ghost"
                        disabled={executionDisabled}
                        onClick={() => onRunAgain(branch.key)}
                      >
                        Run again
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
        {!matching.length && (
          <p className="discovery-paths-empty">
            {paths.length
              ? "No paths match this filter."
              : "No saved paths for this role yet. Explore its entry page to discover available routes."}
          </p>
        )}
      </div>
      <div className="discovery-paths-footer">
        <span aria-live="polite">{selected.length} selected</span>
        <button
          type="button"
          className="button ghost"
          disabled={disabled || !selected.length}
          onClick={() => onSelect([])}
        >
          Clear selection
        </button>
        {matching.length > PAGE_SIZE && (
          <nav aria-label="Path pages">
            <button
              type="button"
              disabled={!currentPage}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous
            </button>
            <span>
              {" "}
              Page {currentPage + 1} of{" "}
              {Math.ceil(matching.length / PAGE_SIZE)}{" "}
            </span>
            <button
              type="button"
              disabled={(currentPage + 1) * PAGE_SIZE >= matching.length}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </button>
          </nav>
        )}
      </div>
      <p className="field-hint">
        Complete means this page was inspected, not that its features passed
        testing. Each route has its own status. Selections are saved for this
        role.
      </p>
    </section>
  );
}
