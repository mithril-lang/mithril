import assert from "node:assert/strict";
import test from "node:test";
import { instantiateMithrilNative as instantiateWordPressPageHierarchy } from "./wordpress_page_hierarchy.js";

const mithrilWordPressPageHierarchy = instantiateWordPressPageHierarchy({ Array, Map, Set });
const { matchesPageHierarchyReadback } = mithrilWordPressPageHierarchy;

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
