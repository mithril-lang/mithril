import { handleDnsMigrations } from "./dns_migration.js";
import { MAX_MEDIA_BYTES, validateImageUpload } from "./media_validation.js";
import { instantiateMithrilNative as instantiateContentBoundary } from "./content_boundary.js";
import { instantiateMithrilNative } from "./platform_hostname.js";
import { collectWordPressMediaReferences, inspectWordPressBlocks } from "./wordpress_blocks.js";
import { buildWordPressPermalinkMap, rewriteWordPressLink } from "./wordpress_links.js";
import { selectWordPressSeoMetadata } from "./wordpress_seo.js";
import { parseWordPressWxr } from "./wxr_import.js";
import {
  isWorkersFreeAiEnabled,
  runWorkersFreeAi,
  STUDIO_AI_FREE_NEURONS_PER_DAY,
} from "./studio_ai.js";

const SITE_ZONE = "sites.mithril.love";
const CUSTOM_DOMAIN_LIMIT_PER_SITE = 10;
const CUSTOM_DOMAIN_LIMIT_PER_DEPLOYMENT = 90;
const CUSTOM_DOMAIN_HEALTH_BATCH_SIZE = 30;
const CUSTOM_DOMAIN_HEALTH_FAILURE_LIMIT = 3;
const MAX_BODY_BYTES = 12_000_000;
const MAX_RECORDS = 500;
const MAX_CONTENT_CHARS = 250_000;
const MAX_IMPORT_CHARS = 10_000_000;
const MAX_IMPORTED_TERMS = 5_000;
const MAX_IMPORTED_TERM_BYTES = 1_000_000;
const MAX_TAXONOMY_REFERENCES = 10_000;
const MAX_SAFE_HTML_CHARS = 1_250_000;
const MAX_D1_ROW_BYTES = 1_800_000;
const SITE_CONTENT_LIMIT_BYTES = 16 * 1024 * 1024;
const DEPLOYMENT_CONTENT_LIMIT_BYTES = 256 * 1024 * 1024;
const SITE_MEDIA_LIMIT_BYTES = 250 * 1024 * 1024;
const DEPLOYMENT_MEDIA_LIMIT_BYTES = 8 * 1024 * 1024 * 1024;
const MEDIA_READS_PER_DAY_LIMIT = 50_000;
const SITE_MEDIA_READS_PER_DAY_LIMIT = 5_000;
const MEDIA_WRITES_PER_DAY_LIMIT = 10_000;
const HOSTING_REQUESTS_PER_DAY_LIMIT = 25_000;
const SITE_HOSTING_REQUESTS_PER_DAY_LIMIT = 5_000;
const ENTRY_SLUG = /^[^/?#\\\u0000-\u001f\u007f]{1,200}$/;
const mithrilHostnameCore = instantiateMithrilNative({});
const mithrilContentBoundary = instantiateContentBoundary({ Array, Number, Set });
const HTML_TAGS = new Set([
  "a", "b", "blockquote", "br", "code", "dd", "del", "div", "dl", "dt",
  "em", "figcaption", "figure", "h1", "h2", "h3", "h4", "h5", "h6", "hr",
  "i", "ins", "li", "ol", "p", "pre", "s", "span", "strong", "sub", "sup",
  "table", "tbody", "td", "th", "thead", "tr", "u", "ul",
]);
const DROP_SUBTREE_TAGS = new Set([
  "audio", "button", "canvas", "embed", "form", "iframe", "input", "link",
  "math", "meta", "noscript", "object", "option", "script", "select", "source",
  "style", "svg", "template", "textarea", "video",
]);

const safeHtmlRewriter = new HTMLRewriter()
  .on("*", {
    element(element) {
      const tag = element.tagName.toLowerCase();
      if (DROP_SUBTREE_TAGS.has(tag)) {
        element.remove();
        return;
      }
      if (!HTML_TAGS.has(tag)) {
        element.removeAndKeepContent();
        return;
      }

      const href = tag === "a" ? element.getAttribute("href") : null;
      for (const [name] of [...element.attributes]) element.removeAttribute(name);
      if (tag === "a" && href !== null) {
        const safeHref = safeLink(href);
        if (safeHref !== null) element.setAttribute("href", safeHref);
      }
    },
    comments(comment) {
      comment.remove();
    },
  });

function safeLink(value) {
  if (typeof value !== "string" || value.length > 2048 || /[\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const base = "https://mithril.invalid/";
    const parsed = new URL(value, base);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (parsed.username || parsed.password) return null;
    if (parsed.origin === "https://mithril.invalid") {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

function secureHeaders(extra = {}) {
  const headers = new Headers(extra);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set("Content-Security-Policy", headers.get("Content-Security-Policy")
    ?? "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'; style-src 'none'; img-src 'none'; connect-src 'none'");
  headers.set("Cache-Control", "no-store");
  return headers;
}

function response(body, status = 200, headers = {}) {
  return new Response(body, { status, headers: secureHeaders(headers) });
}

function json(body, status = 200, headers = {}) {
  return response(JSON.stringify(body), status, { "Content-Type": "application/json; charset=utf-8", ...headers });
}

function fail(status, code, message, headers = {}) {
  return json({ error: { code, message } }, status, headers);
}

function storageQuotaCode(error) {
  const message = String(error?.message ?? error ?? "");
  if (message.includes("site_storage_quota_exceeded")) return "site_storage_quota_exceeded";
  if (message.includes("deployment_storage_quota_exceeded")) return "deployment_storage_quota_exceeded";
  return null;
}

function storageQuotaResponse(code) {
  return code === "site_storage_quota_exceeded"
    ? fail(409, code, "This site's retained content has reached its application storage limit. Reduce the import size or contact the hosting operator.")
    : fail(409, "deployment_storage_quota_exceeded", "The shared hosting content pool is full. This site cannot accept more content right now; contact the hosting operator.");
}

function mediaQuotaCode(error) {
  const message = String(error?.message ?? error ?? "");
  if (message.includes("site_media_quota_exceeded")) return "site_media_quota_exceeded";
  if (message.includes("deployment_media_quota_exceeded")) return "deployment_media_quota_exceeded";
  return null;
}

function mediaQuotaResponse(code) {
  return code === "site_media_quota_exceeded"
    ? fail(409, code, "This site's image storage allowance is full. Remove unused media or contact the hosting operator.")
    : fail(409, "deployment_media_quota_exceeded", "The shared image storage pool is full. New image uploads are paused until the operator removes media.");
}

function hostingRequestQuotaCode(error) {
  const message = String(error?.message ?? error ?? "");
  if (message.includes("site_daily_hosting_request_limit")) return "site_daily_hosting_request_limit";
  if (message.includes("deployment_daily_hosting_request_limit")) return "deployment_daily_hosting_request_limit";
  return null;
}

function d1ProviderLimitReached(error) {
  const message = String(error?.message ?? error ?? "").toLowerCase();
  return message.includes("exceeded d1's free tier daily row read limit")
    || message.includes("exceeded d1's free tier daily row write limit")
    || message.includes("exceeded d1's maximum account storage limit")
    || message.includes("exceeded maximum db size");
}

function secondsUntilUtcRollover(date = new Date()) {
  const nextUtcDay = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
  return Math.max(1, Math.ceil((nextUtcDay - date.getTime()) / 1000));
}

function hostingRequestQuotaResponse(code, date = new Date()) {
  const retryAfter = String(secondsUntilUtcRollover(date));
  return code === "site_daily_hosting_request_limit"
    ? fail(429, code, "This site's included daily hosting allowance is used. Public pages will resume after 00:00 UTC.", { "Retry-After": retryAfter })
    : fail(503, "deployment_daily_hosting_request_limit", "The shared daily hosting allowance is used. Public pages will resume after 00:00 UTC.", { "Retry-After": retryAfter });
}

async function checkHostingRequest(env, siteId = null, date = new Date()) {
  const dayUtc = date.toISOString().slice(0, 10);
  try {
    const statement = siteId === null
      ? env.DB.prepare(
        "INSERT INTO mithrilpress_deployment_daily_requests (singleton, day_utc, request_count) VALUES (1, ?, 1) ON CONFLICT(singleton) DO UPDATE SET day_utc = excluded.day_utc, request_count = CASE WHEN mithrilpress_deployment_daily_requests.day_utc = excluded.day_utc THEN mithrilpress_deployment_daily_requests.request_count + 1 ELSE 1 END",
      ).bind(dayUtc)
      : env.DB.prepare(
          "INSERT INTO mithrilpress_site_daily_requests (site_id, day_utc, request_count) VALUES (?, ?, 1) ON CONFLICT(site_id) DO UPDATE SET day_utc = excluded.day_utc, request_count = CASE WHEN mithrilpress_site_daily_requests.day_utc = excluded.day_utc THEN mithrilpress_site_daily_requests.request_count + 1 ELSE 1 END",
        ).bind(siteId, dayUtc);
    await env.DB.batch([statement]);
    return null;
  } catch (error) {
    const code = hostingRequestQuotaCode(error);
    if (code) return hostingRequestQuotaResponse(code, date);
    throw error;
  }
}

async function countMediaWrite(env, limit, date = new Date()) {
  const row = await env.DB.prepare(
    "INSERT INTO media_daily_operations (day_utc, read_count, write_count) VALUES (?, 0, 1) ON CONFLICT(day_utc) DO UPDATE SET write_count = write_count + 1 WHERE write_count < ? RETURNING write_count AS operation_count",
  ).bind(date.toISOString().slice(0, 10), limit).first();
  return row !== null;
}

async function countMediaRead(env, siteId, date = new Date()) {
  const dayUtc = date.toISOString().slice(0, 10);
  let row;
  try {
    row = await env.DB.prepare(
      "INSERT INTO media_site_daily_reads (site_id, day_utc, read_count) VALUES (?, ?, 1) ON CONFLICT(site_id) DO UPDATE SET day_utc = excluded.day_utc, read_count = CASE WHEN media_site_daily_reads.day_utc = excluded.day_utc THEN media_site_daily_reads.read_count + 1 ELSE 1 END WHERE (CASE WHEN media_site_daily_reads.day_utc = excluded.day_utc THEN media_site_daily_reads.read_count ELSE 0 END) < ? AND COALESCE((SELECT read_count FROM media_daily_operations WHERE day_utc = excluded.day_utc), 0) < ? RETURNING read_count",
    ).bind(siteId, dayUtc, SITE_MEDIA_READS_PER_DAY_LIMIT, MEDIA_READS_PER_DAY_LIMIT).first();
  } catch (error) {
    if (String(error?.message ?? error).includes("media_deployment_daily_read_limit")) return "deployment";
    throw error;
  }
  if (row !== null) return null;

  const [siteUsage, deploymentUsage] = await Promise.all([
    env.DB.prepare("SELECT day_utc, read_count FROM media_site_daily_reads WHERE site_id = ? LIMIT 1").bind(siteId).first(),
    env.DB.prepare("SELECT read_count FROM media_daily_operations WHERE day_utc = ? LIMIT 1").bind(dayUtc).first(),
  ]);
  if (Number(deploymentUsage?.read_count ?? 0) >= MEDIA_READS_PER_DAY_LIMIT) return "deployment";
  if (siteUsage?.day_utc === dayUtc && Number(siteUsage.read_count ?? 0) >= SITE_MEDIA_READS_PER_DAY_LIMIT) return "site";
  return "deployment";
}

function normalizeSiteHostname(hostname) {
  return mithrilHostnameCore.siteHostname(hostname);
}

function normalizeRequestHostname(hostname) {
  if (typeof hostname !== "string" || hostname.length > 253) return null;
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  if (normalized.startsWith("[") || normalized.includes(":")) return null;
  const labels = normalized.split(".");
  if (labels.length < 2 || labels.some((label) => label.length < 1 || label.length > 63
      || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) return null;
  return normalized;
}

async function resolveSite(request, env) {
  if (!env.DB) throw new Error("database binding unavailable");
  const requestedHostname = normalizeRequestHostname(new URL(request.url).hostname);
  const platformHostname = requestedHostname ? normalizeSiteHostname(requestedHostname) : null;
  const hostname = platformHostname ?? requestedHostname;
  if (!hostname) return null;
  if (platformHostname) {
    const site = await env.DB.prepare(
      "SELECT id, hostname, source_origin, status, current_revision_id FROM sites WHERE hostname = ? LIMIT 1",
    ).bind(platformHostname).first();
    return site ? { ...site, request_hostname: requestedHostname } : null;
  }
  if (hostname === "mithril.love" || hostname.endsWith(".mithril.love")) return null;
  const mapping = await env.DB.prepare(
    "SELECT s.id, s.hostname, s.source_origin, s.status, s.current_revision_id FROM site_hostnames h JOIN sites s ON s.id = h.site_id WHERE h.hostname = ? AND h.status = 'active' AND s.status = 'active' LIMIT 1",
  ).bind(hostname).first();
  return mapping ? { ...mapping, request_hostname: hostname, hostname } : null;
}

function parseBoundedInt(value, fallback, minimum, maximum) {
  if (value === null || value === "") return fallback;
  if (!/^[0-9]{1,6}$/.test(value)) return null;
  const parsed = Number(value);
  return parsed >= minimum && parsed <= maximum ? parsed : null;
}

async function readBoundedBytes(request, allowedTypes, unsupportedCode = "unsupported_content_type", maxBytes = MAX_BODY_BYTES) {
  const contentType = request.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase();
  if (!allowedTypes.has(contentType)) throw Object.assign(new Error(), { status: 415, code: unsupportedCode });
  const contentEncoding = request.headers.get("Content-Encoding");
  if (contentEncoding && contentEncoding.toLowerCase() !== "identity") {
    throw Object.assign(new Error(), { status: 415, code: "content_encoding_not_supported" });
  }
  const declared = request.headers.get("Content-Length");
  if (declared && (!Number.isSafeInteger(Number(declared)) || Number(declared) < 0 || Number(declared) > maxBytes)) {
    throw Object.assign(new Error(), { status: 413, code: "payload_too_large" });
  }
  if (!request.body) throw Object.assign(new Error(), { status: 400, code: "missing_body" });
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const item = await reader.read();
    if (item.done) break;
    total += item.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw Object.assign(new Error(), { status: 413, code: "payload_too_large" });
    }
    chunks.push(item.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function readBoundedText(request, allowedTypes, invalidCode, unsupportedCode = "unsupported_content_type") {
  const bytes = await readBoundedBytes(request, allowedTypes, unsupportedCode);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw Object.assign(new Error(), { status: 400, code: invalidCode });
  }
}

async function readBoundedJson(request) {
  const text = await readBoundedText(request, new Set(["application/json"]), "invalid_json", "json_required");
  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error(), { status: 400, code: "invalid_json" });
  }
}

function textValue(value, limit) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= limit;
}

function normalizeRecord(record) {
  const admission = mithrilContentBoundary.normalizeWordPressRecord(record);
  if (!admission.ok) throw Object.assign(new Error(), { status: 422, code: admission.code });
  const selectedSeo = selectWordPressSeoMetadata(record?.seoMetadata ?? record?.meta);
  return {
    ...admission.entry,
    seoMetadata: selectedSeo.metadata,
    seoMetadataOmittedFields: selectedSeo.omittedFields,
  };
}

function normalizeTaxonomyTerms(value, entries) {
  const invalid = (code) => {
    throw Object.assign(new Error(), { status: 422, code });
  };
  const input = value ?? [];
  if (!Array.isArray(input) || input.length > MAX_IMPORTED_TERMS) invalid("invalid_taxonomy_terms");
  const terms = [];
  const byKey = new Map();
  const slugs = new Set();
  const encoder = new TextEncoder();
  let termBytes = 0;
  for (const item of input) {
    const admission = mithrilContentBoundary.normalizeTaxonomyTerm(item);
    if (!admission.ok) invalid(admission.code);
    const { id, taxonomy, slug, name, description, parentId } = admission.term;
    const key = `${taxonomy}:${id}`;
    const slugKey = `${taxonomy}:${slug}`;
    if (byKey.has(key) || slugs.has(slugKey)) invalid("duplicate_taxonomy_term");
    const term = { id, taxonomy, slug, name, description, parentId };
    byKey.set(key, term);
    slugs.add(slugKey);
    termBytes += encoder.encode(slug).byteLength + encoder.encode(name).byteLength + encoder.encode(description).byteLength;
    if (termBytes > MAX_IMPORTED_TERM_BYTES) {
      throw Object.assign(new Error(), { status: 413, code: "taxonomy_term_payload_too_large" });
    }
    terms.push(term);
  }

  for (const term of terms) {
    if (term.parentId && (!byKey.has(`category:${term.parentId}`) || term.parentId === term.id)) {
      invalid("unresolved_taxonomy_parent");
    }
  }
  const visited = new Set();
  for (const term of terms) {
    const path = [];
    const pathIds = new Set();
    let current = term;
    while (current) {
      const key = `${current.taxonomy}:${current.id}`;
      if (visited.has(key)) break;
      if (pathIds.has(key)) invalid("cyclic_taxonomy_parent");
      pathIds.add(key);
      path.push(current);
      if (path.length > 64) invalid("taxonomy_parent_depth_exceeded");
      current = current.parentId ? byKey.get(`category:${current.parentId}`) : null;
    }
    for (const node of path) visited.add(`${node.taxonomy}:${node.id}`);
  }

  let references = 0;
  for (const entry of entries) {
    references += entry.categories.length + entry.tags.length;
    if (references > MAX_TAXONOMY_REFERENCES) {
      throw Object.assign(new Error(), { status: 413, code: "taxonomy_reference_limit_exceeded" });
    }
    if (entry.categories.some((id) => !byKey.has(`category:${id}`))
        || entry.tags.some((id) => !byKey.has(`post_tag:${id}`))) {
      invalid("unresolved_taxonomy_reference");
    }
  }
  return terms;
}

async function sanitizeHtml(source) {
  const result = await safeHtmlRewriter.transform(new Response(source, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })).text();
  if (result.length > MAX_SAFE_HTML_CHARS) throw Object.assign(new Error(), { status: 422, code: "sanitized_content_too_large" });
  return result;
}

function boundedImageAltText(value, fallback = "") {
  const selected = typeof value === "string" && value.length > 0 ? value : fallback;
  return String(selected ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 500);
}

async function sanitizeImportedWordPressHtml(source, mediaBySourceId, linkContext) {
  let imageElements = 0;
  let rewrittenImages = 0;
  let omittedImages = 0;
  let sourceSiteLinks = 0;
  let rewrittenLinks = 0;
  let unresolvedSourceSiteLinks = 0;
  let removedUnsafeLinks = 0;
  const mediaIds = new Set();
  const rewriter = new HTMLRewriter().on("*", {
    element(element) {
      const tag = element.tagName.toLowerCase();
      if (tag === "img") {
        imageElements += 1;
        const classes = element.getAttribute("class") ?? "";
        const marker = /(?:^|\s)wp-image-([0-9]{1,15})(?:\s|$)/.exec(classes);
        const sourceId = marker ? Number(marker[1]) : null;
        const asset = sourceId && Number.isSafeInteger(sourceId) ? mediaBySourceId.get(sourceId) : null;
        if (!asset || !Number.isSafeInteger(asset.id) || asset.id < 1) {
          omittedImages += 1;
          element.remove();
          return;
        }
        const alt = boundedImageAltText(element.getAttribute("alt"), asset.alt_text);
        for (const [name] of [...element.attributes]) element.removeAttribute(name);
        element.setAttribute("src", `/_mithrilpress/media/${asset.id}`);
        element.setAttribute("alt", alt);
        element.setAttribute("width", String(asset.width));
        element.setAttribute("height", String(asset.height));
        element.setAttribute("loading", "lazy");
        element.setAttribute("decoding", "async");
        mediaIds.add(asset.id);
        rewrittenImages += 1;
        return;
      }
      if (DROP_SUBTREE_TAGS.has(tag)) {
        element.remove();
        return;
      }
      if (!HTML_TAGS.has(tag)) {
        element.removeAndKeepContent();
        return;
      }

      const href = tag === "a" ? element.getAttribute("href") : null;
      const rewrittenLink = href === null ? null : rewriteWordPressLink(href, linkContext);
      for (const [name] of [...element.attributes]) element.removeAttribute(name);
      if (tag === "a" && rewrittenLink) {
        if (rewrittenLink.sourceSite) sourceSiteLinks += 1;
        if (rewrittenLink.rewritten) rewrittenLinks += 1;
        if (rewrittenLink.unresolved) unresolvedSourceSiteLinks += 1;
        if (rewrittenLink.removed) removedUnsafeLinks += 1;
        if (rewrittenLink.href !== null) element.setAttribute("href", rewrittenLink.href);
      }
    },
    comments(comment) {
      comment.remove();
    },
  });
  const html = await rewriter.transform(new Response(source, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })).text();
  if (html.length > MAX_SAFE_HTML_CHARS) throw Object.assign(new Error(), { status: 422, code: "sanitized_content_too_large" });
  return {
    html,
    mediaIds: [...mediaIds],
    imageElements,
    rewrittenImages,
    omittedImages,
    links: { sourceSiteLinks, rewrittenLinks, unresolvedSourceSiteLinks, removedUnsafeLinks },
  };
}

async function previewHtmlWithRevisionMedia(source, revisionId) {
  const rewriter = new HTMLRewriter().on("img", {
    element(element) {
      const src = element.getAttribute("src") ?? "";
      if (/^\/_mithrilpress\/media\/[1-9][0-9]*$/.test(src)) {
        element.setAttribute("src", `${src}?revision=${encodeURIComponent(revisionId)}`);
      }
    },
  });
  return await rewriter.transform(new Response(source, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })).text();
}

