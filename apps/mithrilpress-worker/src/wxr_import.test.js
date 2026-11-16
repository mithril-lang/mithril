import assert from "node:assert/strict";
import test from "node:test";
import { parseWordPressWxr } from "./wxr_import.js";
import { instantiateMithrilNative as instantiateWordPressTaxonomy } from "./wordpress_taxonomy.js";

const mithrilWordPressTaxonomy = instantiateWordPressTaxonomy({ Map, Set });

function taxonomyExport(terms) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:wp="http://wordpress.org/export/1.2/">
  <channel><title>Taxonomy fixture</title><link>https://wordpress.example</link><wp:wxr_version>1.2</wp:wxr_version>${terms}</channel>
</rss>`;
}

function categoryTerm(id, slug, parentSlug = "") {
  const parent = parentSlug ? `<wp:category_parent>${parentSlug}</wp:category_parent>` : "";
  return `<wp:category><wp:term_id>${id}</wp:term_id><wp:category_nicename>${slug}</wp:category_nicename><wp:cat_name>${slug}</wp:cat_name>${parent}</wp:category>`;
}

const exportXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:wp="http://wordpress.org/export/1.2/">
  <channel>
    <title>Example</title>
    <link>https://wordpress.example</link>
    <wp:wxr_version>1.2</wp:wxr_version>
    <wp:author>
      <wp:author_id>1</wp:author_id>
      <wp:author_login><![CDATA[editor]]></wp:author_login>
    </wp:author>
    <wp:category>
      <wp:term_id>7</wp:term_id>
      <wp:category_nicename>news</wp:category_nicename>
      <wp:cat_name><![CDATA[News]]></wp:cat_name>
    </wp:category>
    <wp:tag>
      <wp:term_id>9</wp:term_id>
      <wp:tag_slug>security</wp:tag_slug>
      <wp:tag_name><![CDATA[Security]]></wp:tag_name>
    </wp:tag>
    <item>
      <title>Safety &amp; reliability</title>
      <link>https://wordpress.example/safety/</link>
      <wp:post_id>42</wp:post_id>
      <wp:post_type>post</wp:post_type>
      <wp:status>publish</wp:status>
      <wp:post_name>safety</wp:post_name>
      <wp:post_date>2026-10-01 10:00:00</wp:post_date>
      <wp:post_date_gmt>2026-10-01 01:00:00</wp:post_date_gmt>
      <wp:post_modified>2026-10-02 10:00:00</wp:post_modified>
      <wp:post_modified_gmt>2026-10-02 01:00:00</wp:post_modified_gmt>
      <wp:post_parent>0</wp:post_parent>
      <category domain="category" nicename="news"><![CDATA[News]]></category>
      <category domain="post_tag" nicename="security"><![CDATA[Security]]></category>
      <content:encoded><![CDATA[<p>Owner provided <strong>content</strong>.</p>]]></content:encoded>
      <wp:postmeta>
        <wp:meta_key><![CDATA[_thumbnail_id]]></wp:meta_key>
        <wp:meta_value><![CDATA[101]]></wp:meta_value>
      </wp:postmeta>
      <wp:postmeta>
        <wp:meta_key><![CDATA[custom_field]]></wp:meta_key>
        <wp:meta_value><![CDATA[value]]></wp:meta_value>
      </wp:postmeta>
      <wp:postmeta>
        <wp:meta_key><![CDATA[_yoast_wpseo_title]]></wp:meta_key>
        <wp:meta_value><![CDATA[Safety overview]]></wp:meta_value>
      </wp:postmeta>
      <wp:postmeta>
        <wp:meta_key><![CDATA[_yoast_wpseo_metadesc]]></wp:meta_key>
        <wp:meta_value><![CDATA[Owner-authored search description.]]></wp:meta_value>
      </wp:postmeta>
      <wp:comment>
        <wp:comment_id>8</wp:comment_id>
        <wp:comment_content><![CDATA[Reader comment]]></wp:comment_content>
      </wp:comment>
    </item>
    <item>
      <title>About</title>
      <link>https://wordpress.example/about/</link>
      <wp:post_id>43</wp:post_id>
      <wp:post_type>page</wp:post_type>
      <wp:status>draft</wp:status>
      <wp:post_name>about</wp:post_name>
      <wp:post_parent>42</wp:post_parent>
      <content:encoded><![CDATA[<p>About page.</p>]]></content:encoded>
    </item>
    <item>
      <title>Theme code</title>
      <wp:post_id>90</wp:post_id>
      <wp:post_type>custom_widget</wp:post_type>
      <wp:status>publish</wp:status>
      <wp:post_name>widget</wp:post_name>
      <content:encoded><![CDATA[ignored]]></content:encoded>
    </item>
    <item>
      <title>Uploaded image</title>
      <wp:post_id>91</wp:post_id>
      <wp:post_type>attachment</wp:post_type>
      <wp:status>inherit</wp:status>
      <wp:post_name>image</wp:post_name>
      <wp:attachment_url>https://wordpress.example/uploads/image.png</wp:attachment_url>
    </item>
  </channel>
</rss>`;

