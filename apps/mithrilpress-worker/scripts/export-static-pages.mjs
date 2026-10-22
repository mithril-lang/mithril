import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

const MAX_SNAPSHOT_BYTES = 40 * 1024 * 1024;
const MAX_MEDIA_BYTES = 262_144_000;
const MAX_OUTPUT_BYTES = 300_000_000;
const MAX_OUTPUT_FILES = 5_000;
const MEDIA_CONTENT_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/gif", "gif"],
  ["image/webp", "webp"],
]);

function fail(message) {
  throw new Error(message);
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value || value.trim() !== value) fail(`${name} must be set without surrounding whitespace.`);
  return value;
}

function endpointConfiguration() {
  const base = new URL(requiredEnvironment("MITHRILPRESS_CONTROL_URL"));
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || base.pathname !== "/") {
    fail("MITHRILPRESS_CONTROL_URL must be an HTTPS origin without credentials, a path, or query parameters.");
  }
  if (base.hostname !== "mithril.love" && !base.hostname.endsWith(".mithril.love") && !base.hostname.endsWith(".workers.dev")) {
    fail("MITHRILPRESS_CONTROL_URL must use the Mithril domain or a Cloudflare workers.dev hostname.");
  }
  const siteId = requiredEnvironment("MITHRILPRESS_SITE_ID");
  if (!/^[a-f0-9-]{36}$/.test(siteId)) fail("MITHRILPRESS_SITE_ID must be the exact MithrilPress site UUID.");
  const token = requiredEnvironment("MITHRILPRESS_OWNER_TOKEN");
  if (!/^[a-f0-9]{24}\.[A-Za-z0-9_-]{43}$/.test(token)) fail("MITHRILPRESS_OWNER_TOKEN is not a valid owner-token shape.");
  return { base, siteId, token };
}

async function readBoundedJson(response) {
  if (!response.body) fail("The publication API returned an empty response.");
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_SNAPSHOT_BYTES) {
      await reader.cancel();
      fail("The publication snapshot exceeds the local 40 MiB safety limit.");
    }
    chunks.push(Buffer.from(value));
  }
  try {
    return JSON.parse(Buffer.concat(chunks, bytes).toString("utf8"));
  } catch {
    fail("The publication API returned invalid JSON.");
  }
}

function publicationPath(siteId, suffix) {
  return `/_mithrilpress/api/control/sites/${encodeURIComponent(siteId)}/publication${suffix}`;
}

