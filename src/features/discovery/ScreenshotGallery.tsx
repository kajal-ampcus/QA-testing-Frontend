import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AppMap } from "../../types/api";
import { api } from "../../api/client";
import {
  GALLERY_PAGE_SIZE,
  collectShots,
  duplicateIds,
  filterShots,
  groupShots,
  type Shot,
  type ShotFilter,
} from "./galleryModel";

const FILTERS: { id: ShotFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "changed", label: "Changed" },
  { id: "duplicate", label: "Duplicate" },
  { id: "needs_review", label: "Needs Review" },
];

export function ScreenshotGallery({
  projectId,
  map,
}: {
  projectId: string;
  map: AppMap;
}) {
  const [filter, setFilter] = useState<ShotFilter>("needs_review");
  const [groupBy, setGroupBy] = useState<"page" | "state" | "flow">("page");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<Shot | null>(null);
  const [showPrevious, setShowPrevious] = useState(false);
  const [reviewed, setReviewed] = useState<string[]>(map.reviewed_fingerprints || []);
  const versions = useQuery({
    queryKey: ["map-versions", projectId],
    queryFn: () => api.mapVersions(projectId),
  });
  const previous = (versions.data || []).find((item) => item.version < map.version);

  const shots = useMemo(
    () =>
      collectShots({
        states: map.states,
        coverage: map.coverage,
        diagnostic: map.diagnostic_evidence,
        inputRequests: map.discovery_checkpoint?.input_requests,
        reviewed,
        previousStates: showPrevious ? previous?.states : [],
      }),
    [map, reviewed, showPrevious, previous],
  );
  const duplicates = useMemo(() => duplicateIds(shots), [shots]);
  const visible = filterShots(shots, filter, duplicates);
  const groups = groupShots(visible, groupBy);
  const flat = groups.flatMap((group) => group.shots.map((shot) => ({ group: group.title, shot })));
  const pageCount = Math.max(1, Math.ceil(flat.length / GALLERY_PAGE_SIZE));
  const slice = flat.slice(page * GALLERY_PAGE_SIZE, (page + 1) * GALLERY_PAGE_SIZE);

  const markReviewed = async (fingerprint: string) => {
    setReviewed((current) => [...new Set([...current, fingerprint])]);
    await api.reviewScreenshot(projectId, fingerprint);
  };

  if (shots.length === 0) return null;

  return (
    <section className="shot-gallery" aria-label="Discovery screenshots">
      <div className="shot-gallery-bar">
        <h3>Screenshots</h3>
        <div className="shot-filters">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={filter === item.id ? "shot-filter shot-filter--active" : "shot-filter"}
              onClick={() => {
                setFilter(item.id);
                setPage(0);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="shot-group">
          Group
          <select
            value={groupBy}
            onChange={(event) => setGroupBy(event.target.value as "page" | "state" | "flow")}
          >
            <option value="page">Page</option>
            <option value="state">Discovered state</option>
            <option value="flow">Navigation flow</option>
          </select>
        </label>
        {previous && (
          <button type="button" className="shot-filter" onClick={() => setShowPrevious((value) => !value)}>
            {showPrevious ? "Hide previous version" : "View previous screenshots"}
          </button>
        )}
      </div>
      <div className="shot-grid">
        {slice.map(({ group, shot }) => (
          <figure key={shot.id} className={shot.reviewed ? "shot-card shot-card--reviewed" : "shot-card"}>
            <button type="button" onClick={() => setOpen(shot)}>
              <img src={shot.src} alt={shot.label} loading="lazy" />
            </button>
            <figcaption>
              <strong>{shot.label}</strong>
              <span>{group}</span>
              {duplicates.has(shot.id) && <span className="badge">Duplicate</span>}
              {shot.versionStatus !== "unknown" && <span className="badge">{shot.versionStatus}</span>}
              {!shot.reviewed && (
                <button type="button" onClick={() => void markReviewed(shot.fingerprint)}>
                  Mark reviewed
                </button>
              )}
            </figcaption>
          </figure>
        ))}
      </div>
      {pageCount > 1 && (
        <div className="shot-pager">
          <button type="button" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>
            Previous
          </button>
          <span>
            {page + 1} / {pageCount}
          </span>
          <button type="button" disabled={page + 1 >= pageCount} onClick={() => setPage((value) => value + 1)}>
            Next
          </button>
        </div>
      )}
      {open && (
        <div className="shot-lightbox" role="dialog" aria-modal="true" onClick={() => setOpen(null)}>
          <img src={open.src} alt={open.label} />
          <p>{open.label}</p>
        </div>
      )}
    </section>
  );
}
