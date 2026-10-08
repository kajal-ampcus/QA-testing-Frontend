import { useState } from "react";
import { CheckCircle2, ChevronRight, RotateCcw, Search } from "lucide-react";
import type { DiscoveryCheckpoint } from "../../types/api";

type Branch = NonNullable<DiscoveryCheckpoint["jobs"]>[number];
const stepLabel = (step: Branch["path"][number]) =>
  `${step.name || step.url || step.role}${step.value != null ? ` (${step.value})` : ""}`;

export function DiscoveryPaths({ paths, selected, onSelect, onRunAgain, disabled }: {
  paths: Branch[];
  selected: string[];
  onSelect: (keys: string[]) => void;
  onRunAgain: (key: string) => void;
  disabled: boolean;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const completed = paths.filter((path) => path.status === "completed").length;
  const repeatedLabels = new Set(paths.filter((branch, index) =>
    paths.some((other, otherIndex) => otherIndex !== index &&
      stepLabel(other.path[other.path.length - 1]) === stepLabel(branch.path[branch.path.length - 1]))
  ).map((branch) => stepLabel(branch.path[branch.path.length - 1])));
  const groups = new Map<string, { label: string; paths: Branch[] }>();
  for (const branch of paths) {
    if (filter === "remaining" && branch.status === "completed") continue;
    if (filter === "completed" && branch.status !== "completed") continue;
    if (!branch.path.map(stepLabel).join(" / ").toLowerCase().includes(search.toLowerCase())) continue;
    const parent = branch.path.slice(0, -1);
    const key = JSON.stringify(parent);
    const group = groups.get(key) ?? { label: ["Landing", ...parent.map(stepLabel)].join(" / "), paths: [] };
    group.paths.push(branch);
    groups.set(key, group);
  }
  return (
    <section className="discovery-paths" aria-label="Saved discovery paths">
      <div className="discovery-paths-heading">
        <div><h3>Choose your next path</h3><p>Explore a new page or run a completed path again.</p></div>
        <span className="badge good">{completed} / {paths.length} complete</span>
      </div>
      <div className="discovery-paths-tools">
        <label className="discovery-paths-search"><Search size={16} aria-hidden="true" />
          <input aria-label="Search discovery paths" placeholder="Find a page or flow…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <select aria-label="Filter discovery paths" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All paths ({paths.length})</option>
          <option value="remaining">Remaining ({paths.length - completed})</option>
          <option value="completed">Completed ({completed})</option>
        </select>
      </div>
      <div className="discovery-paths-groups">
        {[...groups.entries()].map(([key, group]) => {
          const selectable = group.paths.filter((branch) => branch.status !== "completed").map((branch) => branch.key);
          const selectedCount = selectable.filter((id) => selected.includes(id)).length;
          const allSelected = selectable.length > 0 && selectedCount === selectable.length;
          return (
          <details key={key} className="discovery-path-group" open>
            <summary><ChevronRight size={16} aria-hidden="true" /><span>{group.label}</span><span className="discovery-path-count">{group.paths.length} {group.paths.length === 1 ? "path" : "paths"}</span></summary>
            {selectable.length > 0 && <div className="discovery-path-group-selection">
              <label>
                <input type="checkbox" aria-label={`Select all remaining paths in ${group.label}`}
                  disabled={disabled} checked={allSelected}
                  ref={(input) => { if (input) input.indeterminate = selectedCount > 0 && !allSelected; }}
                  onChange={(event) => onSelect(event.target.checked
                    ? [...new Set([...selected, ...selectable])]
                    : selected.filter((id) => !selectable.includes(id)))} />
                {search ? "Select all matching remaining paths" : "Select all remaining paths"}
              </label>
              <span>{selectedCount} / {selectable.length} selected in this section</span>
            </div>}
            <ul>
              {group.paths.map((branch) => {
                const done = branch.status === "completed";
                const label = stepLabel(branch.path[branch.path.length - 1]);
                const repeated = repeatedLabels.has(label);
                const completedElsewhere = !done && paths.find((other) => other.status === "completed" &&
                  stepLabel(other.path[other.path.length - 1]) === label);
                const name = <span>{label}{repeated && <small className="discovery-path-context">
                  From: {group.label}
                  {completedElsewhere && <span>Same label completed via {['Landing', ...completedElsewhere.path.slice(0, -1).map(stepLabel)].join(' / ')}; this route is separate.</span>}
                </small>}</span>;
                return <li key={branch.key} className={`discovery-path-row ${done ? "is-complete" : ""} ${selected.includes(branch.key) ? "is-selected" : ""}`}>
                  {done ? <div className="discovery-path-name"><CheckCircle2 size={19} aria-hidden="true" />{name}</div>
                    : <label className="discovery-path-name"><input type="checkbox" disabled={disabled} checked={selected.includes(branch.key)} onChange={(e) => onSelect(e.target.checked ? [...selected, branch.key] : selected.filter((id) => id !== branch.key))} />{name}</label>}
                  <span className={`badge ${done ? "good" : branch.status === "failed" ? "bad" : ""}`}>{done ? "Complete" : branch.status === "failed" ? "Failed · retry" : "Not explored"}</span>
                  {done && <button type="button" className="button ghost discovery-path-rerun" disabled={disabled} aria-label={`Run ${label} again`} onClick={() => onRunAgain(branch.key)}><RotateCcw size={14} aria-hidden="true" />Run again</button>}
                </li>;
              })}
            </ul>
          </details>
          );
        })}
        {groups.size === 0 && <p className="discovery-paths-empty">{paths.length ? "No paths match this filter." : "No further safe paths were observed."}</p>}
      </div>
      <div className="discovery-paths-footer"><span aria-live="polite">{selected.length} selected</span>{selected.length > 0 && <button type="button" className="button ghost" onClick={() => onSelect([])} disabled={disabled}>Clear selection</button>}</div>
      <p className="field-hint">Complete means this page was inspected, not that all its features passed testing. Child paths have their own status. Your progress is saved when you leave.</p>
    </section>
  );
}
