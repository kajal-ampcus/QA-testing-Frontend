import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { parseExcelTestCases } from "./excelImport.ts";

test("preserves tester case fields and separates numbered steps", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
    "Test Case ID": "REC_NEG_001", "Scenario Name": "Candidate ID filter",
    "Test Case Name": "Reject invalid candidate ID", "Preconditions": "Recruiter is signed in",
    "Repro Steps": "1. Enter an invalid ID. 2. Apply filter.", "Input": "Invalid candidate ID",
    "Expected Result": "No matching records are displayed.",
  }]), "Test Cases");
  const [item] = parseExcelTestCases(workbook);
  assert.equal(item.source_case_id, "REC_NEG_001");
  assert.equal(item.title, "Reject invalid candidate ID");
  assert.equal(item.scenario_name, "Candidate ID filter");
  assert.equal(item.category, "NEGATIVE");
  assert.deepEqual(item.stepNotes, ["Enter an invalid ID.", "Apply filter."]);
  assert.equal(item.input, "Invalid candidate ID");
  assert.equal(item.expectedResult, "No matching records are displayed.");
});

test("missing expected result is flagged instead of invented", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ "Test Case Name": "Check login" }]), "Sheet1");
  const [item] = parseExcelTestCases(workbook);
  assert.equal(item.expectedResult, "");
  assert.ok(item.inferred.includes("Expected Result"));
  assert.ok(item.inferred.includes("Steps"));
});