function hex(bytes) {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function constantTimeHexEqual(left, right) {
  if (!/^[a-f0-9]{64}$/.test(left ?? "") || !/^[a-f0-9]{64}$/.test(right ?? "")) return false;
  let diff = 0;
  for (let index = 0; index < 64; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

async function ownerToken(request, env, site, requiredScope) {
  const now = new Date().toISOString();
  const bearer = /^Bearer ([a-f0-9]{24})\.([A-Za-z0-9_-]{43})$/.exec(request.headers.get("Authorization") ?? "");
  if (bearer) return await verifyOwnerTokenParts(env, site, bearer[1], bearer[2], requiredScope, now);

  const cookie = request.headers.get("Cookie") ?? "";
  const session = /(?:^|;\s*)mithrilpress_session=([a-f0-9]{24})\.([A-Za-z0-9_-]{43})(?:;|$)/.exec(cookie);
  if (!session) return null;
  if (request.method !== "GET" && request.method !== "HEAD"
      && !sameOriginStudioMutation(request, site)) return null;
  const row = await env.DB.prepare(
    "SELECT s.session_id, s.token_id, s.salt_hex, s.secret_hash_hex, t.owner_label, t.scopes_json FROM studio_sessions s JOIN tenant_owner_tokens t ON t.site_id = s.site_id AND t.token_id = s.token_id WHERE s.site_id = ? AND s.session_id = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND t.revoked_at IS NULL AND t.expires_at > ? LIMIT 1",
  ).bind(site.id, session[1], now, now).first();
  if (!row) return null;
  const expected = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${row.salt_hex}.${session[2]}`)));
  if (!constantTimeHexEqual(expected, row.secret_hash_hex)) return null;
  let scopes;
  try {
    scopes = JSON.parse(row.scopes_json);
  } catch {
    return null;
  }
  if (!Array.isArray(scopes) || (requiredScope && !scopes.includes(requiredScope))) return null;
  return { tokenId: row.token_id, ownerLabel: row.owner_label, sessionId: row.session_id, scopes, viaSession: true };
}

async function verifyOwnerTokenParts(env, site, tokenId, secret, requiredScope, now) {
  const token = await env.DB.prepare(
    "SELECT token_id, owner_label, salt_hex, secret_hash_hex, scopes_json, expires_at FROM tenant_owner_tokens WHERE site_id = ? AND token_id = ? AND revoked_at IS NULL AND expires_at > ? LIMIT 1",
  ).bind(site.id, tokenId, now).first();
  if (!token) return null;
  const expected = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${token.salt_hex}.${secret}`)));
  if (!constantTimeHexEqual(expected, token.secret_hash_hex)) return null;
  let scopes;
  try {
    scopes = JSON.parse(token.scopes_json);
  } catch {
    return null;
  }
  if (!Array.isArray(scopes) || (requiredScope && !scopes.includes(requiredScope))) return null;
  return { tokenId: token.token_id, ownerLabel: token.owner_label, scopes, expiresAt: token.expires_at };
}

function sameOriginStudioMutation(request, site) {
  return request.headers.get("Origin") === `https://${site.hostname}`
    && request.headers.get("X-MithrilPress-Request") === "1";
}

function studioCookie(value, maxAge) {
  return `mithrilpress_session=${value}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Strict`;
}

function customHostname(value) {
  if (typeof value !== "string" || value.length > 253 || value.trim() !== value
      || /[\s/@:#?\\]/.test(value) || value.includes("://")) return null;
  let hostname;
  try {
    const parsed = new URL(`https://${value}/`);
    if (parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.port) return null;
    hostname = normalizeRequestHostname(parsed.hostname);
  } catch {
    return null;
  }
  if (!hostname || hostname.split(".").length < 3
      || hostname.length + "_mithrilpress-verify.".length > 253
      || hostname === "mithril.love" || hostname.endsWith(".mithril.love")) return null;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return null;
  return hostname;
}

function providerCnameTarget(value) {
  if (typeof value !== "string" || value.trim() !== value || /[\s/@:#?\\]/.test(value) || value.includes("://")) return null;
  return normalizeRequestHostname(value);
}

function domainManagementConfigured(env) {
  const rawCapacity = env.CF_SAAS_CAPACITY_REMAINING ?? "";
  const configuredCapacity = /^\d{1,2}$/.test(rawCapacity) ? Number(rawCapacity) : Number.NaN;
  return env.CUSTOM_DOMAINS_ENABLED === "true"
    && env.CUSTOM_DOMAINS_ROUTING_READY === "true"
    && env.CUSTOM_DOMAINS_MONITORING_READY === "true"
    && typeof env.CF_SAAS_API_TOKEN === "string" && env.CF_SAAS_API_TOKEN.length > 0
    && /^[a-f0-9]{32}$/.test(env.CF_SAAS_ZONE_ID ?? "")
    && Number.isSafeInteger(configuredCapacity) && configuredCapacity > 0
    && configuredCapacity <= CUSTOM_DOMAIN_LIMIT_PER_DEPLOYMENT
    && providerCnameTarget(env.CF_SAAS_CNAME_TARGET)?.endsWith(`.${SITE_ZONE}`) === true;
}

async function domainOwner(request, env, site) {
  const owner = await ownerToken(request, env, site, "site:domains");
  if (owner) return { owner };
  const signedInOwner = await ownerToken(request, env, site, "content:write");
  if (signedInOwner) return { error: fail(403, "domain_scope_required", "This owner token does not have site:domains scope.") };
  return { error: fail(401, "domain_owner_required", "Sign in with an owner token that has site:domains scope.") };
}

async function auditDomainAction(env, site, domain, owner, action, metadata = {}) {
  await env.DB.prepare(
    "INSERT INTO domain_actions (id, site_id, hostname_id, token_id, action, created_at, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).bind(crypto.randomUUID(), site.id, domain.id, owner.tokenId, action, new Date().toISOString(), JSON.stringify(metadata)).run();
}

async function expirePendingCustomHostnames(env, nowIso) {
  const rows = await env.DB.prepare(
    "SELECT h.* FROM site_hostnames h WHERE h.status = 'ownership_pending' AND h.ownership_expires_at <= ? ORDER BY h.ownership_expires_at ASC LIMIT ?",
  ).bind(nowIso, CUSTOM_DOMAIN_LIMIT_PER_DEPLOYMENT).all();
  for (const domain of rows.results ?? []) {
    const update = await env.DB.prepare(
      "UPDATE site_hostnames SET status = 'detached', ownership_txt_value = NULL, updated_at = ?, detached_at = ? WHERE site_id = ? AND id = ? AND status = 'ownership_pending' AND ownership_expires_at <= ?",
    ).bind(nowIso, nowIso, domain.site_id, domain.id, nowIso).run();
    if (update.meta?.changes === 1) {
      await auditDomainAction(env, { id: domain.site_id }, domain, { tokenId: domain.owner_token_id }, "domain-ownership-expired", {
        hostname: domain.hostname,
        expired_at: domain.ownership_expires_at,
      });
    }
  }
}

async function domainCheckRateLimit(env, site, domain, owner, action) {
  const cutoff = new Date(Date.now() - 60_000).toISOString();
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM domain_actions WHERE site_id = ? AND token_id = ? AND action = 'domain-check-attempted' AND created_at >= ?",
  ).bind(site.id, owner.tokenId, cutoff).first();
  if (Number(recent?.total ?? 0) >= 10) return false;
  await auditDomainAction(env, site, domain, owner, "domain-check-attempted", { action });
  return true;
}

function readValidationRecords(result) {
  const records = [];
  const ownership = result?.ownership_verification;
  if (ownership?.type === "txt" && textValue(ownership.name, 253) && textValue(ownership.value, 512)) {
    records.push({ type: "TXT", name: ownership.name, value: ownership.value });
  }
  const validation = result?.ssl?.validation_records ?? result?.validation_records ?? [];
  if (Array.isArray(validation)) {
    for (const record of validation.slice(0, 20)) {
      const txtRecord = textValue(record?.txt_record, 512) ?? textValue(record?.txt_value, 512);
      if (textValue(record?.txt_name, 253) && txtRecord) {
        records.push({ type: "TXT", name: record.txt_name, value: txtRecord });
      } else if (textValue(record?.cname, 253) && textValue(record?.cname_target, 253)) {
        records.push({ type: "CNAME", name: record.cname, value: record.cname_target });
      }
    }
  }
  return records;
}

function domainSummary(row) {
  let validationRecords = [];
  try {
    const decoded = JSON.parse(row.validation_records_json ?? "[]");
    validationRecords = Array.isArray(decoded) ? decoded.slice(0, 20) : [];
  } catch {
    validationRecords = [];
  }
  return {
    id: row.id,
    hostname: row.hostname,
    status: row.status,
    provider_status: row.provider_status,
    certificate_status: row.certificate_status,
    cname_record: row.cname_target ? { type: "CNAME", name: row.hostname, value: row.cname_target, proxy: false } : null,
    ownership_record: row.ownership_txt_value ? { type: "TXT", name: row.ownership_txt_name, value: row.ownership_txt_value } : null,
    validation_records: validationRecords,
    ownership_expires_at: row.ownership_txt_value ? row.ownership_expires_at : null,
    created_at: row.created_at,
    activated_at: row.activated_at,
    last_checked_at: row.last_checked_at,
    last_verified_at: row.last_verified_at,
  };
}

async function cloudflareSaasRequest(env, method, hostnameId = null, body = undefined) {
  const suffix = hostnameId ? `/${encodeURIComponent(hostnameId)}` : "";
  const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${env.CF_SAAS_ZONE_ID}/custom_hostnames${suffix}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.CF_SAAS_API_TOKEN}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(8000),
  });
  if (method === "DELETE" && (response.status === 204 || response.status === 404)) return null;
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("custom hostname provider returned an unreadable response");
  }
  if (!response.ok || payload?.success !== true || (method !== "DELETE" && !payload?.result)) {
    throw new Error("custom hostname provider request failed");
  }
  return payload.result;
}

