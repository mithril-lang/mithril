import { SaxesParser } from "saxes";
import { instantiateMithrilNative as instantiateContentBoundary } from "./content_boundary.js";
import { instantiateMithrilNative as instantiateWordPressTaxonomy } from "./wordpress_taxonomy.js";
import { selectWordPressSeoMetadata } from "./wordpress_seo.js";

const MAX_WXR_BYTES = 12_000_000;
const MAX_WXR_DEPTH = 64;
const MAX_WXR_NODES = 100_000;
const MAX_WXR_ITEMS = 2_000;
const MAX_IMPORTED_ENTRIES = 500;
const MAX_IMPORTED_TERMS = 5_000;
const MAX_IMPORTED_TERM_BYTES = 1_000_000;
const MAX_TERM_NAME_CHARS = 500;
const MAX_TERM_DESCRIPTION_CHARS = 20_000;
const TERM_SLUG = /^[^/?#\\\u0000-\u001f\u007f]{1,200}$/;
const MAX_NODE_TEXT_CHARS = 250_000;
const MAX_ATTRIBUTES_PER_ELEMENT = 64;
const MAX_ATTRIBUTE_NAME_CHARS = 256;
const MAX_ATTRIBUTE_VALUE_CHARS = 8_192;
const POST_TYPES = new Set(["post", "page"]);
const FIELD_NAMES = new Map([
  ["title", "title"],
  ["link", "link"],
  ["wp:post_id", "postId"],
  ["wp:post_type", "postType"],
  ["wp:status", "status"],
  ["wp:post_name", "slug"],
  ["wp:post_date", "date"],
  ["wp:post_date_gmt", "dateGmt"],
  ["wp:post_modified", "modified"],
  ["wp:post_modified_gmt", "modifiedGmt"],
  ["wp:post_parent", "parentId"],
  ["wp:post_password", "password"],
  ["content:encoded", "content"],
  ["wp:attachment_url", "attachmentUrl"],
]);
const mithrilContentBoundary = instantiateContentBoundary({ Array, Number, Set });
const mithrilWordPressTaxonomy = instantiateWordPressTaxonomy({ Map, Set });

function fail(code, status = 422) {
  throw Object.assign(new Error(code), { code, status });
}

function localName(name) {
  const separator = name.lastIndexOf(":");
  return (separator < 0 ? name : name.slice(separator + 1)).toLowerCase();
}

function parseId(value) {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,14}$/.test(value.trim())) return null;
  const id = Number(value.trim());
  return Number.isSafeInteger(id) ? id : null;
}

function positiveNumberOrZero(value) {
  const normalized = typeof value === "string" ? value.trim() : value;
  if (normalized === undefined || normalized === "" || normalized === "0") return 0;
  return parseId(normalized) ?? null;
}

function setUniqueField(fields, key, value) {
  if (Object.hasOwn(fields, key)) fail("duplicate_wxr_field");
  fields[key] = value;
}

function putTerm(terms, termRecords, termRecordsById, node) {
  const kind = node.termKind;
  const taxonomy = kind === "category" ? "category" : "post_tag";
  const id = parseId(node.fields.term_id);
  const slug = kind === "category" ? node.fields.category_nicename : node.fields.tag_slug;
  const name = kind === "category" ? node.fields.cat_name : node.fields.tag_name;
  const description = (kind === "category" ? node.fields.category_description : node.fields.tag_description) ?? "";
  const parentSlug = kind === "category" ? node.fields.category_parent?.trim() ?? "" : "";
  if (typeof slug !== "string" || !slug.trim() || !TERM_SLUG.test(slug.trim()) || slug.length > 200 || !id
      || typeof name !== "string" || !name.trim() || name.length > MAX_TERM_NAME_CHARS
      || typeof description !== "string" || description.length > MAX_TERM_DESCRIPTION_CHARS
      || (parentSlug && !TERM_SLUG.test(parentSlug)) || parentSlug.length > 200) {
    fail("invalid_wxr_term");
  }
  const key = `${kind}:${slug.trim()}`;
  const previous = terms.get(key);
  if (previous !== undefined && previous !== id) fail("duplicate_wxr_term");
  terms.set(key, id);
  const idKey = `${taxonomy}:${id}`;
  const existing = termRecordsById.get(idKey);
  if (existing) {
    if (existing.slug !== slug.trim() || existing.name !== name.trim()
        || existing.description !== description.trim() || existing.parentSlug !== parentSlug) {
      fail("duplicate_wxr_term");
    }
    return;
  }
  if (termRecords.length >= MAX_IMPORTED_TERMS) fail("wxr_term_limit_exceeded", 413);
  const term = {
    id,
    taxonomy,
    slug: slug.trim(),
    name: name.trim(),
    description: description.trim(),
    parentSlug,
    parentId: 0,
  };
  termRecords.push(term);
  termRecordsById.set(idKey, term);
}

