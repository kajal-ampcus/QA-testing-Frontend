export type InputRequirement = {
  test_case_id: string;
  missing: boolean;
  runtime_only: boolean;
};

export function testDataReadiness(rows: InputRequirement[]) {
  const formRows = rows.filter((row) => !row.runtime_only);
  const missing = formRows.filter((row) => row.missing);
  return {
    fieldCount: formRows.length,
    missingCount: missing.length,
    caseCount: new Set(missing.map((row) => row.test_case_id)).size,
  };
}