async function findCloudflareHostname(env, hostname) {
  const url = new URL(`https://api.cloudflare.com/client/v4/zones/${env.CF_SAAS_ZONE_ID}/custom_hostnames`);
  url.searchParams.set("hostname", hostname);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${env.CF_SAAS_API_TOKEN}` },
    signal: AbortSignal.timeout(8000),
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("custom hostname provider returned an unreadable response");
  }
  if (!response.ok || payload?.success !== true || !Array.isArray(payload?.result)) {
    throw new Error("custom hostname lookup failed");
  }
  const matches = payload.result.filter((item) => item?.hostname?.toLowerCase() === hostname);
  if (matches.length > 1 || matches.some((item) => item.custom_origin_server)) {
    throw new Error("custom hostname provider state requires operator review");
  }
  return matches[0] ?? null;
}

async function dnsTxtContains(name, expected) {
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=TXT`;
  const response = await fetch(url, {
    headers: { Accept: "application/dns-json" },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("DNS verification service unavailable");
  const payload = await response.json();
  if (![0, 3].includes(payload?.Status)) throw new Error("DNS verification service returned an indeterminate answer");
  return (payload?.Answer ?? []).some((answer) => {
    if (answer?.type !== 16 || typeof answer.data !== "string") return false;
    try {
      return JSON.parse(answer.data) === expected;
    } catch {
      return answer.data === `"${expected}"`;
    }
  });
}

async function dnsCnameMatches(hostname, expectedTarget) {
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=CNAME`;
  const response = await fetch(url, {
    headers: { Accept: "application/dns-json" },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("DNS verification service unavailable");
  const payload = await response.json();
  if (![0, 3].includes(payload?.Status)) throw new Error("DNS verification service returned an indeterminate answer");
  const target = expectedTarget.toLowerCase().replace(/\.$/, "");
  return (payload?.Answer ?? []).some((answer) => answer?.type === 5
    && typeof answer.data === "string"
    && answer.data.toLowerCase().replace(/\.$/, "") === target);
}

async function createCloudflareHostname(env, domain) {
  const existing = await findCloudflareHostname(env, domain.hostname);
  const created = existing ?? await cloudflareSaasRequest(env, "POST", null, {
    hostname: domain.hostname,
    ssl: { method: "txt", type: "dv", settings: { min_tls_version: "1.2" } },
  });
  if (created.hostname?.toLowerCase() !== domain.hostname || !/^[a-f0-9-]{36}$/i.test(created.id ?? "")) {
    throw new Error("custom hostname provider returned a mismatched hostname");
  }
  let current = created;
  try {
    current = await cloudflareSaasRequest(env, "GET", created.id);
  } catch {
    // The create response is still useful; the owner can refresh provider state later.
  }
  const updatedAt = new Date().toISOString();
  const providerStatus = typeof current.status === "string" ? current.status : "pending";
  const certificateStatus = typeof current.ssl?.status === "string" ? current.ssl.status : "pending";
  const records = readValidationRecords(current);
  const update = await env.DB.prepare(
    "UPDATE site_hostnames SET provider_hostname_id = ?, provider_status = ?, certificate_status = ?, cname_target = ?, validation_records_json = ?, status = 'tls_pending', updated_at = ? WHERE site_id = ? AND id = ? AND status = 'provider_creating' AND ownership_verified_at IS NOT NULL AND provider_hostname_id IS NULL",
  ).bind(created.id, providerStatus, certificateStatus, providerCnameTarget(env.CF_SAAS_CNAME_TARGET), JSON.stringify(records), updatedAt, domain.site_id, domain.id).run();
  if (update.meta?.changes !== 1) {
    try {
      await cloudflareSaasRequest(env, "DELETE", created.id);
    } catch {
      // The hostname will not route to the tenant until an active D1 mapping exists.
    }
    throw new Error("custom hostname request was replaced before provider state was saved");
  }
  return await env.DB.prepare("SELECT * FROM site_hostnames WHERE site_id = ? AND id = ? LIMIT 1")
    .bind(domain.site_id, domain.id).first();
}

async function refreshCloudflareHostname(request, env, site, domain, owner) {
  if (!domain.provider_hostname_id) return fail(409, "hostname_not_provisioned", "Verify the ownership TXT record before refreshing provider status.");
  let provider;
  try {
    provider = await cloudflareSaasRequest(env, "GET", domain.provider_hostname_id);
  } catch {
    return fail(503, "hostname_provider_unavailable", "Hostname status could not be read. Try again later.");
  }
  if (provider.hostname?.toLowerCase() !== domain.hostname || provider.id !== domain.provider_hostname_id) {
    return fail(502, "hostname_provider_mismatch", "The provider returned a hostname that does not match this request.");
  }
  if (provider.custom_origin_server) return fail(502, "hostname_provider_mismatch", "The provider hostname is not attached to the MithrilPress fallback Worker.");

  let cnameMatches = false;
  try {
    cnameMatches = await dnsCnameMatches(domain.hostname, providerCnameTarget(env.CF_SAAS_CNAME_TARGET));
  } catch {
    return fail(503, "dns_status_unavailable", "DNS status could not be read. Try again later.");
  }
  const providerStatus = typeof provider.status === "string" ? provider.status : "pending";
  const certificateStatus = typeof provider.ssl?.status === "string" ? provider.ssl.status : "pending";
  const readyAtProvider = providerStatus === "active" && certificateStatus === "active";
  const previouslyActive = domain.status === "active";
  const terminalProviderState = /blocked|deleted|timed_out|expired|error/i.test(`${providerStatus} ${certificateStatus}`);
  const nextStatus = terminalProviderState
    ? (previouslyActive ? "suspended" : "action_required")
    : readyAtProvider && cnameMatches
      ? "active"
      : readyAtProvider
        ? (previouslyActive ? "suspended" : "dns_pending")
        : (previouslyActive ? "suspended" : certificateStatus === "active" ? "provider_pending" : "tls_pending");
  const updatedAt = new Date().toISOString();
  const records = readValidationRecords(provider);
  await env.DB.prepare(
    "UPDATE site_hostnames SET status = ?, provider_status = ?, certificate_status = ?, validation_records_json = ?, last_checked_at = ?, last_verified_at = CASE WHEN ? = 'active' THEN ? ELSE last_verified_at END, health_check_failures = 0, updated_at = ?, activated_at = CASE WHEN ? = 'active' THEN COALESCE(activated_at, ?) ELSE activated_at END WHERE site_id = ? AND id = ? AND status NOT IN ('detaching', 'detached')",
  ).bind(nextStatus, providerStatus, certificateStatus, JSON.stringify(records), updatedAt, nextStatus, updatedAt, updatedAt, nextStatus, updatedAt, site.id, domain.id).run();
  const latest = await env.DB.prepare("SELECT * FROM site_hostnames WHERE site_id = ? AND id = ? LIMIT 1").bind(site.id, domain.id).first();
  await auditDomainAction(env, site, latest, owner, nextStatus === "active" ? "domain-activated" : "domain-refreshed", {
    provider_status: providerStatus,
    certificate_status: certificateStatus,
    cname_matches: cnameMatches,
    state: nextStatus,
  });
  return json({ domain: domainSummary(latest), message: nextStatus === "active"
    ? "The custom hostname, certificate, and CNAME target are active."
    : nextStatus === "dns_pending"
      ? "Add the DNS-only CNAME record shown below, then refresh status."
      : nextStatus === "suspended"
        ? "The hostname was suspended because provider, certificate, or DNS status is no longer active."
        : "Hostname setup is still in progress. Refresh status later." });
}

async function monitorActiveCustomHostnames(env) {
  if (!domainManagementConfigured(env)) return;
  await expirePendingCustomHostnames(env, new Date().toISOString());
  const rows = await env.DB.prepare(
    "SELECT h.*, s.hostname AS site_hostname FROM site_hostnames h JOIN sites s ON s.id = h.site_id WHERE h.status = 'active' AND s.status = 'active' ORDER BY COALESCE(h.last_checked_at, '') ASC, h.created_at ASC LIMIT ?",
  ).bind(CUSTOM_DOMAIN_HEALTH_BATCH_SIZE).all();
  let checked = 0;
  let suspended = 0;

  for (const domain of rows.results ?? []) {
    const checkedAt = new Date().toISOString();
    const site = { id: domain.site_id, hostname: domain.site_hostname };
    const owner = { tokenId: domain.owner_token_id };
    let provider;
    let providerMatches = false;
    let cnameMatches = false;
    try {
      provider = await cloudflareSaasRequest(env, "GET", domain.provider_hostname_id);
      providerMatches = provider.hostname?.toLowerCase() === domain.hostname
        && provider.id === domain.provider_hostname_id
        && !provider.custom_origin_server;
      cnameMatches = providerMatches
        && await dnsCnameMatches(domain.hostname, providerCnameTarget(env.CF_SAAS_CNAME_TARGET));
    } catch {
      const update = await env.DB.prepare(
        "UPDATE site_hostnames SET status = CASE WHEN health_check_failures + 1 >= ? THEN 'suspended' ELSE status END, health_check_failures = MIN(health_check_failures + 1, ?), last_checked_at = ?, updated_at = CASE WHEN health_check_failures + 1 >= ? THEN ? ELSE updated_at END WHERE site_id = ? AND id = ? AND status = 'active'",
      ).bind(CUSTOM_DOMAIN_HEALTH_FAILURE_LIMIT, CUSTOM_DOMAIN_HEALTH_FAILURE_LIMIT, checkedAt, CUSTOM_DOMAIN_HEALTH_FAILURE_LIMIT, checkedAt, site.id, domain.id).run();
      const latest = await env.DB.prepare(
        "SELECT * FROM site_hostnames WHERE site_id = ? AND id = ? LIMIT 1",
      ).bind(site.id, domain.id).first();
      checked += 1;
      if (update.meta?.changes === 1 && latest?.status === "suspended") {
        suspended += 1;
        await auditDomainAction(env, site, latest, owner, "domain-suspended", {
          source: "scheduled-health-check",
          reason: "three-consecutive-check-failures",
        });
      }
      continue;
    }

    const providerStatus = typeof provider.status === "string" ? provider.status : "unknown";
    const certificateStatus = typeof provider.ssl?.status === "string" ? provider.ssl.status : "unknown";
    const remainsActive = providerMatches && cnameMatches
      && providerStatus === "active" && certificateStatus === "active";
    const nextStatus = remainsActive ? "active" : "suspended";
    const update = await env.DB.prepare(
      "UPDATE site_hostnames SET status = ?, provider_status = ?, certificate_status = ?, validation_records_json = ?, last_checked_at = ?, last_verified_at = CASE WHEN ? = 'active' THEN ? ELSE last_verified_at END, health_check_failures = 0, updated_at = CASE WHEN ? != status THEN ? ELSE updated_at END WHERE site_id = ? AND id = ? AND status = 'active'",
    ).bind(nextStatus, providerStatus, certificateStatus, JSON.stringify(readValidationRecords(provider)), checkedAt, nextStatus, checkedAt, nextStatus, checkedAt, site.id, domain.id).run();
    checked += 1;
    if (update.meta?.changes === 1 && nextStatus === "suspended") {
      suspended += 1;
      await auditDomainAction(env, site, domain, owner, "domain-suspended", {
        source: "scheduled-health-check",
        provider_status: providerStatus,
        certificate_status: certificateStatus,
        cname_matches: Boolean(cnameMatches),
      });
    }
  }
  console.log(JSON.stringify({ event: "mithrilpress_domain_health_check", checked, suspended }));
}

async function studioDomains(request, env, site) {
  const authorized = await domainOwner(request, env, site);
  if (authorized.error) return authorized.error;
  const { owner } = authorized;
  if (request.method === "GET") {
    const [rows, defaultSite] = await Promise.all([
      env.DB.prepare(
        "SELECT * FROM site_hostnames WHERE site_id = ? AND status != 'detached' ORDER BY created_at DESC LIMIT 20",
      ).bind(site.id).all(),
      env.DB.prepare("SELECT hostname FROM sites WHERE id = ? LIMIT 1").bind(site.id).first(),
    ]);
    return json({ enabled: domainManagementConfigured(env), default_hostname: defaultSite?.hostname ?? site.hostname, domains: (rows.results ?? []).map(domainSummary) });
  }
  if (!domainManagementConfigured(env)) return fail(503, "custom_domains_unavailable", "Custom domains are not enabled on this hosting deployment.");
  if (request.method !== "POST") return fail(405, "method_not_allowed", "Use GET or POST for custom domain setup.");
  const body = await readBoundedJson(request);
  const hostname = customHostname(body?.hostname);
  if (!hostname) return fail(422, "invalid_custom_hostname", "Enter a fully qualified hostname outside mithril.love, such as blog.example.com.");
  const today = new Date().toISOString().slice(0, 10);
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM domain_actions WHERE site_id = ? AND token_id = ? AND action = 'domain-requested' AND created_at >= ?",
  ).bind(site.id, owner.tokenId, `${today}T00:00:00.000Z`).first();
  if (Number(recent?.total ?? 0) >= 5) return fail(429, "domain_request_limit", "This owner token has reached its five custom hostname requests per day.");
  const now = new Date();
  const nowIso = now.toISOString();
  await expirePendingCustomHostnames(env, nowIso);
  const total = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM site_hostnames WHERE status NOT IN ('ownership_pending', 'detached')",
  ).first();
  const capacity = Math.min(CUSTOM_DOMAIN_LIMIT_PER_DEPLOYMENT, Number.parseInt(env.CF_SAAS_CAPACITY_REMAINING, 10));
  if (Number(total?.total ?? 0) >= capacity) {
    return fail(429, "custom_hostname_capacity", "The deployment has reached its reserved free-plan hostname capacity.");
  }
  const existing = await env.DB.prepare(
    "SELECT * FROM site_hostnames WHERE hostname = ? AND status NOT IN ('ownership_pending', 'detached') LIMIT 1",
  ).bind(hostname).first();
  if (existing) {
    return fail(409, "custom_hostname_in_use", "This hostname is already being used by a MithrilPress site.");
  }
  const perSite = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM site_hostnames WHERE site_id = ? AND status != 'detached'",
  ).bind(site.id).first();
  if (Number(perSite?.total ?? 0) >= CUSTOM_DOMAIN_LIMIT_PER_SITE) {
    return fail(429, "site_hostname_capacity", "This site has reached its ten custom hostname limit.");
  }

  const domain = {
    id: crypto.randomUUID(),
    site_id: site.id,
    hostname,
    status: "ownership_pending",
    owner_token_id: owner.tokenId,
    ownership_txt_name: `_mithrilpress-verify.${hostname}`,
    ownership_txt_value: `mithrilpress-verification=${hex(crypto.getRandomValues(new Uint8Array(32)))}`,
    ownership_expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    created_at: nowIso,
    updated_at: nowIso,
  };
  const insert = await env.DB.prepare(
    "INSERT INTO site_hostnames (id, site_id, hostname, status, owner_token_id, ownership_txt_name, ownership_txt_value, ownership_expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING",
  ).bind(domain.id, site.id, hostname, domain.status, owner.tokenId, domain.ownership_txt_name, domain.ownership_txt_value, domain.ownership_expires_at, nowIso, nowIso).run();
  if (insert.meta?.changes !== 1) return fail(409, "custom_hostname_in_use", "This hostname was requested by another session. Reload and retry.");
  const saved = await env.DB.prepare("SELECT * FROM site_hostnames WHERE site_id = ? AND id = ? LIMIT 1").bind(site.id, domain.id).first();
  await auditDomainAction(env, site, saved, owner, "domain-requested", { hostname });
  return json({ domain: domainSummary(saved), message: "Publish the ownership TXT record, then choose Verify ownership." }, 201);
}

async function studioDomainAction(request, env, site, hostnameId, action) {
  const authorized = await domainOwner(request, env, site);
  if (authorized.error) return authorized.error;
  const { owner } = authorized;
  const domain = await env.DB.prepare(
    "SELECT * FROM site_hostnames WHERE site_id = ? AND id = ? LIMIT 1",
  ).bind(site.id, hostnameId).first();
  if (!domain) return fail(404, "custom_hostname_not_found", "Custom hostname not found.");

  if (action === "verify") {
    if (request.method !== "POST") return fail(405, "method_not_allowed", "Use POST to verify hostname ownership.");
    if (!domainManagementConfigured(env)) return fail(503, "custom_domains_unavailable", "Custom domains are not enabled on this hosting deployment.");
    if (!await domainCheckRateLimit(env, site, domain, owner, action)) {
      return fail(429, "hostname_check_limit", "This owner token has reached its ten hostname checks per minute.");
    }
    if (!domain.ownership_verified_at) {
      if (domain.status !== "ownership_pending" || !domain.ownership_txt_value
          || Date.parse(domain.ownership_expires_at) <= Date.now()) {
        return fail(409, "ownership_challenge_expired", "The ownership challenge expired. Remove this request and start again.");
      }
      let verified = false;
      try {
        verified = await dnsTxtContains(domain.ownership_txt_name, domain.ownership_txt_value);
      } catch {
        return fail(503, "dns_status_unavailable", "DNS status could not be read. Try again later.");
      }
      if (!verified) return fail(409, "ownership_not_verified", "The required TXT record was not found. Check its name and value, then retry.");
      const verifiedAt = new Date().toISOString();
      let update;
      try {
        update = await env.DB.prepare(
          "UPDATE site_hostnames SET status = 'provider_pending', ownership_verified_at = ?, ownership_txt_value = NULL, updated_at = ? WHERE site_id = ? AND id = ? AND status = 'ownership_pending' AND ownership_txt_value = ?",
        ).bind(verifiedAt, verifiedAt, site.id, domain.id, domain.ownership_txt_value).run();
      } catch (error) {
        if (/unique constraint failed/i.test(String(error?.message ?? error))) {
          return fail(409, "custom_hostname_in_use", "Another site claimed this hostname after ownership was verified.");
        }
        throw error;
      }
      if (update.meta?.changes !== 1) return fail(409, "ownership_state_changed", "The hostname request changed. Reload the domain list and retry.");
      domain.status = "provider_pending";
      domain.ownership_verified_at = verifiedAt;
      domain.ownership_txt_value = null;
      await auditDomainAction(env, site, domain, owner, "domain-owner-verified", { hostname: domain.hostname });
    }
    if (!domain.provider_hostname_id
        && Date.parse(domain.ownership_verified_at) < Date.now() - 24 * 60 * 60 * 1000) {
      return fail(409, "ownership_proof_expired", "The ownership proof expired before provisioning completed. Remove this hostname request and start again.");
    }
    if (domain.provider_hostname_id) return await refreshCloudflareHostname(request, env, site, domain, owner);
    if (domain.status === "provider_creating") {
      const staleAt = Date.now() - 30_000;
      if (Date.parse(domain.updated_at) > staleAt) {
        return fail(409, "hostname_setup_in_progress", "Hostname provisioning is already in progress. Reload the domain list shortly.");
      }
      const recover = await env.DB.prepare(
        "UPDATE site_hostnames SET status = 'action_required', updated_at = ? WHERE site_id = ? AND id = ? AND status = 'provider_creating' AND provider_hostname_id IS NULL AND updated_at = ?",
      ).bind(new Date().toISOString(), site.id, domain.id, domain.updated_at).run();
      if (recover.meta?.changes !== 1) return fail(409, "hostname_setup_in_progress", "Hostname provisioning changed while checking recovery. Reload and retry.");
      domain.status = "action_required";
    }
    const claim = await env.DB.prepare(
      "UPDATE site_hostnames SET status = 'provider_creating', updated_at = ? WHERE site_id = ? AND id = ? AND status IN ('provider_pending', 'action_required') AND ownership_verified_at IS NOT NULL AND provider_hostname_id IS NULL",
    ).bind(new Date().toISOString(), site.id, domain.id).run();
    if (claim.meta?.changes !== 1) return fail(409, "hostname_setup_in_progress", "Hostname provisioning is already in progress. Reload the domain list shortly.");
    domain.status = "provider_creating";
    try {
      const created = await createCloudflareHostname(env, domain);
      if (!created?.provider_hostname_id) return fail(503, "hostname_provider_unavailable", "The hostname provider has not confirmed provisioning. Try again later.");
      await auditDomainAction(env, site, created, owner, "domain-provider-created", { provider_status: created.provider_status, certificate_status: created.certificate_status });
      return json({ domain: domainSummary(created), message: "Ownership is verified. Publish the provider validation records and the CNAME record below." }, 201);
    } catch {
      await env.DB.prepare("UPDATE site_hostnames SET status = 'action_required', updated_at = ? WHERE site_id = ? AND id = ? AND status = 'provider_creating' AND provider_hostname_id IS NULL")
        .bind(new Date().toISOString(), site.id, domain.id).run();
      return fail(503, "hostname_provider_unavailable", "The custom hostname provider could not complete setup. Ownership remains verified; retry later or contact the site operator.");
    }
  }

  if (action === "refresh") {
    if (request.method !== "POST") return fail(405, "method_not_allowed", "Use POST to refresh custom hostname status.");
    if (!domainManagementConfigured(env)) return fail(503, "custom_domains_unavailable", "Custom domains are not enabled on this hosting deployment.");
    if (!await domainCheckRateLimit(env, site, domain, owner, action)) {
      return fail(429, "hostname_check_limit", "This owner token has reached its ten hostname checks per minute.");
    }
    return await refreshCloudflareHostname(request, env, site, domain, owner);
  }

  if (action === "delete") {
    if (request.method !== "DELETE") return fail(405, "method_not_allowed", "Use DELETE to remove a custom hostname.");
    if (domain.status === "detached") return json({ domain: domainSummary(domain) });
    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE site_hostnames SET status = 'detaching', updated_at = ? WHERE site_id = ? AND id = ? AND status != 'detached'")
      .bind(now, site.id, domain.id).run();
    if (domain.provider_hostname_id && !domainManagementConfigured(env)) {
      return fail(503, "hostname_detach_pending", "The hostname is no longer served by MithrilPress. Provider cleanup is pending because custom-domain credentials are unavailable.");
    }
    if (domain.provider_hostname_id) {
      try {
        await cloudflareSaasRequest(env, "DELETE", domain.provider_hostname_id);
      } catch {
        return fail(503, "hostname_detach_pending", "The hostname is no longer served by MithrilPress. Provider cleanup is pending; retry removal later.");
      }
    }
    await env.DB.prepare("UPDATE site_hostnames SET status = 'detached', ownership_txt_value = NULL, updated_at = ?, detached_at = ? WHERE site_id = ? AND id = ?")
      .bind(now, now, site.id, domain.id).run();
    const detached = await env.DB.prepare("SELECT * FROM site_hostnames WHERE site_id = ? AND id = ? LIMIT 1").bind(site.id, domain.id).first();
    await auditDomainAction(env, site, detached, owner, "domain-detached", { hostname: domain.hostname });
    return json({ domain: domainSummary(detached), message: "The hostname has been detached from this site." });
  }
  return fail(404, "domain_action_not_found", "Custom hostname action not found.");
}

function validateSourceOrigin(value) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function validateWxrChannelOrigin(value) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

async function studioSession(request, env, site) {
  if (request.method === "GET") {
    const owner = await ownerToken(request, env, site, "content:write")
      ?? await ownerToken(request, env, site, "media:write")
      ?? await ownerToken(request, env, site, "site:domains")
      ?? await ownerToken(request, env, site, "site:dns-migrate");
    if (!owner) return fail(401, "studio_login_required", "Sign in with an owner token that has a Studio scope.");
    const session = owner.viaSession
      ? await env.DB.prepare("SELECT expires_at FROM studio_sessions WHERE site_id = ? AND session_id = ? AND revoked_at IS NULL LIMIT 1")
        .bind(site.id, owner.sessionId).first()
      : null;
    return json({ authenticated: true, owner: owner.ownerLabel, scopes: owner.scopes ?? [], expires_at: session?.expires_at ?? null });
  }

  if (request.method === "POST") {
    if (!sameOriginStudioMutation(request, site)) return fail(403, "same_origin_required", "Studio sign-in must come from this site.");
    const body = await readBoundedJson(request);
    const parts = typeof body?.token === "string"
      ? /^([a-f0-9]{24})\.([A-Za-z0-9_-]{43})$/.exec(body.token)
      : null;
    if (!parts) return fail(401, "studio_login_required", "The owner token is invalid or lacks content:write scope.");
    const nowDate = new Date();
    const owner = await verifyOwnerTokenParts(env, site, parts[1], parts[2], null, nowDate.toISOString());
    if (!owner || !(owner.scopes.includes("content:write") || owner.scopes.includes("media:write") || owner.scopes.includes("site:domains")
        || owner.scopes.includes("site:dns-migrate"))) {
      return fail(401, "studio_login_required", "The owner token is invalid or lacks a Studio scope.");
    }

    const sessionId = hex(crypto.getRandomValues(new Uint8Array(12)));
    const secret = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
      .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
    const saltHex = hex(crypto.getRandomValues(new Uint8Array(16)));
    const hashHex = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${saltHex}.${secret}`)));
    const maxExpiry = new Date(nowDate.getTime() + 60 * 60 * 1000);
    const expiresAt = new Date(Math.min(maxExpiry.getTime(), Date.parse(owner.expiresAt))).toISOString();
    await env.DB.prepare(
      "INSERT INTO studio_sessions (site_id, session_id, token_id, salt_hex, secret_hash_hex, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(site.id, sessionId, owner.tokenId, saltHex, hashHex, nowDate.toISOString(), expiresAt).run();
    const maxAge = Math.max(0, Math.floor((Date.parse(expiresAt) - nowDate.getTime()) / 1000));
    return json({ authenticated: true, owner: owner.ownerLabel, scopes: owner.scopes ?? [], expires_at: expiresAt }, 200, {
      "Set-Cookie": studioCookie(`${sessionId}.${secret}`, maxAge),
    });
  }

  if (request.method === "DELETE") {
    const owner = await ownerToken(request, env, site, "content:write")
      ?? await ownerToken(request, env, site, "media:write")
      ?? await ownerToken(request, env, site, "site:domains")
      ?? await ownerToken(request, env, site, "site:dns-migrate");
    if (!owner?.viaSession || !owner.sessionId) return fail(401, "studio_login_required", "An active studio session is required.");
    await env.DB.prepare(
      "UPDATE studio_sessions SET revoked_at = ? WHERE site_id = ? AND session_id = ? AND revoked_at IS NULL",
    ).bind(new Date().toISOString(), site.id, owner.sessionId).run();
    return json({ authenticated: false }, 200, { "Set-Cookie": studioCookie("", 0) });
  }

  return fail(405, "method_not_allowed", "Use GET, POST, or DELETE for studio session management.");
}

