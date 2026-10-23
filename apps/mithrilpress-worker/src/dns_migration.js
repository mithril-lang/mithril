import {
  MAX_ZONE_FILE_BYTES,
  compareDnsZoneFiles,
  missingDnsZoneRecords,
  normalizeDnsZoneName,
  parseDnsZoneFile,
  renderDnsZoneFile,
} from "./dns_zonefile.js";

const MAX_ACTIVE_MIGRATIONS_PER_SITE = 3;
const MAX_TARGET_NAMESERVERS = 4;
const DNS_SNAPSHOT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const DNS_SNAPSHOT_CLEANUP_BATCH_SIZE = 20;
const CLOUDFLARE_API_ROOT = "https://api.cloudflare.com/client/v4";
const CLOUDFLARE_TOKEN_HEADER = "X-MithrilPress-Cloudflare-Token";
const MAX_CLOUDFLARE_API_TOKEN_CHARS = 512;
const MAX_CLOUDFLARE_JSON_BYTES = 65_536;
const DNS_RESOLVERS = [
  { name: "Cloudflare", endpoint: "https://cloudflare-dns.com/dns-query" },
  { name: "Google", endpoint: "https://dns.google/resolve" },
];
const ACTIVE_STATES = ["ownership_pending", "source_pending", "source_loaded", "target_loaded", "owner_approved", "delegation_verified"];

function errorResponse(api, error, fallbackCode = "dns_migration_failed") {
  const status = error?.status ?? 422;
  const code = error?.code ?? fallbackCode;
  const message = error?.message || "The DNS migration request could not be processed.";
  return api.fail(status, code, message);
}

function randomHex(byteLength) {
  return [...crypto.getRandomValues(new Uint8Array(byteLength))]
    .map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((value) => value.toString(16).padStart(2, "0")).join("");
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function snapshotRetentionDeadline(row) {
  if (row.snapshots_erased_at) return null;
  if (row.status === "ownership_pending") return row.ownership_expires_at ?? null;
  // Preserve the rollback snapshot while a registrar cutover is awaiting an
  // owner's verification or rollback decision.
  if (row.status === "owner_approved") return null;
  const updatedAt = Date.parse(row.updated_at);
  return Number.isFinite(updatedAt)
    ? new Date(updatedAt + DNS_SNAPSHOT_RETENTION_MS).toISOString()
    : null;
}

function zoneNotAllowed(zoneName) {
  return zoneName === "mithril.love" || zoneName.endsWith(".mithril.love");
}

function normalizeNameservers(value) {
  if (!Array.isArray(value) || value.length < 2 || value.length > MAX_TARGET_NAMESERVERS) return null;
  const normalized = value.map((item) => normalizeDnsZoneName(item));
  if (normalized.some((item) => !item) || new Set(normalized).size !== normalized.length) return null;
  return normalized.sort();
}

function migrationSummary(row, includeDetails = false) {
  const result = {
    id: row.id,
    zone_name: row.zone_name,
    status: row.status,
    ownership_record: row.ownership_txt_value ? {
      type: "TXT", name: row.ownership_txt_name, value: row.ownership_txt_value,
    } : null,
    ownership_expires_at: row.ownership_txt_value ? row.ownership_expires_at : null,
    source_record_count: row.source_record_count,
    source_zone_sha256: row.source_zone_sha256,
    source_apex_soa_present: row.source_apex_soa_present === null ? null : Boolean(row.source_apex_soa_present),
    source_apex_ns_count: row.source_apex_ns_count,
    target_record_count: row.target_record_count,
    target_zone_sha256: row.target_zone_sha256,
    target_nameservers: parseJson(row.target_nameservers_json, []),
    target_provider: row.target_provider ?? null,
    target_provider_zone_id: row.target_provider_zone_id ?? null,
    source_nameservers: parseJson(row.source_nameservers_json, []),
    source_ds_records: parseJson(row.source_ds_json, []),
    source_dns_state_captured_at: row.source_dns_state_captured_at,
    diff: parseJson(row.diff_json, null),
    approval_digest: row.approval_digest,
    delegation_check: parseJson(row.delegation_check_json, null),
    rollback_check: parseJson(row.rollback_check_json, null),
    created_at: row.created_at,
    updated_at: row.updated_at,
    ownership_verified_at: row.ownership_verified_at,
    owner_approved_at: row.owner_approved_at,
    delegation_verified_at: row.delegation_verified_at,
    snapshot_retention_expires_at: snapshotRetentionDeadline(row),
    snapshots_erased_at: row.snapshots_erased_at ?? null,
  };
  if (includeDetails) {
    result.import_zone_text = row.import_zone_text;
    result.source_zone_available = Boolean(row.source_zone_text);
    result.target_zone_available = Boolean(row.target_zone_text);
  }
  return result;
}

async function authorize(request, env, site, api) {
  const owner = await api.ownerToken(request, env, site, "site:dns-migrate");
  if (owner) return { owner };
  const signedInOwner = await api.ownerToken(request, env, site, "content:write")
    ?? await api.ownerToken(request, env, site, "site:domains");
  return signedInOwner
    ? { error: api.fail(403, "dns_migration_scope_required", "This owner token does not have site:dns-migrate scope.") }
    : { error: api.fail(401, "dns_migration_owner_required", "Sign in with an owner token that has site:dns-migrate scope.") };
}

async function audit(env, site, migration, owner, action, metadata = {}) {
  await env.DB.prepare(
    "INSERT INTO dns_migration_actions (id, site_id, migration_id, token_id, action, created_at, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).bind(crypto.randomUUID(), site.id, migration.id, owner.tokenId, action, new Date().toISOString(), JSON.stringify(metadata)).run();
}

async function expirePendingMigrations(env, siteId, zoneName, nowIso) {
  const rows = await env.DB.prepare(
    "SELECT * FROM dns_migrations WHERE status = 'ownership_pending' AND ownership_expires_at <= ? AND snapshots_erased_at IS NULL AND (site_id = ? OR zone_name = ?) ORDER BY ownership_expires_at ASC",
  ).bind(nowIso, siteId, zoneName).all();
  for (const migration of rows.results ?? []) {
    const metadata = JSON.stringify({
      zone_name: migration.zone_name,
      previous_status: migration.status,
      reason: "ownership_challenge_expired",
      expired_at: migration.ownership_expires_at,
      source_zone_sha256: migration.source_zone_sha256,
      target_zone_sha256: migration.target_zone_sha256,
    });
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE dns_migrations SET status = 'cancelled', ownership_txt_name = NULL, ownership_txt_value = NULL, source_nameservers_json = '[]', source_ds_json = '[]', source_dns_state_captured_at = NULL, source_zone_text = NULL, target_zone_text = NULL, diff_json = NULL, import_zone_text = NULL, target_nameservers_json = NULL, target_provider = NULL, target_provider_zone_id = NULL, approval_digest = NULL, snapshots_erased_at = ?, updated_at = ? WHERE site_id = ? AND id = ? AND status = 'ownership_pending' AND ownership_expires_at <= ? AND updated_at = ? AND snapshots_erased_at IS NULL",
      ).bind(nowIso, nowIso, migration.site_id, migration.id, nowIso, migration.updated_at),
      env.DB.prepare(
        "INSERT INTO dns_migration_actions (id, site_id, migration_id, token_id, action, created_at, metadata_json) SELECT ?, site_id, id, owner_token_id, 'snapshots-erased', ?, ? FROM dns_migrations WHERE site_id = ? AND id = ? AND status = 'cancelled' AND updated_at = ? AND snapshots_erased_at = ? AND NOT EXISTS (SELECT 1 FROM dns_migration_actions WHERE site_id = ? AND migration_id = ? AND action = 'snapshots-erased' AND created_at = ? AND metadata_json = ?)",
      ).bind(crypto.randomUUID(), nowIso, metadata, migration.site_id, migration.id, nowIso, nowIso, migration.site_id, migration.id, nowIso, metadata),
    ]);
  }
}