function resolveTermParents(termRecords, terms) {
  return mithrilWordPressTaxonomy.resolveTermParents(termRecords, terms, fail);
}

function completeItem(node, pendingItems) {
  if (pendingItems.length >= MAX_WXR_ITEMS) fail("wxr_item_limit_exceeded", 413);
  pendingItems.push(node);
}

function importRecords(pendingItems, terms, omittedSourceCounts) {
  const records = [];
  const omitted = {
    unsupported_post_types: 0,
    attachments: 0,
    password_protected_entries: 0,
    authors: omittedSourceCounts.authors,
    comments: omittedSourceCounts.comments,
    custom_taxonomy_terms: 0,
    parent_page_relations: 0,
    custom_fields: 0,
    media_references: 0,
  };

  for (const item of pendingItems) {
    const fields = item.fields;
    const type = fields.postType?.trim();
    if (type === "attachment") {
      omitted.attachments += 1;
      continue;
    }
    if (!POST_TYPES.has(type)) {
      omitted.unsupported_post_types += 1;
      continue;
    }
    if (fields.password?.trim()) {
      omitted.password_protected_entries += 1;
      continue;
    }

    const taxonomyReferences = mithrilWordPressTaxonomy.normalizeTermReferences(item.terms, terms, fail);
    omitted.custom_taxonomy_terms += taxonomyReferences.customTaxonomyTerms;
    const sourceId = parseId(fields.postId);
    const parentId = positiveNumberOrZero(fields.parentId);
    if (parentId === null) fail("invalid_wxr_page_parent");
    const featuredMedia = item.meta.filter((meta) => meta.key === "_thumbnail_id");
    if (featuredMedia.length > 1) fail("duplicate_wxr_media_reference");
    const mediaId = positiveNumberOrZero(featuredMedia[0]?.value);
    if (mediaId === null) fail("invalid_wxr_media_reference");
    if (mediaId > 0 || fields.attachmentUrl) omitted.media_references += 1;
    const seo = selectWordPressSeoMetadata(item.meta);
    omitted.custom_fields += seo.omittedFields;

    records.push({
      id: sourceId,
      type,
      ...(type === "page" && parentId > 0 ? { parent: parentId } : {}),
      slug: fields.slug?.trim(),
      title: { raw: fields.title?.trim() ?? "" },
      content: { raw: fields.content ?? "" },
      status: fields.status?.trim(),
      date: fields.date?.trim() || null,
      date_gmt: fields.dateGmt?.trim() || null,
      modified: fields.modified?.trim() || null,
      modified_gmt: fields.modifiedGmt?.trim() || null,
      link: fields.link?.trim() || null,
      categories: taxonomyReferences.categories,
      tags: taxonomyReferences.tags,
      featured_media: mediaId,
      seoMetadata: seo.metadata,
    });
    if (records.length > MAX_IMPORTED_ENTRIES) fail("wxr_entry_limit_exceeded", 413);
  }

  if (records.length === 0) fail("wxr_has_no_supported_entries");
  const importedPageIds = new Set(records
    .filter((record) => record.type === "page")
    .map((record) => record.id));
  omitted.parent_page_relations = records.filter((record) => record.type === "page"
    && record.parent > 0 && !importedPageIds.has(record.parent)).length;
  return { records, omitted };
}

