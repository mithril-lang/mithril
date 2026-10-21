import {
  MAX_ZONE_FILE_BYTES,
  compareDnsZoneFiles,
  normalizeDnsZoneName,
  parseDnsZoneFile,
  renderDnsZoneFile,
} from "./dns_zonefile.js";

const MAX_ACTIVE_MIGRATIONS_PER_SITE = 3;
const MAX_TARGET_NAMESERVERS = 4;
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

  const now = new Date();
  const nowIso = now.toISOString();
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
  const result = await env.DB.prepare(
    "UPDATE dns_migrations SET status = 'source_pending', ownership_txt_value = NULL, ownership_verified_at = ?, source_nameservers_json = ?, source_ds_json = ?, source_dns_state_captured_at = ?, updated_at = ? WHERE site_id = ? AND id = ? AND status = 'ownership_pending' AND ownership_txt_value = ?",
  ).bind(now, JSON.stringify(sourceDnsState.nameservers), JSON.stringify(sourceDnsState.ds_records), now,
    now, site.id, migration.id, migration.ownership_txt_value).run();
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
  if (migration.status === "archived" || migration.status === "cancelled") {
    return api.json({ migration: migrationSummary(migration), message: "This migration plan is already closed." });
  }
  if (migration.status === "owner_approved") {
    return api.fail(409, "dns_cutover_snapshot_retained", "Verify the destination or record a source rollback before erasing snapshots. The old zone is needed to restore service.");
  }
  const completed = migration.status === "delegation_verified" || migration.status === "rolled_back";
  const status = completed ? "archived" : "cancelled";
  const now = new Date().toISOString();
  await env.DB.prepare(
    "UPDATE dns_migrations SET status = ?, ownership_txt_value = NULL, source_zone_text = NULL, target_zone_text = NULL, diff_json = NULL, import_zone_text = NULL, target_nameservers_json = NULL, approval_digest = NULL, updated_at = ? WHERE site_id = ? AND id = ?",
  ).bind(status, now, site.id, migration.id).run();
  const latest = await getMigration(env, site, migration.id);
  await audit(env, site, latest, owner, completed ? "snapshots-erased" : "cancelled", {
    zone_name: migration.zone_name,
    source_zone_sha256: migration.source_zone_sha256,
    target_zone_sha256: migration.target_zone_sha256,
  });
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

  const match = /^\/_mithrilpress\/api\/dns-migrations\/([a-f0-9-]{36})(?:\/(verify-ownership|source|target|approve|verify-delegation|verify-rollback))?$/.exec(url.pathname);
  if (!match) return api.fail(404, "dns_migration_not_found", "DNS migration plan not found.");
  const migration = await getMigration(env, site, match[1]);
  if (!migration) return api.fail(404, "dns_migration_not_found", "DNS migration plan not found.");
  const action = match[2];
  if (!action && request.method === "GET") return api.json({ migration: migrationSummary(migration, true) }, 200, { "Cache-Control": "private, no-store" });
  if (!action) return await eraseOrCancel(request, env, site, migration, owner, api);
  if (action === "verify-ownership") return await verifyOwnership(request, env, site, migration, owner, api);
  if (action === "source") return await uploadSource(request, env, site, migration, owner, api);
  if (action === "target") return await uploadTarget(request, env, site, migration, owner, api);
  if (action === "approve") return await approveDiff(request, env, site, migration, owner, api);
  if (action === "verify-delegation") return await verifyDelegation(request, env, site, migration, owner, api);
  return await verifyRollback(request, env, site, migration, owner, api);
}
