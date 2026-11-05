import assert from "node:assert/strict";
import { test } from "node:test";
import { generateBatch, generationTargets } from "./generationBatch.ts";
import type { Generation } from "../../types/api.ts";

function result(): Generation {
  return { generated: 1, test_cases: [], uncovered_acs: ["AC-1"], partial_pairing_acs: [], needs_review_test_cases: [] };
}

test("adding approved Feedback keeps Login and excludes pending or foreign requirements", () => {
  assert.deepEqual(generationTargets([
    { state_code: "home", requirements: [{ id: "login", status: "APPROVED" }] },
    { state_code: "feedback", requirements: [{ id: "feedback", status: "APPROVED" }, { id: "pending", status: "PENDING_APPROVAL" }] },
    { state_code: "login", requirements: [{ id: "login", status: "APPROVED" }, { id: "foreign", status: "APPROVED" }] },
  ], ["login", "feedback", "pending"]), [
    { requirementId: "login", stateCodes: ["home", "login"] },
    { requirementId: "feedback", stateCodes: ["feedback"] },
  ]);
});

test("one action processes both requirements without merging their AC identifiers", async () => {
  const visited: string[] = [];
  const combined = await generateBatch(["login", "feedback"].map(requirementId => ({ requirementId, stateCodes: [requirementId] })), async target => {
    visited.push(target.requirementId);
    return result();
  });
  assert.deepEqual(visited, ["login", "feedback"]);
  assert.equal(combined.generated, 2);
  assert.deepEqual(combined.uncovered_acs, ["login/AC-1", "feedback/AC-1"]);
  assert.deepEqual(combined.requirement_ids, ["login", "feedback"]);
});

test("partial failures retain successful groups and do not skip the next group", async () => {
  const visited: string[] = [];
  const combined = await generateBatch(["first", "failed", "last"].map(requirementId => ({ requirementId, stateCodes: [requirementId] })), async target => {
    visited.push(target.requirementId);
    if (target.requirementId === "failed") throw new Error("Version changed");
    return result();
  });
  assert.equal(combined.generated, 2);
  assert.deepEqual(visited, ["first", "failed", "last"]);
  assert.match(combined.validation_issues!.join(" "), /failed: Version changed/);
});

test("single-requirement generation retains the existing AC keys", async () => {
  const combined = await generateBatch([{ requirementId: "login", stateCodes: ["login"] }], async () => result());
  assert.deepEqual(combined.uncovered_acs, ["AC-1"]);
  await assert.rejects(generateBatch([], async () => result()), /approved requirements/);
});