async function apiFetch(base, siteId, token, pathname, method = "GET") {
  const url = new URL(pathname, base);
  if (url.origin !== base.origin || !url.pathname.startsWith(`${publicationPath(siteId, "")}/`)) {
    fail("Refusing to send the owner token outside the publication API origin.");
  }
  return await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json, image/*" },
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
}

async function requestSnapshot(base, siteId, token) {
  const response = await apiFetch(base, siteId, token, publicationPath(siteId, "/current"));
  if (!response.ok) fail(`Publication snapshot request failed with HTTP ${response.status}.`);
  const snapshot = await readBoundedJson(response);
  const suppliedDigest = snapshot?.digest_sha256;
  if (!/^[a-f0-9]{64}$/.test(suppliedDigest ?? "")) fail("The publication snapshot has no valid SHA-256 digest.");
  const payload = { ...snapshot };
  delete payload.digest_sha256;
  const actualDigest = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  if (actualDigest !== suppliedDigest) fail("The publication snapshot digest does not match its contents.");
  if (snapshot.schema_version !== 1 || snapshot.site_id !== siteId
      || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.sites\.mithril\.love$/.test(snapshot.hostname ?? "")) {
    fail("The publication snapshot identity or schema does not match the requested site.");
  }
  if (!snapshot.revision || !/^[a-f0-9-]{36}$/.test(snapshot.revision.id ?? "")
      || !snapshot.revision.published_at || !snapshot.revision.approval_proof_id) {
    fail("The snapshot is not bound to a published, owner-approved revision.");
  }
  if (!Array.isArray(snapshot.entries) || !Array.isArray(snapshot.terms) || !Array.isArray(snapshot.media)
      || snapshot.entries.length !== snapshot.revision.published_entry_count
      || snapshot.entries.length < 1 || snapshot.entries.length > 500) {
    fail("The publication snapshot has an invalid content or media collection.");
  }
  const expectedRevision = process.env.MITHRILPRESS_EXPECTED_REVISION;
  if (expectedRevision && expectedRevision !== snapshot.revision.id) {
    fail("The current published revision changed from MITHRILPRESS_EXPECTED_REVISION.");
  }
  return snapshot;
}

async function verifyStillCurrent(base, siteId, token, snapshot) {
  const response = await apiFetch(base, siteId, token, publicationPath(siteId, "/current"), "HEAD");
  if (!response.ok
      || response.headers.get("X-MithrilPress-Revision") !== snapshot.revision.id
      || response.headers.get("X-MithrilPress-Snapshot-SHA256") !== snapshot.digest_sha256) {
    fail("The published revision changed during export; discard the artifact and retry.");
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[character]);
}

function escapeXml(value) {
  return escapeHtml(value).replace(/\r/g, "&#13;").replace(/\n/g, "&#10;");
}

function safeSlug(value, label) {
  if (typeof value !== "string" || value.length < 1 || value.length > 200
      || value === "." || value === ".."
      || /[/?#%\\\u0000-\u001f\u007f]/u.test(value)) {
    fail(`The ${label} contains a value that cannot become a safe static path.`);
  }
  return encodeURIComponent(value);
}

function routeForEntry(entry) {
  const slug = safeSlug(entry.slug, "entry slug");
  return entry.kind === "page" && entry.slug === "home" ? "/" : `/${slug}/`;
}

function pathForEntry(entry) {
  safeSlug(entry.slug, "entry slug");
  return entry.kind === "page" && entry.slug === "home" ? "/index.html" : `/${entry.slug}/index.html`;
}

function canonicalUrl(hostname, route) {
  return `https://${hostname}${route}`;
}

function mediaPath(media) {
  const extension = MEDIA_CONTENT_TYPES.get(media.content_type);
  if (!extension || !Number.isSafeInteger(Number(media.id)) || Number(media.id) < 1) {
    fail("The snapshot contains unsupported or invalid publication media.");
  }
  return `/_mithrilpress/media/${media.id}.${extension}`;
}

function rewritePublishedMedia(html, mediaById, absoluteHostname = null) {
  return String(html ?? "").replace(/\/_mithrilpress\/media\/([1-9][0-9]*)(?:\.[a-zA-Z0-9]+)?/g, (match, rawId) => {
    const media = mediaById.get(Number(rawId));
    if (!media) fail("Published HTML references media outside the approved snapshot.");
    const path = mediaPath(media);
    return absoluteHostname ? canonicalUrl(absoluteHostname, path) : path;
  });
}

function metadataFor(entry) {
  let metadata;
  try {
    metadata = JSON.parse(entry.seo_metadata_json ?? "{}");
  } catch {
    fail("A publication entry has invalid SEO metadata.");
  }
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
}

function renderEntry(hostname, entry, mediaById, mediaBySourceId) {
  const route = routeForEntry(entry);
  const metadata = metadataFor(entry);
  const title = metadata._yoast_wpseo_title || metadata.rank_math_title || entry.title;
  const description = metadata._yoast_wpseo_metadesc || metadata.rank_math_description || "";
  const safeHtml = rewritePublishedMedia(entry.safe_html, mediaById);
  const featuredId = Number(entry.featured_media_id);
  const featured = Number.isSafeInteger(featuredId) && featuredId > 0
    ? mediaBySourceId.get(featuredId) ?? mediaById.get(featuredId)
    : null;
  const featuredHtml = featured
    ? `<img src="${mediaPath(featured)}" alt="${escapeHtml(featured.alt_text)}" loading="lazy" decoding="async">`
    : "";
  const language = /^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*$/.test(entry.language_code ?? "")
    ? entry.language_code
    : "und";
  const descriptionTag = description ? `<meta name="description" content="${escapeHtml(description)}">` : "";
  const canonical = canonicalUrl(hostname, route);
  const html = `<!doctype html><html lang="${escapeHtml(language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="index, follow">${descriptionTag}<title>${escapeHtml(title)}</title><link rel="canonical" href="${escapeHtml(canonical)}"></head><body><main><article><h1>${escapeHtml(entry.title)}</h1>${featuredHtml}<div>${safeHtml}</div></article></main></body></html>`;
  return { path: pathForEntry(entry), route, html };
}

function publishedPosts(entries) {
  return entries.filter((entry) => entry.kind === "post");
}

function entryTermIds(entry, taxonomy) {
  const key = taxonomy === "category" ? "categories_json" : "tags_json";
  let ids;
  try {
    ids = JSON.parse(entry[key] ?? "[]");
  } catch {
    fail("A publication entry has invalid taxonomy references.");
  }
  if (!Array.isArray(ids) || ids.some((id) => !Number.isSafeInteger(Number(id)) || Number(id) < 1)) {
    fail("A publication entry has invalid taxonomy references.");
  }
  return new Set(ids.map(Number));
}

function buildStaticFiles(snapshot) {
  const mediaById = new Map();
  const mediaBySourceId = new Map();
  const totalMediaBytes = snapshot.media.reduce((sum, media) => {
    const byteLength = Number(media.byte_length);
    if (!Number.isSafeInteger(byteLength) || byteLength < 1 || byteLength > 8_388_608
        || !/^[a-f0-9]{64}$/.test(media.sha256 ?? "")) {
      fail("The snapshot contains invalid media metadata.");
    }
    if (!MEDIA_CONTENT_TYPES.has(media.content_type)) fail("The snapshot contains an unsupported media type.");
    mediaById.set(Number(media.id), media);
    if (media.wordpress_source_id) mediaBySourceId.set(Number(media.wordpress_source_id), media);
    return sum + byteLength;
  }, 0);
  if (totalMediaBytes > MAX_MEDIA_BYTES) fail("The media set exceeds the site's enforced storage allowance.");

  const files = new Map();
  const routes = new Set();
  const add = (path, body) => {
    if (!path.startsWith("/") || path.split("/").some((part) => part === "." || part === "..") || files.has(path)) {
      fail(`The publication has a duplicate or unsafe output path: ${path}`);
    }
    files.set(path, Buffer.from(body, "utf8"));
  };

  const entries = [...snapshot.entries].sort((left, right) => {
    const kind = left.kind.localeCompare(right.kind);
    return kind || Number(left.api_id) - Number(right.api_id);
  });
  for (const entry of entries) {
    if ((entry.kind !== "post" && entry.kind !== "page") || !Number.isSafeInteger(Number(entry.api_id))
        || Number(entry.api_id) < 1 || typeof entry.title !== "string" || typeof entry.safe_html !== "string") {
      fail("The snapshot contains an invalid published entry.");
    }
    const rendered = renderEntry(snapshot.hostname, entry, mediaById, mediaBySourceId);
    if (routes.has(rendered.route)) fail(`Two entries resolve to the same public route: ${rendered.route}`);
    routes.add(rendered.route);
    add(rendered.path, rendered.html);
  }

  if (!routes.has("/")) {
    const homepage = [...entries].sort((left, right) => {
      const kindOrder = (left.kind === "page" ? 0 : 1) - (right.kind === "page" ? 0 : 1);
      if (kindOrder) return kindOrder;
      const dateOrder = String(right.source_date ?? "").localeCompare(String(left.source_date ?? ""));
      return dateOrder || Number(left.api_id) - Number(right.api_id);
    })[0];
    if (homepage) {
      const rendered = renderEntry(snapshot.hostname, homepage, mediaById, mediaBySourceId);
      add("/index.html", rendered.html);
      routes.add("/");
    }
  }

  const posts = publishedPosts(entries).sort((left, right) => {
    const dateOrder = String(right.source_date ?? "").localeCompare(String(left.source_date ?? ""));
    return dateOrder || Number(left.api_id) - Number(right.api_id);
  });
  const postsByTerm = { category: new Map(), post_tag: new Map() };
  for (const entry of posts) {
    for (const taxonomy of ["category", "post_tag"]) {
      for (const termId of entryTermIds(entry, taxonomy)) {
        const matching = postsByTerm[taxonomy].get(termId) ?? [];
        matching.push(entry);
        postsByTerm[taxonomy].set(termId, matching);
      }
    }
  }
  for (const taxonomy of ["category", "post_tag"]) {
    for (const term of snapshot.terms.filter((item) => item.taxonomy === taxonomy)) {
      const ids = postsByTerm[taxonomy].get(Number(term.term_id)) ?? [];
      if (ids.length === 0) continue;
      const slug = safeSlug(term.slug, "taxonomy slug");
      const route = `/${taxonomy === "category" ? "category" : "tag"}/${slug}/`;
      const canonical = canonicalUrl(snapshot.hostname, route);
      const list = ids.map((entry) => `<li><a href="${escapeHtml(canonicalUrl(snapshot.hostname, routeForEntry(entry)))}">${escapeHtml(entry.title)}</a></li>`).join("");
      const description = term.description_html ? `<div>${escapeHtml(term.description_html)}</div>` : "";
      const html = `<!doctype html><html lang="und"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="index, follow"><title>${escapeHtml(term.name)}</title><link rel="canonical" href="${escapeHtml(canonical)}"></head><body><main><h1>${escapeHtml(term.name)}</h1>${description}<ul>${list}</ul></main></body></html>`;
      add(`/${taxonomy === "category" ? "category" : "tag"}/${term.slug}/index.html`, html);
      routes.add(route);
    }
  }

  const sitemapRoutes = [...routes].sort();
  add("/sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemapRoutes.map((route) => `<url><loc>${escapeXml(canonicalUrl(snapshot.hostname, route))}</loc></url>`).join("")}</urlset>`);
  add("/feed.xml", `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${escapeXml(snapshot.hostname)}</title><link>${escapeXml(canonicalUrl(snapshot.hostname, "/"))}</link><description>${escapeXml(snapshot.hostname)} articles</description>${posts.slice(0, 50).map((entry) => {
    const content = rewritePublishedMedia(entry.safe_html, mediaById, snapshot.hostname).replace(/]]>/g, "]]]]><![CDATA[>");
    const link = canonicalUrl(snapshot.hostname, routeForEntry(entry));
    return `<item><title>${escapeXml(entry.title)}</title><link>${escapeXml(link)}</link><guid isPermaLink="true">${escapeXml(link)}</guid>${entry.source_date ? `<pubDate>${escapeXml(new Date(entry.source_date).toUTCString())}</pubDate>` : ""}<description><![CDATA[${content}]]></description></item>`;
  }).join("")}</channel></rss>`);
  add("/robots.txt", `User-agent: *\nAllow: /\nSitemap: ${canonicalUrl(snapshot.hostname, "/sitemap.xml")}\n`);
  add("/_headers", "/*\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: no-referrer\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Content-Security-Policy: default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'; img-src 'self'; style-src 'none'; connect-src 'none'\n");

  for (const value of [...files.values()]) {
    if (value.byteLength > 25 * 1024 * 1024) fail("A generated file exceeds the Pages 25 MiB per-file limit.");
  }
  const outputFileCount = files.size + snapshot.media.length;
  if (outputFileCount > MAX_OUTPUT_FILES) fail("The static output exceeds the local 5,000-file safety limit.");
  const textBytes = [...files.values()].reduce((sum, value) => sum + value.byteLength, 0);
  if (textBytes + totalMediaBytes > MAX_OUTPUT_BYTES) fail("The complete site exceeds the local 300 MB publication limit.");
  return { files, outputFileCount, outputBytes: textBytes + totalMediaBytes };
}

async function writeAsset(root, pathname, bytes) {
  const segments = pathname.replace(/^\//, "").split("/");
  if (segments.length === 0 || segments.some((segment) => !segment || segment === "." || segment === "..")) {
    fail("Refusing to write an unsafe publication path.");
  }
  const target = resolve(root, ...segments);
  const relativePath = relative(root, target);
  if (relativePath.startsWith(`..${sep}`) || relativePath === ".." || isAbsolute(relativePath)) {
    fail("Refusing to write outside the publication output directory.");
  }
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes, { flag: "wx", mode: 0o644 });
}

async function downloadMedia(snapshot, base, siteId, token, outputRoot, media) {
  const pathname = publicationPath(siteId, `/revisions/${encodeURIComponent(snapshot.revision.id)}/media/${encodeURIComponent(String(media.id))}`);
  const response = await apiFetch(base, siteId, token, pathname);
  if (!response.ok || !response.body) fail(`A publication media request failed with HTTP ${response.status}.`);
  const expectedType = media.content_type;
  const expectedLength = Number(media.byte_length);
  if (response.headers.get("Content-Type")?.split(";")[0] !== expectedType
      || response.headers.get("X-MithrilPress-Media-SHA256") !== media.sha256) {
    fail("A media response does not match the approved snapshot metadata.");
  }
  const reader = response.body.getReader();
  const chunks = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > expectedLength || byteLength > 8_388_608) {
      await reader.cancel();
      fail("A media response exceeds its approved byte-length limit.");
    }
    chunks.push(Buffer.from(value));
  }
  const bytes = Buffer.concat(chunks, byteLength);
  if (bytes.byteLength !== expectedLength || createHash("sha256").update(bytes).digest("hex") !== media.sha256) {
    fail("A media object's length or SHA-256 does not match the approved snapshot.");
  }
  await writeAsset(outputRoot, mediaPath(media), bytes);
}

async function downloadMediaWithLimit(snapshot, base, siteId, token, outputRoot) {
  let next = 0;
  let firstError = null;
  const workers = Array.from({ length: Math.min(4, snapshot.media.length) }, async () => {
    while (!firstError && next < snapshot.media.length) {
      const index = next;
      next += 1;
      try {
        await downloadMedia(snapshot, base, siteId, token, outputRoot, snapshot.media[index]);
      } catch (error) {
        firstError ??= error;
      }
    }
  });
  await Promise.all(workers);
  if (firstError) throw firstError;
}

async function main() {
  const { base, siteId, token } = endpointConfiguration();
  const snapshot = await requestSnapshot(base, siteId, token);
  const output = resolve(process.env.MITHRILPRESS_OUTPUT_DIR || "./mithrilpress-pages-output");
  const parent = dirname(output);
  await mkdir(parent, { recursive: true });
  try {
    await lstat(output);
    fail("MITHRILPRESS_OUTPUT_DIR already exists. Choose an empty new path so existing files are preserved.");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const staging = resolve(parent, `.${output.split(sep).at(-1)}.staging-${randomUUID()}`);
  await mkdir(staging, { recursive: false, mode: 0o700 });
  try {
    const built = buildStaticFiles(snapshot);
    for (const [pathname, bytes] of built.files) await writeAsset(staging, pathname, bytes);
    await downloadMediaWithLimit(snapshot, base, siteId, token, staging);
    await verifyStillCurrent(base, siteId, token, snapshot);
    await rename(staging, output);
    process.stdout.write(`${JSON.stringify({
      output_directory: output,
      hostname: snapshot.hostname,
      revision_id: snapshot.revision.id,
      snapshot_sha256: snapshot.digest_sha256,
      files: built.outputFileCount,
      output_bytes: built.outputBytes,
      deployed: false,
    }, null, 2)}\n`);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
