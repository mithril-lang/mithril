import assert from "node:assert/strict";
import test from "node:test";
import { buildWordPressPermalinkMap, rewriteWordPressLink } from "./wordpress_links.js";

const sourceOrigin = "https://wp.example";
const siteHostname = "migrated.sites.mithril.love";
const records = [
  { kind: "page", slug: "home", sourcePermalink: "https://wp.example/" },
  { kind: "post", slug: "article", sourcePermalink: "https://wp.example/2026/article/" },
];

test("maps imported source permalinks to MithrilPress canonical routes", () => {
  const permalinkMap = buildWordPressPermalinkMap(records, sourceOrigin, siteHostname);
  const result = rewriteWordPressLink("https://wp.example/2026/article/#summary", {
    sourceOrigin,
    sourcePermalink: "https://wp.example/other/",
    permalinkMap,
  });
  assert.deepEqual(result, {
    href: "https://migrated.sites.mithril.love/article/#summary",
    sourceSite: true,
    rewritten: true,
    unresolved: false,
    removed: false,
  });
});

test("maps relative links against the current source permalink", () => {
  const permalinkMap = buildWordPressPermalinkMap(records, sourceOrigin, siteHostname);
  const result = rewriteWordPressLink("../../article/", {
    sourceOrigin,
    sourcePermalink: "https://wp.example/2026/section/page/",
    permalinkMap,
  });
  assert.equal(result.href, "https://migrated.sites.mithril.love/article/");
  assert.equal(result.rewritten, true);
});

test("rewrites source permalinks with tracking query parameters and preserves the tracking data", () => {
  const permalinkMap = buildWordPressPermalinkMap(records, sourceOrigin, siteHostname);
  const result = rewriteWordPressLink("https://wp.example/2026/article/?utm_source=old#summary", {
    sourceOrigin,
    sourcePermalink: "https://wp.example/other/",
    permalinkMap,
  });
  assert.equal(result.href, "https://migrated.sites.mithril.love/article/?utm_source=old#summary");
  assert.equal(result.rewritten, true);
});

test("reports an unresolved source-site link while preserving its safe destination", () => {
  const permalinkMap = buildWordPressPermalinkMap(records, sourceOrigin, siteHostname);
  const result = rewriteWordPressLink("/not-imported/", {
    sourceOrigin,
    sourcePermalink: "https://wp.example/2026/article/",
    permalinkMap,
  });
  assert.equal(result.href, "https://wp.example/not-imported/");
  assert.equal(result.sourceSite, true);
  assert.equal(result.unresolved, true);
});

test("preserves external HTTPS links and in-page fragments", () => {
  const permalinkMap = buildWordPressPermalinkMap(records, sourceOrigin, siteHostname);
  assert.equal(rewriteWordPressLink("https://docs.example/help", {
    sourceOrigin, permalinkMap,
  }).href, "https://docs.example/help");
  assert.equal(rewriteWordPressLink("#section", { sourceOrigin, permalinkMap }).href, "#section");
});

test("removes unsafe schemes and does not map a duplicate source permalink", () => {
  const permalinkMap = buildWordPressPermalinkMap([
    ...records,
    { kind: "post", slug: "another", sourcePermalink: "https://wp.example/2026/article/" },
  ], sourceOrigin, siteHostname);
  assert.equal(rewriteWordPressLink("javascript:alert(1)", { sourceOrigin, permalinkMap }).removed, true);
  const duplicate = rewriteWordPressLink("/2026/article/", { sourceOrigin, permalinkMap });
  assert.equal(duplicate.rewritten, false);
  assert.equal(duplicate.unresolved, true);
});