function retentionCleanupStatements(env, migration, nowIso, reason, retentionCutoff) {
  const nextStatus = ["delegation_verified", "rolled_back", "archived"].includes(migration.status)
    ? "archived"
    : "cancelled";
  const expiresAt = migration.status === "ownership_pending"
    ? migration.ownership_expires_at
    : new Date(Date.parse(migration.updated_at) + DNS_SNAPSHOT_RETENTION_MS).toISOString();
  const metadata = JSON.stringify({
    reason,
    previous_status: migration.status,
    expires_at: expiresAt,
    source_zone_sha256: migration.source_zone_sha256,
    target_zone_sha256: migration.target_zone_sha256,
  });
  return [
    env.DB.prepare(
      "UPDATE dns_migrations SET status = ?, ownership_txt_name = NULL, ownership_txt_value = NULL, source_nameservers_json = '[]', source_ds_json = '[]', source_dns_state_captured_at = NULL, source_zone_text = NULL, source_record_count = NULL, source_apex_soa_present = NULL, source_apex_ns_count = NULL, target_zone_text = NULL, target_record_count = NULL, target_nameservers_json = NULL, diff_json = NULL, import_zone_text = NULL, target_provider = NULL, target_provider_zone_id = NULL, approval_digest = NULL, delegation_check_json = NULL, rollback_check_json = NULL, snapshots_erased_at = ?, updated_at = ? WHERE site_id = ? AND id = ? AND status = ? AND updated_at = ? AND snapshots_erased_at IS NULL AND ((status = 'ownership_pending' AND ownership_expires_at <= ?) OR (status <> 'ownership_pending' AND updated_at <= ?))",
    ).bind(nextStatus, nowIso, nowIso, migration.site_id, migration.id, migration.status, migration.updated_at, nowIso, retentionCutoff),
    env.DB.prepare(
      "INSERT INTO dns_migration_actions (id, site_id, migration_id, token_id, action, created_at, metadata_json) SELECT ?, site_id, id, owner_token_id, 'snapshots-erased', ?, ? FROM dns_migrations WHERE site_id = ? AND id = ? AND status = ? AND updated_at = ? AND snapshots_erased_at = ? AND NOT EXISTS (SELECT 1 FROM dns_migration_actions WHERE site_id = ? AND migration_id = ? AND action = 'snapshots-erased' AND created_at = ? AND metadata_json = ?)",
    ).bind(crypto.randomUUID(), nowIso, metadata, migration.site_id, migration.id, nextStatus, nowIso, nowIso, migration.site_id, migration.id, nowIso, metadata),
  ];
}

export async function cleanupDnsMigrationSnapshots(env, now = new Date()) {
  const nowIso = now.toISOString();
  const retentionCutoff = new Date(now.getTime() - DNS_SNAPSHOT_RETENTION_MS).toISOString();
  const challengeLimit = Math.floor(DNS_SNAPSHOT_CLEANUP_BATCH_SIZE / 2);
  const expiredChallenges = await env.DB.prepare(
    "SELECT * FROM dns_migrations WHERE status = 'ownership_pending' AND ownership_expires_at <= ? AND snapshots_erased_at IS NULL ORDER BY ownership_expires_at ASC, id ASC LIMIT ?",
  ).bind(nowIso, challengeLimit).all();
  const staleLimit = DNS_SNAPSHOT_CLEANUP_BATCH_SIZE - (expiredChallenges.results ?? []).length;
  const stalePlans = staleLimit > 0 ? await env.DB.prepare(
    "SELECT * FROM dns_migrations WHERE status <> 'ownership_pending' AND status <> 'owner_approved' AND snapshots_erased_at IS NULL AND updated_at <= ? AND (status IN ('source_pending', 'source_loaded', 'target_loaded', 'delegation_verified', 'rolled_back') OR (status IN ('cancelled', 'archived') AND (ownership_txt_name IS NOT NULL OR ownership_txt_value IS NOT NULL OR source_nameservers_json <> '[]' OR source_ds_json <> '[]' OR source_dns_state_captured_at IS NOT NULL OR source_zone_text IS NOT NULL OR target_zone_text IS NOT NULL OR diff_json IS NOT NULL OR import_zone_text IS NOT NULL OR target_nameservers_json IS NOT NULL OR target_provider IS NOT NULL OR target_provider_zone_id IS NOT NULL OR approval_digest IS NOT NULL OR delegation_check_json IS NOT NULL OR rollback_check_json IS NOT NULL))) AND NOT EXISTS (SELECT 1 FROM dns_migration_actions a WHERE a.site_id = dns_migrations.site_id AND a.migration_id = dns_migrations.id AND a.action = 'cloudflare-import-started' AND a.created_at >= ?) ORDER BY updated_at ASC, id ASC LIMIT ?",
  ).bind(retentionCutoff, new Date(now.getTime() - 60_000).toISOString(), staleLimit).all() : { results: [] };
  const plans = [
    ...(expiredChallenges.results ?? []).map((migration) => ({ migration, reason: "ownership_challenge_expired" })),
    ...(stalePlans.results ?? []).map((migration) => ({ migration, reason: "inactive_snapshot_retention_expired" })),
  ];
  if (!plans.length) return 0;
  const statements = plans.flatMap(({ migration, reason }) => retentionCleanupStatements(env, migration, nowIso, reason, retentionCutoff));
  await env.DB.batch(statements);
  return plans.length;
}

async function getMigration(env, site, migrationId) {
  return await env.DB.prepare(
    "SELECT * FROM dns_migrations WHERE site_id = ? AND id = ? LIMIT 1",
  ).bind(site.id, migrationId).first();
}

