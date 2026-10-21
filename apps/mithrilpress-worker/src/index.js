import { handleDnsMigrations } from "./dns_migration.js";

const SITE_ZONE = "sites.mithril.love";
const CUSTOM_DOMAIN_LIMIT_PER_SITE = 10;
const CUSTOM_DOMAIN_LIMIT_PER_DEPLOYMENT = 90;
const CUSTOM_DOMAIN_HEALTH_BATCH_SIZE = 30;
const CUSTOM_DOMAIN_HEALTH_FAILURE_LIMIT = 3;
const MAX_BODY_BYTES = 12_000_000;
const MAX_RECORDS = 500;
const MAX_CONTENT_CHARS = 250_000;
const MAX_IMPORT_CHARS = 10_000_000;
const MAX_SAFE_HTML_CHARS = 1_250_000;
const MAX_D1_ROW_BYTES = 1_800_000;
const SITE_CONTENT_LIMIT_BYTES = 16 * 1024 * 1024;
const DEPLOYMENT_CONTENT_LIMIT_BYTES = 256 * 1024 * 1024;
const TENANT_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const ENTRY_SLUG = /^[^/?#\\\u0000-\u001f\u007f]{1,200}$/;
const RESERVED_LABELS = new Set([
  "www", "admin", "api", "assets", "preview", "mail", "status",
  "support", "docs", "help", "root",
]);
const POST_TYPES = new Set(["post", "page"]);
const SOURCE_STATUSES = new Set(["publish", "future", "draft", "pending", "private", "trash"]);
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

function fail(status, code, message) {
  return json({ error: { code, message } }, status);
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

function normalizeSiteHostname(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const suffix = `.${SITE_ZONE}`;
  if (!host.endsWith(suffix)) return null;
  const label = host.slice(0, -suffix.length);
  if (!TENANT_LABEL.test(label) || RESERVED_LABELS.has(label)) return null;
  return host;
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

async function readBoundedJson(request) {
  const contentType = request.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") throw Object.assign(new Error(), { status: 415, code: "json_required" });
  const declared = request.headers.get("Content-Length");
  if (declared && Number(declared) > MAX_BODY_BYTES) throw Object.assign(new Error(), { status: 413, code: "payload_too_large" });
  if (!request.body) throw Object.assign(new Error(), { status: 400, code: "missing_body" });
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const item = await reader.read();
    if (item.done) break;
    total += item.value.byteLength;
    if (total > MAX_BODY_BYTES) {
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
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw Object.assign(new Error(), { status: 400, code: "invalid_json" });
  }
}

function textValue(value, limit) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= limit;
}

function renderedText(record, key) {
  const value = record[key];
  return value && typeof value === "object"
    ? (typeof value.raw === "string" ? value.raw : typeof value.rendered === "string" ? value.rendered : null)
    : null;
}

function normalizeRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) throw Object.assign(new Error(), { status: 422, code: "invalid_wordpress_record" });
  const id = record.id;
  const kind = record.type;
  const slug = record.slug;
  const title = renderedText(record, "title");
  const content = record.content && typeof record.content === "object"
    ? (typeof record.content.raw === "string"
      ? record.content.raw
      : typeof record.content.rendered === "string" ? record.content.rendered : null)
    : null;
  const sourceStatus = record.status;
  const categories = record.categories ?? [];
  const tags = record.tags ?? [];
  const media = record.featured_media ?? 0;
  if (!Number.isSafeInteger(id) || id <= 0) throw Object.assign(new Error(), { status: 422, code: "invalid_source_id" });
  if (!POST_TYPES.has(kind)) throw Object.assign(new Error(), { status: 422, code: "unsupported_post_type" });
  if (!SOURCE_STATUSES.has(sourceStatus)) throw Object.assign(new Error(), { status: 422, code: "unsupported_source_status" });
  if (!textValue(slug, 200) || !ENTRY_SLUG.test(slug)) throw Object.assign(new Error(), { status: 422, code: "invalid_slug" });
  if (!textValue(title, 20000)) throw Object.assign(new Error(), { status: 422, code: "invalid_title" });
  if (!textValue(content, MAX_CONTENT_CHARS)) throw Object.assign(new Error(), { status: 422, code: "invalid_content" });
  if (!validIdList(categories) || !validIdList(tags) || !Number.isSafeInteger(media) || media < 0) {
    throw Object.assign(new Error(), { status: 422, code: "invalid_taxonomy_or_media" });
  }
  for (const field of ["date", "date_gmt", "modified", "modified_gmt"]) {
    if (record[field] !== undefined && record[field] !== null && (typeof record[field] !== "string" || record[field].length > 128)) {
      throw Object.assign(new Error(), { status: 422, code: "invalid_date" });
    }
  }
  if (record.link !== undefined && record.link !== null && (typeof record.link !== "string" || record.link.length > 2048)) {
    throw Object.assign(new Error(), { status: 422, code: "invalid_permalink" });
  }
  return {
    entryId: `wordpress:${kind}:${id}`,
    kind,
    slug,
    title,
    sourceHtml: content,
    sourceId: id,
    sourceStatus,
    sourceDate: record.date ?? null,
    sourceDateGmt: record.date_gmt ?? null,
    sourceModified: record.modified ?? null,
    sourceModifiedGmt: record.modified_gmt ?? null,
    sourcePermalink: record.link ?? null,
    categories,
    tags,
    featuredMediaId: media || null,
  };
}

