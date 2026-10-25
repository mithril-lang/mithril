import assert from "node:assert/strict";
import test from "node:test";
import { instantiateMithrilNative as instantiateWordPressPageHierarchy } from "./wordpress_page_hierarchy.js";

const mithrilWordPressPageHierarchy = instantiateWordPressPageHierarchy({ Array, Map, Set });
const { matchesPageHierarchyReadback } = mithrilWordPressPageHierarchy;

test("preserves valid WordPress page parents and omits non-page, missing, and self parents", () => {
  const entries = [
    { entryId: "wordpress:page:103", kind: "page", sourceId: 103, parentSourceId: 102 },
    { entryId: "wordpress:page:102", kind: "page", sourceId: 102, parentSourceId: null },
    { entryId: "wordpress:post:105", kind: "post", sourceId: 105, parentSourceId: 102 },
    { entryId: "wordpress:page:106", kind: "page", sourceId: 106, parentSourceId: 999 },
    { entryId: "wordpress:page:107", kind: "page", sourceId: 107, parentSourceId: 107 },
  ];

  assert.deepEqual(mithrilWordPressPageHierarchy.preserveWordPressPageParents(entries), {
    preserved: 1,
    omitted: 3,
  });
  assert.equal(entries[0].parentSourceId, 102);
  assert.equal(entries[2].parentSourceId, null);
  assert.equal(entries[3].parentSourceId, null);
  assert.equal(entries[4].parentSourceId, null);
});

test("omits only the cyclic WordPress page-parent edges", () => {
  const entries = [
    { entryId: "wordpress:page:1", kind: "page", sourceId: 1, parentSourceId: 2 },
    { entryId: "wordpress:page:2", kind: "page", sourceId: 2, parentSourceId: 3 },
    { entryId: "wordpress:page:3", kind: "page", sourceId: 3, parentSourceId: 2 },
  ];

  assert.deepEqual(mithrilWordPressPageHierarchy.preserveWordPressPageParents(entries), {
    preserved: 1,
    omitted: 2,
  });
  assert.equal(entries[0].parentSourceId, 2);
  assert.equal(entries[1].parentSourceId, null);
  assert.equal(entries[2].parentSourceId, null);
});

test("bounds preserved WordPress page-parent depth to 64", () => {
  const entries = Array.from({ length: 66 }, (_, index) => ({
    entryId: `wordpress:page:${index + 1}`,
    kind: "page",
    sourceId: index + 1,
    parentSourceId: index === 0 ? null : index,
  }));

  assert.deepEqual(mithrilWordPressPageHierarchy.preserveWordPressPageParents(entries), {
    preserved: 64,
    omitted: 1,
  });
  assert.equal(entries[1].parentSourceId, null);
  assert.equal(entries[65].parentSourceId, 65);
});

test("accepts exact WordPress page hierarchy readback without relying on affected-row metadata", () => {
  const expected = [
    { entryId: "wordpress:page:103", parentSourceId: 102 },
    { entryId: "wordpress:page:104", parentSourceId: 102 },
  ];
  const actual = [
    { entry_id: "wordpress:page:103", parent_source_id: 102 },
    { entry_id: "wordpress:page:104", parent_source_id: 102 },
  ];

  assert.equal(matchesPageHierarchyReadback(expected, actual), true);
});

test("rejects missing, extra, duplicate, and mismatched hierarchy rows", () => {
  const expected = [{ entryId: "wordpress:page:103", parentSourceId: 102 }];

  assert.equal(matchesPageHierarchyReadback(expected, []), false);
  assert.equal(matchesPageHierarchyReadback(expected, [
    { entry_id: "wordpress:page:103", parent_source_id: 102 },
    { entry_id: "wordpress:page:104", parent_source_id: 102 },
  ]), false);
  assert.equal(matchesPageHierarchyReadback(expected, [
    { entry_id: "wordpress:page:103", parent_source_id: 101 },
  ]), false);
  assert.equal(matchesPageHierarchyReadback([
    ...expected,
    { entryId: "wordpress:page:103", parentSourceId: 102 },
  ], [
    { entry_id: "wordpress:page:103", parent_source_id: 102 },
    { entry_id: "wordpress:page:103", parent_source_id: 102 },
  ]), false);
  assert.equal(matchesPageHierarchyReadback([
    { entryId: "wordpress:page:103", parentSourceId: 102 },
    { entryId: "wordpress:page:104", parentSourceId: 102 },
  ], [
    { entry_id: "wordpress:page:103", parent_source_id: 102 },
    { entry_id: "wordpress:page:103", parent_source_id: 102 },
  ]), false);
});
