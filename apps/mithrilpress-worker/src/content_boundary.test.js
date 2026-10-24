import assert from "node:assert/strict";
import test from "node:test";
import { instantiateMithrilNative as instantiateContentBoundary } from "./content_boundary.js";

const boundary = instantiateContentBoundary({ Array, Map, Number, Set });
const fail = (code) => {
  throw Object.assign(new Error(code), { code });
};

test("Mithril maps only requested owner media IDs and returns missing IDs for review", () => {
  const mediaRows = [
    { id: 101, wordpress_source_id: 101 },
    { id: 202, wordpress_source_id: 202 },
  ];

  const result = boundary.mapWordPressMediaReferences([101, 202, 303], mediaRows, 5_000, fail);

  assert.deepEqual(result.mappedSourceIds, [101, 202]);
  assert.deepEqual(result.unmappedSourceIds, [303]);
  assert.equal(result.reviewRequired, true);
  assert.equal(result.bySourceId.get(101), mediaRows[0]);
});

test("Mithril rejects ambiguous duplicate owner media mappings", () => {
  assert.throws(
    () => boundary.mapWordPressMediaReferences(
      [101],
      [
        { id: 101, wordpress_source_id: 101 },
        { id: 102, wordpress_source_id: 101 },
      ],
      5_000,
      fail,
    ),
    (error) => error.code === "duplicate_wordpress_media_mapping",
  );
});

test("Mithril media reference mapping honors the import's 5,000-reference cap", () => {
  const ids = Array.from({ length: 1_001 }, (_, index) => index + 1);
  const result = boundary.mapWordPressMediaReferences(ids, [], 5_000, fail);

  assert.equal(result.unmappedSourceIds.length, 1_001);
  assert.equal(result.reviewRequired, true);
});