async function createMigration(request, env, site, owner, api) {
  if (request.method !== "POST") return api.fail(405, "method_not_allowed", "Use GET or POST for DNS migration planning.");
  if (!api.sameOriginStudioMutation(request, site)) return api.fail(403, "same_origin_required", "DNS migration changes must come from this site.");
  const body = await api.readBoundedJson(request);
  const zoneName = normalizeDnsZoneName(body?.zone_name);
  if (!zoneName || zoneNotAllowed(zoneName)) return api.fail(422, "invalid_zone_name", "Enter a public DNS zone name that you control.");
  const now = new Date();
  const nowIso = now.toISOString();
  await expirePendingMigrations(env, site.id, zoneName, nowIso);
  const createCutoff = new Date(Date.now() - 60 * 60_000).toISOString();
  const recentCreations = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM dns_migration_actions WHERE site_id = ? AND token_id = ? AND action = 'created' AND created_at >= ?",
  ).bind(site.id, owner.tokenId, createCutoff).first();
  if (Number(recentCreations?.total ?? 0) >= 3) return api.fail(429, "dns_migration_create_limit", "This owner token has reached the three DNS migration plans per hour limit.");
  const count = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM dns_migrations WHERE site_id = ? AND status IN (${ACTIVE_STATES.map(() => "?").join(",")})`,
  ).bind(site.id, ...ACTIVE_STATES).first();
  if (Number(count?.total ?? 0) >= MAX_ACTIVE_MIGRATIONS_PER_SITE) {
    return api.fail(429, "dns_migration_limit", "This site already has three active DNS migration plans. Cancel or archive one before starting another.");
  }

  const id = crypto.randomUUID();
  const challenge = `mithrilpress-migration=${randomHex(24)}`;
  const challengeName = `_mithrilpress-migration.${zoneName}`;
  if (challengeName.length > 253) return api.fail(422, "invalid_zone_name", "This zone name is too long for the ownership TXT record.");
  const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
  try {
    await env.DB.prepare(
      "INSERT INTO dns_migrations (id, site_id, zone_name, status, owner_token_id, ownership_txt_name, ownership_txt_value, ownership_expires_at, source_nameservers_json, source_ds_json, created_at, updated_at) VALUES (?, ?, ?, 'ownership_pending', ?, ?, ?, ?, '[]', '[]', ?, ?)",
    ).bind(id, site.id, zoneName, owner.tokenId, challengeName, challenge, expiresAt, nowIso, nowIso).run();
  } catch (error) {
    const message = String(error?.message ?? error);
    if (/unique constraint failed|dns_migration_active_limit/i.test(message)) {
      return api.fail(409, "dns_zone_migration_exists", "An active migration plan already exists for this DNS zone, or this site already has three active migration plans.");
    }
    return api.fail(503, "dns_migration_unavailable", "The migration plan could not be stored. No provider or registrar changes were made.");
  }
  const migration = await getMigration(env, site, id);
  await audit(env, site, migration, owner, "created", { zone_name: zoneName });
  return api.json({ migration: migrationSummary(migration), message: "Publish the ownership TXT record, then verify it. Current nameserver and DS state is captured only after domain control is proven." }, 201);
}

async function verifyOwnership(request, env, site, migration, owner, api) {
  if (request.method !== "POST" || !api.sameOriginStudioMutation(request, site)) {
    return api.fail(403, "same_origin_required", "Ownership verification requires a same-origin Studio request.");
  }
  if (migration.status !== "ownership_pending" || !migration.ownership_txt_value
      || !migration.ownership_expires_at || Date.parse(migration.ownership_expires_at) <= Date.now()) {
    return api.fail(409, "ownership_challenge_expired", "The DNS ownership challenge is expired or no longer active. Create a new migration plan.");
  }
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM dns_migration_actions WHERE site_id = ? AND token_id = ? AND action = 'ownership-check' AND created_at >= ?",
  ).bind(site.id, owner.tokenId, new Date(Date.now() - 60_000).toISOString()).first();
  if (Number(recent?.total ?? 0) >= 10) return api.fail(429, "dns_check_limit", "This owner token has reached the ten DNS checks per minute limit.");
  await audit(env, site, migration, owner, "ownership-check", { zone_name: migration.zone_name });

  let verified;
  try {
    verified = await dnsTxtContains(migration.ownership_txt_name, migration.ownership_txt_value);
  } catch {
    return api.fail(503, "dns_resolver_unavailable", "The public DNS resolver could not confirm the TXT record. Retry later.");
  }
  if (!verified) return api.fail(409, "dns_ownership_not_verified", "The ownership TXT record is not visible yet. Confirm the name and value, then retry.");
  let sourceDnsState;
  try {
    sourceDnsState = await readDnsState(migration.zone_name);
  } catch {
    return api.fail(503, "source_dns_unavailable", "Two public DNS resolvers could not agree on current nameserver and DNSSEC state. The ownership proof is visible; retry the check later.");
  }
  const now = new Date().toISOString();
  let result;
  try {
    result = await env.DB.prepare(
      "UPDATE dns_migrations SET status = 'source_pending', ownership_txt_value = NULL, ownership_verified_at = ?, source_nameservers_json = ?, source_ds_json = ?, source_dns_state_captured_at = ?, updated_at = ? WHERE site_id = ? AND id = ? AND status = 'ownership_pending' AND ownership_txt_value = ?",
    ).bind(now, JSON.stringify(sourceDnsState.nameservers), JSON.stringify(sourceDnsState.ds_records), now,
      now, site.id, migration.id, migration.ownership_txt_value).run();
  } catch (error) {
    if (/unique constraint failed/i.test(String(error?.message ?? error))) {
      return api.fail(409, "dns_zone_migration_exists", "Another verified migration plan already owns this zone.");
    }
    throw error;
  }
  if (result.meta?.changes !== 1) return api.fail(409, "dns_migration_state_changed", "The migration state changed. Reload the migration list and retry.");
  const latest = await getMigration(env, site, migration.id);
  await audit(env, site, latest, owner, "ownership-verified", {
    zone_name: migration.zone_name,
    source_nameservers: sourceDnsState.nameservers,
    source_ds_record_count: sourceDnsState.ds_records.length,
  });
  return api.json({ migration: migrationSummary(latest), message: "Domain ownership is verified and the current NS/DS state is captured for rollback. Upload a complete source zone export." });
}

function parseZoneFile(value, zoneName, api) {
  if (typeof value !== "string" || !value.trim()) throw Object.assign(new Error("Upload a non-empty BIND zone file."), { code: "zone_file_required" });
  try {
    return parseDnsZoneFile(value, zoneName);
  } catch (error) {
    throw Object.assign(error, { status: 422 });
  }
}

function cloudflareToken(request) {
  const token = request.headers.get(CLOUDFLARE_TOKEN_HEADER);
  if (typeof token !== "string" || token.length < 20 || token.length > MAX_CLOUDFLARE_API_TOKEN_CHARS
      || /[\u0000-\u0020\u007f]/.test(token)) return null;
  return token;
}

async function boundedResponseText(response, maxBytes) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw Object.assign(new Error("The provider response exceeds the DNS migration size limit."), { code: "provider_response_too_large" });
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch { /* The response is already over budget. */ }
      throw Object.assign(new Error("The provider response exceeds the DNS migration size limit."), { code: "provider_response_too_large" });
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

async function cloudflareJson(path, token) {
  let response;
  try {
    response = await fetch(`${CLOUDFLARE_API_ROOT}/${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw Object.assign(new Error("Cloudflare could not be reached. The DNS plan was not changed."), { status: 503, code: "cloudflare_unavailable" });
  }
  let text;
  try {
    text = await boundedResponseText(response, MAX_CLOUDFLARE_JSON_BYTES);
  } catch {
    throw Object.assign(new Error("Cloudflare returned an unreadable response. The DNS plan was not changed."), { status: 502, code: "cloudflare_invalid_response" });
  }
  let payload;
  try { payload = JSON.parse(text); } catch {
    throw Object.assign(new Error("Cloudflare returned an unreadable response. The DNS plan was not changed."), { status: 502, code: "cloudflare_invalid_response" });
  }
  if (!response.ok || payload?.success !== true || !payload.result) {
    throw Object.assign(new Error("Cloudflare rejected this zone request. Check that the token is valid and scoped to this zone."), { status: 502, code: "cloudflare_request_rejected" });
  }
  return payload.result;
}

async function cloudflareImport(token, zoneId, zoneText) {
  let response;
  try {
    const form = new FormData();
    form.set("file", new Blob([zoneText], { type: "text/plain" }), "mithrilpress-zone.txt");
    response = await fetch(`${CLOUDFLARE_API_ROOT}/zones/${zoneId}/dns_records/import`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      body: form,
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { received: false, success: false, result: null };
  }
  let payload;
  try {
    payload = JSON.parse(await boundedResponseText(response, MAX_CLOUDFLARE_JSON_BYTES));
  } catch {
    return { received: true, success: false, result: null };
  }
  return {
    received: true,
    success: response.ok && payload?.success === true,
    result: payload?.result && typeof payload.result === "object" ? payload.result : null,
  };
}

async function cloudflareZoneSnapshot(token, zoneId, expectedZoneName) {
  if (!/^[a-f0-9]{32}$/.test(zoneId)) {
    throw Object.assign(new Error("Enter the 32-character Cloudflare zone ID."), { status: 422, code: "invalid_cloudflare_zone_id" });
  }
  const zone = await cloudflareJson(`zones/${zoneId}`, token);
  const actualZoneName = normalizeDnsZoneName(zone?.name);
  if (zone?.id !== zoneId || actualZoneName !== expectedZoneName) {
    throw Object.assign(new Error("The Cloudflare zone does not match the verified migration domain."), { status: 403, code: "cloudflare_zone_mismatch" });
  }
  if (zone?.type !== "full" || !["active", "pending"].includes(zone?.status)) {
    throw Object.assign(new Error("Use an active or pending full Cloudflare DNS zone for this migration."), { status: 409, code: "cloudflare_zone_not_ready" });
  }
  const nameservers = normalizeNameservers(zone?.name_servers);
  if (!nameservers) {
    throw Object.assign(new Error("Cloudflare did not return a complete nameserver set for this zone."), { status: 502, code: "cloudflare_nameservers_unavailable" });
  }
  let response;
  try {
    response = await fetch(`${CLOUDFLARE_API_ROOT}/zones/${zoneId}/dns_records/export`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "text/plain" },
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw Object.assign(new Error("Cloudflare could not export this zone. The DNS plan was not changed."), { status: 503, code: "cloudflare_export_unavailable" });
  }
  let zoneText;
  try {
    zoneText = await boundedResponseText(response, MAX_ZONE_FILE_BYTES);
  } catch {
    throw Object.assign(new Error("The Cloudflare zone export exceeds the 256 KiB migration limit."), { status: 413, code: "cloudflare_export_too_large" });
  }
  if (!response.ok) {
    throw Object.assign(new Error("Cloudflare refused to export this zone. Check the DNS Read permission on the scoped token."), { status: 502, code: "cloudflare_export_rejected" });
  }
  return { zone, nameservers, zoneText };
}

async function claimCloudflareImport(env, site, migration, owner, zoneId) {
  const now = new Date().toISOString();
  const rateLimitSince = new Date(Date.now() - 60_000).toISOString();
  const id = crypto.randomUUID();
  const results = await env.DB.batch([
    env.DB.prepare(
      "UPDATE dns_migrations SET updated_at = ? WHERE site_id = ? AND id = ? AND status = 'target_loaded' AND updated_at = ? AND target_zone_sha256 = ? AND target_provider_zone_id = ? AND snapshots_erased_at IS NULL AND (SELECT COUNT(*) FROM dns_migration_actions WHERE site_id = ? AND token_id = ? AND action = 'cloudflare-import-started' AND created_at >= ?) < 1",
    ).bind(now, site.id, migration.id, migration.updated_at, migration.target_zone_sha256, zoneId,
      site.id, owner.tokenId, rateLimitSince),
    env.DB.prepare(
      "INSERT INTO dns_migration_actions (id, site_id, migration_id, token_id, action, created_at, metadata_json) SELECT ?, ?, ?, ?, 'cloudflare-import-started', ?, ? WHERE EXISTS (SELECT 1 FROM dns_migrations WHERE site_id = ? AND id = ? AND status = 'target_loaded' AND updated_at = ? AND target_zone_sha256 = ? AND target_provider_zone_id = ? AND snapshots_erased_at IS NULL) AND (SELECT COUNT(*) FROM dns_migration_actions WHERE site_id = ? AND token_id = ? AND action = 'cloudflare-import-started' AND created_at >= ?) < 1",
    ).bind(id, site.id, migration.id, owner.tokenId, now, JSON.stringify({ zone_id: zoneId }),
      site.id, migration.id, now, migration.target_zone_sha256, zoneId,
      site.id, owner.tokenId, rateLimitSince),
  ]);
  return results[1]?.meta?.changes === 1;
}

async function cloudflareReadCount(env, site, owner) {
  const cutoff = new Date(Date.now() - 60_000).toISOString();
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM dns_migration_actions WHERE site_id = ? AND token_id = ? AND action = 'cloudflare-zone-read' AND created_at >= ?",
  ).bind(site.id, owner.tokenId, cutoff).first();
  return Number(recent?.total ?? 0);
}

