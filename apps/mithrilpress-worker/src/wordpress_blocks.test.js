import assert from "node:assert/strict";
import test from "node:test";
import { collectWordPressMediaReferences, inspectWordPressBlocks } from "./wordpress_blocks.js";

test("summarizes static, layout, dynamic, and extension Gutenberg blocks", () => {
  const content = `
    <!-- wp:heading --><h2>News</h2><!-- /wp:heading -->
    <!-- wp:columns --><!-- wp:column --><p>Item</p><!-- /wp:column --><!-- /wp:columns -->
    <!-- wp:latest-posts /-->
    <!-- wp:sample/plugin-card {"id":17} /-->
  `;
  const report = inspectWordPressBlocks([content]);
  assert.equal(report.block_count, 5);
  assert.equal(report.block_type_counts["core/heading"], 1);
  assert.equal(report.block_type_counts["core/columns"], 1);
  assert.equal(report.block_type_counts["core/column"], 1);
  assert.equal(report.block_type_counts["core/latest-posts"], 1);
  assert.equal(report.block_type_counts["sample/plugin-card"], 1);
  assert.equal(report.static_blocks, 1);
  assert.equal(report.layout_degraded_blocks, 2);
  assert.equal(report.dynamic_blocks, 1);
  assert.equal(report.unknown_blocks, 1);
  assert.equal(report.needs_owner_review, true);
});

test("keeps ordinary HTML as a no-block content report", () => {
  const report = inspectWordPressBlocks(["<p>Static HTML without block comments.</p>"]);
  assert.equal(report.block_count, 0);
  assert.equal(report.needs_owner_review, false);
});

test("classifies core details disclosures as static Gutenberg content", () => {
  const report = inspectWordPressBlocks([
    '<!-- wp:details --><details open><summary>Answer</summary><p>Details</p></details><!-- /wp:details -->',
  ]);
  assert.equal(report.block_count, 1);
  assert.equal(report.static_blocks, 1);
  assert.equal(report.layout_degraded_blocks, 0);
  assert.equal(report.unknown_blocks, 0);
  assert.equal(report.needs_owner_review, false);
});

test("collects unique media IDs without exposing source URLs", () => {
  const result = collectWordPressMediaReferences([
    { sourceHtml: '<figure><img class="wp-image-12" src="https://wp.example/a.png"></figure>' },
    { sourceHtml: '<img class="alignleft wp-image-8 size-large"><img class="wp-image-12">' },
  ]);
  assert.deepEqual(result, { class_references: 3, source_ids: [8, 12] });
  assert.equal(JSON.stringify(result).includes("https://wp.example/a.png"), false);
});

test("collects featured WordPress media IDs for owner mapping", () => {
  const result = collectWordPressMediaReferences([
    { sourceHtml: '<img class="wp-image-12">', featuredMediaId: 22 },
    { sourceHtml: "<p>Text</p>", featuredMediaId: 12 },
  ]);

  assert.deepEqual(result, { class_references: 1, source_ids: [12, 22] });
});

test("does not treat closing block markers as new blocks", () => {
  const report = inspectWordPressBlocks([
    "<!-- wp:paragraph --><p>one</p><!-- /wp:paragraph --><!-- wp:paragraph /-->",
  ]);
  assert.equal(report.block_count, 2);
  assert.equal(report.block_type_counts["core/paragraph"], 2);
});

test("reports block type truncation without losing the omitted-type count", () => {
  const source = Array.from({ length: 120 }, (_, index) => `<!-- wp:plugin/block-${index} /-->`).join("");
  const report = inspectWordPressBlocks([source]);
  assert.equal(report.block_count, 120);
  assert.equal(report.type_counts_truncated, true);
  assert.ok(report.block_type_counts.other > 0);
});
