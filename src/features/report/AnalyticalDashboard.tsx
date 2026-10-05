import type { ExecutionReport, ExecutionRun } from "../../types/api";
import { durationLabel } from "./exportExecutionExcel";
import {
  STATUS_COLORS,
  failureGroups,
  headline,
  requirementBars,
  runTrend,
  slowestTests,
  statusSlices,
  suiteFailure,
} from "./dashboardModel";

export function AnalyticalDashboard({
  report,
  runs,
  activeRunId,
  suiteDetail = "",
}: {
  report: ExecutionReport;
  runs: ExecutionRun[];
  activeRunId: string;
  suiteDetail?: string;
}) {
  const counts = report.counts;
  const slices = statusSlices(counts);
  const visibleSlices = slices.filter((slice) => slice.value > 0);
  const requirements = requirementBars(report.results);
  const recorded = failureGroups(report.results);
  const stopped = suiteFailure(suiteDetail);
  const failures =
    recorded.length > 0 || !stopped ? recorded : [{ message: stopped, count: 1 }];
  const durations = slowestTests(report.results);
  const trend = runTrend(runs);
  const longest = durations[0]?.duration || 1;
  const widestFailure = failures[0]?.count || 1;
  const widestRequirement = requirements[0]?.total || 1;

  return (
    <section className="analytics" aria-label="Execution analytics">
      <div className="analytics-kpis">
        <PassRing rate={counts.pass_rate} total={counts.total} />
        <div>
          <p className="analytics-headline">{headline(counts, report.results.length)}</p>
          <div className="analytics-tiles">
            <Tile label="Passed" value={counts.passed} tone="passed" />
            <Tile label="Failed" value={counts.failed} tone="failed" />
            <Tile label="Skipped" value={counts.skipped} tone="skipped" />
            <Tile label="Error" value={counts.error} tone="error" />
            <Tile label="Duration" value={durationLabel(counts.duration_ms) || "0 ms"} />
          </div>
        </div>
      </div>

      <div className="analytics-grid">
        <article className="analytics-panel">
          <h3>Result mix</h3>
          <div className="analytics-split">
            <Donut slices={visibleSlices} total={counts.total} />
            <ul className="analytics-legend">
              {slices.map((slice) => (
                <li key={slice.key}>
                  <span style={{ background: slice.color }} />
                  {slice.label}
                  <strong>{slice.value}</strong>
                </li>
              ))}
            </ul>
          </div>
        </article>

        <article className="analytics-panel">
          <h3>By requirement</h3>
          {requirements.length === 0 ? (
            <p className="muted">No result rows in this run.</p>
          ) : (
            <ul className="analytics-bars">
              {requirements.map((bar) => (
                <li key={bar.code}>
                  <div className="analytics-bar-label">
                    <span>{bar.code}</span>
                    <span>{bar.total}</span>
                  </div>
                  <div
                    className="analytics-stack"
                    title={`${bar.passed} passed, ${bar.failed} failed, ${bar.other} other`}
                  >
                    <span
                      style={{
                        width: `${(bar.passed / widestRequirement) * 100}%`,
                        background: STATUS_COLORS.passed,
                      }}
                    />
                    <span
                      style={{
                        width: `${(bar.failed / widestRequirement) * 100}%`,
                        background: STATUS_COLORS.failed,
                      }}
                    />
                    <span
                      style={{
                        width: `${(bar.other / widestRequirement) * 100}%`,
                        background: STATUS_COLORS.skipped,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="analytics-panel">
          <h3>Why tests failed</h3>
          {failures.length === 0 ? (
            <p className="muted">No failed or error results in this run.</p>
          ) : (
            <ul className="analytics-bars">
              {failures.map((group) => (
                <li key={group.message}>
                  <div className="analytics-bar-label">
                    <span title={group.message}>{group.message}</span>
                    <span>{group.count}</span>
                  </div>
                  <div className="analytics-stack">
                    <span
                      style={{
                        width: `${(group.count / widestFailure) * 100}%`,
                        background: STATUS_COLORS.failed,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="analytics-panel">
          <h3>Slowest tests</h3>
          {durations.length === 0 ? (
            <p className="muted">No durations were recorded.</p>
          ) : (
            <ul className="analytics-bars">
              {durations.map((item) => (
                <li key={item.code}>
                  <div className="analytics-bar-label">
                    <span title={item.title}>
                      {item.code}
                      <small>{item.title}</small>
                    </span>
                    <span>{durationLabel(item.duration)}</span>
                  </div>
                  <div className="analytics-stack">
                    <span
                      style={{
                        width: `${(item.duration / longest) * 100}%`,
                        background: item.failed ? STATUS_COLORS.failed : STATUS_COLORS.passed,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>

      {trend.length > 0 && (
        <article className="analytics-panel">
          <h3>Pass rate across finished runs</h3>
          <div className="analytics-trend" role="img" aria-label="Pass rate for recent finished runs">
            {trend.map((point) => (
              <div
                key={point.id}
                className={`analytics-column${point.id === activeRunId ? " is-active" : ""}`}
                title={`${point.label}: ${point.passRate}% of ${point.total}`}
              >
                <span className="analytics-column-value">{point.passRate}%</span>
                <div className="analytics-column-track">
                  <span
                    style={{
                      height: `${point.total ? Math.max(point.passRate, 14) : 8}%`,
                      background:
                        point.passRate >= 80
                          ? STATUS_COLORS.passed
                          : point.passRate > 0
                            ? STATUS_COLORS.skipped
                            : STATUS_COLORS.failed,
                    }}
                  />
                </div>
                <span className="analytics-column-label">{point.label}</span>
              </div>
            ))}
          </div>
        </article>
      )}
    </section>
  );
}

function Tile({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className={`analytics-tile${tone ? ` is-${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PassRing({ rate, total }: { rate: number; total: number }) {
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const filled = (Math.min(Math.max(rate, 0), 100) / 100) * circumference;
  return (
    <svg className="analytics-ring" viewBox="0 0 120 120" role="img" aria-label={`Pass rate ${rate} percent`}>
      <circle cx="60" cy="60" r={radius} fill="none" stroke="#e3eae0" strokeWidth="12" />
      <circle
        cx="60"
        cy="60"
        r={radius}
        fill="none"
        stroke={rate > 0 ? STATUS_COLORS.passed : STATUS_COLORS.failed}
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circumference - filled}`}
        transform="rotate(-90 60 60)"
      />
      <text x="60" y="56" textAnchor="middle" className="analytics-ring-value">
        {rate}%
      </text>
      <text x="60" y="74" textAnchor="middle" className="analytics-ring-caption">
        {total} tests
      </text>
    </svg>
  );
}

function Donut({
  slices,
  total,
}: {
  slices: { key: string; value: number; color: string }[];
  total: number;
}) {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const safeTotal = total || 1;
  return (
    <svg className="analytics-donut" viewBox="0 0 120 120" role="img" aria-label="Passed, failed, skipped, and error counts">
      <circle cx="60" cy="60" r={radius} fill="none" stroke="#e3eae0" strokeWidth="16" />
      {slices.map((slice) => {
        const length = (slice.value / safeTotal) * circumference;
        const element = (
          <circle
            key={slice.key}
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={slice.color}
            strokeWidth="16"
            strokeDasharray={`${length} ${circumference - length}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 60 60)"
          />
        );
        offset += length;
        return element;
      })}
      <text x="60" y="58" textAnchor="middle" className="analytics-ring-value">
        {total}
      </text>
      <text x="60" y="74" textAnchor="middle" className="analytics-ring-caption">
        results
      </text>
    </svg>
  );
}