async function stageCloudflareTarget(env, site, migration, zoneId, snapshot) {
  const source = parseZoneFile(migration.source_zone_text, migration.zone_name);
  const target = parseZoneFile(snapshot.zoneText, migration.zone_name);
  const diff = compareDnsZoneFiles(source.records, target.records, migration.zone_name);
  const targetHash = await sha256Hex(snapshot.zoneText);
  const approvalDigest = await sha256Hex(JSON.stringify([
    migration.zone_name,
    migration.source_zone_sha256,
    targetHash,
    snapshot.nameservers,
    diff,
  ]));
  const now = new Date().toISOString();
  const importText = renderDnsZoneFile(source.records, migration.zone_name);
  const update = await env.DB.prepare(
    "UPDATE dns_migrations SET status = 'target_loaded', target_zone_text = ?, target_zone_sha256 = ?, target_record_count = ?, target_nameservers_json = ?, target_provider = 'cloudflare', target_provider_zone_id = ?, diff_json = ?, import_zone_text = ?, approval_digest = ?, owner_approved_at = NULL, delegation_check_json = NULL, delegation_verified_at = NULL, updated_at = ? WHERE site_id = ? AND id = ? AND status IN ('source_loaded', 'target_loaded') AND source_zone_sha256 = ?",
  ).bind(snapshot.zoneText, targetHash, target.records.length, JSON.stringify(snapshot.nameservers), zoneId,
    JSON.stringify(diff), importText, approvalDigest, now, site.id, migration.id, migration.source_zone_sha256).run();
  if (update.meta?.changes !== 1) throw apiError(409, "dns_migration_state_changed", "The migration state changed. Reload the plan and retry.");
  return { migration: await getMigration(env, site, migration.id), diff, targetHash, recordCount: target.records.length };
}

