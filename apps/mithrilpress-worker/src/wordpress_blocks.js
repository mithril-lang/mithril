import { instantiateMithrilNative as instantiateWordPressBlockPolicy } from "./wordpress_block_policy.js";
const CORE_STATIC_BLOCKS = new Set([
  "core/paragraph", "core/heading", "core/list", "core/list-item", "core/quote",
  "core/pullquote", "core/code", "core/preformatted", "core/separator",
  "core/table", "core/html", "core/freeform", "core/verse", "core/image",
  "core/details",
]);

const CORE_LAYOUT_BLOCKS = new Set([
  "core/group", "core/columns", "core/column", "core/buttons", "core/button",
  "core/gallery", "core/cover", "core/media-text", "core/spacer",
]);

const CORE_DYNAMIC_BLOCKS = new Set([
  "core/latest-posts", "core/query", "core/query-title", "core/post-template",
  "core/post-title", "core/post-content", "core/post-date", "core/post-author",
  "core/post-excerpt", "core/post-featured-image", "core/site-title", "core/site-tagline",
  "core/site-logo", "core/navigation", "core/search", "core/widget-area",
  "core/legacy-widget", "core/shortcode", "core/embed", "core/audio", "core/video",
  "core/file", "core/block",
]);

const BLOCK_COMMENT = /<!--\s*(\/?)wp:([a-z0-9_-]+(?:\/[a-z0-9_-]+)?)([\s\S]*?)-->/gi;
const WORDPRESS_IMAGE_ID = /\bwp-image-([0-9]{1,15})\b/g;
const MAX_BLOCK_MARKERS_PER_IMPORT = 20_000;
const MAX_BLOCK_TYPES = 100;
export const MAX_WORDPRESS_MEDIA_IDS_PER_IMPORT = 5_000;
const wordPressBlockPolicy = instantiateWordPressBlockPolicy({});

function countType(target, name) {
  if (Object.hasOwn(target, name)) {
    target[name] += 1;
  } else if (Object.keys(target).length < MAX_BLOCK_TYPES) {
    target[name] = 1;
  } else {
    target.other += 1;
  }
}

/** Summarize serialized Gutenberg blocks without rendering or executing block code. */
export function inspectWordPressBlocks(sources) {
  const report = {
    format: "wordpress-gutenberg-comment-markup",
    block_count: 0,
    block_type_counts: { other: 0 },
    type_counts_truncated: false,
    static_blocks: 0,
    layout_degraded_blocks: 0,
    layout_degraded_types: { other: 0 },
    dynamic_blocks: 0,
    dynamic_types: { other: 0 },
    unknown_blocks: 0,
    unknown_types: { other: 0 },
    scan_truncated: false,
    needs_owner_review: false,
  };

  if (!Array.isArray(sources)) return report;
  let scanned = 0;
  outer: for (const source of sources) {
    if (typeof source !== "string") continue;
    for (const match of source.matchAll(BLOCK_COMMENT)) {
      if (match[1] === "/") continue;
      if (scanned >= MAX_BLOCK_MARKERS_PER_IMPORT) {
        report.scan_truncated = true;
        break outer;
      }
      scanned += 1;
      report.block_count += 1;
      const name = wordPressBlockPolicy.normalizeWordPressBlockName(match[2]);
      countType(report.block_type_counts, name);
      const classification = wordPressBlockPolicy.classifyWordPressBlock(name);
      if (classification === "static") {
        report.static_blocks += 1;
      } else if (classification === "layout-degraded") {
        report.layout_degraded_blocks += 1;
        countType(report.layout_degraded_types, name);
      } else if (classification === "dynamic") {
        report.dynamic_blocks += 1;
        countType(report.dynamic_types, name);
      } else {
        report.unknown_blocks += 1;
        countType(report.unknown_types, name);
      }
    }
  }

  report.type_counts_truncated = report.block_type_counts.other > 0
    || report.layout_degraded_types.other > 0
    || report.dynamic_types.other > 0
    || report.unknown_types.other > 0;
  report.needs_owner_review = report.scan_truncated
    || report.layout_degraded_blocks > 0
    || report.dynamic_blocks > 0
    || report.unknown_blocks > 0;
  return report;
}

/** Collect owner-supplied WordPress media IDs from image class markers. */
export function collectWordPressMediaReferences(records) {
  const sourceIds = new Set();
  let classReferences = 0;
  for (const record of records ?? []) {
    const source = typeof record?.sourceHtml === "string" ? record.sourceHtml : "";
    const featuredMediaId = record?.featuredMediaId;
    if (Number.isSafeInteger(featuredMediaId) && featuredMediaId > 0) {
      sourceIds.add(featuredMediaId);
    }
    for (const match of source.matchAll(WORDPRESS_IMAGE_ID)) {
      classReferences += 1;
      const id = Number(match[1]);
      if (!Number.isSafeInteger(id) || id <= 0) continue;
      sourceIds.add(id);
      if (sourceIds.size > MAX_WORDPRESS_MEDIA_IDS_PER_IMPORT) {
        throw Object.assign(new Error(), {
          status: 413,
          code: "wordpress_media_reference_limit_exceeded",
        });
      }
    }
  }
  return {
    class_references: classReferences,
    source_ids: [...sourceIds].sort((left, right) => left - right),
  };
}
