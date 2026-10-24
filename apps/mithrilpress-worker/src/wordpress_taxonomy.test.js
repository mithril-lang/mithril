import assert from "node:assert/strict";
import test from "node:test";
import { instantiateMithrilNative as instantiateWordPressTaxonomy } from "./wordpress_taxonomy.js";

const policy = instantiateWordPressTaxonomy({ Map, Set });
const fail = (code) => {
  throw Object.assign(new Error(code), { code });
};

test("Mithril WXR term policy keeps standard category/tag references and counts custom taxonomies", () => {
  const terms = new Map([
    ["category:news", 7],
    ["tag:security", 9],
  ]);

  const result = policy.normalizeTermReferences([
    { domain: "CATEGORY", slug: "news" },
    { domain: "category", slug: "news" },
    { domain: "post_tag", slug: "security" },
    { domain: "genre", slug: "essay" },
  ], terms, fail);

  assert.deepEqual(result, {
    categories: [7],
    tags: [9],
    customTaxonomyTerms: 1,
  });
});

test("Mithril WXR term policy rejects an unresolved standard term reference", () => {
  assert.throws(
    () => policy.normalizeTermReferences([{ domain: "category", slug: "missing" }], new Map(), fail),
    (error) => error.code === "unresolved_wxr_term",
  );
});