function validIdList(value) {
  return Array.isArray(value)
    && value.length <= 1000
    && value.every((item) => Number.isSafeInteger(item) && item > 0)
    && new Set(value).size === value.length;
}

async function sanitizeHtml(source) {
  const result = await safeHtmlRewriter.transform(new Response(source, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })).text();
  if (result.length > MAX_SAFE_HTML_CHARS) throw Object.assign(new Error(), { status: 422, code: "sanitized_content_too_large" });
  return result;
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
  const total = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM site_hostnames WHERE status != 'detached'",
  ).first();
  const capacity = Math.min(CUSTOM_DOMAIN_LIMIT_PER_DEPLOYMENT, Number.parseInt(env.CF_SAAS_CAPACITY_REMAINING, 10));
  if (Number(total?.total ?? 0) >= capacity) {
    return fail(429, "custom_hostname_capacity", "The deployment has reached its reserved free-plan hostname capacity.");
  }
  const existing = await env.DB.prepare("SELECT * FROM site_hostnames WHERE hostname = ? LIMIT 1").bind(hostname).first();
  if (existing && (existing.site_id !== site.id || existing.status !== "detached")) {
    return fail(409, "custom_hostname_in_use", "This hostname is already being used by a MithrilPress site.");
  }
  const perSite = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM site_hostnames WHERE site_id = ? AND status != 'detached'",
  ).bind(site.id).first();
  if (Number(perSite?.total ?? 0) >= CUSTOM_DOMAIN_LIMIT_PER_SITE) {
    return fail(429, "site_hostname_capacity", "This site has reached its ten custom hostname limit.");
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const domain = {
    id: existing?.id ?? crypto.randomUUID(),
    site_id: site.id,
    hostname,
    status: "ownership_pending",
    owner_token_id: owner.tokenId,
    ownership_txt_name: `_mithrilpress-verify.${hostname}`,
    ownership_txt_value: `mithrilpress-verification=${hex(crypto.getRandomValues(new Uint8Array(32)))}`,
    ownership_expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    created_at: existing?.created_at ?? nowIso,
    updated_at: nowIso,
  };
  if (existing) {
    const update = await env.DB.prepare(
      "UPDATE site_hostnames SET status = ?, owner_token_id = ?, ownership_txt_name = ?, ownership_txt_value = ?, ownership_expires_at = ?, ownership_verified_at = NULL, provider_hostname_id = NULL, provider_status = NULL, certificate_status = NULL, cname_target = NULL, validation_records_json = '[]', updated_at = ?, activated_at = NULL, detached_at = NULL WHERE site_id = ? AND id = ? AND status = 'detached'",
    ).bind(domain.status, owner.tokenId, domain.ownership_txt_name, domain.ownership_txt_value, domain.ownership_expires_at, nowIso, site.id, domain.id).run();
    if (update.meta?.changes !== 1) return fail(409, "custom_hostname_in_use", "This hostname changed while the request was being saved. Reload and retry.");
  } else {
    const insert = await env.DB.prepare(
      "INSERT INTO site_hostnames (id, site_id, hostname, status, owner_token_id, ownership_txt_name, ownership_txt_value, ownership_expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(hostname) DO NOTHING",
    ).bind(domain.id, site.id, hostname, domain.status, owner.tokenId, domain.ownership_txt_name, domain.ownership_txt_value, domain.ownership_expires_at, nowIso, nowIso).run();
    if (insert.meta?.changes !== 1) return fail(409, "custom_hostname_in_use", "This hostname was requested by another session. Reload and retry.");
  }
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
      const update = await env.DB.prepare(
        "UPDATE site_hostnames SET status = 'provider_pending', ownership_verified_at = ?, ownership_txt_value = NULL, updated_at = ? WHERE site_id = ? AND id = ? AND status = 'ownership_pending' AND ownership_txt_value = ?",
      ).bind(verifiedAt, verifiedAt, site.id, domain.id, domain.ownership_txt_value).run();
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

async function studioSession(request, env, site) {
  if (request.method === "GET") {
    const owner = await ownerToken(request, env, site, "content:write")
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
    if (!owner || !(owner.scopes.includes("content:write") || owner.scopes.includes("site:domains")
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

const STUDIO_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
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
  if (!env.AI) return fail(503, "ai_unavailable", "Chat drafting is not configured for this site.");

  const body = await readBoundedJson(request);
  if (!textValue(body?.message, 1800)) return fail(422, "invalid_message", "Enter a message of up to 1,800 characters.");
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
    await env.DB.prepare(
      "INSERT INTO studio_conversations (site_id, id, token_id, base_revision_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(site.id, conversation.id, owner.tokenId, site.current_revision_id, nowIso, nowIso).run();
  }

  const dailyQuota = await env.DB.prepare(
    "INSERT INTO studio_ai_usage (day_utc, request_count) VALUES (?, 1) ON CONFLICT(day_utc) DO UPDATE SET request_count = request_count + 1 WHERE studio_ai_usage.request_count < ? RETURNING request_count",
  ).bind(nowIso.slice(0, 10), STUDIO_DAILY_GENERATION_LIMIT).first();
  if (!dailyQuota) return fail(429, "daily_ai_limit", "The free daily drafting allowance has been used. Try again after 00:00 UTC.");

  const historyRows = await env.DB.prepare(
    "SELECT role, body FROM studio_messages WHERE site_id = ? AND conversation_id = ? ORDER BY created_at DESC LIMIT ?",
  ).bind(site.id, conversation.id, STUDIO_CONTEXT_MESSAGES).all();
  const history = (historyRows.results ?? []).reverse().map((row) => ({ role: row.role, content: row.body }));
  let currentDraft = null;
  if (conversation.draft_revision_id) {
    currentDraft = await env.DB.prepare(
      "SELECT kind, title, slug, safe_html FROM entries WHERE site_id = ? AND revision_id = ? AND entry_id = ? LIMIT 1",
    ).bind(site.id, conversation.draft_revision_id, `mithrilpress:chat:${conversation.id}`).first();
  }
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
    modelResult = await env.AI.run(STUDIO_MODEL, {
      messages: [{ role: "system", content: system }, ...history, { role: "user", content: body.message }],
      response_format: { type: "json_schema", json_schema: STUDIO_RESPONSE_SCHEMA },
      max_tokens: 700,
      temperature: 0.35,
    });
  } catch {
    return fail(503, "ai_generation_unavailable", "The free AI drafting service is temporarily unavailable. No draft was published.");
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
  if (!proposal || typeof proposal !== "object"
      || !textValue(proposal.assistant_message, 1500)
      || !textValue(proposal.title, 200)
      || !languageCode
      || typeof proposal.html !== "string" || proposal.html.length < 1 || proposal.html.length > MAX_CONTENT_CHARS) {
    return fail(502, "invalid_ai_response", "The drafting service returned an incomplete proposal. No draft was saved.");
  }
  const safeHtml = await sanitizeHtml(proposal.html);
  if (!textValue(safeHtml, MAX_SAFE_HTML_CHARS)) return fail(502, "empty_ai_draft", "The generated content did not contain publishable text. No draft was saved.");
  let slug = studioSlug(proposal.slug, proposal.title);
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
  const entryId = `mithrilpress:chat:${conversation.id}`;
  const assistantAt = new Date(now.getTime() + 1).toISOString();
  const baseRevisionId = conversation.base_revision_id;
  const statements = [
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
      "INSERT INTO entries (site_id, revision_id, entry_id, kind, slug, title, source_html, safe_html, entry_origin, publication_status, language_code, api_id, source_id, source_status, source_date, source_date_gmt, source_modified, source_modified_gmt, source_permalink, categories_json, tags_json, featured_media_id, rendering_admission) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'chat', 'draft', ?, ?, NULL, 'draft', ?, ?, ?, ?, NULL, '[]', '[]', NULL, 'ready')",
    ).bind(site.id, revisionId, entryId, kind, slug, proposal.title.trim(), proposal.html, safeHtml,
      languageCode, apiId, nowIso, nowIso, nowIso, nowIso),
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
    ).bind(site.id, conversation.id, crypto.randomUUID(), proposal.assistant_message.trim(), assistantAt),
    env.DB.prepare(
      "INSERT INTO owner_actions (id, site_id, revision_id, token_id, action, created_at, metadata_json) SELECT ?, ?, ?, ?, 'chat-generate', ?, ? WHERE EXISTS (SELECT 1 FROM site_revisions WHERE site_id = ? AND id = ? AND state = 'private-preview')",
    ).bind(crypto.randomUUID(), site.id, revisionId, owner.tokenId, assistantAt,
      JSON.stringify({ model: STUDIO_MODEL, conversation_id: conversation.id, entry_id: entryId }), site.id, revisionId),
  ];
  let saved;
  try {
    saved = await env.DB.batch(statements);
  } catch (error) {
    const quotaCode = storageQuotaCode(error);
    if (quotaCode) return storageQuotaResponse(quotaCode);
    return fail(503, "draft_not_saved", "The private draft could not be saved. No content was published.");
  }
  if (saved[4]?.meta?.changes !== 1 || saved[5]?.meta?.changes !== 1) {
    return fail(503, "draft_not_saved", "The private draft could not be saved. No content was published.");
  }
  return json({
    conversation_id: conversation.id,
    message: proposal.assistant_message.trim(),
    draft: { revision_id: revisionId, title: proposal.title.trim(), slug, kind, state: "private-preview" },
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
      "SELECT title, slug, kind FROM entries WHERE site_id = ? AND revision_id = ? AND entry_id = ? LIMIT 1",
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
  if (!owner || !owner.scopes.some((scope) => scope === "content:write" || scope === "site:domains")) {
    return fail(401, "studio_login_required", "Sign in with a content:write or site:domains owner token to view hosting usage.");
  }

  const now = new Date();
  const dayUtc = now.toISOString().slice(0, 10);
  const resetsAtUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
  const [storage, aiUsage] = await Promise.all([
    env.DB.prepare("SELECT content_bytes FROM mithrilpress_site_storage_usage WHERE site_id = ? LIMIT 1").bind(site.id).first(),
    env.DB.prepare("SELECT request_count FROM studio_ai_usage WHERE day_utc = ? LIMIT 1").bind(dayUtc).first(),
  ]);
  return json({
    storage: {
      estimate_type: "retained_entry_text_payload",
      estimated_content_bytes: Number(storage?.content_bytes ?? 0),
      site_limit_bytes: SITE_CONTENT_LIMIT_BYTES,
      shared_deployment_limit_bytes: DEPLOYMENT_CONTENT_LIMIT_BYTES,
    },
    ai_drafting: {
      scope: "shared_deployment",
      requests_used: Number(aiUsage?.request_count ?? 0),
      daily_app_limit: STUDIO_DAILY_GENERATION_LIMIT,
      resets_at_utc: resetsAtUtc,
    },
    provider_metering: {
      available: false,
      detail: "Cloudflare account-level Worker requests, D1 reads/writes/storage, and Workers AI neuron usage are not measured by this site view.",
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

async function importWordPress(request, env, site) {
  const owner = await ownerToken(request, env, site, "content:import");
  if (!owner) return fail(401, "owner_authorization_required", "A scoped site owner token is required.");
  const body = await readBoundedJson(request);
  const sourceOrigin = validateSourceOrigin(body?.source_site);
  if (!sourceOrigin || (site.source_origin && sourceOrigin !== site.source_origin)) {
    return fail(422, "source_origin_not_admitted", "Provide the owner-authorized HTTPS WordPress origin for this site.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)
      || !Array.isArray(body.records) || body.records.length < 1 || body.records.length > MAX_RECORDS) {
    return fail(422, "invalid_import_size", "An import must contain between 1 and 500 WordPress REST records.");
  }
  const entries = body.records.map(normalizeRecord);
  const identities = new Set(entries.map((entry) => entry.entryId));
  if (identities.size !== entries.length) return fail(422, "duplicate_source_id", "The import contains duplicate WordPress record identities.");
  const slugs = new Set(entries.map((entry) => `${entry.kind}:${entry.slug}`));
  if (slugs.size !== entries.length) return fail(422, "duplicate_slug", "Each post type may contain a slug only once per revision.");
  const totalChars = entries.reduce((sum, entry) => sum + entry.sourceHtml.length, 0);
  if (totalChars > MAX_IMPORT_CHARS) return fail(413, "import_too_large", "The imported content exceeds the site import budget.");

  const encoder = new TextEncoder();
  for (const entry of entries) {
    entry.safeHtml = await sanitizeHtml(entry.sourceHtml);
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
    if (rowBytes > MAX_D1_ROW_BYTES) return fail(413, "entry_row_too_large", "An entry exceeds the D1 row budget.");
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
    const finalized = await env.DB.batch([
      env.DB.prepare(
        "UPDATE site_revisions SET state = 'private-preview' WHERE site_id = ? AND id = ? AND state = 'importing'",
      ).bind(site.id, revisionId),
      env.DB.prepare(
        "INSERT INTO owner_actions (id, site_id, revision_id, token_id, action, created_at, metadata_json) SELECT ?, ?, ?, ?, 'import', ?, ? WHERE EXISTS (SELECT 1 FROM site_revisions WHERE site_id = ? AND id = ? AND state = 'private-preview')",
      ).bind(crypto.randomUUID(), site.id, revisionId, owner.tokenId, now,
        JSON.stringify({ entry_count: entries.length, proof_id: proofId }), site.id, revisionId),
    ]);
    if (finalized[0]?.meta?.changes !== 1) throw new Error("revision finalization failed");
  } catch (error) {
    const quotaCode = storageQuotaCode(error);
    try {
      await env.DB.batch([
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
  return json({ revision_id: revisionId, state: "private-preview", entry_count: entries.length, authorization_proof_id: proofId }, 201);
}

async function previewRevision(request, env, site, revisionId, slug) {
  const owner = await ownerToken(request, env, site, "revision:preview");
  if (!owner) return fail(401, "owner_authorization_required", "A scoped site owner token is required.");
  const revision = await env.DB.prepare(
    "SELECT id FROM site_revisions WHERE site_id = ? AND id = ? AND state IN ('private-preview', 'approved', 'published', 'superseded') LIMIT 1",
  ).bind(site.id, revisionId).first();
  if (!revision) return fail(404, "revision_not_found", "Revision not found.");
  const entry = await env.DB.prepare(
    "SELECT kind, slug, title, safe_html, language_code, source_date FROM entries WHERE site_id = ? AND revision_id = ? AND slug = ? ORDER BY CASE kind WHEN 'page' THEN 0 ELSE 1 END LIMIT 1",
  ).bind(site.id, revisionId, slug).first();
  if (!entry) return fail(404, "entry_not_found", "Entry not found.");
  return htmlDocument(site.hostname, entry, true);
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

function canonicalUrl(hostname, slug, kind) {
  const path = kind === "page" && slug === "home" ? "/" : `/${encodeURIComponent(slug)}/`;
  return `https://${hostname}${path}`;
}

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
  };
}

async function wordpressRead(request, env, site, kind) {
  if (request.method !== "GET" && request.method !== "HEAD") return fail(405, "method_not_allowed", "This compatibility endpoint is read-only.");
  const url = new URL(request.url);
  if (url.searchParams.get("context") && url.searchParams.get("context") !== "view" && url.searchParams.get("context") !== "embed") {
    return fail(401, "context_not_available", "Authenticated WordPress edit contexts are not available through the public API.");
  }
  const page = parseBoundedInt(url.searchParams.get("page"), 1, 1, 100000);
  const perPage = parseBoundedInt(url.searchParams.get("per_page"), 10, 1, 100);
  if (page === null || perPage === null) return fail(400, "invalid_pagination", "Use a valid WordPress page and per_page value (1-100).");
  const slug = url.searchParams.get("slug");
  if (slug !== null && (!textValue(slug, 200) || !ENTRY_SLUG.test(slug))) return fail(400, "invalid_slug", "The slug filter is invalid.");
  if (!site.current_revision_id || site.status !== "active") return json([], 200, { "X-WP-Total": "0", "X-WP-TotalPages": "0" });
  const where = "site_id = ? AND revision_id = ? AND kind = ? AND publication_status = 'published'" + (slug === null ? "" : " AND slug = ?");
  const params = slug === null
    ? [site.id, site.current_revision_id, kind]
    : [site.id, site.current_revision_id, kind, slug];
  const count = await env.DB.prepare(`SELECT COUNT(*) AS total FROM entries WHERE ${where}`).bind(...params).first();
  const total = Number(count?.total ?? 0);
  const offset = (page - 1) * perPage;
  const rows = await env.DB.prepare(
    `SELECT api_id, source_id, source_date, source_date_gmt, source_modified, source_modified_gmt, featured_media_id, slug, title, safe_html, categories_json, tags_json, kind FROM entries WHERE ${where} ORDER BY COALESCE(source_date, '') DESC, api_id ASC LIMIT ? OFFSET ?`,
  ).bind(...params, perPage, offset).all();
  const totalPages = total === 0 ? 0 : Math.ceil(total / perPage);
  const headers = { "X-WP-Total": String(total), "X-WP-TotalPages": String(totalPages) };
  if (totalPages > 0) {
    const origin = `https://${site.hostname}${url.pathname}`;
    const links = [];
    if (page > 1) links.push(`<${origin}?page=${page - 1}&per_page=${perPage}>; rel="prev"`);
    if (page < totalPages) links.push(`<${origin}?page=${page + 1}&per_page=${perPage}>; rel="next"`);
    if (links.length) headers.Link = links.join(", ");
  }
  const payload = (rows.results ?? []).map((row) => wpRecord(site, row));
  if (request.method === "HEAD") return response(null, 200, { "Content-Type": "application/json; charset=utf-8", ...headers });
  return json(payload, 200, headers);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[character]);
}

function htmlDocument(hostname, entry, privatePreview = false, headOnly = false) {
  const canonical = canonicalUrl(hostname, entry.slug, entry.kind);
  const robots = privatePreview ? "noindex, nofollow, noarchive" : "index, follow";
  const language = normalizedLanguageTag(entry.language_code) ?? "und";
  const body = `<!doctype html><html lang="${escapeHtml(language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="${robots}"><title>${escapeHtml(entry.title)}</title><link rel="canonical" href="${escapeHtml(canonical)}"></head><body><main><article><h1>${escapeHtml(entry.title)}</h1><div>${entry.safe_html}</div></article></main></body></html>`;
  const headers = { "Content-Type": "text/html; charset=utf-8" };
  if (privatePreview) headers["X-Robots-Tag"] = "noindex, nofollow, noarchive";
  return response(headOnly ? null : body, 200, headers);
}

async function publicPage(request, env, site, pathname) {
  if (request.method !== "GET" && request.method !== "HEAD") return fail(405, "method_not_allowed", "This site is read-only for public visitors.");
  if (!site.current_revision_id || site.status !== "active") return fail(404, "site_not_published", "This site has no published revision.");
  if (pathname === "/") {
    const home = await env.DB.prepare(
      "SELECT kind, slug, title, safe_html, language_code, source_date FROM entries WHERE site_id = ? AND revision_id = ? AND kind = 'page' AND slug = 'home' AND publication_status = 'published' LIMIT 1",
    ).bind(site.id, site.current_revision_id).first();
    if (home) return htmlDocument(site.hostname, home, false, request.method === "HEAD");
    const firstPost = await env.DB.prepare(
      "SELECT kind, slug, title, safe_html, language_code, source_date, api_id FROM entries WHERE site_id = ? AND revision_id = ? AND publication_status = 'published' ORDER BY CASE kind WHEN 'page' THEN 0 ELSE 1 END, COALESCE(source_date, '') DESC, api_id ASC LIMIT 1",
    ).bind(site.id, site.current_revision_id).first();
    return firstPost ? htmlDocument(site.hostname, firstPost, false, request.method === "HEAD") : fail(404, "site_empty", "No published content is available.");
  }
  const rawSlug = pathname.replace(/^\/+|\/+$/g, "");
  const slug = parsePathSegment(rawSlug);
  if (!slug || !ENTRY_SLUG.test(slug)) return fail(404, "entry_not_found", "Entry not found.");
  const entry = await env.DB.prepare(
    "SELECT kind, slug, title, safe_html, language_code, source_date FROM entries WHERE site_id = ? AND revision_id = ? AND slug = ? AND publication_status = 'published' ORDER BY CASE kind WHEN 'page' THEN 0 ELSE 1 END LIMIT 1",
  ).bind(site.id, site.current_revision_id, slug).first();
  return entry ? htmlDocument(site.hostname, entry, false, request.method === "HEAD") : fail(404, "entry_not_found", "Entry not found.");
}

async function handleRequest(request, env) {
  const site = await resolveSite(request, env);
  if (!site) return fail(404, "site_not_found", "Site not found.");
  if (site.status !== "active") return fail(404, "site_not_found", "Site not found.");
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

  const wpMatch = /^\/wp-json\/wp\/v2\/(posts|pages)\/?$/.exec(url.pathname);
  if (wpMatch) return await wordpressRead(request, env, site, wpMatch[1] === "pages" ? "page" : "post");
  if (url.pathname.startsWith("/wp-json/")) return fail(404, "rest_route_not_supported", "This WordPress-compatible route is not implemented.");

  return await publicPage(request, env, site, url.pathname);
}

export default {
  async fetch(request, env) {
    const requestId = crypto.randomUUID();
    try {
      return await handleRequest(request, env);
    } catch (error) {
      if (error?.status && error?.code) return fail(error.status, error.code, "The request could not be processed.");
      console.error(JSON.stringify({ event: "sites_request_failed", request_id: requestId }));
      return fail(500, "internal_error", "The request could not be completed.");
    }
  },
  async scheduled(controller, env) {
    await monitorActiveCustomHostnames(env);
  },
};