function importAttachments(pendingItems) {
  return pendingItems.flatMap((item) => {
    if (item.fields.postType?.trim() !== "attachment") return [];
    const paths = item.meta.filter((meta) => meta.key === "_wp_attached_file")
      .map((meta) => meta.value.trim());
    const altTexts = item.meta.filter((meta) => meta.key === "_wp_attachment_image_alt")
      .map((meta) => meta.value);
    const path = paths.find(Boolean) ?? null;
    const altText = altTexts[0] ?? "";
    const pathConflict = new Set(paths.filter(Boolean)).size > 1;
    const altConflict = new Set(altTexts).size > 1;
    const admitted = mithrilContentBoundary.normalizeWordPressAttachment({
      source_id: parseId(item.fields.postId),
      path,
      alt_text: altText,
    });
    return [{
      source_id: admitted.ok ? admitted.attachment.id : parseId(item.fields.postId),
      path: admitted.ok ? admitted.attachment.path : path,
      alt_text: admitted.ok ? admitted.attachment.altText : altText,
      admission_error: pathConflict ? "duplicate_wordpress_attachment_path"
        : altConflict ? "duplicate_wordpress_attachment_alt_text"
          : admitted.ok ? null : admitted.code,
    }];
  });
}

/**
 * Parse the WordPress eXtended RSS subset used by MithrilPress imports.
 * DTDs, custom entities, processing instructions, unsupported content types,
 * and over-budget XML are refused or reported instead of being guessed.
 */
