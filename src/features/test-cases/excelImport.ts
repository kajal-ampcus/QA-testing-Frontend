import * as XLSX from "xlsx";

export type ImportedCase = {
  rowNumber: number;
  title: string;
  objective: string;
  expectedResult: string;
  category: "POSITIVE" | "NEGATIVE" | "EDGE_CASE";
  preconditions: string[];
  stepNotes: string[];
  input: string;
  scenario_name: string;
  source_case_id: string;
  inferred: string[];
  page?: string;
  screen?: string;
  module?: string;
  url?: string;
};

const IMPORT_COLUMNS: Record<string, string[]> = {
  title: ["test case name", "test case title", "test scenario", "scenario name", "title", "scenario", "name"],
  objective: ["objective", "description", "module", "what this verifies"],
  expectedResult: ["expected result", "expected", "expected outcome", "result"],
  category: ["category", "type", "test type"],
  preconditions: ["preconditions", "precondition", "prerequisites"],
  steps: ["repro steps", "reproduction steps", "test steps", "steps", "step", "steps to reproduce", "action"],
  input: ["input", "inputs", "input data", "test data", "data"],
  scenarioName: ["scenario name", "test scenario", "scenario"],
  caseKey: ["test case", "test case id", "test case code", "tc code", "id"],
  page: ["page", "page name"], screen: ["screen"], moduleName: ["module"], url: ["url", "route"],
};

function normaliseColumn(value: string) {
  return value.trim().toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ");
}

function readImportCell(row: Record<string, unknown>, column: keyof typeof IMPORT_COLUMNS) {
  // Prefer the most explicit alias (for example, "Title" over the exported
  // workbook's adjacent "Test Case" identifier column).
  for (const alias of IMPORT_COLUMNS[column]) {
    const entry = Object.entries(row).find(([name]) => normaliseColumn(name) === normaliseColumn(alias));
    const value = String(entry?.[1] ?? "").trim();
    if (value) return value;
  }
  return "";
}

function splitImportLines(value: string) {
  return value.split(/\r?\n|;|(?=\s+\d+[.)]\s+)/).map((item) => item.trim().replace(/^\d+[.)]\s+/, "")).filter(Boolean);
}

/** Convert common test-case workbooks, including this application's export, into drafts.
 * Empty required cells are filled from the useful information in the same row so no
 * defined scenario is silently lost during import. */
export function parseExcelTestCases(workbook: XLSX.WorkBook): ImportedCase[] {
  const caseSheetName = workbook.SheetNames.find((name) => normaliseColumn(name) === "test cases")
    ?? workbook.SheetNames[0];
  const caseSheet = workbook.Sheets[caseSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(caseSheet, { defval: "" });
  if (!rows.length) throw new Error("The selected workbook has no test-case rows.");

  const stepsByCase = new Map<string, string[]>();
  const stepSheetName = workbook.SheetNames.find((name) => normaliseColumn(name) === "test steps");
  if (stepSheetName) {
    const stepRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[stepSheetName], { defval: "" });
    for (const row of stepRows) {
      const key = readImportCell(row, "caseKey") || readImportCell(row, "title");
      const step = readImportCell(row, "steps");
      if (key && step) stepsByCase.set(key.toLowerCase(), [...(stepsByCase.get(key.toLowerCase()) ?? []), step]);
    }
  }

  return rows.filter((row) => Object.values(row).some((value) => String(value).trim())).map((row, index) => {
    const inferred: string[] = [];
    const rowKey = readImportCell(row, "caseKey");
    const suppliedTitle = readImportCell(row, "title");
    const suppliedObjective = readImportCell(row, "objective");
    const suppliedExpected = readImportCell(row, "expectedResult");
    const inlineSteps = splitImportLines(readImportCell(row, "steps"));
    const linkedSteps = stepsByCase.get((rowKey || suppliedTitle).toLowerCase()) ?? [];
    const stepNotes = inlineSteps.length ? inlineSteps : linkedSteps;
    const rawTitle = suppliedTitle || suppliedObjective || stepNotes[0] || `Imported test case ${index + 1}`;
    const title = rawTitle.length < 3 ? `Test case: ${rawTitle}` : rawTitle;
    if (!suppliedTitle) inferred.push("Title");
    const objective = suppliedObjective.length >= 3
      ? suppliedObjective
      : suppliedObjective ? `Verify ${suppliedObjective}: ${title}` : `Verify: ${title}`;
    if (suppliedObjective.length < 3) inferred.push("Objective");
    const expectedResult = suppliedExpected
      ? suppliedExpected.length < 3 ? `Expected result: ${suppliedExpected}` : suppliedExpected
      : "";
    if (!suppliedExpected) inferred.push("Expected Result");
    if (!stepNotes.length) inferred.push("Steps");
    const kind = (readImportCell(row, "category") || rowKey).toUpperCase();
    return {
      rowNumber: index + 2,
      title,
      objective,
      expectedResult,
      category: /NEGATIVE|(?:^|[_\- ])NEG(?:$|[_\- ])/.test(kind) ? "NEGATIVE" : kind.includes("EDGE") ? "EDGE_CASE" : "POSITIVE",
      preconditions: splitImportLines(readImportCell(row, "preconditions")),
      stepNotes,
      input: readImportCell(row, "input"),
      scenario_name: readImportCell(row, "scenarioName"),
      source_case_id: rowKey,
      inferred,
      page: readImportCell(row, "page"), screen: readImportCell(row, "screen"), module: readImportCell(row, "moduleName"), url: readImportCell(row, "url"),
    };
  });
}

