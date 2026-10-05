import type { Cell, SheetData } from "write-excel-file/browser";
import { api } from "../../api/client";
import type { ExecutionReport, ExecutionReportResult } from "../../types/api";

const CELL_LIMIT = 32000;

const HEADER = {
  fontWeight: "bold" as const,
  textColor: "#FFFFFF",
  backgroundColor: "#278066",
  alignVertical: "center" as const,
  wrap: true,
  height: 28,
  bottomBorderColor: "#1D604E",
  bottomBorderStyle: "thin" as const,
};

function safeText(value: string): string {
  const text = value.slice(0, 32767);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function valueCell(value: unknown): Cell {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return safeText(value);
  return safeText(JSON.stringify(value));
}

function headerRow(labels: string[]): SheetData[number] {
  return labels.map((label) => ({ value: label, ...HEADER }));
}

function linkCell(url: string): Cell {
  const target = url.replaceAll('"', '""');
  return {
    value: `HYPERLINK("${target}","${target}")`,
    type: "Formula",
    textColor: "#146b48",
    textDecoration: { underline: true },
    alignVertical: "top",
    wrap: true,
  };
}

function dataRow(values: unknown[]): SheetData[number] {
  return values.map((value) => {
    if (value && typeof value === "object" && "type" in value) return value as Cell;
    return {
      value: valueCell(value) as string | number | boolean,
      alignVertical: "top" as const,
      wrap: true,
    };
  });
}

function sheet(name: string, headers: string[], rows: unknown[][], widths: number[]) {
  return {
    sheet: name,
    data: [headerRow(headers), ...rows.map(dataRow)],
    columns: widths.map((width) => ({ width })),
    stickyRowsCount: 1,
    showGridLines: false,
    zoomScale: 0.9,
  };
}

export function durationLabel(ms: number | null | undefined): string {
  if (ms == null) return "";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function when(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function evidenceLabel(channels: string[]): string {
  return channels.length ? channels.join(", ") : "None";
}

export function clipCell(value: string): string {
  if (value.length <= CELL_LIMIT) return value;
  return `${value.slice(0, CELL_LIMIT)}\n… truncated`;
}

export function formatLog(raw: string): string {
  const text = raw.trim();
  if (!text) return "";
  try {
    return clipCell(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    return clipCell(text);
  }
}

const RESULT_HEADERS = [
  "Test case",
  "Title",
  "Requirement",
  "Status",
  "Expected",
  "Actual",
  "Duration",
  "Error",
  "Screenshot URL",
  "Console log",
  "Network log",
  "Other evidence",
];

export interface ResultEvidence {
  screenshotUrl: string;
  consoleLog: string;
  networkLog: string;
}

function resultRow(row: ExecutionReportResult, evidence?: ResultEvidence): unknown[] {
  return [
    row.test_case_code,
    row.title,
    row.requirement_code,
    row.status,
    row.expected,
    row.actual,
    durationLabel(row.duration_ms),
    row.error_message || "",
    evidence?.screenshotUrl ? linkCell(evidence.screenshotUrl) : "",
    evidence?.consoleLog || "",
    evidence?.networkLog || "",
    evidenceLabel(
      row.evidence.filter(
        (channel) =>
          channel !== "screenshot" &&
          channel !== "console_log" &&
          channel !== "network_log",
      ),
    ),
  ];
}

export function buildExecutionSheets(
  report: ExecutionReport,
  evidence: Map<string, ResultEvidence> = new Map(),
) {
  const counts = report.counts;
  const summaryRows: unknown[][] = [
    ["Report generated", new Date().toISOString()],
    ["Run", report.run_id],
    ["Status", report.status],
    ["Environment", report.environment],
    ["Application URL", report.base_url || ""],
    ["Started", when(report.started_at)],
    ["Finished", when(report.finished_at)],
    ["Total", counts.total],
    ["Passed", counts.passed],
    ["Failed", counts.failed],
    ["Skipped", counts.skipped],
    ["Error", counts.error],
    ["Pass rate", `${counts.pass_rate}%`],
    ["Duration", durationLabel(counts.duration_ms)],
  ];
  const failures = report.results.filter((row) =>
    ["FAILED", "ERROR"].includes(row.status),
  );
  return [
    sheet("Summary", ["Metric", "Value"], summaryRows, [22, 72]),
    sheet(
      "Execution results",
      RESULT_HEADERS,
      report.results.map((row) => resultRow(row, evidence.get(row.id))),
      [16, 36, 16, 14, 42, 42, 14, 42, 55, 55, 55, 24],
    ),
    sheet(
      "Failures",
      RESULT_HEADERS,
      failures.map((row) => resultRow(row, evidence.get(row.id))),
      [16, 36, 16, 14, 42, 42, 14, 42, 55, 55, 55, 24],
    ),
    sheet(
      "Traceability",
      ["Requirement", "Test case", "Title", "Status"],
      report.results.map((row) => [
        row.requirement_code,
        row.test_case_code,
        row.title,
        row.status,
      ]),
      [18, 16, 42, 14],
    ),
  ];
}

async function loadEvidence(report: ExecutionReport): Promise<Map<string, ResultEvidence>> {
  const entries = await Promise.all(
    report.results.map(async (row) => {
      const screenshotUrl = row.evidence.includes("screenshot")
        ? api.evidenceUrl(report.project_id, report.run_id, row.id, "screenshot")
        : "";
      const consoleLog = row.evidence.includes("console_log")
        ? await readLog(report, row.id, "console_log")
        : "";
      const networkLog = row.evidence.includes("network_log")
        ? await readLog(report, row.id, "network_log")
        : "";
      return [
        row.id,
        { screenshotUrl, consoleLog, networkLog },
      ] as const;
    }),
  );
  return new Map(entries);
}

async function readLog(report: ExecutionReport, resultId: string, channel: string) {
  try {
    const text = await api.readEvidence(
      report.project_id,
      report.run_id,
      resultId,
      channel,
    );
    return formatLog(text);
  } catch {
    return "Could not load this log.";
  }
}

export async function exportExecutionExcelReport(report: ExecutionReport) {
  const evidence = await loadEvidence(report);
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const date = new Date().toISOString().slice(0, 10);
  await writeExcelFile(buildExecutionSheets(report, evidence), {
    fontFamily: "Arial",
    fontSize: 10,
  }).toFile(`qa-execution-report-${date}.xlsx`);
}