function apiError(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

async function recordCloudflareRead(env, site, migration, owner, zoneId, purpose) {
  if (await cloudflareReadCount(env, site, owner) >= 6) {
    return apiError(429, "cloudflare_read_limit", "This owner token has reached the six Cloudflare zone reads per minute limit.");
  }
  await audit(env, site, migration, owner, "cloudflare-zone-read", { zone_id: zoneId, purpose });
  return null;
}

async function uploadSource(request, env, site, migration, owner, api) {
  if (request.method !== "POST" || !api.sameOriginStudioMutation(request, site)) {
    return api.fail(403, "same_origin_required", "Source zone uploads require a same-origin Studio request.");
  }
  if (!migration.ownership_verified_at || !["source_pending", "source_loaded"].includes(migration.status)) {
    return api.fail(409, "source_upload_not_allowed", "Verify zone ownership first. Source records cannot be replaced after target staging begins.");
  }
  const body = await api.readBoundedJson(request);
  let parsed;
  try {
    parsed = parseZoneFile(body?.zone_file, migration.zone_name, api);
  } catch (error) {
    return errorResponse(api, error, "invalid_source_zone");
  }
  const sourceHash = await sha256Hex(body.zone_file);
  const now = new Date().toISOString();
  const importText = renderDnsZoneFile(parsed.records, migration.zone_name);
  if (new TextEncoder().encode(importText).byteLength > MAX_ZONE_FILE_BYTES) {
    return api.fail(413, "destination_import_too_large", "The generated destination import exceeds the 256 KiB zone-file limit after adding safe proxy defaults. Reduce the source zone or stage manually reviewed batches outside MithrilPress.");
  }
  const update = await env.DB.prepare(
    "UPDATE dns_migrations SET status = 'source_loaded', source_zone_text = ?, source_zone_sha256 = ?, source_record_count = ?, source_apex_soa_present = ?, source_apex_ns_count = ?, target_zone_text = NULL, target_zone_sha256 = NULL, target_record_count = NULL, target_nameservers_json = NULL, diff_json = NULL, import_zone_text = ?, approval_digest = NULL, owner_approved_at = NULL, delegation_check_json = NULL, delegation_verified_at = NULL, rollback_check_json = NULL, updated_at = ? WHERE site_id = ? AND id = ? AND status IN ('source_pending', 'source_loaded') AND ownership_verified_at IS NOT NULL",
  ).bind(body.zone_file, sourceHash, parsed.records.length, parsed.apex_soa_present ? 1 : 0,
    parsed.apex_ns_count, importText, now, site.id, migration.id).run();
  if (update.meta?.changes !== 1) return api.fail(409, "dns_migration_state_changed", "The migration state changed. Reload the migration and retry.");
  const latest = await getMigration(env, site, migration.id);
  await audit(env, site, latest, owner, "source-uploaded", {
    record_count: parsed.records.length,
    sha256: sourceHash,
    apex_soa_present: parsed.apex_soa_present,
    apex_ns_count: parsed.apex_ns_count,
    bytes: new TextEncoder().encode(body.zone_file).byteLength,
  });
  return api.json({ migration: migrationSummary(latest), message: `Stored ${parsed.records.length} source DNS records in the private migration plan.` });
}

async function uploadTarget(request, env, site, migration, owner, api) {
  if (request.method !== "POST" || !api.sameOriginStudioMutation(request, site)) {
    return api.fail(403, "same_origin_required", "Target zone uploads require a same-origin Studio request.");
  }
  if (!migration.source_zone_text || !["source_loaded", "target_loaded"].includes(migration.status)) {
    return api.fail(409, "target_upload_not_allowed", "Upload and review the source zone before staging a target zone.");
  }
  const body = await api.readBoundedJson(request);
  const nameservers = normalizeNameservers(body?.nameservers);
  if (!nameservers) return api.fail(422, "invalid_target_nameservers", "Enter two to four unique destination nameservers.");
  let source;
  let target;
  try {
    source = parseZoneFile(migration.source_zone_text, migration.zone_name, api);
    target = parseZoneFile(body?.zone_file, migration.zone_name, api);
  } catch (error) {
    return errorResponse(api, error, "invalid_target_zone");
  }
  const diff = compareDnsZoneFiles(source.records, target.records, migration.zone_name);
  const importText = renderDnsZoneFile(source.records, migration.zone_name);
  const targetHash = await sha256Hex(body.zone_file);
  const approvalDigest = await sha256Hex(JSON.stringify([
    migration.zone_name,
    migration.source_zone_sha256,
    targetHash,
    nameservers,
    diff,
  ]));
  const now = new Date().toISOString();
  const update = await env.DB.prepare(
    "UPDATE dns_migrations SET status = 'target_loaded', target_zone_text = ?, target_zone_sha256 = ?, target_record_count = ?, target_nameservers_json = ?, diff_json = ?, import_zone_text = ?, approval_digest = ?, owner_approved_at = NULL, delegation_check_json = NULL, delegation_verified_at = NULL, updated_at = ? WHERE site_id = ? AND id = ? AND status IN ('source_loaded', 'target_loaded') AND source_zone_sha256 = ?",
  ).bind(body.zone_file, targetHash, target.records.length, JSON.stringify(nameservers), JSON.stringify(diff),
    importText, approvalDigest, now, site.id, migration.id, migration.source_zone_sha256).run();
  if (update.meta?.changes !== 1) return api.fail(409, "dns_migration_state_changed", "The source snapshot changed. Reload the migration and retry.");
  const latest = await getMigration(env, site, migration.id);
  await audit(env, site, latest, owner, "target-uploaded", {
    record_count: target.records.length,
    sha256: targetHash,
    expected_nameservers: nameservers,
    exact_diff: diff.exact,
    added_records: diff.added.length,
    removed_records: diff.removed.length,
  });
  return api.json({ migration: migrationSummary(latest, true), message: diff.exact
    ? "The DNS records match after excluding provider-managed apex and generated DNSSEC records. Review Cloudflare proxy settings and DNSSEC before approving."
    : "The staged target differs from the source. Review the record diff and import plan, then stage the destination again before approval." });
}

async function readCloudflareTarget(request, env, site, migration, owner, api) {
  if (request.method !== "POST" || !api.sameOriginStudioMutation(request, site)) {
    return api.fail(403, "same_origin_required", "Cloudflare zone reads require a same-origin Studio request.");
  }
  if (!migration.source_zone_text || !["source_loaded", "target_loaded"].includes(migration.status)) {
    return api.fail(409, "target_upload_not_allowed", "Upload and review the source zone before staging a Cloudflare target.");
  }
  const token = cloudflareToken(request);
  if (!token) return api.fail(422, "cloudflare_token_required", "Paste a valid, short-lived Cloudflare API token in the request field.");
  const body = await api.readBoundedJson(request);
  const zoneId = typeof body?.zone_id === "string" ? body.zone_id.toLowerCase() : "";
  if (!/^[a-f0-9]{32}$/.test(zoneId)) return api.fail(422, "invalid_cloudflare_zone_id", "Enter the 32-character Cloudflare zone ID.");
  const readError = await recordCloudflareRead(env, site, migration, owner, zoneId, "stage-target");
  if (readError) return api.fail(readError.status, readError.code, readError.message);
  try {
    const snapshot = await cloudflareZoneSnapshot(token, zoneId, migration.zone_name);
    const staged = await stageCloudflareTarget(env, site, migration, zoneId, snapshot);
    await audit(env, site, staged.migration, owner, "target-uploaded", {
      provider: "cloudflare",
      zone_id: zoneId,
      record_count: staged.recordCount,
      sha256: staged.targetHash,
      expected_nameservers: snapshot.nameservers,
      exact_diff: staged.diff.exact,
      added_records: staged.diff.added.length,
      removed_records: staged.diff.removed.length,
    });
    return api.json({ migration: migrationSummary(staged.migration, true), cloudflare_dns_imports_enabled: env.CLOUDFLARE_DNS_IMPORTS_ENABLED === "true", message: staged.diff.exact
      ? "The Cloudflare zone export matches the source. Review Cloudflare proxy settings and DNSSEC separately before approval."
      : "The Cloudflare zone is staged. Review all differences; MithrilPress will offer only an additive import when there are no destination-only or changed records." });
  } catch (error) {
    return errorResponse(api, error, "cloudflare_target_failed");
  }
}

async function importCloudflareMissingRecords(request, env, site, migration, owner, api) {
  if (request.method !== "POST" || !api.sameOriginStudioMutation(request, site)) {
    return api.fail(403, "same_origin_required", "Cloudflare DNS imports require a same-origin Studio request.");
  }
  if (migration.status !== "target_loaded" || migration.target_provider !== "cloudflare"
      || !migration.target_provider_zone_id || !migration.source_zone_text || !migration.target_zone_text) {
    return api.fail(409, "cloudflare_import_not_ready", "Read and stage a Cloudflare destination zone before requesting an additive import.");
  }
  if (env.CLOUDFLARE_DNS_IMPORTS_ENABLED !== "true") {
    return api.fail(503, "cloudflare_import_disabled", "Cloudflare DNS imports are disabled for this deployment until the import behavior is qualified against an isolated zone. You can continue with the manual import and comparison workflow.");
  }
  const body = await api.readBoundedJson(request);
  if (body?.confirm !== true || body?.target_zone_sha256 !== migration.target_zone_sha256) {
    return api.fail(409, "cloudflare_import_confirmation_required", "Confirm the displayed missing-record plan for the current Cloudflare snapshot.");
  }
  const stagedDiff = parseJson(migration.diff_json, null);
  if (!stagedDiff || stagedDiff.added?.length || !stagedDiff.removed?.length) {
    return api.fail(409, "cloudflare_additive_import_not_allowed", "Automatic import is available only when source records are missing and the destination has no extra or changed records.");
  }
  const token = cloudflareToken(request);
  if (!token) return api.fail(422, "cloudflare_token_required", "Paste a valid, short-lived Cloudflare API token in the request field.");
  if (await cloudflareReadCount(env, site, owner) > 4) {
    return api.fail(429, "cloudflare_read_limit", "Wait before importing so MithrilPress can safely read the zone both before and after the write.");
  }
  const claimed = await claimCloudflareImport(env, site, migration, owner, migration.target_provider_zone_id);
  if (!claimed) {
    const latest = await getMigration(env, site, migration.id);
    if (!latest || latest.status !== "target_loaded" || latest.snapshots_erased_at
        || latest.updated_at !== migration.updated_at || latest.target_zone_sha256 !== migration.target_zone_sha256) {
      return api.fail(409, "cloudflare_import_state_changed", "The DNS migration changed or expired. Reload it and review the current destination-zone snapshot.");
    }
    return api.fail(429, "cloudflare_import_limit", "This owner token can start one Cloudflare DNS import per minute.");
  }

  const beforeReadError = await recordCloudflareRead(env, site, migration, owner, migration.target_provider_zone_id, "pre-import-check");
  if (beforeReadError) {
    await audit(env, site, migration, owner, "cloudflare-import-failed", { zone_id: migration.target_provider_zone_id, outcome: "not-started" });
    return api.fail(beforeReadError.status, beforeReadError.code, beforeReadError.message);
  }

  let before;
  let source;
  let stagedTarget;
  let beforeTarget;
  try {
    before = await cloudflareZoneSnapshot(token, migration.target_provider_zone_id, migration.zone_name);
    source = parseZoneFile(migration.source_zone_text, migration.zone_name);
    stagedTarget = parseZoneFile(migration.target_zone_text, migration.zone_name);
    beforeTarget = parseZoneFile(before.zoneText, migration.zone_name);
  } catch (error) {
    await audit(env, site, migration, owner, "cloudflare-import-failed", { zone_id: migration.target_provider_zone_id, outcome: "not-started", error_code: error?.code ?? "cloudflare_preflight_failed" });
    return errorResponse(api, error, "cloudflare_import_preflight_failed");
  }

  const stagedNameservers = parseJson(migration.target_nameservers_json, []);
  const nameserversMatch = JSON.stringify(before.nameservers) === JSON.stringify(stagedNameservers);
  const liveMatchesStaged = nameserversMatch
    && compareDnsZoneFiles(stagedTarget.records, beforeTarget.records, migration.zone_name).exact;
  if (!liveMatchesStaged) {
    try {
      const refreshed = await stageCloudflareTarget(env, site, migration, migration.target_provider_zone_id, before);
      await audit(env, site, refreshed.migration, owner, "cloudflare-import-failed", { zone_id: migration.target_provider_zone_id, outcome: "stale-snapshot-refreshed" });
      return api.json({ migration: migrationSummary(refreshed.migration, true), cloudflare_dns_imports_enabled: env.CLOUDFLARE_DNS_IMPORTS_ENABLED === "true", message: "The live Cloudflare zone changed since the staged snapshot. No records were imported; review the refreshed diff." }, 409);
    } catch (error) {
      await audit(env, site, migration, owner, "cloudflare-import-failed", { zone_id: migration.target_provider_zone_id, outcome: "not-started", error_code: error?.code ?? "cloudflare_preflight_failed" });
      return errorResponse(api, error, "cloudflare_import_preflight_failed");
    }
  }

  const beforeDiff = compareDnsZoneFiles(source.records, beforeTarget.records, migration.zone_name);
  if (beforeDiff.added.length || !beforeDiff.removed.length) {
    try {
      const refreshed = await stageCloudflareTarget(env, site, migration, migration.target_provider_zone_id, before);
      await audit(env, site, refreshed.migration, owner, "cloudflare-import-failed", { zone_id: migration.target_provider_zone_id, outcome: "not-started", reason: "destination-not-additive" });
      return api.json({ migration: migrationSummary(refreshed.migration, true), cloudflare_dns_imports_enabled: env.CLOUDFLARE_DNS_IMPORTS_ENABLED === "true", message: beforeDiff.added.length
        ? "The destination now contains extra or changed records. No import was made; review the refreshed diff manually."
        : "The destination already matches the source. No import was needed; the exact snapshot is ready for approval." }, beforeDiff.added.length ? 409 : 200);
    } catch (error) {
      await audit(env, site, migration, owner, "cloudflare-import-failed", { zone_id: migration.target_provider_zone_id, outcome: "not-started", error_code: error?.code ?? "cloudflare_preflight_failed" });
      return errorResponse(api, error, "cloudflare_import_preflight_failed");
    }
  }

  const missing = missingDnsZoneRecords(source.records, beforeTarget.records, migration.zone_name);
  const importText = renderDnsZoneFile(missing, migration.zone_name);
  if (missing.length !== beforeDiff.removed.length || new TextEncoder().encode(importText).byteLength > MAX_ZONE_FILE_BYTES) {
    await audit(env, site, migration, owner, "cloudflare-import-failed", { zone_id: migration.target_provider_zone_id, outcome: "not-started", reason: "import_plan_invalid", missing_count: missing.length });
    return api.fail(409, "cloudflare_import_plan_invalid", "The additive import plan failed its record-count or 256 KiB safety check. No records were sent.");
  }

  const importResult = await cloudflareImport(token, migration.target_provider_zone_id, importText);
  const afterReadError = await recordCloudflareRead(env, site, migration, owner, migration.target_provider_zone_id, "post-import-readback");
  if (afterReadError) {
    await audit(env, site, migration, owner, "cloudflare-import-failed", { zone_id: migration.target_provider_zone_id, outcome: "unknown", api_response_received: importResult.received });
    return api.fail(503, "cloudflare_import_outcome_unknown", "Cloudflare may have received the import, but MithrilPress could not read the zone back. Reconnect and refresh the Cloudflare target before retrying.");
  }

  let after;
  let staged;
  try {
    after = await cloudflareZoneSnapshot(token, migration.target_provider_zone_id, migration.zone_name);
    staged = await stageCloudflareTarget(env, site, migration, migration.target_provider_zone_id, after);
  } catch (error) {
    await audit(env, site, migration, owner, "cloudflare-import-failed", { zone_id: migration.target_provider_zone_id, outcome: "unknown", api_response_received: importResult.received, error_code: error?.code ?? "cloudflare_readback_failed" });
    return api.fail(503, "cloudflare_import_readback_failed", "The import may have changed Cloudflare, but MithrilPress could not validate the zone readback. Refresh the Cloudflare target before retrying.");
  }

  if (JSON.stringify(after.nameservers) !== JSON.stringify(stagedNameservers)) {
    await audit(env, site, staged.migration, owner, "cloudflare-import-failed", {
      zone_id: migration.target_provider_zone_id,
      outcome: "nameservers-changed",
      api_response_received: importResult.received,
      readback_exact: staged.diff.exact,
    });
    return api.json({ migration: migrationSummary(staged.migration, true), cloudflare_dns_imports_enabled: env.CLOUDFLARE_DNS_IMPORTS_ENABLED === "true", message: "The Cloudflare nameservers changed during the request. The zone records were read back and staged, but review the new nameserver set before approval." }, 409);
  }

  if (!staged.diff.exact) {
    await audit(env, site, staged.migration, owner, "cloudflare-import-failed", {
      zone_id: migration.target_provider_zone_id,
      outcome: "readback-incomplete",
      api_response_received: importResult.received,
      api_reported_success: importResult.success,
      remaining_source_records: staged.diff.removed.length,
      destination_only_records: staged.diff.added.length,
    });
    return api.json({ migration: migrationSummary(staged.migration, true), cloudflare_dns_imports_enabled: env.CLOUDFLARE_DNS_IMPORTS_ENABLED === "true", message: "Cloudflare accepted or partially processed the import, but the readback still differs from the source. Review the refreshed record diff; no records were removed or replaced." }, 409);
  }

  await audit(env, site, staged.migration, owner, "cloudflare-import-finished", {
    zone_id: migration.target_provider_zone_id,
    record_count: missing.length,
    api_response_received: importResult.received,
    api_reported_success: importResult.success,
    readback_exact: true,
  });
  return api.json({ migration: migrationSummary(staged.migration, true), cloudflare_dns_imports_enabled: env.CLOUDFLARE_DNS_IMPORTS_ENABLED === "true", message: importResult.success
    ? `Cloudflare now contains all ${missing.length} missing source records. Readback matches the source; review the exact diff and proxy settings before approving.`
    : `Cloudflare readback now matches the source after the import request. Review the exact diff and proxy settings before approving.` });
}

async function approveDiff(request, env, site, migration, owner, api) {
  if (request.method !== "POST" || !api.sameOriginStudioMutation(request, site)) {
    return api.fail(403, "same_origin_required", "Diff approval requires a same-origin Studio request.");
  }
  if (migration.status !== "target_loaded" || !migration.approval_digest) {
    return api.fail(409, "dns_diff_not_ready", "Upload the staged target zone and review its diff before approval.");
  }
  const body = await api.readBoundedJson(request);
  const diff = parseJson(migration.diff_json, null);
  if (!diff?.exact) return api.fail(409, "dns_diff_must_match", "The source and staged target records must match before cutover approval.");
  if (body?.confirm !== true || body?.approval_digest !== migration.approval_digest) {
    return api.fail(409, "dns_approval_confirmation_required", "Confirm the exact displayed DNS diff before approving the cutover plan.");
  }
  const now = new Date().toISOString();
  const update = await env.DB.prepare(
    "UPDATE dns_migrations SET status = 'owner_approved', owner_approved_at = ?, updated_at = ? WHERE site_id = ? AND id = ? AND status = 'target_loaded' AND approval_digest = ?",
  ).bind(now, now, site.id, migration.id, migration.approval_digest).run();
  if (update.meta?.changes !== 1) return api.fail(409, "dns_migration_state_changed", "The target snapshot changed. Reload the migration and approve the current diff.");
  const latest = await getMigration(env, site, migration.id);
  await audit(env, site, latest, owner, "diff-approved", {
    approval_digest: migration.approval_digest,
    owner_label: owner.ownerLabel,
  });
  return api.json({ migration: migrationSummary(latest, true), message: "The owner approved this exact DNS snapshot. The registrar and destination DNS changes remain manual." });
}

async function dnsTxtContains(name, expected) {
  const url = new URL(DNS_RESOLVERS[0].endpoint);
  url.searchParams.set("name", name);
  url.searchParams.set("type", "TXT");
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

async function resolveDns(resolver, name, type) {
  const url = new URL(resolver.endpoint);
  url.searchParams.set("name", name);
  url.searchParams.set("type", type);
  const response = await fetch(url, {
    headers: { Accept: "application/dns-json" },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("DNS resolver unavailable");
  const payload = await response.json();
  if (![0, 3].includes(payload?.Status)) throw new Error("DNS resolver returned an indeterminate answer");
  return payload;
}

function normalizeDnsAnswerName(value) {
  if (typeof value !== "string") return null;
  return normalizeDnsZoneName(value.replace(/\.$/, ""));
}

function answerNameservers(payload) {
  return [...new Set((payload.Answer ?? [])
    .filter((answer) => answer?.type === 2)
    .map((answer) => normalizeDnsAnswerName(answer.data))
    .filter(Boolean))].sort();
}

function answerDsRecords(payload) {
  return [...new Set((payload.Answer ?? [])
    .filter((answer) => answer?.type === 43 && typeof answer.data === "string")
    .map((answer) => answer.data.trim().replace(/\s+/g, " ").toUpperCase()))].sort();
}

async function readDnsState(zoneName) {
  const observations = await Promise.all(DNS_RESOLVERS.map(async (resolver) => {
    const [nsPayload, dsPayload] = await Promise.all([
      resolveDns(resolver, zoneName, "NS"),
      resolveDns(resolver, zoneName, "DS"),
    ]);
    return {
      nameservers: answerNameservers(nsPayload),
      ds_records: answerDsRecords(dsPayload),
      ns_status: nsPayload.Status,
      ds_status: dsPayload.Status,
    };
  }));
  const first = observations[0];
  const consistent = first.nameservers.length > 0 && observations.every((current) =>
    current.ns_status === 0 && current.ds_status === 0
      && JSON.stringify(current.nameservers) === JSON.stringify(first.nameservers)
      && JSON.stringify(current.ds_records) === JSON.stringify(first.ds_records));
  if (!consistent) throw new Error("DNS state is not consistent across resolvers");
  return { nameservers: first.nameservers, ds_records: first.ds_records };
}

async function verifyDelegation(request, env, site, migration, owner, api) {
  if (request.method !== "POST" || !api.sameOriginStudioMutation(request, site)) {
    return api.fail(403, "same_origin_required", "Delegation verification requires a same-origin Studio request.");
  }
  if (migration.status !== "owner_approved" || !migration.owner_approved_at) {
    return api.fail(409, "dns_cutover_not_approved", "Approve the exact staged DNS diff before verifying registrar delegation.");
  }
  const body = await api.readBoundedJson(request);
  if (body?.registrar_updated !== true || body?.old_ds_removed !== true) {
    return api.fail(422, "dns_cutover_confirmation_required", "Confirm that the registrar nameservers were changed and the old DNSSEC DS record was removed before checking propagation.");
  }
  const cutoff = new Date(Date.now() - 60_000).toISOString();
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM dns_migration_actions WHERE site_id = ? AND token_id = ? AND action = 'delegation-check-started' AND created_at >= ?",
  ).bind(site.id, owner.tokenId, cutoff).first();
  if (Number(recent?.total ?? 0) >= 10) return api.fail(429, "dns_check_limit", "This owner token has reached the ten DNS checks per minute limit.");
  await audit(env, site, migration, owner, "delegation-check-started", { zone_name: migration.zone_name });

  const expectedNameservers = parseJson(migration.target_nameservers_json, []);
  if (!Array.isArray(expectedNameservers) || expectedNameservers.length < 2) {
    return api.fail(409, "target_nameservers_missing", "The approved migration has no destination nameserver set.");
  }
  let checks;
  try {
    checks = await Promise.all(DNS_RESOLVERS.map(async (resolver) => {
      const [nsPayload, dsPayload] = await Promise.all([
        resolveDns(resolver, migration.zone_name, "NS"),
        resolveDns(resolver, migration.zone_name, "DS"),
      ]);
      const actualNameservers = answerNameservers(nsPayload);
      const dsRecords = answerDsRecords(dsPayload);
      return {
        resolver: resolver.name,
        nameservers: actualNameservers,
        nameservers_match: actualNameservers.length === expectedNameservers.length
          && actualNameservers.every((value, index) => value === expectedNameservers[index]),
        ds_present: dsRecords.length > 0,
        ds_records: dsRecords,
        dns_status: nsPayload.Status,
        ds_status: dsPayload.Status,
      };
    }));
  } catch {
    return api.fail(503, "dns_resolver_unavailable", "A public DNS resolver could not complete the delegation check. No migration status was changed.");
  }
  const verified = checks.length === DNS_RESOLVERS.length && checks.every((check) =>
    check.nameservers_match && !check.ds_present && check.dns_status === 0 && check.ds_status === 0);
  const now = new Date().toISOString();
  const nextStatus = verified ? "delegation_verified" : "owner_approved";
  await env.DB.prepare(
    "UPDATE dns_migrations SET status = ?, delegation_check_json = ?, delegation_verified_at = CASE WHEN ? = 'delegation_verified' THEN ? ELSE delegation_verified_at END, last_checked_at = ?, updated_at = ? WHERE site_id = ? AND id = ? AND status = 'owner_approved'",
  ).bind(nextStatus, JSON.stringify({ checked_at: now, resolvers: checks }), nextStatus, now, now, now, site.id, migration.id).run();
  const latest = await getMigration(env, site, migration.id);
  await audit(env, site, latest, owner, "delegation-check", {
    verified,
    resolvers: checks.map(({ resolver, nameservers_match, ds_present }) => ({ resolver, nameservers_match, ds_present })),
  });
  return api.json({ migration: migrationSummary(latest, true), verified, message: verified
    ? "Both recursive DNS resolvers now show the approved nameservers and no DS record. Email delivery, HTTP/TLS service, and authoritative server health still need separate verification."
    : "The new nameserver set or DNSSEC state is not visible consistently yet. Keep both DNS providers active and retry later; do not delete the source zone." }, verified ? 200 : 409);
}

async function verifyRollback(request, env, site, migration, owner, api) {
  if (request.method !== "POST" || !api.sameOriginStudioMutation(request, site)) {
    return api.fail(403, "same_origin_required", "Rollback verification requires a same-origin Studio request.");
  }
  if (!["owner_approved", "delegation_verified"].includes(migration.status)) {
    return api.fail(409, "dns_cutover_not_active", "A rollback check is available only after cutover approval and while the source snapshots are retained.");
  }
  const body = await api.readBoundedJson(request);
  if (body?.registrar_restored !== true || body?.source_ds_restored !== true) {
    return api.fail(422, "dns_rollback_confirmation_required", "Confirm that the registrar points to the captured source nameservers and that the source DNSSEC DS state was restored.");
  }
  const cutoff = new Date(Date.now() - 60_000).toISOString();
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM dns_migration_actions WHERE site_id = ? AND token_id = ? AND action = 'rollback-check-started' AND created_at >= ?",
  ).bind(site.id, owner.tokenId, cutoff).first();
  if (Number(recent?.total ?? 0) >= 10) return api.fail(429, "dns_check_limit", "This owner token has reached the ten DNS checks per minute limit.");
  await audit(env, site, migration, owner, "rollback-check-started", { zone_name: migration.zone_name });

  const expectedNameservers = parseJson(migration.source_nameservers_json, []);
  const expectedDs = parseJson(migration.source_ds_json, []);
  let checks;
  try {
    checks = await Promise.all(DNS_RESOLVERS.map(async (resolver) => {
      const [nsPayload, dsPayload] = await Promise.all([
        resolveDns(resolver, migration.zone_name, "NS"),
        resolveDns(resolver, migration.zone_name, "DS"),
      ]);
      const nameservers = answerNameservers(nsPayload);
      const dsRecords = answerDsRecords(dsPayload);
      return {
        resolver: resolver.name,
        nameservers,
        nameservers_match: JSON.stringify(nameservers) === JSON.stringify(expectedNameservers),
        ds_records: dsRecords,
        ds_state_match: JSON.stringify(dsRecords) === JSON.stringify(expectedDs),
        dns_status: nsPayload.Status,
        ds_status: dsPayload.Status,
      };
    }));
  } catch {
    return api.fail(503, "dns_resolver_unavailable", "A public DNS resolver could not complete the rollback check. No migration status was changed.");
  }
  const verified = checks.length === DNS_RESOLVERS.length && checks.every((check) =>
    check.nameservers_match && check.ds_state_match && check.dns_status === 0 && check.ds_status === 0);
  const now = new Date().toISOString();
  const status = verified ? "rolled_back" : migration.status;
  await env.DB.prepare(
    "UPDATE dns_migrations SET status = ?, rollback_check_json = ?, last_checked_at = ?, updated_at = ? WHERE site_id = ? AND id = ? AND status = ?",
  ).bind(status, JSON.stringify({ checked_at: now, resolvers: checks }), now, now, site.id, migration.id, migration.status).run();
  const latest = await getMigration(env, site, migration.id);
  await audit(env, site, latest, owner, "rollback-check", {
    verified,
    resolvers: checks.map(({ resolver, nameservers_match, ds_state_match }) => ({ resolver, nameservers_match, ds_state_match })),
  });
  return api.json({ migration: migrationSummary(latest, true), verified, message: verified
    ? "Both recursive DNS resolvers now show the captured source nameservers and DS state. Keep the source provider active and separately verify HTTP/TLS and mail."
    : "The captured source nameserver or DS state is not visible consistently yet. Keep both providers active and retry later." }, verified ? 200 : 409);
}

async function eraseOrCancel(request, env, site, migration, owner, api) {
  if (request.method !== "DELETE" || !api.sameOriginStudioMutation(request, site)) {
    return api.fail(403, "same_origin_required", "Removing DNS migration data requires a same-origin Studio request.");
  }
  const alreadyClosed = migration.status === "archived" || migration.status === "cancelled";
  if (alreadyClosed && migration.snapshots_erased_at) {
    return api.json({ migration: migrationSummary(migration), message: "This migration plan is already closed." });
  }
  if (migration.status === "owner_approved") {
    return api.fail(409, "dns_cutover_snapshot_retained", "Verify the destination or record a source rollback before erasing snapshots. The old zone is needed to restore service.");
  }
  const recentCloudflareImport = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM dns_migration_actions WHERE site_id = ? AND migration_id = ? AND action = 'cloudflare-import-started' AND created_at >= ?",
  ).bind(site.id, migration.id, new Date(Date.now() - 60_000).toISOString()).first();
  if (Number(recentCloudflareImport?.total ?? 0) > 0) {
    return api.fail(409, "cloudflare_import_in_progress", "A Cloudflare import was started recently. Refresh and verify the target-zone readback before erasing its rollback snapshots.");
  }
  const completed = migration.status === "delegation_verified" || migration.status === "rolled_back" || migration.status === "archived";
  const status = completed ? "archived" : "cancelled";
  const now = new Date().toISOString();
  const action = completed || alreadyClosed ? "snapshots-erased" : "cancelled";
  const metadata = JSON.stringify({
    zone_name: migration.zone_name,
    previous_status: migration.status,
    reason: completed || alreadyClosed ? "owner_requested_erase" : "owner_cancelled",
    source_zone_sha256: migration.source_zone_sha256,
    target_zone_sha256: migration.target_zone_sha256,
  });
  const [update] = await env.DB.batch([
    env.DB.prepare(
      "UPDATE dns_migrations SET status = ?, ownership_txt_name = NULL, ownership_txt_value = NULL, source_nameservers_json = '[]', source_ds_json = '[]', source_dns_state_captured_at = NULL, source_zone_text = NULL, source_record_count = NULL, source_apex_soa_present = NULL, source_apex_ns_count = NULL, target_zone_text = NULL, target_record_count = NULL, target_nameservers_json = NULL, diff_json = NULL, import_zone_text = NULL, target_provider = NULL, target_provider_zone_id = NULL, approval_digest = NULL, delegation_check_json = NULL, rollback_check_json = NULL, snapshots_erased_at = ?, updated_at = ? WHERE site_id = ? AND id = ? AND status = ? AND updated_at = ? AND snapshots_erased_at IS NULL",
    ).bind(status, now, now, site.id, migration.id, migration.status, migration.updated_at),
    env.DB.prepare(
      "INSERT INTO dns_migration_actions (id, site_id, migration_id, token_id, action, created_at, metadata_json) SELECT ?, site_id, id, ?, ?, ?, ? FROM dns_migrations WHERE site_id = ? AND id = ? AND status = ? AND updated_at = ? AND snapshots_erased_at = ? AND NOT EXISTS (SELECT 1 FROM dns_migration_actions WHERE site_id = ? AND migration_id = ? AND action = ? AND created_at = ? AND metadata_json = ?)",
    ).bind(crypto.randomUUID(), owner.tokenId, action, now, metadata, site.id, migration.id, status, now, now, site.id, migration.id, action, now, metadata),
  ]);
  if (update.meta?.changes !== 1) {
    const latest = await getMigration(env, site, migration.id);
    if (latest?.snapshots_erased_at) {
      return api.json({ migration: migrationSummary(latest), message: "The DNS migration snapshots have already been erased." });
    }
    return api.fail(409, "dns_migration_state_changed", "The DNS migration changed. Reload the current snapshot before erasing it.");
  }
  const latest = await getMigration(env, site, migration.id);
  return api.json({ migration: migrationSummary(latest), message: completed
    ? "Zone snapshots and TXT values were erased. The verification hashes and audit receipt remain."
    : "The migration was cancelled and zone snapshots and TXT values were erased. No registrar or DNS provider changes were made by MithrilPress." });
}

async function listMigrations(env, site) {
  const rows = await env.DB.prepare(
    "SELECT id, zone_name, status, created_at, updated_at FROM dns_migrations WHERE site_id = ? ORDER BY updated_at DESC LIMIT 20",
  ).bind(site.id).all();
  return rows.results ?? [];
}

export async function handleDnsMigrations(request, env, site, api) {
  const authorization = await authorize(request, env, site, api);
  if (authorization.error) return authorization.error;
  const { owner } = authorization;
  const url = new URL(request.url);
  if (url.pathname === "/_mithrilpress/api/dns-migrations") {
    if (request.method === "GET") return api.json({ migrations: await listMigrations(env, site) }, 200, { "Cache-Control": "private, no-store" });
    return await createMigration(request, env, site, owner, api);
  }

  const match = /^\/_mithrilpress\/api\/dns-migrations\/([a-f0-9-]{36})(?:\/(verify-ownership|source|target|cloudflare-target|cloudflare-import|approve|verify-delegation|verify-rollback))?$/.exec(url.pathname);
  if (!match) return api.fail(404, "dns_migration_not_found", "DNS migration plan not found.");
  const migration = await getMigration(env, site, match[1]);
  if (!migration) return api.fail(404, "dns_migration_not_found", "DNS migration plan not found.");
  const action = match[2];
  if (!action && request.method === "GET") return api.json({
    migration: migrationSummary(migration, true),
    cloudflare_dns_imports_enabled: env.CLOUDFLARE_DNS_IMPORTS_ENABLED === "true",
  }, 200, { "Cache-Control": "private, no-store" });
  if (!action) return await eraseOrCancel(request, env, site, migration, owner, api);
  if (action === "verify-ownership") return await verifyOwnership(request, env, site, migration, owner, api);
  if (action === "source") return await uploadSource(request, env, site, migration, owner, api);
  if (action === "target") return await uploadTarget(request, env, site, migration, owner, api);
  if (action === "cloudflare-target") return await readCloudflareTarget(request, env, site, migration, owner, api);
  if (action === "cloudflare-import") return await importCloudflareMissingRecords(request, env, site, migration, owner, api);
  if (action === "approve") return await approveDiff(request, env, site, migration, owner, api);
  if (action === "verify-delegation") return await verifyDelegation(request, env, site, migration, owner, api);
  return await verifyRollback(request, env, site, migration, owner, api);
}