const STUDIO_DAILY_GENERATION_LIMIT = 8;
const STUDIO_MAX_MESSAGES = 40;
const STUDIO_CONTEXT_MESSAGES = 8;
const STUDIO_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    assistant_message: { type: "string" },
    title: { type: "string" },
    slug: { type: "string" },
    language: { type: "string" },
    html: { type: "string" },
  },
  required: ["assistant_message", "title", "slug", "language", "html"],
  additionalProperties: false,
};

function studioSlug(value, fallback) {
  const source = typeof value === "string" && value.trim() ? value : fallback;
  const normalized = source.normalize("NFKC").toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180)
    .replace(/-+$/g, "");
  return normalized || "untitled";
}

function normalizedLanguageTag(value) {
  if (typeof value !== "string" || value.length > 64 || value.trim() !== value) return null;
  try {
    return Intl.getCanonicalLocales(value)[0] ?? null;
  } catch {
    return null;
  }
}

async function studioChat(request, env, site) {
  if (!sameOriginStudioMutation(request, site)) return fail(403, "same_origin_required", "Studio changes must come from this site.");
  const owner = await ownerToken(request, env, site, "content:write");
  if (!owner) return fail(401, "studio_login_required", "An active content:write session is required.");
  if (!isWorkersFreeAiEnabled(env)) {
    return fail(503, "ai_unavailable", "Chat drafting is disabled until Workers AI is explicitly enabled in Workers Free-only mode.");
  }

  const body = await readBoundedJson(request);
  if (!textValue(body?.message, 1800)) return fail(422, "invalid_message", "Enter a message of up to 1,800 characters.");
  const hasFeaturedMedia = Object.hasOwn(body, "featured_media_id");
  let requestedFeaturedMediaId = null;
  if (hasFeaturedMedia && body.featured_media_id !== null) {
    if (!Number.isSafeInteger(body.featured_media_id) || body.featured_media_id <= 0) {
      return fail(422, "invalid_featured_media", "Select a media item from this site's library.");
    }
    if (!owner.scopes.includes("media:write")) {
      return fail(403, "media_scope_required", "A media:write owner scope is required to set a featured image.");
    }
    const selectedMedia = await env.DB.prepare(
      "SELECT id FROM media_assets WHERE site_id = ? AND id = ? AND status = 'active' LIMIT 1",
    ).bind(site.id, body.featured_media_id).first();
    if (!selectedMedia) return fail(422, "invalid_featured_media", "Select an active image from this site's media library.");
    requestedFeaturedMediaId = selectedMedia.id;
  }
  const requestedKind = body.kind === "page" ? "page" : "post";
  const requestedConversationId = body.conversation_id ?? null;
  if (requestedConversationId !== null && !/^[a-f0-9-]{36}$/.test(requestedConversationId)) {
    return fail(422, "invalid_conversation", "The studio conversation identifier is invalid.");
  }

  const now = new Date();
  const nowIso = now.toISOString();
  let conversation;
  if (requestedConversationId) {
    conversation = await env.DB.prepare(
      "SELECT c.id, c.token_id, c.base_revision_id, c.draft_revision_id, r.state AS draft_state FROM studio_conversations c LEFT JOIN site_revisions r ON r.site_id = c.site_id AND r.id = c.draft_revision_id WHERE c.site_id = ? AND c.id = ? LIMIT 1",
    ).bind(site.id, requestedConversationId).first();
    if (!conversation || conversation.token_id !== owner.tokenId) return fail(404, "conversation_not_found", "Studio conversation not found.");
    if (conversation.base_revision_id !== site.current_revision_id) {
      return fail(409, "site_changed", "The published site changed since this conversation began. Start a new conversation from the latest revision.");
    }
    if (conversation.draft_state && conversation.draft_state !== "private-preview") {
      return fail(409, "draft_locked", "This conversation draft has been approved or published. Start a new conversation to continue editing.");
    }
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM studio_messages WHERE site_id = ? AND conversation_id = ?",
    ).bind(site.id, conversation.id).first();
    if (Number(count?.total ?? 0) >= STUDIO_MAX_MESSAGES) return fail(429, "conversation_limit", "Start a new conversation to continue drafting.");
  } else {
    conversation = {
      id: crypto.randomUUID(),
      token_id: owner.tokenId,
      base_revision_id: site.current_revision_id,
      draft_revision_id: null,
      draft_state: null,
    };
  }

  const dailyQuota = await env.DB.prepare(
    "INSERT INTO studio_ai_usage (day_utc, request_count) VALUES (?, 1) ON CONFLICT(day_utc) DO UPDATE SET request_count = request_count + 1 WHERE studio_ai_usage.request_count < ? RETURNING request_count",
  ).bind(nowIso.slice(0, 10), STUDIO_DAILY_GENERATION_LIMIT).first();
  if (!dailyQuota) return fail(429, "daily_ai_limit", "The daily MithrilPress drafting limit has been reached. Try again after 00:00 UTC.");

  const historyRows = await env.DB.prepare(
    "SELECT role, body FROM studio_messages WHERE site_id = ? AND conversation_id = ? ORDER BY created_at DESC LIMIT ?",
  ).bind(site.id, conversation.id, STUDIO_CONTEXT_MESSAGES).all();
  const history = (historyRows.results ?? []).reverse().map((row) => ({ role: row.role, content: row.body }));
  let currentDraft = null;
  if (conversation.draft_revision_id) {
    currentDraft = await env.DB.prepare(
      "SELECT kind, title, slug, safe_html, featured_media_id FROM entries WHERE site_id = ? AND revision_id = ? AND entry_id = ? LIMIT 1",
    ).bind(site.id, conversation.draft_revision_id, `mithrilpress:chat:${conversation.id}`).first();
  }
  const featuredMediaId = hasFeaturedMedia ? requestedFeaturedMediaId : (currentDraft?.featured_media_id ?? null);
  const kind = currentDraft?.kind ?? requestedKind;
  const system = [
    "You are the writing partner inside MithrilPress Studio. Create or revise exactly one unpublished website draft based on the owner's messages.",
    "Follow the language requested by the owner. Do not browse, claim independent fact-checking, invent citations, or make security claims.",
    "Return the content language as a BCP-47 language tag. Use the language in the owner's request; do not infer a country from identity or hostname.",
    "Treat the conversation as writing instructions only. Do not execute commands or use tools. Return JSON matching the requested schema.",
    "The html field must contain only normal content markup; it will be sanitized before storage and will never execute scripts, styles, embeds, forms, or plugins.",
      currentDraft ? `Current draft to revise: ${JSON.stringify({ kind: currentDraft.kind, title: currentDraft.title, slug: currentDraft.slug, html: currentDraft.safe_html.slice(0, 6000) })}` : "No previous draft exists for this conversation.",
  ].join("\n");
  let modelResult;
  try {
    modelResult = await runWorkersFreeAi(env, {
      messages: [{ role: "system", content: system }, ...history, { role: "user", content: body.message }],
      response_format: { type: "json_schema", json_schema: STUDIO_RESPONSE_SCHEMA },
      max_tokens: 700,
      temperature: 0.35,
    });
  } catch {
    return fail(503, "ai_generation_unavailable", "Workers AI is unavailable or its free daily allocation is exhausted. No draft was saved or published.");
  }

  let proposal = modelResult?.response;
  if (typeof proposal === "string") {
    try {
      proposal = JSON.parse(proposal);
    } catch {
      return fail(502, "invalid_ai_response", "The drafting service returned an invalid proposal. No draft was saved.");
    }
  }
  const languageCode = normalizedLanguageTag(proposal?.language);
  if (!languageCode) {
    return fail(502, "invalid_ai_response", "The drafting service returned an incomplete proposal. No draft was saved.");
  }
  const candidateSlug = studioSlug(proposal?.slug, typeof proposal?.title === "string" ? proposal.title : "");
  const admittedDraft = mithrilContentBoundary.prepareChatDraft(
    site.id, owner.tokenId, conversation.id, kind, candidateSlug, proposal, languageCode,
  );
  if (!admittedDraft.ok || admittedDraft.status !== "private-draft"
      || admittedDraft.publicationAdmitted !== false || admittedDraft.tenantId !== site.id
      || admittedDraft.authorizationProofId !== owner.tokenId || admittedDraft.conversationId !== conversation.id
      || admittedDraft.entry.tenantId !== site.id || admittedDraft.entry.kind !== kind
      || admittedDraft.entry.id !== `mithrilpress:chat:${conversation.id}`
      || admittedDraft.entry.language !== languageCode || admittedDraft.entry.trust !== "untrusted"
      || admittedDraft.entry.renderingAdmission !== "blocked" || admittedDraft.entry.publicationState !== "draft") {
    return fail(502, "invalid_ai_response", "The drafting service returned an incomplete proposal. No draft was saved.");
  }
  const chatEntry = admittedDraft.entry;
  const safeHtml = await sanitizeHtml(chatEntry.source);
  if (!textValue(safeHtml, MAX_SAFE_HTML_CHARS)) return fail(502, "empty_ai_draft", "The generated content did not contain publishable text. No draft was saved.");
  let slug = chatEntry.slug;
  const baseEntries = conversation.base_revision_id
    ? await env.DB.prepare(
      "SELECT slug, api_id FROM entries WHERE site_id = ? AND revision_id = ? AND kind = ?",
    ).bind(site.id, conversation.base_revision_id, kind).all()
    : { results: [] };
  const occupied = new Set((baseEntries.results ?? []).map((entry) => entry.slug));
  if (occupied.has(slug)) {
    const suffix = conversation.id.replaceAll("-", "").slice(0, 10);
    const prefix = slug.slice(0, 180 - suffix.length - 1).replace(/-+$/g, "") || "entry";
    slug = `${prefix}-${suffix}`;
  }
  const apiId = Math.max(0, ...((baseEntries.results ?? []).map((entry) => Number(entry.api_id) || 0))) + 1;
  if (!Number.isSafeInteger(apiId)) return fail(409, "site_content_limit", "The site has reached the WordPress-compatible identifier limit.");
  const baseCount = conversation.base_revision_id
    ? Number((await env.DB.prepare("SELECT COUNT(*) AS total FROM entries WHERE site_id = ? AND revision_id = ?").bind(site.id, conversation.base_revision_id).first())?.total ?? 0)
    : 0;
  if (baseCount >= MAX_RECORDS) return fail(409, "site_content_limit", "This revision has reached the 500-entry limit. Import or archive content before adding another post.");

  const revisionId = crypto.randomUUID();
  const entryId = chatEntry.id;
  const assistantAt = new Date(now.getTime() + 1).toISOString();
  const baseRevisionId = conversation.base_revision_id;
  const statements = [];
  const newConversationOffset = requestedConversationId === null ? 1 : 0;
  if (newConversationOffset) {
    statements.push(
      env.DB.prepare(
        "INSERT INTO studio_conversations (site_id, id, token_id, base_revision_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(site.id, conversation.id, owner.tokenId, baseRevisionId, nowIso, nowIso),
    );
  }
  statements.push(
    env.DB.prepare(
      "UPDATE site_revisions SET state = 'superseded' WHERE site_id = ? AND id = (SELECT draft_revision_id FROM studio_conversations WHERE site_id = ? AND id = ?) AND state = 'private-preview'",
    ).bind(site.id, site.id, conversation.id),
    env.DB.prepare(
      "INSERT INTO site_revisions (id, site_id, parent_revision_id, state, revision_origin, source_origin, import_proof_id, import_token_id, imported_at, entry_count) SELECT ?, ?, ?, 'importing', 'chat', NULL, NULL, NULL, ?, ? WHERE EXISTS (SELECT 1 FROM studio_conversations c JOIN sites s ON s.id = c.site_id WHERE c.site_id = ? AND c.id = ? AND c.token_id = ? AND c.base_revision_id IS ? AND c.draft_revision_id IS ? AND (c.draft_revision_id IS NULL OR EXISTS (SELECT 1 FROM site_revisions d WHERE d.site_id = c.site_id AND d.id = c.draft_revision_id AND d.state = 'private-preview')) AND s.current_revision_id IS ? AND s.status = 'active')",
    ).bind(revisionId, site.id, baseRevisionId, nowIso, baseCount + 1,
      site.id, conversation.id, owner.tokenId, baseRevisionId, conversation.draft_revision_id, site.current_revision_id),
    env.DB.prepare(
      "INSERT INTO entries (site_id, revision_id, entry_id, kind, slug, title, source_html, safe_html, entry_origin, publication_status, language_code, api_id, source_id, source_status, source_date, source_date_gmt, source_modified, source_modified_gmt, source_permalink, categories_json, tags_json, featured_media_id, rendering_admission) SELECT site_id, ?, entry_id, kind, slug, title, source_html, safe_html, entry_origin, publication_status, language_code, api_id, source_id, source_status, source_date, source_date_gmt, source_modified, source_modified_gmt, source_permalink, categories_json, tags_json, featured_media_id, rendering_admission FROM entries WHERE site_id = ? AND revision_id = ?",
    ).bind(revisionId, site.id, baseRevisionId),
    env.DB.prepare(
      "INSERT INTO entry_seo_metadata (site_id, revision_id, entry_id, metadata_json) SELECT site_id, ?, entry_id, metadata_json FROM entry_seo_metadata WHERE site_id = ? AND revision_id = ?",
    ).bind(revisionId, site.id, baseRevisionId),
    env.DB.prepare(
      "INSERT INTO entry_media (site_id, revision_id, entry_id, media_id, created_at) SELECT site_id, ?, entry_id, media_id, created_at FROM entry_media WHERE site_id = ? AND revision_id = ?",
    ).bind(revisionId, site.id, baseRevisionId),
    env.DB.prepare(
      "INSERT INTO taxonomy_terms (site_id, revision_id, taxonomy, term_id, slug, name, description_html, parent_term_id) SELECT site_id, ?, taxonomy, term_id, slug, name, description_html, parent_term_id FROM taxonomy_terms WHERE site_id = ? AND revision_id = ?",
    ).bind(revisionId, site.id, baseRevisionId),
    env.DB.prepare(
      "INSERT INTO entries (site_id, revision_id, entry_id, kind, slug, title, source_html, safe_html, entry_origin, publication_status, language_code, api_id, source_id, source_status, source_date, source_date_gmt, source_modified, source_modified_gmt, source_permalink, categories_json, tags_json, featured_media_id, rendering_admission) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'chat', 'draft', ?, ?, NULL, 'draft', ?, ?, ?, ?, NULL, '[]', '[]', ?, 'ready')",
    ).bind(site.id, revisionId, entryId, kind, slug, chatEntry.title.trim(), chatEntry.source, safeHtml,
      languageCode, apiId, nowIso, nowIso, nowIso, nowIso, featuredMediaId),
    env.DB.prepare(
      "UPDATE site_revisions SET state = 'private-preview' WHERE site_id = ? AND id = ? AND state = 'importing' AND entry_count = (SELECT COUNT(*) FROM entries WHERE site_id = ? AND revision_id = ? AND rendering_admission = 'ready')",
    ).bind(site.id, revisionId, site.id, revisionId),
    env.DB.prepare(
      "UPDATE studio_conversations SET draft_revision_id = ?, updated_at = ? WHERE site_id = ? AND id = ? AND token_id = ? AND base_revision_id IS ?",
    ).bind(revisionId, assistantAt, site.id, conversation.id, owner.tokenId, baseRevisionId),
    env.DB.prepare(
      "INSERT INTO studio_messages (site_id, conversation_id, id, role, body, created_at) VALUES (?, ?, ?, 'user', ?, ?)",
    ).bind(site.id, conversation.id, crypto.randomUUID(), body.message.trim(), nowIso),
    env.DB.prepare(
      "INSERT INTO studio_messages (site_id, conversation_id, id, role, body, created_at) VALUES (?, ?, ?, 'assistant', ?, ?)",
    ).bind(site.id, conversation.id, crypto.randomUUID(), chatEntry.assistantMessage.trim(), assistantAt),
    env.DB.prepare(
      "INSERT INTO owner_actions (id, site_id, revision_id, token_id, action, created_at, metadata_json) SELECT ?, ?, ?, ?, 'chat-generate', ?, ? WHERE EXISTS (SELECT 1 FROM site_revisions WHERE site_id = ? AND id = ? AND state = 'private-preview')",
    ).bind(crypto.randomUUID(), site.id, revisionId, owner.tokenId, assistantAt,
      JSON.stringify({ model: STUDIO_MODEL, conversation_id: conversation.id, entry_id: entryId }), site.id, revisionId),
  );
  let saved;
  try {
    saved = await env.DB.batch(statements);
  } catch (error) {
    const quotaCode = storageQuotaCode(error);
    if (quotaCode) return storageQuotaResponse(quotaCode);
    return fail(503, "draft_not_saved", "The private draft could not be saved. No content was published.");
  }
  if (saved[7 + newConversationOffset]?.meta?.changes !== 1
      || saved[8 + newConversationOffset]?.meta?.changes !== 1) {
    return fail(503, "draft_not_saved", "The private draft could not be saved. No content was published.");
  }
  return json({
    conversation_id: conversation.id,
    message: chatEntry.assistantMessage.trim(),
    draft: { revision_id: revisionId, title: chatEntry.title.trim(), slug, kind, state: "private-preview", featured_media_id: featuredMediaId },
    preview_url: `/_mithrilpress/preview/${revisionId}/${encodeURIComponent(slug)}`,
  }, 201);
}

async function studioConversation(request, env, site, conversationId, owner) {
  const conversation = await env.DB.prepare(
    "SELECT c.id, c.base_revision_id, c.draft_revision_id, c.created_at, c.updated_at, r.state AS draft_state FROM studio_conversations c LEFT JOIN site_revisions r ON r.site_id = c.site_id AND r.id = c.draft_revision_id WHERE c.site_id = ? AND c.id = ? AND c.token_id = ? LIMIT 1",
  ).bind(site.id, conversationId, owner.tokenId).first();
  if (!conversation) return fail(404, "conversation_not_found", "Studio conversation not found.");
  const messages = await env.DB.prepare(
    "SELECT role, body, created_at FROM studio_messages WHERE site_id = ? AND conversation_id = ? ORDER BY created_at ASC, id ASC LIMIT ?",
  ).bind(site.id, conversationId, STUDIO_MAX_MESSAGES).all();
  const draft = conversation.draft_revision_id
    ? await env.DB.prepare(
      "SELECT title, slug, kind, featured_media_id FROM entries WHERE site_id = ? AND revision_id = ? AND entry_id = ? LIMIT 1",
    ).bind(site.id, conversation.draft_revision_id, `mithrilpress:chat:${conversationId}`).first()
    : null;
  return json({
    conversation: {
      id: conversation.id,
      base_revision_id: conversation.base_revision_id,
      draft_revision_id: conversation.draft_revision_id,
      draft_state: conversation.draft_state,
      messages: messages.results ?? [],
      draft,
    },
  });
}