export function parseWordPressWxr(xml) {
  if (typeof xml !== "string" || !xml.trim()) fail("wxr_required", 400);
  if (new TextEncoder().encode(xml).byteLength > MAX_WXR_BYTES) fail("wxr_too_large", 413);

  const stack = [];
  const terms = new Map();
  const termRecords = [];
  const termRecordsById = new Map();
  const pendingItems = [];
  let nodeCount = 0;
  let rootSeen = false;
  let channelSeen = false;
  let channelLink = null;
  let channelLinkSeen = false;
  let wxrVersion = null;
  let wxrVersionSeen = false;
  const omittedSourceCounts = { authors: 0, comments: 0 };

  const parser = new SaxesParser({ position: false });
  parser.on("doctype", () => fail("wxr_doctype_not_supported"));
  parser.on("processinginstruction", () => fail("wxr_processing_instruction_not_supported"));
  parser.on("opentag", (tag) => {
    nodeCount += 1;
    if (nodeCount > MAX_WXR_NODES) fail("wxr_node_limit_exceeded", 413);
    if (stack.length >= MAX_WXR_DEPTH) fail("wxr_depth_limit_exceeded", 413);

    const name = tag.name.toLowerCase();
    const local = localName(tag.name);
    const attributes = tag.attributes ?? {};
    const attributeEntries = Object.entries(attributes);
    if (tag.name.length > MAX_ATTRIBUTE_NAME_CHARS
        || attributeEntries.length > MAX_ATTRIBUTES_PER_ELEMENT
        || attributeEntries.some(([key, value]) => key.length > MAX_ATTRIBUTE_NAME_CHARS
          || typeof value !== "string" || value.length > MAX_ATTRIBUTE_VALUE_CHARS)) {
      fail("wxr_attribute_limit_exceeded", 413);
    }
    const parent = stack.at(-1);
    if (stack.length === 0) {
      if (name !== "rss") fail("wxr_root_not_rss");
      rootSeen = true;
    }
    if (local === "channel" && parent?.local === "rss") {
      if (channelSeen) fail("wxr_duplicate_channel");
      channelSeen = true;
    }
    if (parent?.local === "channel" && name === "wp:author") omittedSourceCounts.authors += 1;
    if (parent?.container === "item" && local === "comment") omittedSourceCounts.comments += 1;

    const node = {
      name,
      local,
      attributes,
      text: "",
      fields: {},
      terms: [],
      meta: [],
      container: null,
    };
    if (local === "item" && parent?.local === "channel") {
      if (stack.some((ancestor) => ancestor.container === "item")) fail("wxr_nested_item");
      node.container = "item";
    } else if (parent?.container === "item" && local === "category" && name === "category") {
      node.container = "item-term";
    } else if (parent?.container === "item" && local === "postmeta") {
      node.container = "postmeta";
    } else if (parent?.local === "channel" && name === "wp:category") {
      node.container = "term";
      node.termKind = "category";
    } else if (parent?.local === "channel" && name === "wp:tag") {
      node.container = "term";
      node.termKind = "tag";
    }
    stack.push(node);
  });

  const appendText = (value) => {
    const node = stack.at(-1);
    if (!node) {
      if (value.trim()) fail("wxr_text_outside_root");
      return;
    }
    if (node.text.length + value.length > MAX_NODE_TEXT_CHARS) fail("wxr_text_limit_exceeded", 413);
    node.text += value;
  };
  parser.on("text", appendText);
  parser.on("cdata", appendText);
  parser.on("closetag", () => {
    const node = stack.pop();
    const parent = stack.at(-1);
    if (!node) fail("wxr_unbalanced_xml");

    if (parent?.container === "postmeta") {
      if (node.local === "meta_key") setUniqueField(parent.fields, "key", node.text.trim());
      if (node.local === "meta_value") setUniqueField(parent.fields, "value", node.text);
    } else if (parent?.container === "term") {
      setUniqueField(parent.fields, node.local, node.text.trim());
    } else if (parent?.container === "item") {
      if (node.container === "postmeta") {
        parent.meta.push({ key: node.fields.key ?? "", value: node.fields.value ?? "" });
      } else if (node.container === "item-term") {
        parent.terms.push({
          domain: node.attributes.domain ?? "",
          slug: node.attributes.nicename ?? "",
          name: node.text.trim(),
        });
      } else if (node.name === "content:encoded") {
        setUniqueField(parent.fields, "content", node.text);
      } else {
        const field = FIELD_NAMES.get(node.name);
        if (field) setUniqueField(parent.fields, field, node.text);
      }
    } else if (parent?.local === "channel" && node.name === "link") {
      if (channelLinkSeen) fail("wxr_duplicate_channel_link");
      channelLinkSeen = true;
      channelLink = node.text.trim();
    } else if (parent?.local === "channel" && node.name === "wp:wxr_version") {
      if (wxrVersionSeen) fail("wxr_duplicate_version");
      wxrVersionSeen = true;
      wxrVersion = node.text.trim();
    }

    if (node.container === "term") putTerm(terms, termRecords, termRecordsById, node);
    if (node.container === "item") completeItem(node, pendingItems);
  });

  try {
    parser.write(xml).close();
  } catch (error) {
    if (error?.code) throw error;
    fail("invalid_wxr_xml");
  }
  if (!rootSeen || !channelSeen || !channelLink) fail("invalid_wxr_channel");
  if (wxrVersion !== "1.2") fail("unsupported_wxr_version");
  const taxonomyTerms = resolveTermParents(termRecords, terms);
  const termBytes = taxonomyTerms.reduce((sum, term) => sum
    + new TextEncoder().encode(term.slug).byteLength
    + new TextEncoder().encode(term.name).byteLength
    + new TextEncoder().encode(term.description).byteLength, 0);
  if (termBytes > MAX_IMPORTED_TERM_BYTES) fail("wxr_term_payload_too_large", 413);
  const imported = importRecords(pendingItems, terms, omittedSourceCounts);
  return {
    channelLink,
    wxrVersion,
    ...imported,
    attachments: importAttachments(pendingItems),
    taxonomyTerms,
    source: "wordpress-wxr",
  };
}