test("parses a bounded WXR posts/pages subset with category and tag IDs", () => {
  const parsed = parseWordPressWxr(exportXml);
  assert.equal(parsed.channelLink, "https://wordpress.example");
  assert.equal(parsed.records.length, 2);
  assert.deepEqual(parsed.records[0], {
    id: 42,
    type: "post",
    slug: "safety",
    title: { raw: "Safety & reliability" },
    content: { raw: "<p>Owner provided <strong>content</strong>.</p>" },
    status: "publish",
    date: "2026-10-01 10:00:00",
    date_gmt: "2026-10-01 01:00:00",
    modified: "2026-10-02 10:00:00",
    modified_gmt: "2026-10-02 01:00:00",
    link: "https://wordpress.example/safety/",
    categories: [7],
    tags: [9],
    featured_media: 101,
    seoMetadata: {
      _yoast_wpseo_title: "Safety overview",
      _yoast_wpseo_metadesc: "Owner-authored search description.",
    },
  });
  assert.deepEqual(parsed.omitted, {
    unsupported_post_types: 1,
    attachments: 1,
    password_protected_entries: 0,
    authors: 1,
    comments: 1,
    custom_taxonomy_terms: 0,
    parent_page_relations: 1,
    custom_fields: 1,
    media_references: 1,
  });
});

test("refuses DTDs and custom entities", () => {
  const hostile = `<!DOCTYPE rss [<!ENTITY x "expanded">]>${exportXml}`;
  assert.throws(() => parseWordPressWxr(hostile), { code: "wxr_doctype_not_supported" });
});

test("refuses undeclared entities and unsupported WXR versions", () => {
  const unknownEntity = exportXml.replace("Safety &amp; reliability", "Safety &external; reliability");
  assert.throws(() => parseWordPressWxr(unknownEntity), { code: "invalid_wxr_xml" });
  const oldVersion = exportXml.replace("<wp:wxr_version>1.2</wp:wxr_version>", "<wp:wxr_version>1.1</wp:wxr_version>");
  assert.throws(() => parseWordPressWxr(oldVersion), { code: "unsupported_wxr_version" });
});

test("refuses ambiguous duplicate source metadata", () => {
  const duplicateLink = exportXml.replace(
    "<link>https://wordpress.example</link>",
    "<link>https://wordpress.example</link><link>https://other.example</link>",
  );
  assert.throws(() => parseWordPressWxr(duplicateLink), { code: "wxr_duplicate_channel_link" });
});

test("refuses an unresolved supported taxonomy term instead of dropping it", () => {
  const unresolved = exportXml.replace('nicename="news"', 'nicename="missing"');
  assert.throws(() => parseWordPressWxr(unresolved), { code: "unresolved_wxr_term" });
});

test("resolves category parents independent of WXR declaration order and preserves the legacy projection", () => {
  const parsed = parseWordPressWxr(taxonomyExport(
    `${categoryTerm(12, "child", "parent")}${categoryTerm(11, "parent")}`,
  ));
  assert.deepEqual(parsed.taxonomyTerms, [
    { id: 12, taxonomy: "category", slug: "child", name: "child", description: "", parentId: 11 },
    { id: 11, taxonomy: "category", slug: "parent", name: "parent", description: "", parentId: 0 },
  ]);
});

test("rejects self-parent and cyclic category graphs", () => {
  assert.throws(
    () => parseWordPressWxr(taxonomyExport(categoryTerm(21, "self", "self"))),
    { code: "unresolved_wxr_term_parent" },
  );
  assert.throws(
    () => parseWordPressWxr(taxonomyExport(`${categoryTerm(31, "first", "second")}${categoryTerm(32, "second", "first")}`)),
    { code: "cyclic_wxr_term_parent" },
  );
});

test("preserves category hierarchies deeper than the XML nesting guard", () => {
  const nestedCategories = (count) => Array.from({ length: count }, (_, index) =>
    categoryTerm(index + 1, `category-${index}`, index > 0 ? `category-${index - 1}` : "")
  ).join("");
  const taxonomyTerms = parseWordPressWxr(taxonomyExport(nestedCategories(256))).taxonomyTerms;
  assert.equal(taxonomyTerms.length, 256);
  assert.equal(taxonomyTerms[255].parentId, 255);
});

test("Mithril taxonomy policy rejects a parent on a non-category term", () => {
  const termRecords = [{
    id: 41,
    taxonomy: "post_tag",
    slug: "tag",
    name: "tag",
    description: "",
    parentSlug: "parent",
    parentId: 0,
  }];
  const fail = (code, status = 422) => {
    throw Object.assign(new Error(code), { code, status });
  };
  assert.throws(
    () => mithrilWordPressTaxonomy.resolveTermParents(termRecords, new Map(), fail),
    { code: "invalid_wxr_term_parent" },
  );
});

test("refuses malformed XML", () => {
  assert.throws(() => parseWordPressWxr("<rss><channel></rss>"), { code: "invalid_wxr_xml" });
});

test("does not import password-protected entries as ordinary public content", () => {
  const protectedPost = exportXml.replace(
    "<wp:post_type>post</wp:post_type>",
    "<wp:post_type>post</wp:post_type><wp:post_password>secret</wp:post_password>",
  );
  const parsed = parseWordPressWxr(protectedPost);
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0].id, 43);
  assert.equal(parsed.omitted.password_protected_entries, 1);
});