async function studioConversations(request, env, site) {
  if (request.method !== "GET") return fail(405, "method_not_allowed", "Studio conversations are read-only through this route.");
  const owner = await ownerToken(request, env, site, "content:write");
  if (!owner) return fail(401, "studio_login_required", "An active content:write session is required.");
  const rows = await env.DB.prepare(
    "SELECT c.id, c.updated_at, c.draft_revision_id, r.state AS draft_state, (SELECT body FROM studio_messages m WHERE m.site_id = c.site_id AND m.conversation_id = c.id AND m.role = 'user' ORDER BY m.created_at ASC, m.id ASC LIMIT 1) AS title FROM studio_conversations c LEFT JOIN site_revisions r ON r.site_id = c.site_id AND r.id = c.draft_revision_id WHERE c.site_id = ? AND c.token_id = ? ORDER BY c.updated_at DESC LIMIT 20",
  ).bind(site.id, owner.tokenId).all();
  return json({ conversations: rows.results ?? [] });
}

async function studioUsage(request, env, site) {
  if (request.method !== "GET") return fail(405, "method_not_allowed", "Hosting usage is read-only.");
  const owner = await ownerToken(request, env, site, null);
  if (!owner || !owner.scopes.some((scope) => scope === "content:write" || scope === "media:write" || scope === "site:domains")) {
    return fail(401, "studio_login_required", "Sign in with a content:write, media:write, or site:domains owner token to view hosting usage.");
  }

  const now = new Date();
  const dayUtc = now.toISOString().slice(0, 10);
  const resetsAtUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
  const [storage, aiUsage, siteMedia, deploymentMedia, mediaOperations, siteMediaReads, siteHostingRequests, deploymentHostingRequests] = await Promise.all([
    env.DB.prepare("SELECT content_bytes FROM mithrilpress_site_storage_usage WHERE site_id = ? LIMIT 1").bind(site.id).first(),
    env.DB.prepare("SELECT request_count FROM studio_ai_usage WHERE day_utc = ? LIMIT 1").bind(dayUtc).first(),
    env.DB.prepare("SELECT asset_bytes FROM mithrilpress_site_media_usage WHERE site_id = ? LIMIT 1").bind(site.id).first(),
    env.DB.prepare("SELECT asset_bytes FROM mithrilpress_deployment_media_usage WHERE singleton = 1").first(),
    env.DB.prepare("SELECT read_count, write_count FROM media_daily_operations WHERE day_utc = ? LIMIT 1").bind(dayUtc).first(),
    env.DB.prepare("SELECT day_utc, read_count FROM media_site_daily_reads WHERE site_id = ? LIMIT 1").bind(site.id).first(),
    env.DB.prepare("SELECT day_utc, request_count FROM mithrilpress_site_daily_requests WHERE site_id = ? LIMIT 1").bind(site.id).first(),
    env.DB.prepare("SELECT day_utc, request_count FROM mithrilpress_deployment_daily_requests WHERE singleton = 1 LIMIT 1").first(),
  ]);
  return json({
    storage: {
      estimate_type: "retained_entry_and_seo_metadata_payload",
      estimated_content_bytes: Number(storage?.content_bytes ?? 0),
      site_limit_bytes: SITE_CONTENT_LIMIT_BYTES,
      shared_deployment_limit_bytes: DEPLOYMENT_CONTENT_LIMIT_BYTES,
    },
    ai_drafting: {
      scope: "shared_deployment",
      requests_used: Number(aiUsage?.request_count ?? 0),
      daily_app_limit: STUDIO_DAILY_GENERATION_LIMIT,
      provider_free_neurons_per_day: STUDIO_AI_FREE_NEURONS_PER_DAY,
      provider_scope: "account",
      provider_usage_measured_here: false,
      resets_at_utc: resetsAtUtc,
    },
    hosting_requests: {
      site_requests_used: siteHostingRequests?.day_utc === dayUtc ? Number(siteHostingRequests.request_count ?? 0) : 0,
      site_daily_limit: SITE_HOSTING_REQUESTS_PER_DAY_LIMIT,
      deployment_requests_used: deploymentHostingRequests?.day_utc === dayUtc ? Number(deploymentHostingRequests.request_count ?? 0) : 0,
      shared_deployment_daily_limit: HOSTING_REQUESTS_PER_DAY_LIMIT,
      resets_at_utc: resetsAtUtc,
    },
    r2_media: {
      site_used_bytes: Number(siteMedia?.asset_bytes ?? 0),
      site_limit_bytes: SITE_MEDIA_LIMIT_BYTES,
      deployment_used_bytes: Number(deploymentMedia?.asset_bytes ?? 0),
      deployment_limit_bytes: DEPLOYMENT_MEDIA_LIMIT_BYTES,
      site_daily_reads_used: siteMediaReads?.day_utc === dayUtc ? Number(siteMediaReads.read_count ?? 0) : 0,
      site_daily_reads_limit: SITE_MEDIA_READS_PER_DAY_LIMIT,
      daily_reads_used: Number(mediaOperations?.read_count ?? 0),
      daily_reads_limit: MEDIA_READS_PER_DAY_LIMIT,
      daily_uploads_and_deletes_used: Number(mediaOperations?.write_count ?? 0),
      daily_uploads_and_deletes_limit: MEDIA_WRITES_PER_DAY_LIMIT,
      storage_class: "Standard",
    },
    provider_metering: {
      available: false,
      detail: "This view shows MithrilPress app request caps, not account-level usage. Workers Free stops AI inference after its shared 10,000-Neuron daily allocation; other account workloads may use it first.",
    },
  }, 200, { "Cache-Control": "private, no-store" });
}

async function deleteStudioConversation(request, env, site, conversationId, owner) {
  if (request.method !== "DELETE" || !sameOriginStudioMutation(request, site)) {
    return fail(403, "same_origin_required", "Deleting a conversation requires a same-origin Studio request.");
  }
  const conversation = await env.DB.prepare(
    "SELECT draft_revision_id FROM studio_conversations WHERE site_id = ? AND id = ? AND token_id = ? LIMIT 1",
  ).bind(site.id, conversationId, owner.tokenId).first();
  if (!conversation) return fail(404, "conversation_not_found", "Studio conversation not found.");
  const revisionId = conversation.draft_revision_id;
  if (revisionId && revisionId !== site.current_revision_id) {
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE site_revisions SET state = 'superseded' WHERE site_id = ? AND id = ? AND state IN ('private-preview', 'approved')",
      ).bind(site.id, revisionId),
      env.DB.prepare(
        "DELETE FROM entries WHERE site_id = ? AND revision_id = ? AND ? <> COALESCE((SELECT current_revision_id FROM sites WHERE id = ?), '')",
      ).bind(site.id, revisionId, revisionId, site.id),
      env.DB.prepare(
        "DELETE FROM taxonomy_terms WHERE site_id = ? AND revision_id = ? AND ? <> COALESCE((SELECT current_revision_id FROM sites WHERE id = ?), '')",
      ).bind(site.id, revisionId, revisionId, site.id),
    ]);
  }
  await env.DB.batch([
    env.DB.prepare("UPDATE studio_conversations SET draft_revision_id = NULL WHERE site_id = ? AND id = ?").bind(site.id, conversationId),
    env.DB.prepare("DELETE FROM studio_messages WHERE site_id = ? AND conversation_id = ?").bind(site.id, conversationId),
    env.DB.prepare("DELETE FROM studio_conversations WHERE site_id = ? AND id = ? AND token_id = ?").bind(site.id, conversationId, owner.tokenId),
  ]);
  return json({ deleted: true });
}

async function studioAsset(request, env, path) {
  if (request.method !== "GET" && request.method !== "HEAD") return fail(405, "method_not_allowed", "Studio assets are read-only.");
  if (!env.ASSETS) return fail(503, "studio_assets_unavailable", "The Studio interface is not configured.");
  const assetRequest = new Request(new URL(path, request.url), { method: request.method, headers: request.headers });
  const assetResponse = await env.ASSETS.fetch(assetRequest);
  const headers = new Headers(assetResponse.headers);
  if (path === "/studio.html") {
    headers.set("Content-Security-Policy", "default-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-src 'self'");
  } else {
    headers.set("Content-Security-Policy", "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'");
  }
  return response(assetResponse.body, assetResponse.status, headers);
}

function mediaSummary(site, row) {
  return {
    id: row.id,
    wordpress_source_id: row.wordpress_source_id ?? null,
    content_type: row.content_type,
    byte_length: row.byte_length,
    width: row.width,
    height: row.height,
    sha256: row.sha256,
    alt_text: row.alt_text,
    created_at: row.created_at,
    preview_url: `/_mithrilpress/media/${row.id}`,
    source_url: `https://${site.hostname}/_mithrilpress/media/${row.id}`,
  };
}

function optionalWordPressMediaId(request) {
  const raw = request.headers.get("X-WordPress-Media-ID");
  if (raw === null) return null;
  if (!/^[1-9][0-9]{0,14}$/.test(raw)) throw Object.assign(new Error(), { status: 422, code: "invalid_wordpress_media_id" });
  const id = Number(raw);
  if (!Number.isSafeInteger(id)) throw Object.assign(new Error(), { status: 422, code: "invalid_wordpress_media_id" });
  return id;
}

function mediaAltText(request) {
  const raw = request.headers.get("X-MithrilPress-Alt") ?? "";
  let value;
  try {
    value = decodeURIComponent(raw);
  } catch {
    throw Object.assign(new Error(), { status: 422, code: "invalid_media_alt_text" });
  }
  if (value.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    throw Object.assign(new Error(), { status: 422, code: "invalid_media_alt_text" });
  }
  return value.trim();
}

async function existingWordPressMediaResponse(env, site, wordpressSourceId, contentType, details, sha256, altText) {
  const existing = await env.DB.prepare(
    "SELECT id, wordpress_source_id, content_type, byte_length, width, height, sha256, alt_text, status, created_at FROM media_assets WHERE site_id = ? AND wordpress_source_id = ? LIMIT 1",
  ).bind(site.id, wordpressSourceId).first();
  if (!existing) return null;
  if (existing.status !== "active") {
    return fail(409, "wordpress_media_not_ready", "This WordPress media ID has an upload that is not ready. Resolve it before retrying the import.");
  }
  if (existing.sha256 !== sha256 || existing.content_type !== contentType
      || existing.byte_length !== details.byteLength || existing.alt_text !== altText) {
    return fail(409, "wordpress_media_conflict", "This WordPress media ID is already mapped to different image bytes or alt text.");
  }
  return json({ media: mediaSummary(site, existing) }, 200, { "Cache-Control": "private, no-store" });
}

async function studioMedia(request, env, site) {
  const owner = await ownerToken(request, env, site, "media:write");
  if (!owner) return fail(401, "media_owner_required", "An active site owner token with media:write scope is required.");
  if (request.method === "GET") {
    const rows = await env.DB.prepare(
      "SELECT id, wordpress_source_id, content_type, byte_length, width, height, sha256, alt_text, created_at FROM media_assets WHERE site_id = ? AND status = 'active' ORDER BY created_at DESC, id DESC LIMIT 200",
    ).bind(site.id).all();
    const usage = await env.DB.prepare(
      "SELECT asset_bytes FROM mithrilpress_site_media_usage WHERE site_id = ? LIMIT 1",
    ).bind(site.id).first();
    return json({
      media: (rows.results ?? []).map((row) => mediaSummary(site, row)),
      storage: { used_bytes: Number(usage?.asset_bytes ?? 0), site_limit_bytes: SITE_MEDIA_LIMIT_BYTES },
    }, 200, { "Cache-Control": "private, no-store" });
  }
  if (request.method !== "POST") return fail(405, "method_not_allowed", "Use GET or POST for the media library.");
  if (!env.MEDIA) return fail(503, "media_storage_unavailable", "Image storage is not configured for this hosting deployment.");

  const allowedTypes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
  const bytes = await readBoundedBytes(request, allowedTypes, "image_type_not_supported", MAX_MEDIA_BYTES);
  const contentType = request.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase();
  const details = validateImageUpload(bytes, contentType);
  const wordpressSourceId = optionalWordPressMediaId(request);
  const altText = mediaAltText(request);
  const sha256 = hex(await crypto.subtle.digest("SHA-256", bytes));
  if (wordpressSourceId !== null) {
    const existing = await existingWordPressMediaResponse(env, site, wordpressSourceId, contentType, details, sha256, altText);
    if (existing) return existing;
  }
  if (!await countMediaWrite(env, MEDIA_WRITES_PER_DAY_LIMIT)) {
    return fail(429, "media_daily_write_limit", "The shared free media upload and delete allowance is exhausted for today. Try again after 00:00 UTC.");
  }

  const idempotentObjectKey = `${site.id}/${crypto.randomUUID()}`;
  const createdAt = new Date().toISOString();
  let reserved;
  try {
    reserved = await env.DB.prepare(
      "INSERT INTO media_assets (site_id, wordpress_source_id, object_key, content_type, byte_length, width, height, sha256, alt_text, status, uploaded_by_token_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?) RETURNING id, wordpress_source_id, content_type, byte_length, width, height, sha256, alt_text, created_at",
    ).bind(site.id, wordpressSourceId, idempotentObjectKey, contentType, details.byteLength,
      details.width, details.height, sha256, altText, owner.tokenId, createdAt).first();
  } catch (error) {
    const quotaCode = mediaQuotaCode(error);
    if (quotaCode) return mediaQuotaResponse(quotaCode);
    if (wordpressSourceId !== null) {
      const existing = await existingWordPressMediaResponse(env, site, wordpressSourceId, contentType, details, sha256, altText);
      if (existing) return existing;
    }
    return fail(503, "media_not_reserved", "The image could not be reserved in the site's free storage allowance.");
  }

  try {
    await env.MEDIA.put(idempotentObjectKey, bytes, {
      httpMetadata: {
        contentType,
        contentDisposition: "inline",
        cacheControl: "public, max-age=3600, immutable",
      },
      customMetadata: { mediaId: String(reserved.id), sha256 },
    });
    const committed = await env.DB.batch([
      env.DB.prepare("UPDATE media_assets SET status = 'active' WHERE site_id = ? AND id = ? AND status = 'pending'")
        .bind(site.id, reserved.id),
      env.DB.prepare("INSERT INTO media_actions (id, site_id, media_id, token_id, action, created_at, metadata_json) VALUES (?, ?, ?, ?, 'media-uploaded', ?, ?)")
        .bind(crypto.randomUUID(), site.id, reserved.id, owner.tokenId, createdAt,
          JSON.stringify({ byte_length: details.byteLength, content_type: contentType, sha256, wordpress_source_id: wordpressSourceId })),
    ]);
    if (committed[0]?.meta?.changes !== 1) throw new Error("media reservation state changed");
  } catch {
    try {
      await env.MEDIA.delete(idempotentObjectKey);
    } catch {
      // A pending database row remains private and can be cleaned up by an operator.
    }
    try {
      await env.DB.prepare("DELETE FROM media_assets WHERE site_id = ? AND id = ? AND status = 'pending'")
        .bind(site.id, reserved.id).run();
    } catch {
      // The row remains non-public; the database storage guard prevents further over-allocation.
    }
    return fail(503, "media_upload_not_committed", "The image upload could not be committed. It is not available to public pages.");
  }
  return json({ media: mediaSummary(site, reserved) }, 201, { "Cache-Control": "private, no-store" });
}

async function deleteStudioMedia(request, env, site, mediaId) {
  const owner = await ownerToken(request, env, site, "media:write");
  if (!owner) return fail(401, "media_owner_required", "An active site owner token with media:write scope is required.");
  if (request.method !== "DELETE") return fail(405, "method_not_allowed", "Use DELETE to remove this media item.");
  if (!env.MEDIA) return fail(503, "media_storage_unavailable", "Image storage is not configured for this hosting deployment.");
  const row = await env.DB.prepare(
    "SELECT id, object_key, status FROM media_assets WHERE site_id = ? AND id = ? LIMIT 1",
  ).bind(site.id, mediaId).first();
  if (!row) return fail(404, "media_not_found", "Media item not found.");
  if (!await countMediaWrite(env, MEDIA_WRITES_PER_DAY_LIMIT)) {
    return fail(429, "media_daily_write_limit", "The shared free media upload and delete allowance is exhausted for today. Try again after 00:00 UTC.");
  }
  await env.DB.prepare("UPDATE media_assets SET status = 'deleting' WHERE site_id = ? AND id = ? AND status IN ('pending', 'active', 'deleting')")
    .bind(site.id, mediaId).run();
  try {
    await env.MEDIA.delete(row.object_key);
  } catch {
    return fail(503, "media_delete_pending", "The item is hidden from publication, but object removal is pending. Retry later.");
  }
  const now = new Date().toISOString();
  try {
    const result = await env.DB.batch([
      env.DB.prepare("DELETE FROM media_assets WHERE site_id = ? AND id = ? AND status = 'deleting'").bind(site.id, mediaId),
      env.DB.prepare("INSERT INTO media_actions (id, site_id, media_id, token_id, action, created_at, metadata_json) VALUES (?, ?, ?, ?, 'media-deleted', ?, '{}')")
        .bind(crypto.randomUUID(), site.id, mediaId, owner.tokenId, now),
    ]);
    if (result[0]?.meta?.changes !== 1) throw new Error("media metadata removal failed");
  } catch {
    return fail(503, "media_delete_pending", "The object was removed, but metadata cleanup is pending. Retry later.");
  }
  return json({ media_id: mediaId, deleted: true });
}

