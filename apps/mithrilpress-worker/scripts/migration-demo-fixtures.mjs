import { mkdir, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import { join } from "node:path";

const SOURCE_ORIGIN = "https://northstar.example";

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}

function fixturePng(seed) {
  const width = 64;
  const height = 64;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const rows = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    rows[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const pixel = row + 1 + x * 3;
      rows[pixel] = (x * 3 + seed * 23) & 255;
      rows[pixel + 1] = (y * 4 + seed * 41) & 255;
      rows[pixel + 2] = ((x + y) * 2 + seed * 17) & 255;
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(rows)),
    pngChunk("IEND"),
  ]);
}

function postmeta(key, value) {
  return `<wp:postmeta><wp:meta_key><![CDATA[${key}]]></wp:meta_key><wp:meta_value><![CDATA[${value}]]></wp:meta_value></wp:postmeta>`;
}

function item({ id, kind, slug, title, path, parent = 0, content, category = null, tag = null, mediaId = null, password = false, customType = false }) {
  const year = "2026";
  const date = `2026-10-${String((id % 28) + 1).padStart(2, "0")} 09:00:00`;
  const mediaMarkup = mediaId === null
    ? ""
    : `<figure><img class="wp-image-${mediaId}" src="${SOURCE_ORIGIN}/wp-content/uploads/${year}/10/demo-image-${String(mediaId - 1000).padStart(2, "0")}.png" alt="Original generated demo image ${mediaId - 1000}"></figure>`;
  const type = customType ? "portfolio" : kind;
  return `<item>
<title>${title}</title><link>${SOURCE_ORIGIN}${path}</link><wp:post_id>${id}</wp:post_id><wp:post_type>${type}</wp:post_type><wp:status>publish</wp:status><wp:post_name>${slug}</wp:post_name><wp:post_date>${date}</wp:post_date><wp:post_date_gmt>${date}</wp:post_date_gmt><wp:post_modified>${date}</wp:post_modified><wp:post_modified_gmt>${date}</wp:post_modified_gmt><wp:post_parent>${parent}</wp:post_parent>${password ? "<wp:post_password>fictional-secret</wp:post_password>" : ""}${category ? `<category domain="category" nicename="${category}"><![CDATA[${category}]]></category>` : ""}${tag ? `<category domain="post_tag" nicename="${tag}"><![CDATA[${tag}]]></category>` : ""}<content:encoded><![CDATA[<p>${content}</p>${mediaMarkup}${kind === "post" && id === 201 ? "<!-- wp:latest-posts /-->" : ""}]]></content:encoded>${mediaId === null ? "" : postmeta("_thumbnail_id", mediaId)}${kind === "post" && id === 201 ? postmeta("northstar_custom_field", "deliberately unsupported fixture") : ""}
</item>`;
}

function attachment(id) {
  const index = id - 1000;
  return `<item><title>Generated illustration ${String(index).padStart(2, "0")}</title><link>${SOURCE_ORIGIN}/attachment/generated-${index}/</link><wp:post_id>${id}</wp:post_id><wp:post_type>attachment</wp:post_type><wp:status>inherit</wp:status><wp:post_name>generated-${index}</wp:post_name><wp:attachment_url>${SOURCE_ORIGIN}/wp-content/uploads/2026/10/demo-image-${String(index).padStart(2, "0")}.png</wp:attachment_url>${postmeta("_wp_attached_file", `2026/10/demo-image-${String(index).padStart(2, "0")}.png`)}${postmeta("_wp_attachment_image_alt", `Original generated demo image ${index}`)}</item>`;
}

export async function writeMigrationDemoFixtures(directory, { update = false } = {}) {
  const uploads = join(directory, "uploads", "2026", "10");
  await mkdir(uploads, { recursive: true });
  for (let index = 1; index <= 10; index += 1) {
    await writeFile(join(uploads, `demo-image-${String(index).padStart(2, "0")}.png`), fixturePng(index), { flag: "wx" });
  }

  const categoryTerms = [
    "<wp:category><wp:term_id>1</wp:term_id><wp:category_nicename>services</wp:category_nicename><wp:cat_name><![CDATA[Services]]></wp:cat_name></wp:category>",
    "<wp:category><wp:term_id>2</wp:term_id><wp:category_nicename>updates</wp:category_nicename><wp:cat_name><![CDATA[Updates]]></wp:cat_name></wp:category>",
  ].join("\n");
  const tagTerms = ["practice", "operations", "research"].map((slug, index) =>
    `<wp:tag><wp:term_id>${10 + index}</wp:term_id><wp:tag_slug>${slug}</wp:tag_slug><wp:tag_name><![CDATA[${slug}]]></wp:tag_name></wp:tag>`).join("\n");

  const pages = [];
  for (let index = 1; index <= 24; index += 1) {
    const id = 100 + index;
    const slug = index === 1 ? "company" : index === 2 ? "services" : `service-${String(index).padStart(2, "0")}`;
    const parent = index <= 2 ? 0 : index <= 8 ? 102 : 103;
    const parentPath = parent === 102 ? "/services/" : parent === 103 ? "/services/service-03/" : "/";
    const path = index === 1 ? "/company/" : index === 2 ? "/services/" : `${parentPath}${slug}/`;
    const title = update && index === 1 ? "About Northstar Fictional Services, updated" : `Northstar ${index === 1 ? "company" : "service"} page ${String(index).padStart(2, "0")}`;
    pages.push(item({
      id, kind: "page", slug, title, path, parent,
      content: `Synthetic, owner-supplied sample content for ${title}. This fictional page contains no prospect data.`,
      mediaId: index <= 10 ? 1000 + index : null,
    }));
  }

  const posts = [];
  for (let index = 1; index <= 6; index += 1) {
    const id = 200 + index;
    const slug = `news-${String(index).padStart(2, "0")}`;
    const title = update && index === 1 ? "Northstar publishes an updated service note" : `Northstar fictional news item ${String(index).padStart(2, "0")}`;
    posts.push(item({
      id, kind: "post", slug, title, path: `/news/${slug}/`,
      content: `Synthetic editorial content ${index}. Northstar Fictional Services demonstrates an owner-approved WordPress migration.`,
      category: index <= 3 ? "updates" : "services",
      tag: ["practice", "operations", "research"][(index - 1) % 3],
      mediaId: index <= 10 ? 1000 + index : null,
    }));
  }

  const unsupported = [
    item({ id: 901, kind: "post", slug: "portfolio-fixture", title: "Unsupported portfolio fixture", path: "/portfolio/fixture/", content: "A custom post type is intentionally omitted.", customType: true }),
    item({ id: 902, kind: "page", slug: "protected-fixture", title: "Password protected fixture", path: "/protected/fixture/", content: "This protected page must not be imported as public content.", password: true }),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:wp="http://wordpress.org/export/1.2/">
<channel><title>Northstar Fictional Services</title><link>${SOURCE_ORIGIN}</link><description>Synthetic local migration demo fixture.</description><wp:wxr_version>1.2</wp:wxr_version>${categoryTerms}${tagTerms}${pages.join("\n")}${posts.join("\n")}${unsupported.join("\n")}${Array.from({ length: 10 }, (_, index) => attachment(1001 + index)).join("\n")}</channel></rss>`;
  const wxrPath = join(directory, "export.xml");
  await writeFile(wxrPath, xml, { flag: "wx" });
  return { wxrPath, uploadsPath: uploads, sourceOrigin: SOURCE_ORIGIN, supportedRecords: 30, pages: 24, posts: 6, images: 10 };
}
