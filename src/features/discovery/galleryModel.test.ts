import assert from "node:assert/strict";
import test from "node:test";

import { collectShots, duplicateIds, filterShots, groupShots } from "./galleryModel.ts";

const base = {
  states: [
    {
      fingerprint: "fp-new",
      url_pattern: "/orders",
      reached_via: ["click Orders"],
      evidence_ref: "/evidence/a.png",
      evidence_sha256: "hash-a",
    },
    {
      fingerprint: "fp-same",
      url_pattern: "/home",
      reached_via: ["ROOT"],
      evidence_ref: "/evidence/b.png",
      evidence_sha256: "hash-b",
    },
    {
      fingerprint: "fp-same",
      url_pattern: "/home",
      reached_via: ["ROOT"],
      evidence_ref: "/evidence/c.png",
      evidence_sha256: "hash-b",
    },
  ],
  coverage: {
    screen_delta: {
      new: [{ fingerprint: "fp-new", page_key: "/orders" }],
      changed: [],
      unchanged: [{ fingerprint: "fp-same", page_key: "/home" }],
    },
  },
  reviewed: ["fp-same"],
};

test("same image and fingerprint group as duplicates while a different fingerprint stays distinct", () => {
  const shots = collectShots(base);
  const duplicates = duplicateIds(shots);
  assert.equal(duplicates.size, 1);
  const distinct = collectShots({
    states: [
      {
        fingerprint: "one",
        url_pattern: "/a",
        evidence_ref: "/evidence/same.png",
        evidence_sha256: "shared",
      },
      {
        fingerprint: "two",
        url_pattern: "/b",
        evidence_ref: "/evidence/same.png",
        evidence_sha256: "shared",
      },
    ],
  });
  assert.equal(duplicateIds(distinct).size, 0);
});

test("filters prioritize new and changed screens and collapse reviewed ones", () => {
  const shots = collectShots(base);
  const duplicates = duplicateIds(shots);
  assert.equal(filterShots(shots, "new", duplicates).length, 1);
  assert.equal(filterShots(shots, "needs_review", duplicates).every((shot) => !shot.reviewed), true);
  const groups = groupShots(shots, "page");
  assert.ok(groups.some((group) => group.key === "/orders"));
});