async function serveMedia(request, env, site, mediaId) {
  if (request.method !== "GET" && request.method !== "HEAD") return fail(405, "method_not_allowed", "Published media is read-only.");
  if (!env.MEDIA) return fail(503, "media_storage_unavailable", "Image storage is not configured for this hosting deployment.");
  const url = new URL(request.url);
  const revisionId = url.searchParams.get("revision");
  let asset = null;
  let privateRead = false;
  if (revisionId !== null) {
    const owner = await ownerToken(request, env, site, "revision:preview");
    if (!owner || !/^[a-f0-9-]{36}$/.test(revisionId)) return fail(404, "media_not_found", "Media item not found.");
    asset = await env.DB.prepare(
      "SELECT a.id, a.object_key, a.content_type, a.byte_length, a.sha256, a.alt_text FROM media_assets a JOIN site_revisions r ON r.site_id = a.site_id AND r.id = ? WHERE a.site_id = ? AND a.id = ? AND a.status = 'active' AND r.state IN ('private-preview', 'approved', 'published', 'superseded') AND EXISTS (SELECT 1 FROM entries e WHERE e.site_id = a.site_id AND e.revision_id = r.id AND (e.featured_media_id IN (a.id, a.wordpress_source_id) OR EXISTS (SELECT 1 FROM entry_media em WHERE em.site_id = e.site_id AND em.revision_id = e.revision_id AND em.entry_id = e.entry_id AND em.media_id = a.id))) LIMIT 1",
    ).bind(revisionId, site.id, mediaId).first();
    privateRead = true;
  } else if (site.current_revision_id) {
    asset = await env.DB.prepare(
      "SELECT a.id, a.object_key, a.content_type, a.byte_length, a.sha256, a.alt_text FROM media_assets a WHERE a.site_id = ? AND a.id = ? AND a.status = 'active' AND EXISTS (SELECT 1 FROM entries e WHERE e.site_id = a.site_id AND e.revision_id = ? AND e.publication_status = 'published' AND (e.featured_media_id IN (a.id, a.wordpress_source_id) OR EXISTS (SELECT 1 FROM entry_media em WHERE em.site_id = e.site_id AND em.revision_id = e.revision_id AND em.entry_id = e.entry_id AND em.media_id = a.id))) LIMIT 1",
    ).bind(site.id, mediaId, site.current_revision_id).first();
  }
  if (!asset && revisionId === null) {
    const owner = await ownerToken(request, env, site, "media:write");
    if (owner) {
      asset = await env.DB.prepare(
        "SELECT id, object_key, content_type, byte_length, sha256, alt_text FROM media_assets WHERE site_id = ? AND id = ? AND status = 'active' LIMIT 1",
      ).bind(site.id, mediaId).first();
      privateRead = Boolean(asset);
    }
  }
  if (!asset) return fail(404, "media_not_found", "Media item not found.");
  const readLimit = await countMediaRead(env, site.id);
  if (readLimit === "site") return fail(429, "site_media_daily_read_limit", "This site's daily image delivery allowance is exhausted. It resets at 00:00 UTC.");
  if (readLimit === "deployment") return fail(429, "deployment_media_daily_read_limit", "The shared free image delivery allowance is exhausted for today. It resets at 00:00 UTC.");
  const object = request.method === "HEAD"
    ? await env.MEDIA.head(asset.object_key)
    : await env.MEDIA.get(asset.object_key);
  if (!object) return fail(404, "media_not_found", "Media item not found.");
  const headers = {
    "Content-Type": asset.content_type,
    "Content-Length": String(asset.byte_length),
    "ETag": object.httpEtag ?? object.etag,
    "Cache-Control": privateRead ? "private, no-store" : "public, max-age=3600, immutable",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cross-Origin-Resource-Policy": "same-site",
  };
  return response(request.method === "HEAD" ? null : object.body, 200, headers);
}

async function wordpressMediaRead(request, env, site, mediaId) {
  if (request.method !== "GET" && request.method !== "HEAD") return fail(405, "method_not_allowed", "This WordPress media endpoint is read-only.");
  const asset = await env.DB.prepare(
    "SELECT a.id, a.wordpress_source_id, a.content_type, a.byte_length, a.width, a.height, a.alt_text, a.created_at FROM media_assets a WHERE a.site_id = ? AND (a.id = ? OR a.wordpress_source_id = ?) AND a.status = 'active' AND EXISTS (SELECT 1 FROM entries e WHERE e.site_id = a.site_id AND e.revision_id = ? AND e.publication_status = 'published' AND (e.featured_media_id IN (a.id, a.wordpress_source_id) OR EXISTS (SELECT 1 FROM entry_media em WHERE em.site_id = e.site_id AND em.revision_id = e.revision_id AND em.entry_id = e.entry_id AND em.media_id = a.id))) ORDER BY CASE WHEN a.wordpress_source_id = ? THEN 0 ELSE 1 END LIMIT 1",
  ).bind(site.id, mediaId, mediaId, site.current_revision_id ?? "", mediaId).first();
  if (!asset) return fail(404, "media_not_found", "Media item not found.");
  const link = `https://${site.hostname}/_mithrilpress/media/${asset.id}`;
  const result = {
    id: asset.wordpress_source_id ?? asset.id,
    date: asset.created_at,
    slug: `media-${asset.id}`,
    status: "inherit",
    type: "attachment",
    link,
    title: { rendered: asset.alt_text || `Image ${asset.id}` },
    author: 0,
    media_type: "image",
    mime_type: asset.content_type,
    media_details: { width: asset.width, height: asset.height, file: `media-${asset.id}` },
    post: 0,
    source_url: link,
    alt_text: asset.alt_text,
  };
  return request.method === "HEAD"
    ? response(null, 200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300" })
    : json(result, 200, { "Cache-Control": "public, max-age=300" });
}

async function importWordPress(request, env, site) {
  const owner = await ownerToken(request, env, site, "content:import");
  if (!owner) return fail(401, "owner_authorization_required", "A scoped site owner token is required.");
  const contentType = request.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase();
  const wxrTypes = new Set(["application/rss+xml", "application/xml", "text/xml"]);
  let body = null;
  let parsedWxr = null;
  let sourceOrigin;
  let records;
  let sourceTaxonomyTerms = [];
  let sourceDigest = null;
  let importFormat = "wordpress-rest-json";
  if (wxrTypes.has(contentType)) {
    const xml = await readBoundedText(request, wxrTypes, "invalid_wxr_xml");
    try {
      parsedWxr = parseWordPressWxr(xml);
    } catch (error) {
      return fail(error?.status ?? 422, error?.code ?? "invalid_wxr_xml", "The WXR export is malformed or uses content outside the supported import subset.");
    }
    sourceOrigin = validateWxrChannelOrigin(parsedWxr.channelLink);
    records = parsedWxr.records;
    sourceTaxonomyTerms = parsedWxr.taxonomyTerms;
    sourceDigest = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(xml)));
    importFormat = "wordpress-wxr-v1.2-subset";
  } else {
    body = await readBoundedJson(request);
    sourceOrigin = validateSourceOrigin(body?.source_site);
    records = body?.records;
    sourceTaxonomyTerms = body?.taxonomy_terms ?? [];
  }
  if (!sourceOrigin || (site.source_origin && sourceOrigin !== site.source_origin)) {
    return fail(422, "source_origin_not_admitted", "Provide a WXR export whose channel link, or JSON source_site, matches the owner-authorized HTTPS WordPress origin for this site.");
  }
  if (!Array.isArray(records) || records.length < 1 || records.length > MAX_RECORDS) {
    return fail(422, "invalid_import_size", "An import must contain between 1 and 500 supported WordPress post or page records.");
  }
  const entries = records.map(normalizeRecord);
  const taxonomyTerms = normalizeTaxonomyTerms(sourceTaxonomyTerms, entries);
  let gutenbergReport;
  let wordpressMediaReferences;
  try {
    gutenbergReport = inspectWordPressBlocks(entries.map((entry) => entry.sourceHtml));
    wordpressMediaReferences = collectWordPressMediaReferences(entries);
  } catch (error) {
    return fail(error?.status ?? 422, error?.code ?? "invalid_wordpress_content", "The imported WordPress content exceeds a supported compatibility boundary.");
  }
  const identities = new Set(entries.map((entry) => entry.entryId));
  if (identities.size !== entries.length) return fail(422, "duplicate_source_id", "The import contains duplicate WordPress record identities.");
  const slugs = new Set(entries.map((entry) => `${entry.kind}:${entry.slug}`));
  if (slugs.size !== entries.length) return fail(422, "duplicate_slug", "Each post type may contain a slug only once per revision.");
  const totalChars = entries.reduce((sum, entry) => sum + entry.sourceHtml.length, 0);
  if (totalChars > MAX_IMPORT_CHARS) return fail(413, "import_too_large", "The imported content exceeds the site import budget.");

  let mediaBySourceId = new Map();
  if (wordpressMediaReferences.source_ids.length > 0) {
    const placeholders = JSON.stringify(wordpressMediaReferences.source_ids);
    const mediaRows = await env.DB.prepare(
      "SELECT id, wordpress_source_id, alt_text, width, height FROM media_assets WHERE site_id = ? AND status = 'active' AND wordpress_source_id IN (SELECT CAST(value AS INTEGER) FROM json_each(?))",
    ).bind(site.id, placeholders).all();
    mediaBySourceId = new Map((mediaRows.results ?? []).map((row) => [Number(row.wordpress_source_id), row]));
  }

  const permalinkMap = buildWordPressPermalinkMap(entries, sourceOrigin, site.hostname);
  const encoder = new TextEncoder();
  let totalInlineImages = 0;
  let rewrittenInlineImages = 0;
  let omittedInlineImages = 0;
  let sourceSiteLinks = 0;
  let rewrittenLinks = 0;
  let unresolvedSourceSiteLinks = 0;
  let removedUnsafeLinks = 0;
  for (const entry of entries) {
    const sanitized = await sanitizeImportedWordPressHtml(entry.sourceHtml, mediaBySourceId, {
      sourceOrigin,
      sourcePermalink: entry.sourcePermalink,
      permalinkMap,
    });
    entry.safeHtml = sanitized.html;
    entry.inlineMediaIds = sanitized.mediaIds;
    totalInlineImages += sanitized.imageElements;
    rewrittenInlineImages += sanitized.rewrittenImages;
    omittedInlineImages += sanitized.omittedImages;
    sourceSiteLinks += sanitized.links.sourceSiteLinks;
    rewrittenLinks += sanitized.links.rewrittenLinks;
    unresolvedSourceSiteLinks += sanitized.links.unresolvedSourceSiteLinks;
    removedUnsafeLinks += sanitized.links.removedUnsafeLinks;
    const rowBytes = encoder.encode(entry.entryId).byteLength
      + encoder.encode(entry.kind).byteLength
      + encoder.encode(entry.slug).byteLength
      + encoder.encode(entry.title).byteLength
      + encoder.encode(entry.sourceHtml).byteLength
      + encoder.encode(entry.safeHtml).byteLength
      + encoder.encode(JSON.stringify(entry.categories)).byteLength
      + encoder.encode(JSON.stringify(entry.tags)).byteLength
      + encoder.encode(JSON.stringify([entry.sourceStatus, entry.sourceDate, entry.sourceDateGmt,
        entry.sourceModified, entry.sourceModifiedGmt, entry.sourcePermalink, entry.featuredMediaId])).byteLength;
    const seoMetadataBytes = encoder.encode(JSON.stringify(entry.seoMetadata)).byteLength;
    if (seoMetadataBytes > 4096) return fail(413, "seo_metadata_too_large", "WordPress SEO metadata exceeds the supported per-entry limit.");
    if (rowBytes + seoMetadataBytes > MAX_D1_ROW_BYTES) return fail(413, "entry_row_too_large", "An entry exceeds the D1 row budget.");
  }

  const migrationReport = {
    version: 1,
    gutenberg: gutenbergReport,
    seo_metadata: {
      entries_with_metadata: entries.filter((entry) => Object.keys(entry.seoMetadata).length > 0).length,
      imported_fields: entries.reduce((sum, entry) => sum + Object.keys(entry.seoMetadata).length, 0),
      omitted_fields: parsedWxr
        ? Number(parsedWxr.omitted.custom_fields ?? 0)
        : entries.reduce((sum, entry) => sum + entry.seoMetadataOmittedFields, 0),
    },
    inline_media: {
      wp_image_class_references: wordpressMediaReferences.class_references,
      referenced_source_ids: wordpressMediaReferences.source_ids.length,
      mapped_source_ids: mediaBySourceId.size,
      image_elements: totalInlineImages,
      rewritten_images: rewrittenInlineImages,
      omitted_images: omittedInlineImages,
    },
    content_links: {
      source_site_links: sourceSiteLinks,
      rewritten_links: rewrittenLinks,
      unresolved_source_site_links: unresolvedSourceSiteLinks,
      removed_unsafe_links: removedUnsafeLinks,
    },
    source_omissions: parsedWxr?.omitted ?? null,
    needs_owner_review: gutenbergReport.needs_owner_review
      || omittedInlineImages > 0
      || unresolvedSourceSiteLinks > 0
      || removedUnsafeLinks > 0
      || migrationReport.seo_metadata.omitted_fields > 0
      || Object.values(parsedWxr?.omitted ?? {}).some((count) => Number(count) > 0),
  };

  let safeTermBytes = 0;
  for (const term of taxonomyTerms) {
    term.descriptionHtml = await sanitizeHtml(term.description);
    safeTermBytes += encoder.encode(term.slug).byteLength
      + encoder.encode(term.name).byteLength
      + encoder.encode(term.descriptionHtml).byteLength;
    if (safeTermBytes > MAX_IMPORTED_TERM_BYTES) {
      return fail(413, "taxonomy_term_payload_too_large", "The imported taxonomy descriptions exceed the term storage budget.");
    }
  }

  const now = new Date().toISOString();
  const revisionId = crypto.randomUUID();
  const proofId = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO site_revisions (id, site_id, parent_revision_id, state, source_origin, import_proof_id, import_token_id, imported_at, entry_count) VALUES (?, ?, ?, 'importing', ?, ?, ?, ?, ?)",
  ).bind(revisionId, site.id, site.current_revision_id, sourceOrigin, proofId, owner.tokenId, now, entries.length).run();

  const insert = env.DB.prepare(
    "INSERT INTO entries (site_id, revision_id, entry_id, kind, slug, title, source_html, safe_html, entry_origin, publication_status, api_id, source_id, source_status, source_date, source_date_gmt, source_modified, source_modified_gmt, source_permalink, categories_json, tags_json, featured_media_id, rendering_admission) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'wordpress', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready')",
  );
  try {
    for (let start = 0; start < entries.length; start += 50) {
      const statements = entries.slice(start, start + 50).map((entry) => insert.bind(
        site.id, revisionId, entry.entryId, entry.kind, entry.slug, entry.title,
        entry.sourceHtml, entry.safeHtml, entry.sourceStatus === "publish" ? "published" : "draft",
        entry.sourceId, entry.sourceId, entry.sourceStatus,
        entry.sourceDate, entry.sourceDateGmt, entry.sourceModified, entry.sourceModifiedGmt,
        entry.sourcePermalink, JSON.stringify(entry.categories), JSON.stringify(entry.tags),
        entry.featuredMediaId,
      ));
      await env.DB.batch(statements);
    }
    const metadataEntries = entries.filter((entry) => Object.keys(entry.seoMetadata).length > 0);
    const metadataInsert = env.DB.prepare(
      "INSERT INTO entry_seo_metadata (site_id, revision_id, entry_id, metadata_json) VALUES (?, ?, ?, ?)",
    );
    for (let start = 0; start < metadataEntries.length; start += 50) {
      const statements = metadataEntries.slice(start, start + 50).map((entry) => metadataInsert.bind(
        site.id, revisionId, entry.entryId, JSON.stringify(entry.seoMetadata),
      ));
      await env.DB.batch(statements);
    }
    const inlineMediaLinks = entries.flatMap((entry) => entry.inlineMediaIds.map((mediaId) => ({
      entryId: entry.entryId,
      mediaId,
    })));
    const inlineMediaInsert = env.DB.prepare(
      "INSERT INTO entry_media (site_id, revision_id, entry_id, media_id, created_at) VALUES (?, ?, ?, ?, ?)",
    );
    for (let start = 0; start < inlineMediaLinks.length; start += 50) {
      const statements = inlineMediaLinks.slice(start, start + 50).map((link) => inlineMediaInsert.bind(
        site.id, revisionId, link.entryId, link.mediaId, now,
      ));
      await env.DB.batch(statements);
    }
    const termInsert = env.DB.prepare(
      "INSERT INTO taxonomy_terms (site_id, revision_id, taxonomy, term_id, slug, name, description_html, parent_term_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    for (let start = 0; start < taxonomyTerms.length; start += 50) {
      const statements = taxonomyTerms.slice(start, start + 50).map((term) => termInsert.bind(
        site.id, revisionId, term.taxonomy, term.id, term.slug, term.name, term.descriptionHtml, term.parentId,
      ));
      await env.DB.batch(statements);
    }
    const finalized = await env.DB.batch([
      env.DB.prepare(
        "UPDATE site_revisions SET state = 'private-preview' WHERE site_id = ? AND id = ? AND state = 'importing'",
      ).bind(site.id, revisionId),
      env.DB.prepare(
        "INSERT INTO owner_actions (id, site_id, revision_id, token_id, action, created_at, metadata_json) SELECT ?, ?, ?, ?, 'import', ?, ? WHERE EXISTS (SELECT 1 FROM site_revisions WHERE site_id = ? AND id = ? AND state = 'private-preview')",
      ).bind(crypto.randomUUID(), site.id, revisionId, owner.tokenId, now,
        JSON.stringify({
          entry_count: entries.length,
          taxonomy_term_count: taxonomyTerms.length,
          proof_id: proofId,
          import_format: importFormat,
          source_text_sha256: sourceDigest,
          omitted: parsedWxr?.omitted ?? null,
          migration_report: migrationReport,
        }), site.id, revisionId),
    ]);
    if (finalized[0]?.meta?.changes !== 1) throw new Error("revision finalization failed");
  } catch (error) {
    const quotaCode = storageQuotaCode(error);
    try {
      await env.DB.batch([
        env.DB.prepare(
          "DELETE FROM taxonomy_terms WHERE site_id = ? AND revision_id = ? AND EXISTS (SELECT 1 FROM site_revisions WHERE site_id = ? AND id = ? AND state = 'importing')",
        ).bind(site.id, revisionId, site.id, revisionId),
        env.DB.prepare(
          "UPDATE site_revisions SET state = 'failed' WHERE site_id = ? AND id = ? AND state = 'importing'",
        ).bind(site.id, revisionId),
        env.DB.prepare(
          "DELETE FROM entries WHERE site_id = ? AND revision_id = ? AND EXISTS (SELECT 1 FROM site_revisions WHERE site_id = ? AND id = ? AND state = 'failed')",
        ).bind(site.id, revisionId, site.id, revisionId),
      ]);
    } catch {
      // The failed revision is still not addressable as a preview or public site.
    }
    if (quotaCode) return storageQuotaResponse(quotaCode);
    return fail(503, "import_not_committed", "The private import could not be committed. No content was published.");
  }
  return json({
    revision_id: revisionId,
    state: "private-preview",
    entry_count: entries.length,
    taxonomy_term_count: taxonomyTerms.length,
    source_format: importFormat,
    source_text_sha256: sourceDigest,
    omitted: parsedWxr?.omitted ?? null,
    migration_report: migrationReport,
    authorization_proof_id: proofId,
  }, 201);
}

async function revisionMigrationReport(request, env, site, revisionId) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return fail(405, "method_not_allowed", "Migration reports are read-only.");
  }
  const owner = await ownerToken(request, env, site, "revision:preview");
  if (!owner) return fail(401, "owner_authorization_required", "A scoped site owner token is required.");
  const row = await env.DB.prepare(
    "SELECT r.id, r.state, a.metadata_json FROM site_revisions r LEFT JOIN owner_actions a ON a.site_id = r.site_id AND a.revision_id = r.id AND a.action = 'import' WHERE r.site_id = ? AND r.id = ? AND r.state IN ('private-preview', 'approved', 'published', 'superseded') ORDER BY a.created_at DESC LIMIT 1",
  ).bind(site.id, revisionId).first();
  if (!row || !row.metadata_json) return fail(404, "revision_not_found", "Migration report not found.");
  let metadata = {};
  try {
    metadata = JSON.parse(row.metadata_json ?? "{}");
  } catch {
    return fail(503, "migration_report_unavailable", "The saved migration report is unreadable.");
  }
  const report = {
    revision_id: row.id,
    state: row.state,
    source_format: metadata.import_format ?? null,
    omitted: metadata.omitted ?? null,
    migration_report: metadata.migration_report ?? null,
  };
  return request.method === "HEAD"
    ? response(null, 200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store" })
    : json(report, 200, { "Cache-Control": "private, no-store" });
}

