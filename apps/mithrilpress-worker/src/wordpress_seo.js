const WORDPRESS_SEO_META_KEYS = new Set([
  "_yoast_wpseo_title",
  "_yoast_wpseo_metadesc",
  "rank_math_title",
  "rank_math_description",
]);
const MAX_META_FIELDS_PER_RECORD = 128;
const MAX_SEO_TITLE_CHARS = 500;
const MAX_SEO_DESCRIPTION_CHARS = 2_000;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const TEMPLATE_TOKEN = /%[^%\s]{1,100}%/;

function entriesFrom(value) {
  if (Array.isArray(value)) {
    if (value.length > MAX_META_FIELDS_PER_RECORD) {
      throw Object.assign(new Error(), { status: 413, code: "wordpress_meta_limit_exceeded" });
    }
    return value.map((field) => [field?.key, field?.value]);
  }
  if (value === null || value === undefined) return [];
  if (typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return [];
  const entries = Object.entries(value);
  if (entries.length > MAX_META_FIELDS_PER_RECORD) {
    throw Object.assign(new Error(), { status: 413, code: "wordpress_meta_limit_exceeded" });
  }
  return entries;
}

/** Keep only bounded, static SEO text from a small explicit plugin allowlist. */
export function selectWordPressSeoMetadata(value) {
  const selected = {};
  const seen = new Set();
  const ambiguous = new Set();
  let omittedFields = 0;

  for (const [rawKey, rawValue] of entriesFrom(value)) {
    const key = typeof rawKey === "string" ? rawKey.trim() : "";
    if (key === "_thumbnail_id" || (!key && rawValue === "")) continue;
    if (!WORDPRESS_SEO_META_KEYS.has(key)) {
      if (rawValue !== "" && rawValue !== null && rawValue !== undefined) omittedFields += 1;
      continue;
    }
    if (seen.has(key)) {
      if (Object.hasOwn(selected, key)) omittedFields += 1;
      ambiguous.add(key);
      delete selected[key];
      omittedFields += 1;
      continue;
    }
    seen.add(key);
    const limit = key.endsWith("_title") ? MAX_SEO_TITLE_CHARS : MAX_SEO_DESCRIPTION_CHARS;
    if (typeof rawValue !== "string" || rawValue.length > limit
        || CONTROL_CHARACTER.test(rawValue) || TEMPLATE_TOKEN.test(rawValue)) {
      if (rawValue !== "" && rawValue !== null && rawValue !== undefined) omittedFields += 1;
      continue;
    }
    const text = rawValue.trim();
    if (text) selected[key] = text;
  }

  for (const key of ambiguous) delete selected[key];
  const hasYoast = Object.keys(selected).some((key) => key.startsWith("_yoast_wpseo_"));
  const hasRankMath = Object.keys(selected).some((key) => key.startsWith("rank_math_"));
  if (hasYoast && hasRankMath) {
    omittedFields += Object.keys(selected).length;
    for (const key of Object.keys(selected)) delete selected[key];
  }
  return { metadata: selected, omittedFields };
}
