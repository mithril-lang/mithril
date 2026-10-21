import assert from "node:assert/strict";
import test from "node:test";
import { selectWordPressSeoMetadata } from "./wordpress_seo.js";

test("selects only bounded Yoast and Rank Math static text fields", () => {
  const selected = selectWordPressSeoMetadata({
    _yoast_wpseo_title: "News & updates",
    _yoast_wpseo_metadesc: "A safe description",
    _thumbnail_id: "12",
    _private_internal_note: "private source metadata",
  });
  assert.deepEqual(selected, {
    metadata: {
      _yoast_wpseo_title: "News & updates",
      _yoast_wpseo_metadesc: "A safe description",
    },
    omittedFields: 1,
  });
});

test("selects Rank Math text when it is the only SEO plugin represented", () => {
  const selected = selectWordPressSeoMetadata({
    rank_math_title: "Alternate title",
    rank_math_description: "Alternate description",
  });
  assert.deepEqual(selected, {
    metadata: {
      rank_math_title: "Alternate title",
      rank_math_description: "Alternate description",
    },
    omittedFields: 0,
  });
});

test("omits dynamic templates, controls, and ambiguous duplicate values", () => {
  const selected = selectWordPressSeoMetadata([
    { key: "_yoast_wpseo_title", value: "%%title%% %%sep%% %%sitename%%" },
    { key: "rank_math_description", value: "first" },
    { key: "rank_math_description", value: "second" },
    { key: "_yoast_wpseo_metadesc", value: "line one\nline two" },
  ]);
  assert.deepEqual(selected, { metadata: {}, omittedFields: 4 });
});

test("does not guess which SEO plugin owns mixed metadata", () => {
  const selected = selectWordPressSeoMetadata({
    _yoast_wpseo_title: "Yoast title",
    rank_math_description: "Rank Math description",
  });
  assert.deepEqual(selected, { metadata: {}, omittedFields: 2 });
});

test("bounds per-record metadata inspection", () => {
  const meta = Object.fromEntries(Array.from({ length: 129 }, (_, index) => [`field_${index}`, "x"]));
  assert.throws(() => selectWordPressSeoMetadata(meta), { code: "wordpress_meta_limit_exceeded", status: 413 });
});