async function previewRevision(request, env, site, revisionId, slug) {
  const owner = await ownerToken(request, env, site, "revision:preview");
  if (!owner) return fail(401, "owner_authorization_required", "A scoped site owner token is required.");
  const revision = await env.DB.prepare(
    "SELECT id FROM site_revisions WHERE site_id = ? AND id = ? AND state IN ('private-preview', 'approved', 'published', 'superseded') LIMIT 1",
  ).bind(site.id, revisionId).first();
  if (!revision) return fail(404, "revision_not_found", "Revision not found.");
  const entry = await env.DB.prepare(
    `SELECT kind, slug, title, safe_html, language_code, source_date, featured_media_id, ${SEO_METADATA_SELECT} FROM entries WHERE site_id = ? AND revision_id = ? AND slug = ? ORDER BY CASE kind WHEN 'page' THEN 0 ELSE 1 END LIMIT 1`,
  ).bind(site.id, revisionId, slug).first();
  if (!entry) return fail(404, "entry_not_found", "Entry not found.");
  const media = await featuredMediaForEntry(env, site, entry);
  const previewEntry = {
    ...entry,
    safe_html: await previewHtmlWithRevisionMedia(entry.safe_html, revisionId),
  };
  return htmlDocument(site.hostname, previewEntry, true, false, media, revisionId);
}

async function approveRevision(request, env, site, revisionId) {
  const owner = await ownerToken(request, env, site, "revision:approve");
  if (!owner) return fail(401, "owner_authorization_required", "A scoped site owner token is required.");
  const now = new Date().toISOString();
  const proofId = crypto.randomUUID();
  const approvalId = crypto.randomUUID();
  const results = await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO owner_approvals (id, site_id, revision_id, owner_id, token_id, proof_id, approved_at) SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM site_revisions r WHERE r.site_id = ? AND r.id = ? AND r.state = 'private-preview' AND r.parent_revision_id IS (SELECT current_revision_id FROM sites s WHERE s.id = r.site_id AND s.status = 'active') AND r.entry_count = (SELECT COUNT(*) FROM entries e WHERE e.site_id = r.site_id AND e.revision_id = r.id AND e.rendering_admission = 'ready'))",
    ).bind(approvalId, site.id, revisionId, owner.ownerLabel, owner.tokenId, proofId, now, site.id, revisionId),
    env.DB.prepare(
      "UPDATE site_revisions SET state = 'approved', approved_at = ?, approved_by = ?, approval_proof_id = ? WHERE site_id = ? AND id = ? AND state = 'private-preview' AND parent_revision_id IS (SELECT current_revision_id FROM sites s WHERE s.id = site_revisions.site_id AND s.status = 'active') AND entry_count = (SELECT COUNT(*) FROM entries e WHERE e.site_id = site_revisions.site_id AND e.revision_id = site_revisions.id AND e.rendering_admission = 'ready')",
    ).bind(now, owner.ownerLabel, proofId, site.id, revisionId),
    env.DB.prepare(
      "INSERT INTO owner_actions (id, site_id, revision_id, token_id, action, created_at, metadata_json) SELECT ?, ?, ?, ?, 'approve', ?, ? WHERE EXISTS (SELECT 1 FROM site_revisions WHERE site_id = ? AND id = ? AND state = 'approved' AND approval_proof_id = ?)",
    ).bind(crypto.randomUUID(), site.id, revisionId, owner.tokenId, now,
      JSON.stringify({ proof_id: proofId }), site.id, revisionId, proofId),
  ]);
  if (results[1]?.meta?.changes !== 1) return fail(409, "revision_not_approvable", "The private revision is missing, incomplete, or already approved.");
  return json({ revision_id: revisionId, state: "approved", approval_proof_id: proofId });
}

async function publishRevision(request, env, site, revisionId) {
  const owner = await ownerToken(request, env, site, "site:publish");
  if (!owner) return fail(401, "owner_authorization_required", "A scoped site owner token is required.");
  const now = new Date().toISOString();
  const results = await env.DB.batch([
    env.DB.prepare(
      "UPDATE site_revisions SET state = 'superseded' WHERE site_id = ? AND id = (SELECT current_revision_id FROM sites WHERE id = ? AND status = 'active') AND id <> ? AND state = 'published' AND EXISTS (SELECT 1 FROM site_revisions r WHERE r.site_id = ? AND r.id = ? AND r.state = 'approved' AND r.parent_revision_id IS (SELECT current_revision_id FROM sites s WHERE s.id = r.site_id AND s.status = 'active') AND r.entry_count = (SELECT COUNT(*) FROM entries e WHERE e.site_id = r.site_id AND e.revision_id = r.id AND e.rendering_admission = 'ready'))",
    ).bind(site.id, site.id, revisionId, site.id, revisionId),
    env.DB.prepare(
      "UPDATE site_revisions SET state = 'published', published_at = ?, published_by = ? WHERE site_id = ? AND id = ? AND state = 'approved' AND EXISTS (SELECT 1 FROM sites s WHERE s.id = ? AND s.status = 'active' AND site_revisions.parent_revision_id IS s.current_revision_id) AND entry_count = (SELECT COUNT(*) FROM entries e WHERE e.site_id = site_revisions.site_id AND e.revision_id = site_revisions.id AND e.rendering_admission = 'ready')",
    ).bind(now, owner.ownerLabel, site.id, revisionId, site.id),
    env.DB.prepare(
      "UPDATE entries SET publication_status = 'published' WHERE site_id = ? AND revision_id = ? AND entry_origin = 'chat' AND publication_status = 'draft' AND EXISTS (SELECT 1 FROM site_revisions WHERE site_id = ? AND id = ? AND state = 'published')",
    ).bind(site.id, revisionId, site.id, revisionId),
    env.DB.prepare(
      "UPDATE sites SET current_revision_id = ? WHERE id = ? AND status = 'active' AND EXISTS (SELECT 1 FROM site_revisions WHERE site_id = ? AND id = ? AND state = 'published')",
    ).bind(revisionId, site.id, site.id, revisionId),
    env.DB.prepare(
      "INSERT INTO owner_actions (id, site_id, revision_id, token_id, action, created_at, metadata_json) SELECT ?, ?, ?, ?, 'publish', ?, '{}' WHERE EXISTS (SELECT 1 FROM sites WHERE id = ? AND current_revision_id = ?)",
    ).bind(crypto.randomUUID(), site.id, revisionId, owner.tokenId, now, site.id, revisionId),
  ]);
  if (results[1]?.meta?.changes !== 1 || results[3]?.meta?.changes !== 1) {
    return fail(409, "revision_not_publishable", "Only a fully approved private revision for an active site can be published.");
  }
  return json({ revision_id: revisionId, state: "published", published_at: now });
}

function parsePathSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function parseWordPressDateFilter(value, { endOfDay = false } = {}) {
  if (value === null) return { valid: true, value: null };
  if (value.length > 40 || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) {
    return { valid: false, value: null };
  }
  const date = value.slice(0, 10);
  const calendarDate = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(calendarDate) || new Date(calendarDate).toISOString().slice(0, 10) !== date) {
    return { valid: false, value: null };
  }
  const parsedValue = endOfDay && value.length === 10 ? `${value}T23:59:59.999Z` : value;
  const timestamp = Date.parse(parsedValue);
  return Number.isFinite(timestamp)
    ? { valid: true, value: new Date(timestamp).toISOString() }
    : { valid: false, value: null };
}

function canonicalUrl(hostname, slug, kind) {
  const path = kind === "page" && slug === "home" ? "/" : `/${encodeURIComponent(slug)}/`;
  return `https://${hostname}${path}`;
}

const SEO_METADATA_SELECT = "COALESCE((SELECT metadata_json FROM entry_seo_metadata seo WHERE seo.site_id = entries.site_id AND seo.revision_id = entries.revision_id AND seo.entry_id = entries.entry_id), '{}') AS seo_metadata_json";

function wpRecord(site, row) {
  const link = canonicalUrl(site.hostname, row.slug, row.kind);
  const date = row.source_date ?? null;
  return {
    id: row.source_id ?? row.api_id,
    date,
    date_gmt: row.source_date_gmt ?? null,
    guid: { rendered: link },
    modified: row.source_modified ?? date,
    modified_gmt: row.source_modified_gmt ?? null,
    slug: row.slug,
    status: "publish",
    type: row.kind,
    link,
    title: { rendered: row.title },
    content: { rendered: row.safe_html, protected: false },
    excerpt: { rendered: "", protected: false },
    author: 0,
    featured_media: row.featured_media_id ?? 0,
    comment_status: "closed",
    ping_status: "closed",
    sticky: false,
    template: "",
    categories: JSON.parse(row.categories_json),
    tags: JSON.parse(row.tags_json),
    meta: selectWordPressSeoMetadata(JSON.parse(row.seo_metadata_json ?? "{}")).metadata,
  };
}

async function featuredMediaForEntry(env, site, entry) {
  const mediaId = entry.featured_media_id;
  if (!Number.isSafeInteger(mediaId) || mediaId < 1) return null;
  return await env.DB.prepare(
    "SELECT id, alt_text FROM media_assets WHERE site_id = ? AND status = 'active' AND (id = ? OR wordpress_source_id = ?) ORDER BY CASE WHEN wordpress_source_id = ? THEN 0 ELSE 1 END LIMIT 1",
  ).bind(site.id, mediaId, mediaId, mediaId).first();
}

async function wordpressRead(request, env, site, kind, itemId = null) {
  if (request.method !== "GET" && request.method !== "HEAD") return fail(405, "method_not_allowed", "This compatibility endpoint is read-only.");
  const url = new URL(request.url);
  if (url.searchParams.get("context") && url.searchParams.get("context") !== "view" && url.searchParams.get("context") !== "embed") {
    return fail(401, "context_not_available", "Authenticated WordPress edit contexts are not available through the public API.");
  }
  if (itemId !== null) {
    if (itemId.length > 15) return fail(404, "entry_not_found", "Entry not found.");
    const sourceId = Number(itemId);
    if (!Number.isSafeInteger(sourceId) || sourceId < 1) return fail(404, "entry_not_found", "Entry not found.");
    if (!site.current_revision_id || site.status !== "active") return fail(404, "entry_not_found", "Entry not found.");
    const row = await env.DB.prepare(
      `SELECT api_id, source_id, source_date, source_date_gmt, source_modified, source_modified_gmt, featured_media_id, slug, title, safe_html, categories_json, tags_json, kind, ${SEO_METADATA_SELECT} FROM entries WHERE site_id = ? AND revision_id = ? AND kind = ? AND publication_status = 'published' AND COALESCE(source_id, api_id) = ? LIMIT 1`,
    ).bind(site.id, site.current_revision_id, kind, sourceId).first();
    if (!row) return fail(404, "entry_not_found", "Entry not found.");
    return request.method === "HEAD"
      ? response(null, 200, { "Content-Type": "application/json; charset=utf-8" })
      : json(wpRecord(site, row));
  }
  const page = parseBoundedInt(url.searchParams.get("page"), 1, 1, 100000);
  const perPage = parseBoundedInt(url.searchParams.get("per_page"), 10, 1, 100);
  if (page === null || perPage === null) return fail(400, "invalid_pagination", "Use a valid WordPress page and per_page value (1-100).");
  const slug = url.searchParams.get("slug");
  if (slug !== null && (!textValue(slug, 200) || !ENTRY_SLUG.test(slug))) return fail(400, "invalid_slug", "The slug filter is invalid.");
  const searchValue = url.searchParams.get("search");
  const search = searchValue === null ? null : searchValue.trim();
  if (search !== null && (!search || search.length > 100 || /[\u0000-\u001f\u007f]/.test(search))) {
    return fail(400, "invalid_search", "The search filter must contain 1-100 printable characters.");
  }
  const after = parseWordPressDateFilter(url.searchParams.get("after"));
  const before = parseWordPressDateFilter(url.searchParams.get("before"), { endOfDay: true });
  const modifiedAfter = parseWordPressDateFilter(url.searchParams.get("modified_after"));
  const modifiedBefore = parseWordPressDateFilter(url.searchParams.get("modified_before"), { endOfDay: true });
  if (!after.valid || !before.valid || !modifiedAfter.valid || !modifiedBefore.valid) {
    return fail(400, "invalid_date_filter", "Use an ISO 8601 date or date-time for after, before, modified_after, and modified_before.");
  }
  if ((after.value && before.value && after.value > before.value)
      || (modifiedAfter.value && modifiedBefore.value && modifiedAfter.value > modifiedBefore.value)) {
    return fail(400, "invalid_date_range", "A date filter's after value must not be later than its before value.");
  }
  const orderValue = url.searchParams.get("order") ?? "desc";
  if (orderValue !== "asc" && orderValue !== "desc") {
    return fail(400, "invalid_order", "Sort order must be asc or desc.");
  }
  const order = orderValue.toUpperCase();
  const orderby = url.searchParams.get("orderby") ?? "date";
  const orderColumns = {
    date: "COALESCE(julianday(COALESCE(source_date_gmt, source_date)), -1)",
    id: "CAST(COALESCE(source_id, api_id) AS INTEGER)",
    modified: "COALESCE(julianday(COALESCE(source_modified_gmt, source_modified, source_date_gmt, source_date)), -1)",
    slug: "slug",
    title: "lower(title)",
  };
  if (!Object.hasOwn(orderColumns, orderby) && orderby !== "relevance") {
    return fail(400, "invalid_orderby", "Sort posts and pages by date, id, modified, relevance, slug, or title.");
  }
  if (orderby === "relevance" && search === null) {
    return fail(400, "search_term_required", "A search filter is required when ordering by relevance.");
  }
  if (!site.current_revision_id || site.status !== "active") return json([], 200, { "X-WP-Total": "0", "X-WP-TotalPages": "0" });
  const conditions = ["site_id = ?", "revision_id = ?", "kind = ?", "publication_status = 'published'"];
  const params = [site.id, site.current_revision_id, kind];
  if (slug !== null) {
    conditions.push("slug = ?");
    params.push(slug);
  }
  if (search !== null) {
    conditions.push("(instr(lower(title), lower(?)) > 0 OR instr(lower(safe_html), lower(?)) > 0)");
    params.push(search, search);
  }
  if (after.value !== null) {
    conditions.push("julianday(COALESCE(source_date_gmt, source_date)) >= julianday(?)");
    params.push(after.value);
  }
  if (before.value !== null) {
    conditions.push("julianday(COALESCE(source_date_gmt, source_date)) <= julianday(?)");
    params.push(before.value);
  }
  if (modifiedAfter.value !== null) {
    conditions.push("julianday(COALESCE(source_modified_gmt, source_modified, source_date_gmt, source_date)) >= julianday(?)");
    params.push(modifiedAfter.value);
  }
  if (modifiedBefore.value !== null) {
    conditions.push("julianday(COALESCE(source_modified_gmt, source_modified, source_date_gmt, source_date)) <= julianday(?)");
    params.push(modifiedBefore.value);
  }
  const where = conditions.join(" AND ");
  const count = await env.DB.prepare(`SELECT COUNT(*) AS total FROM entries WHERE ${where}`).bind(...params).first();
  const total = Number(count?.total ?? 0);
  const offset = (page - 1) * perPage;
  const orderExpression = orderby === "relevance"
    ? "CASE WHEN lower(title) = lower(?) THEN 2 WHEN instr(lower(title), lower(?)) > 0 THEN 1 ELSE 0 END"
    : orderColumns[orderby];
  const orderParams = orderby === "relevance" ? [search, search] : [];
  const rows = await env.DB.prepare(
    `SELECT api_id, source_id, source_date, source_date_gmt, source_modified, source_modified_gmt, featured_media_id, slug, title, safe_html, categories_json, tags_json, kind, ${SEO_METADATA_SELECT} FROM entries WHERE ${where} ORDER BY ${orderExpression} ${order}, api_id ASC LIMIT ? OFFSET ?`,
  ).bind(...params, ...orderParams, perPage, offset).all();
  const totalPages = total === 0 ? 0 : Math.ceil(total / perPage);
  const headers = { "X-WP-Total": String(total), "X-WP-TotalPages": String(totalPages) };
  if (totalPages > 0) {
    const pageLink = (targetPage) => {
      const target = new URL(request.url);
      target.searchParams.set("page", String(targetPage));
      target.searchParams.set("per_page", String(perPage));
      return `<${target.origin}${target.pathname}${target.search}>`;
    };
    const links = [];
    if (page > 1) links.push(`${pageLink(page - 1)}; rel="prev"`);
    if (page < totalPages) links.push(`${pageLink(page + 1)}; rel="next"`);
    if (links.length) headers.Link = links.join(", ");
  }
  const payload = (rows.results ?? []).map((row) => wpRecord(site, row));
  if (request.method === "HEAD") return response(null, 200, { "Content-Type": "application/json; charset=utf-8", ...headers });
  return json(payload, 200, headers);
}

function wpTerm(site, row) {
  const taxonomy = row.taxonomy;
  const path = taxonomy === "category" ? "category" : "tag";
  const term = {
    id: row.term_id,
    count: Number(row.term_count ?? 0),
    description: row.description_html,
    link: `https://${site.hostname}/${path}/${encodeURIComponent(row.slug)}/`,
    name: row.name,
    slug: row.slug,
    taxonomy,
    meta: {},
  };
  if (taxonomy === "category") term.parent = row.parent_term_id;
  return term;
}

