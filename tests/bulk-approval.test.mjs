import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/api/client.ts", import.meta.url), "utf8").replaceAll("import.meta.env", "({})");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { api } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("bulk approval submits all 451 cases within API limits and aggregates failures", async () => {
  const original = globalThis.fetch;
  const batches = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    batches.push(body.test_case_ids);
    return Response.json({ approved: body.test_case_ids.length - 1, skipped: 0, failed: [{ test_case_id: body.test_case_ids[0], error: "Needs review" }], test_cases: [] });
  };
  try {
    const ids = Array.from({ length: 451 }, (_, i) => `test-${i}`);
    const result = await api.bulkReviewTests("project", { decided_by: "Reviewer", test_case_ids: [...ids, ids[0]] });
    assert.deepEqual(batches.map(batch => batch.length), [200, 200, 51]);
    assert.deepEqual(batches.flat(), ids);
    assert.equal(result.approved, 448);
    assert.equal(result.failed.length, 3);
    await assert.rejects(api.bulkReviewTests("project", { decided_by: "Reviewer", test_case_ids: [] }), /Select at least one/);
    assert.equal(batches.length, 3);
  } finally { globalThis.fetch = original; }
});
