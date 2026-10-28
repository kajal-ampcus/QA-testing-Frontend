import { useState } from "react";
import type { ExplorerRole } from "./explorerModel";

export function RoleSelector({
  roles,
  active,
  runningRef,
  selectedCount,
  onSelect,
}: {
  roles: ExplorerRole[];
  active: string;
  runningRef?: string;
  selectedCount: number;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const selected = roles.find((role) => role.id === active);
  const summary = (role: ExplorerRole) => {
    if (runningRef === role.ref || runningRef === role.id) return "In progress";
    if (role.choice) return "Login found — explore it to discover its pages.";
    if (!role.paths.length) return "Not explored";
    return `${selectedCount} selected`;
  };
  return (
    <section className="discovery-role-selector" aria-label="Discovery roles">
      <h3>Discovery Explorer</h3>
      {roles.length ? (
        <>
          {roles.length > 6 && (
            <input
              aria-label="Search roles"
              placeholder="Search discovered logins"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          )}
          <label>
            Discovered login
            <select
              aria-label="Select discovery role"
              value={selected?.id ?? ""}
              onChange={(event) => onSelect(event.target.value)}
            >
              {!selected && (
                <option value="" disabled>
                  Select a discovered login
                </option>
              )}
              {roles
                .filter(
                  (role) =>
                    roles.length <= 6 ||
                    role.id === active ||
                    role.label.toLowerCase().includes(search.toLowerCase()),
                )
                .map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.label}
                  </option>
                ))}
            </select>
          </label>
          <p aria-live="polite">
            {selected
              ? summary(selected)
              : "Choose a login to see its discovery paths."}
          </p>
        </>
      ) : (
        <p role="status">
          Login options will appear here when discovery finds them in the
          application.
        </p>
      )}
    </section>
  );
}