async function wordpressTaxonomyRead(request, env, site, taxonomy, termId = null) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return fail(405, "method_not_allowed", "This WordPress taxonomy endpoint is read-only.");
  }
  const url = new URL(request.url);
  const context = url.searchParams.get("context");
  if (context && context !== "view" && context !== "embed") {
    return fail(401, "context_not_available", "Authenticated WordPress edit contexts are not available through the public API.");
  }
  if (!site.current_revision_id || site.status !== "active") {
    if (termId !== null) return fail(404, "term_not_found", "Term not found.");
    return json([], 200, { "X-WP-Total": "0", "X-WP-TotalPages": "0" });
  }

  const page = parseBoundedInt(url.searchParams.get("page"), 1, 1, 100000);
  const perPage = parseBoundedInt(url.searchParams.get("per_page"), 10, 1, 100);
  if (page === null || perPage === null) return fail(400, "invalid_pagination", "Use a valid WordPress page and per_page value (1-100).");
  const slug = url.searchParams.get("slug");
  if (slug !== null && (!textValue(slug, 200) || !ENTRY_SLUG.test(slug))) {
    return fail(400, "invalid_slug", "The term slug filter is invalid.");
  }
  const search = url.searchParams.get("search");
  if (search !== null && (!search.trim() || search.length > 100)) {
    return fail(400, "invalid_search", "The term search must contain 1-100 characters.");
  }
  const hideEmptyValue = url.searchParams.get("hide_empty");
  if (hideEmptyValue !== null && !["true", "false", "1", "0"].includes(hideEmptyValue)) {
    return fail(400, "invalid_hide_empty", "Use true, false, 1, or 0 for hide_empty.");
  }
  const numericId = termId === null ? null : Number(termId);
  if (termId !== null && (!Number.isSafeInteger(numericId) || numericId < 1)) {
    return fail(404, "term_not_found", "Term not found.");
  }
  const hideEmpty = numericId === null
    && (hideEmptyValue === null || hideEmptyValue === "true" || hideEmptyValue === "1");

  const categoryReferences = taxonomy === "category";
  const referencedIds = categoryReferences ? "e.categories_json" : "e.tags_json";
  const countExpression = `(SELECT COUNT(*) FROM entries e, json_each(${referencedIds}) ref WHERE e.site_id = t.site_id AND e.revision_id = t.revision_id AND e.kind = 'post' AND e.publication_status = 'published' AND CAST(ref.value AS INTEGER) = t.term_id)`;
  const conditions = ["t.site_id = ?", "t.revision_id = ?", "t.taxonomy = ?"];
  const parameters = [site.id, site.current_revision_id, taxonomy];
  if (numericId !== null) {
    conditions.push("t.term_id = ?");
    parameters.push(numericId);
  }
  if (slug !== null) {
    conditions.push("t.slug = ?");
    parameters.push(slug);
  }
  if (search !== null) {
    conditions.push("instr(lower(t.name), lower(?)) > 0");
    parameters.push(search.trim());
  }
  if (hideEmpty) conditions.push(`${countExpression} > 0`);
  const where = conditions.join(" AND ");

  if (numericId !== null) {
    const row = await env.DB.prepare(
      `SELECT t.term_id, t.taxonomy, t.slug, t.name, t.description_html, t.parent_term_id, ${countExpression} AS term_count FROM taxonomy_terms t WHERE ${where} LIMIT 1`,
    ).bind(...parameters).first();
    if (!row) return fail(404, "term_not_found", "Term not found.");
    return request.method === "HEAD"
      ? response(null, 200, { "Content-Type": "application/json; charset=utf-8" })
      : json(wpTerm(site, row));
  }

  const orderValue = url.searchParams.get("order") ?? "asc";
  if (!["asc", "desc"].includes(orderValue)) return fail(400, "invalid_order", "Sort order must be asc or desc.");
  const order = orderValue === "desc" ? "DESC" : "ASC";
  const orderby = url.searchParams.get("orderby") ?? "name";
  const orderColumn = orderby === "id" ? "t.term_id"
    : orderby === "slug" ? "t.slug"
      : orderby === "count" ? "term_count" : "t.name";
  if (!["name", "id", "slug", "count"].includes(orderby)) {
    return fail(400, "invalid_orderby", "Sort terms by name, id, slug, or count.");
  }

  const termCounts = `WITH term_counts AS (SELECT CAST(ref.value AS INTEGER) AS term_id, COUNT(*) AS term_count FROM entries e, json_each(${referencedIds}) ref WHERE e.site_id = ? AND e.revision_id = ? AND e.kind = 'post' AND e.publication_status = 'published' GROUP BY CAST(ref.value AS INTEGER))`;
  const listParameters = [site.id, site.current_revision_id, ...parameters];
  const visibleTerms = hideEmpty ? " AND COALESCE(tc.term_count, 0) > 0" : "";
  const count = await env.DB.prepare(
    `${termCounts} SELECT COUNT(*) AS total FROM taxonomy_terms t LEFT JOIN term_counts tc ON tc.term_id = t.term_id WHERE ${where}${visibleTerms}`,
  ).bind(...listParameters).first();
  const total = Number(count?.total ?? 0);
  const totalPages = total === 0 ? 0 : Math.ceil(total / perPage);
  const offset = (page - 1) * perPage;
  const rows = await env.DB.prepare(
    `${termCounts} SELECT t.term_id, t.taxonomy, t.slug, t.name, t.description_html, t.parent_term_id, COALESCE(tc.term_count, 0) AS term_count FROM taxonomy_terms t LEFT JOIN term_counts tc ON tc.term_id = t.term_id WHERE ${where}${visibleTerms} ORDER BY ${orderColumn} ${order}, t.term_id ASC LIMIT ? OFFSET ?`,
  ).bind(...listParameters, perPage, offset).all();
  const headers = { "X-WP-Total": String(total), "X-WP-TotalPages": String(totalPages) };
  if (totalPages > 0) {
    const pageLink = (targetPage) => {
      const target = new URL(request.url);
      target.searchParams.set("page", String(targetPage));
      target.searchParams.set("per_page", String(perPage));
      return `<${target.origin}${target.pathname}${target.search}>`;
    };
    const links = [];
    if (page > 1) links.push(`${pageLink(page - 1)}; rel="prev"`);
    if (page < totalPages) links.push(`${pageLink(page + 1)}; rel="next"`);
    if (links.length) headers.Link = links.join(", ");
  }
  if (request.method === "HEAD") return response(null, 200, { "Content-Type": "application/json; charset=utf-8", ...headers });
  return json((rows.results ?? []).map((row) => wpTerm(site, row)), 200, headers);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[character]);
}

function htmlDocument(hostname, entry, privatePreview = false, headOnly = false, media = null, previewRevisionId = null) {
  const canonical = canonicalUrl(hostname, entry.slug, entry.kind);
  const robots = privatePreview ? "noindex, nofollow, noarchive" : "index, follow";
  const language = normalizedLanguageTag(entry.language_code) ?? "und";
  const seo = selectWordPressSeoMetadata(JSON.parse(entry.seo_metadata_json ?? "{}")).metadata;
  const seoTitle = seo._yoast_wpseo_title || seo.rank_math_title || entry.title;
  const seoDescription = seo._yoast_wpseo_metadesc || seo.rank_math_description;
  const description = seoDescription ? `<meta name="description" content="${escapeHtml(seoDescription)}">` : "";
  const image = media
    ? `<img src="/_mithrilpress/media/${media.id}${privatePreview ? `?revision=${encodeURIComponent(previewRevisionId)}` : ""}" alt="${escapeHtml(media.alt_text)}" loading="lazy" decoding="async">`
    : "";
  const body = `<!doctype html><html lang="${escapeHtml(language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="${robots}">${description}<title>${escapeHtml(seoTitle)}</title><link rel="canonical" href="${escapeHtml(canonical)}"></head><body><main><article><h1>${escapeHtml(entry.title)}</h1>${image}<div>${entry.safe_html}</div></article></main></body></html>`;
  const headers = {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'; img-src 'self'; style-src 'none'; connect-src 'none'",
  };
  if (privatePreview) headers["X-Robots-Tag"] = "noindex, nofollow, noarchive";
  return response(headOnly ? null : body, 200, headers);
}

async function publicTaxonomyArchive(request, env, site, taxonomy, slug) {
  const term = await env.DB.prepare(
    "SELECT term_id, taxonomy, slug, name, description_html FROM taxonomy_terms WHERE site_id = ? AND revision_id = ? AND taxonomy = ? AND slug = ? LIMIT 1",
  ).bind(site.id, site.current_revision_id, taxonomy, slug).first();
  if (!term) return fail(404, "term_not_found", "Term not found.");
  const page = parseBoundedInt(new URL(request.url).searchParams.get("page"), 1, 1, 100000);
  const perPage = parseBoundedInt(new URL(request.url).searchParams.get("per_page"), 10, 1, 50);
  if (page === null || perPage === null) return fail(400, "invalid_pagination", "Use a valid page and per_page value (1-50).");
  const referencedIds = taxonomy === "category" ? "e.categories_json" : "e.tags_json";
  const matching = `e.site_id = ? AND e.revision_id = ? AND e.kind = 'post' AND e.publication_status = 'published' AND CAST(ref.value AS INTEGER) = ?`;
  const count = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM entries e, json_each(${referencedIds}) ref WHERE ${matching}`,
  ).bind(site.id, site.current_revision_id, term.term_id).first();
  const total = Number(count?.total ?? 0);
  const totalPages = Math.ceil(total / perPage);
  const rows = await env.DB.prepare(
    `SELECT e.kind, e.slug, e.title FROM entries e, json_each(${referencedIds}) ref WHERE ${matching} ORDER BY COALESCE(e.source_date, '') DESC, e.api_id ASC LIMIT ? OFFSET ?`,
  ).bind(site.id, site.current_revision_id, term.term_id, perPage, (page - 1) * perPage).all();
  const archivePath = taxonomy === "category" ? "category" : "tag";
  const canonical = `https://${site.hostname}/${archivePath}/${encodeURIComponent(term.slug)}/`;
  const articleLinks = (rows.results ?? []).map((entry) => {
    const href = canonicalUrl(site.hostname, entry.slug, entry.kind);
    return `<li><a href="${escapeHtml(href)}">${escapeHtml(entry.title)}</a></li>`;
  }).join("");
  const pageLinks = [
    page > 1 ? `<a rel="prev" href="?page=${page - 1}&amp;per_page=${perPage}">Previous</a>` : "",
    page < totalPages ? `<a rel="next" href="?page=${page + 1}&amp;per_page=${perPage}">Next</a>` : "",
  ].filter(Boolean).join(" ");
  const body = `<!doctype html><html lang="und"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="index, follow"><title>${escapeHtml(term.name)}</title><link rel="canonical" href="${escapeHtml(canonical)}"></head><body><main><h1>${escapeHtml(term.name)}</h1><div>${term.description_html}</div><ul>${articleLinks}</ul><nav aria-label="Pagination">${pageLinks}</nav></main></body></html>`;
  const headers = {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'; img-src 'self'; style-src 'none'; connect-src 'none'",
  };
  return response(request.method === "HEAD" ? null : body, 200, headers);
}

async function publicPage(request, env, site, pathname) {
  if (request.method !== "GET" && request.method !== "HEAD") return fail(405, "method_not_allowed", "This site is read-only for public visitors.");
  if (!site.current_revision_id || site.status !== "active") return fail(404, "site_not_published", "This site has no published revision.");
  if (pathname === "/") {
    const home = await env.DB.prepare(
      `SELECT kind, slug, title, safe_html, language_code, source_date, featured_media_id, ${SEO_METADATA_SELECT} FROM entries WHERE site_id = ? AND revision_id = ? AND kind = 'page' AND slug = 'home' AND publication_status = 'published' LIMIT 1`,
    ).bind(site.id, site.current_revision_id).first();
    if (home) return htmlDocument(site.hostname, home, false, request.method === "HEAD", await featuredMediaForEntry(env, site, home));
    const firstPost = await env.DB.prepare(
      `SELECT kind, slug, title, safe_html, language_code, source_date, api_id, featured_media_id, ${SEO_METADATA_SELECT} FROM entries WHERE site_id = ? AND revision_id = ? AND publication_status = 'published' ORDER BY CASE kind WHEN 'page' THEN 0 ELSE 1 END, COALESCE(source_date, '') DESC, api_id ASC LIMIT 1`,
    ).bind(site.id, site.current_revision_id).first();
    return firstPost ? htmlDocument(site.hostname, firstPost, false, request.method === "HEAD", await featuredMediaForEntry(env, site, firstPost)) : fail(404, "site_empty", "No published content is available.");
  }
  const archiveMatch = /^\/(category|tag)\/([^/]+)\/?$/.exec(pathname);
  if (archiveMatch) {
    const slug = parsePathSegment(archiveMatch[2]);
    if (!slug || !ENTRY_SLUG.test(slug)) return fail(404, "term_not_found", "Term not found.");
    return await publicTaxonomyArchive(request, env, site, archiveMatch[1] === "category" ? "category" : "post_tag", slug);
  }
  const rawSlug = pathname.replace(/^\/+|\/+$/g, "");
  const slug = parsePathSegment(rawSlug);
  if (!slug || !ENTRY_SLUG.test(slug)) return fail(404, "entry_not_found", "Entry not found.");
  const entry = await env.DB.prepare(
    `SELECT kind, slug, title, safe_html, language_code, source_date, featured_media_id, ${SEO_METADATA_SELECT} FROM entries WHERE site_id = ? AND revision_id = ? AND slug = ? AND publication_status = 'published' ORDER BY CASE kind WHEN 'page' THEN 0 ELSE 1 END LIMIT 1`,
  ).bind(site.id, site.current_revision_id, slug).first();
  return entry ? htmlDocument(site.hostname, entry, false, request.method === "HEAD", await featuredMediaForEntry(env, site, entry)) : fail(404, "entry_not_found", "Entry not found.");
}

async function handleRequest(request, env) {
  // Count the deployment allowance before resolving the tenant. Once the
  // shared cap is exhausted, reject further requests without reading D1's
  // hostname registry. This counter covers every HTTP route, not just pages.
  const deploymentLimit = await checkHostingRequest(env);
  if (deploymentLimit) return deploymentLimit;

  const site = await resolveSite(request, env);
  if (!site || site.status !== "active") return fail(404, "site_not_found", "Site not found.");

  const siteLimit = await checkHostingRequest(env, site.id);
  if (siteLimit) return siteLimit;

  const url = new URL(request.url);

  if (url.pathname === "/_mithrilpress/studio" || url.pathname === "/_mithrilpress/studio/" || url.pathname === "/_mithrilpress/studio.html") {
    return await studioAsset(request, env, "/studio.html");
  }
  if (url.pathname === "/_mithrilpress/studio.js") return await studioAsset(request, env, "/studio.js");
  if (url.pathname === "/_mithrilpress/studio.css") return await studioAsset(request, env, "/studio.css");

  if (url.pathname === "/_mithrilpress/api/studio/session") return await studioSession(request, env, site);
  if (url.pathname.startsWith("/_mithrilpress/api/dns-migrations")) {
    return await handleDnsMigrations(request, env, site, {
      ownerToken,
      sameOriginStudioMutation,
      readBoundedJson,
      json,
      fail,
    });
  }
  if (url.pathname === "/_mithrilpress/api/domains") return await studioDomains(request, env, site);
  const domainActionMatch = /^\/_mithrilpress\/api\/domains\/([a-f0-9-]{36})(?:\/(verify|refresh))?$/.exec(url.pathname);
  if (domainActionMatch) {
    const action = domainActionMatch[2] ?? "delete";
    return await studioDomainAction(request, env, site, domainActionMatch[1], action);
  }
  if (url.pathname === "/_mithrilpress/api/studio/conversations" && request.method === "GET") {
    return await studioConversations(request, env, site);
  }
  if (url.pathname === "/_mithrilpress/api/studio/usage") {
    return await studioUsage(request, env, site);
  }
  if (url.pathname === "/_mithrilpress/api/studio/chat" && request.method === "POST") {
    return await studioChat(request, env, site);
  }
  const studioConversationMatch = /^\/_mithrilpress\/api\/studio\/conversations\/([a-f0-9-]{36})$/.exec(url.pathname);
  if (studioConversationMatch) {
    const owner = await ownerToken(request, env, site, "content:write");
    if (!owner) return fail(401, "studio_login_required", "An active content:write session is required.");
    if (request.method === "DELETE") return await deleteStudioConversation(request, env, site, studioConversationMatch[1], owner);
    if (request.method === "GET") return await studioConversation(request, env, site, studioConversationMatch[1], owner);
    return fail(405, "method_not_allowed", "Use GET or DELETE for this conversation.");
  }

  if (url.pathname === "/api/wordpress/import" && request.method === "POST") {
    return await importWordPress(request, env, site);
  }

  const migrationReportMatch = /^\/_mithrilpress\/api\/revisions\/([a-f0-9-]{36})\/migration-report$/.exec(url.pathname);
  if (migrationReportMatch) {
    return await revisionMigrationReport(request, env, site, migrationReportMatch[1]);
  }

  const approvalMatch = /^\/_mithrilpress\/api\/revisions\/([a-f0-9-]{36})\/(approve|publish)$/.exec(url.pathname);
  if (approvalMatch && request.method === "POST") {
    return approvalMatch[2] === "approve"
      ? await approveRevision(request, env, site, approvalMatch[1])
      : await publishRevision(request, env, site, approvalMatch[1]);
  }

  const previewMatch = /^\/_mithrilpress\/preview\/([a-f0-9-]{36})\/([^/]+)\/?$/.exec(url.pathname);
  if (previewMatch && request.method === "GET") {
    const slug = parsePathSegment(previewMatch[2]);
    if (!slug) return fail(404, "entry_not_found", "Entry not found.");
    return await previewRevision(request, env, site, previewMatch[1], slug);
  }

  const wpMediaMatch = /^\/wp-json\/wp\/v2\/media\/(\d+)\/?$/.exec(url.pathname);
  if (wpMediaMatch) {
    const mediaId = Number(wpMediaMatch[1]);
    if (!Number.isSafeInteger(mediaId) || mediaId < 1) return fail(404, "media_not_found", "Media item not found.");
    return await wordpressMediaRead(request, env, site, mediaId);
  }
  const wpMatch = /^\/wp-json\/wp\/v2\/(posts|pages)(?:\/([0-9]+))?\/?$/.exec(url.pathname);
  if (wpMatch) return await wordpressRead(request, env, site, wpMatch[1] === "pages" ? "page" : "post", wpMatch[2] ?? null);
  const wpTaxonomyMatch = /^\/wp-json\/wp\/v2\/(categories|tags)(?:\/(\d+))?\/?$/.exec(url.pathname);
  if (wpTaxonomyMatch) {
    const taxonomy = wpTaxonomyMatch[1] === "categories" ? "category" : "post_tag";
    return await wordpressTaxonomyRead(request, env, site, taxonomy, wpTaxonomyMatch[2] ?? null);
  }

  if (url.pathname === "/_mithrilpress/api/media") return await studioMedia(request, env, site);
  const studioMediaMatch = /^\/_mithrilpress\/api\/media\/(\d+)$/.exec(url.pathname);
  if (studioMediaMatch) {
    const mediaId = Number(studioMediaMatch[1]);
    if (!Number.isSafeInteger(mediaId) || mediaId < 1) return fail(404, "media_not_found", "Media item not found.");
    return await deleteStudioMedia(request, env, site, mediaId);
  }
  const mediaRouteMatch = /^\/_mithrilpress\/media\/(\d+)$/.exec(url.pathname);
  if (mediaRouteMatch) {
    const mediaId = Number(mediaRouteMatch[1]);
    if (!Number.isSafeInteger(mediaId) || mediaId < 1) return fail(404, "media_not_found", "Media item not found.");
    return await serveMedia(request, env, site, mediaId);
  }
  if (url.pathname.startsWith("/wp-json/")) return fail(404, "rest_route_not_supported", "This WordPress-compatible route is not implemented.");

  return await publicPage(request, env, site, url.pathname);
}

export default {
  async fetch(request, env) {
    const requestId = crypto.randomUUID();
    try {
      return await handleRequest(request, env);
    } catch (error) {
      if (d1ProviderLimitReached(error)) {
        return fail(503, "provider_usage_limit", "Hosting is temporarily unavailable because a Cloudflare D1 usage limit has been reached.");
      }
      if (error?.status && error?.code) return fail(error.status, error.code, "The request could not be processed.");
      console.error(JSON.stringify({ event: "sites_request_failed", request_id: requestId }));
      return fail(500, "internal_error", "The request could not be completed.");
    }
  },
  async scheduled(controller, env) {
    await monitorActiveCustomHostnames(env);
  },
};
