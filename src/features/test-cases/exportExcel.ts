import type { Cell, SheetData } from "write-excel-file/browser";
import type { AppMap, Generation, Requirement, TestCase } from "../../types/api";

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

function dataRow(values: unknown[]): SheetData[number] {
  return values.map((value) => ({
    value: valueCell(value) as string | number | boolean,
    alignVertical: "top" as const,
    wrap: true,
  }));
}

function sheet(
  name: string,
  headers: string[],
  rows: unknown[][],
  widths: number[],
) {
  return {
    sheet: name,
    data: [headerRow(headers), ...rows.map(dataRow)],
    columns: widths.map((width) => ({ width })),
    stickyRowsCount: 1,
    showGridLines: false,
    zoomScale: 0.9,
  };
}

function flattenTestData(
  value: unknown,
  prefix = "",
): { key: string; value: unknown }[] {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length
  ) {
    return Object.entries(value).flatMap(([key, child]) =>
      flattenTestData(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [{ key: prefix || "value", value }];
}

export function buildReportSheets({
  tests,
  requirements,
  map,
  result,
}: {
  tests: TestCase[];
  requirements: Requirement[];
  map?: AppMap | null;
  result?: Generation;
}) {
  const requirementById = new Map(requirements.map((item) => [item.id, item]));
  const generatedAt = new Date().toISOString();
  const categories = [...new Set(tests.map((item) => item.current.category))]
    .map(
      (category) =>
        `${category}: ${tests.filter((item) => item.current.category === category).length}`,
    )
    .join(", ");

  const summaryRows: unknown[][] = [
    ["Report generated", generatedAt],
    ["Test cases", tests.length],
    ["Requirements", requirements.length],
    ["Categories", categories || "None"],
    ["Application map ID", map?.id || "Not available"],
    ["Application map version", map?.version ?? "Not available"],
    ["Application map status", map?.status || "Not available"],
    ["Application base URL", map?.base_url || "Not available"],
    ["Application states", map?.states.length ?? 0],
    ["Termination reason", map?.termination_reason || ""],
    ["Uncovered acceptance criteria", result?.uncovered_acs.join(", ") || "None"],
    ["Partial scenario pairing", result?.partial_pairing_acs.join(", ") || "None"],
    ["Tests requiring review", result?.needs_review_test_cases.join(", ") || "None"],
  ];

  const testRows = tests.map((test) => {
    const requirement = requirementById.get(test.requirement_id);
    return [
      test.tc_code,
      test.current.title,
      test.current.objective,
      test.current.category,
      test.status,
      test.current.confidence,
      requirement?.req_code || test.requirement_id,
      test.requirement_version,
      test.current.traceability.join(", "),
      test.current.preconditions.join("\n"),
      test.current.expected_result,
      test.application_map_id,
      test.current_version,
      test.role_name || "",
    ];
  });

  const stepRows = tests.flatMap((test) =>
    test.current.steps.map((step) => [
      test.tc_code,
      test.current.title,
      step.step_number,
      step.action,
      step.target.state_code || "",
      step.target.element_code || "",
      step.target.element_name || "",
      step.target.element_role || "",
      step.value || "",
      step.expected || "",
    ]),
  );

  const testDataRows = tests.flatMap((test) =>
    flattenTestData(test.current.test_data).map((entry) => [
      test.tc_code,
      test.current.title,
      entry.key,
      entry.value,
    ]),
  );

  const requirementRows = requirements.map((requirement) => [
    requirement.req_code,
    requirement.version,
    requirement.status,
    requirement.title,
    requirement.description,
    requirement.domain_tags.join(", "),
    requirement.ambiguities
      .map((item) => `${item.field}: ${item.issue}`)
      .join("\n"),
  ]);

  const acceptanceRows = requirements.flatMap((requirement) =>
    requirement.acceptance_criteria.map((criterion) => [
      requirement.req_code,
      requirement.version,
      criterion.id,
      criterion.text,
      criterion.source,
    ]),
  );

  const stateRows = (map?.states || []).map((state) => [
    state.state_code,
    state.url_pattern,
    state.reached_via.join("\n"),
    state.elements.length,
    state.evidence_ref || "",
  ]);

  const elementRows = (map?.states || []).flatMap((state) =>
    state.elements.map((element) => [
      state.state_code,
      state.url_pattern,
      element.element_code || "",
      element.role || "",
      element.name || "",
      element.risk || "",
      element.source || "",
      element.locator || element.dom_id || "",
      element.input_type || "",
      element.required ?? "",
      element.disabled ?? "",
      element.visible ?? "",
      element.url || "",
    ]),
  );

  return [
    sheet("Summary", ["Metric", "Value"], summaryRows, [31, 85]),
    sheet(
      "Test Cases",
      [
        "Test Case",
        "Title",
        "Objective",
        "Category",
        "Status",
        "Confidence",
        "Requirement",
        "Requirement Version",
        "Traceability",
        "Preconditions",
        "Expected Result",
        "Application Map ID",
        "Test Version",
        "Role",
      ],
      testRows,
      [14, 40, 50, 15, 15, 14, 18, 18, 25, 48, 50, 38, 14, 18],
    ),
    sheet(
      "Test Steps",
      [
        "Test Case",
        "Title",
        "Step",
        "Action",
        "State",
        "Element",
        "Element Name",
        "Element Role",
        "Value",
        "Expected",
      ],
      stepRows,
      [14, 38, 9, 14, 14, 14, 28, 18, 35, 55],
    ),
    sheet(
      "Test Data",
      ["Test Case", "Title", "Data Key", "Value"],
      testDataRows,
      [14, 40, 35, 60],
    ),
    sheet(
      "Requirements",
      ["Requirement", "Version", "Status", "Title", "Description", "Tags", "Ambiguities"],
      requirementRows,
      [18, 12, 18, 40, 80, 28, 65],
    ),
    sheet(
      "Acceptance Criteria",
      ["Requirement", "Version", "Criterion", "Text", "Source"],
      acceptanceRows,
      [18, 12, 18, 85, 20],
    ),
    sheet(
      "Map States",
      ["State", "URL Pattern", "Reached Via", "Element Count", "Screenshot Evidence"],
      stateRows,
      [15, 45, 75, 16, 75],
    ),
    sheet(
      "Map Elements",
      [
        "State",
        "URL Pattern",
        "Element",
        "Role",
        "Name",
        "Risk",
        "Source",
        "Locator / DOM ID",
        "Input Type",
        "Required",
        "Disabled",
        "Visible",
        "Target URL",
      ],
      elementRows,
      [15, 38, 14, 18, 45, 15, 22, 35, 16, 12, 12, 12, 55],
    ),
  ];
}

export async function exportCompleteExcelReport(input: {
  tests: TestCase[];
  requirements: Requirement[];
  map?: AppMap | null;
  result?: Generation;
}) {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const date = new Date().toISOString().slice(0, 10);
  await writeExcelFile(buildReportSheets(input), {
    fontFamily: "Arial",
    fontSize: 10,
  }).toFile(`qa-complete-report-${date}.xlsx`);
}
