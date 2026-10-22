import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const apiRoot = "https://api.cloudflare.com/client/v4/";
const accountIdExpected = "62e1fda53188460698f8c66d3aef59c6";
const zoneNameExpected = "mithril.love";
const workerNameExpected = "mithrilpress";
const platformHost = "*.sites.mithril.love";
const routePattern = "*.sites.mithril.love/*";
const placeholderIpv4 = "192.0.2.0";
const routingDnsTypes = new Set(["A", "AAAA", "CNAME", "HTTPS", "NS", "SVCB"]);
// This non-overridable source gate stays closed until the CLI can verify real
// ingress-abuse protection and provider-level usage stops for every resource.
const publicHostingBlockedReason = "Public wildcard hosting is disabled until a host-aware abuse control and enforceable provider-cost stop are verified for Worker, D1, and R2; this CLI cannot verify either control yet (MITHRIL-292).";

const usage = `Inspect, enable, or disable the single MithrilPress wildcard host route.

Usage:
  node scripts/provision-platform-route.mjs <status|enable|disable> \\
    --config <production-wrangler.jsonc> --zone-id <mithril.love-zone-id> \\
    [--apply --confirm-platform-host '*.sites.mithril.love']

status is read-only. enable and disable are read-only plans unless --apply and
the exact platform-host confirmation are supplied. Enable is currently blocked
until a host-aware abuse control and enforceable provider-cost stop are verified
for this deployment. This CLI never orders certificates, changes an account
plan, or creates a wildcard route until all gates pass.

The provider credential is read from CLOUDFLARE_API_TOKEN and is never printed.
No tenant-specific DNS records or customer-owned zones are managed here.`;

function fail(message) {
  throw new Error(message);
}

function stripJsonComments(source) {
  let output = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (inString) {
      output += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      output += char;
    } else if (char === "/" && next === "/") {
      index += 2;
      while (index < source.length && source[index] !== "\n" && source[index] !== "\r") index += 1;
      output += "\n";
    } else if (char === "/" && next === "*") {
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
        output += source[index] === "\n" || source[index] === "\r" ? source[index] : " ";
        index += 1;
      }
      if (index >= source.length) fail("Wrangler config contains an unterminated block comment.");
      index += 1;
    } else output += char;
  }

  let normalized = "";
  inString = false;
  escaped = false;
  for (let index = 0; index < output.length; index += 1) {
    const char = output[index];
    if (inString) {
      normalized += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      normalized += char;
    } else if (char === ",") {
      let next = index + 1;
      while (/\s/u.test(output[next] ?? "")) next += 1;
      if (output[next] !== "}" && output[next] !== "]") normalized += char;
    } else normalized += char;
  }
  return normalized;
}

function parseArgs(argv) {
  const action = argv[0];
  if (action === "--help" || action === "-h") return { help: true };
  if (!["status", "enable", "disable"].includes(action)) {
    fail(`Choose status, enable, or disable.\n\n${usage}`);
  }
  const values = new Map();
  const known = new Set(["--config", "--zone-id", "--confirm-platform-host"]);
  let apply = false;
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--help" || flag === "-h") return { help: true };
    if (flag === "--apply") {
      if (apply) fail("Option may only be used once: --apply");
      apply = true;
      continue;
    }
    if (!known.has(flag)) fail(`Unknown option: ${flag}\n\n${usage}`);
    if (values.has(flag)) fail(`Option may only be used once: ${flag}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail(`Missing value for ${flag}`);
    values.set(flag, value);
    index += 1;
  }
  const options = Object.fromEntries([...values].map(([key, value]) => [
    key.slice(2).replaceAll("-", "_"),
    value,
  ]));
  for (const required of ["config", "zone_id"]) {
    if (!options[required]) fail(`Missing --${required.replaceAll("_", "-")}\n\n${usage}`);
  }
  if (!/^[a-f0-9]{32}$/iu.test(options.zone_id) || /^0{32}$/u.test(options.zone_id)) {
    fail("--zone-id must be the exact non-placeholder mithril.love zone ID.");
  }
  if (action === "status" && (apply || options.confirm_platform_host)) {
    fail("The status action is read-only and does not accept provider-write options.");
  }
  if (apply && options.confirm_platform_host !== platformHost) {
    fail("Provider changes require --confirm-platform-host to exactly match '*.sites.mithril.love'.");
  }
  if (!apply && options.confirm_platform_host) {
    fail("--confirm-platform-host is only valid with --apply.");
  }
  return { action, apply, ...options, zone_id: options.zone_id.toLowerCase() };
}

function readWorkerConfig(configPath) {
  let config;
  try {
    config = JSON.parse(stripJsonComments(readFileSync(configPath, "utf8")));
  } catch (error) {
    fail(`Cannot parse Wrangler config ${configPath}: ${error.message}`);
  }
  if (config.name !== workerNameExpected) {
    fail(`Wrangler config must target Worker ${workerNameExpected}.`);
  }
  if (typeof config.account_id !== "string"
      || config.account_id.toLowerCase() !== accountIdExpected) {
    fail("Wrangler config must target the user-confirmed fund-mithril account.");
  }
  if (config.workers_dev !== false) {
    fail("Production Wrangler config must explicitly set workers_dev to false.");
  }
  if (Array.isArray(config.routes)
      && config.routes.some((route) => mayOverlapPlatformRoute({
        pattern: typeof route === "string" ? route : route?.pattern,
      }))) {
    fail("Do not declare a route overlapping the managed platform namespace in Wrangler config; this CLI is its single writer.");
  }
  return { accountId: config.account_id.toLowerCase(), workerName: config.name };
}

function requireApiToken() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (typeof token !== "string" || token.length < 20 || token.length > 512 || /[\r\n]/u.test(token)) {
    fail("Set CLOUDFLARE_API_TOKEN in the operator environment.");
  }
  return token;
}

async function cloudflareRequest(token, method, path, query = {}, body, allow404 = false) {
  const url = new URL(path.replace(/^\//u, ""), apiRoot);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
  const response = await fetch(url, {
    method,
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  if (text.length > 1_000_000) fail(`Cloudflare API ${method} ${url.pathname} returned an oversized response.`);
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    fail(`Cloudflare API ${method} ${url.pathname} returned invalid JSON (${response.status}).`);
  }
  if (response.status === 404 && allow404) return null;
  if (!response.ok || payload.success !== true) {
    const details = Array.isArray(payload.errors)
      ? payload.errors.map((item) => `${item.code ?? "?"}: ${item.message ?? "Cloudflare API error"}`).join("; ")
      : "Cloudflare API request failed";
    fail(`Cloudflare API ${method} ${url.pathname} returned HTTP ${response.status}: ${details}`);
  }
  return payload;
}

async function readZone(token, zoneId, accountId) {
  const { result: zone } = await cloudflareRequest(token, "GET", `/zones/${zoneId}`);
  if (zone.id?.toLowerCase() !== zoneId
      || zone.account?.id?.toLowerCase() !== accountId
      || zone.name !== zoneNameExpected
      || zone.status !== "active") {
    fail("The selected zone must be the active mithril.love zone in fund-mithril.");
  }
  return { id: zone.id, name: zone.name, status: zone.status, plan: zone.plan?.name ?? null };
}

async function readWorker(token, accountId, workerName) {
  const response = await cloudflareRequest(
    token,
    "GET",
    `/accounts/${accountId}/workers/scripts/${encodeURIComponent(workerName)}/settings`,
    {},
    undefined,
    true,
  );
  return response !== null;
}

async function readDnsRecords(token, zoneId) {
  const records = [];
  const perPage = 500;
  let page = 1;
  let totalPages;
  do {
    const payload = await cloudflareRequest(token, "GET", `/zones/${zoneId}/dns_records`, {
      page,
      per_page: perPage,
    });
    if (!Array.isArray(payload.result) || !Number.isInteger(payload.result_info?.total_pages)) {
      fail("Cloudflare returned an invalid or incomplete DNS records list.");
    }
    records.push(...payload.result);
    totalPages = payload.result_info.total_pages;
    page += 1;
  } while (page <= totalPages);
  return records.filter((record) => {
    const name = record.name?.toLowerCase();
    return (name === platformHost || name?.endsWith(".sites.mithril.love"))
      && routingDnsTypes.has(record.type);
  });
}

async function readRoutes(token, zoneId) {
  const { result } = await cloudflareRequest(token, "GET", `/zones/${zoneId}/workers/routes`);
  if (!Array.isArray(result)) fail("Cloudflare returned an invalid Worker routes list.");
  return result;
}

async function readCertificates(token, zoneId) {
  const { result } = await cloudflareRequest(token, "GET", `/zones/${zoneId}/ssl/certificate_packs`);
  if (!Array.isArray(result)) fail("Cloudflare returned an invalid certificate packs list.");
  return result.filter((pack) => Array.isArray(pack.hosts)
    && pack.hosts.some((host) => host.toLowerCase() === platformHost));
}

function expectedDnsRecord(record) {
  return record.type === "A"
    && record.name?.toLowerCase() === platformHost
    && record.content === placeholderIpv4
    && record.proxied === true;
}

function routeHost(pattern) {
  if (typeof pattern !== "string") return null;
  const withoutScheme = pattern.replace(/^https?:\/\//iu, "");
  return withoutScheme.split(/[/:]/u, 1)[0]?.toLowerCase() ?? null;
}

function mayOverlapPlatformRoute(route) {
  const host = routeHost(route.pattern);
  if (!host) return true;
  if (host === platformHost || host === "sites.mithril.love"
      || host.endsWith(`.sites.mithril.love`)) return true;
  return host.includes("*") && (host === "*" || host.includes("mithril.love"));
}

function safeDnsRecord(record) {
  return {
    id: record.id,
    name: record.name,
    type: record.type,
    content: record.content,
    proxied: record.proxied,
    expected: expectedDnsRecord(record),
  };
}

async function inspect(token, config, zoneId) {
  const zone = await readZone(token, zoneId, config.accountId);
  const [workerExists, dnsRecords, routes, certificates] = await Promise.all([
    readWorker(token, config.accountId, config.workerName),
    readDnsRecords(token, zoneId),
    readRoutes(token, zoneId),
    readCertificates(token, zoneId),
  ]);

  if (dnsRecords.length > 1 || (dnsRecords.length === 1 && !expectedDnsRecord(dnsRecords[0]))) {
    fail("A conflicting DNS record exists in the sites.mithril.love namespace; inspect it manually. No write was made.");
  }
  const exactRoutes = routes.filter((route) => route.pattern === routePattern);
  if (exactRoutes.length > 1
      || (exactRoutes.length === 1 && exactRoutes[0].script !== config.workerName)) {
    fail("A conflicting exact wildcard route exists; inspect it manually. No write was made.");
  }
  const overlappingRoutes = routes.filter((route) => route.pattern !== routePattern
    && mayOverlapPlatformRoute(route));
  if (overlappingRoutes.length > 0) {
    fail("A broader or more-specific route overlaps *.sites.mithril.love; resolve it before provisioning.");
  }
  const matchingCertificates = certificates.map((pack) => ({
    id: pack.id,
    type: pack.type,
    status: pack.status,
    hosts: pack.hosts,
  }));
  const activeWildcardCertificate = certificates.some((pack) => pack.status === "active");
  return {
    zone,
    workerExists,
    dnsRecords: dnsRecords.map(safeDnsRecord),
    route: exactRoutes[0] ? {
      id: exactRoutes[0].id,
      pattern: exactRoutes[0].pattern,
      script: exactRoutes[0].script,
    } : null,
    certificates: matchingCertificates,
    activeWildcardCertificate,
  };
}

function enableBlockers(state) {
  const blockedBy = [];
  if (!state.workerExists) blockedBy.push("Worker mithrilpress is not deployed.");
  if (!state.activeWildcardCertificate) {
    blockedBy.push("No active certificate covers *.sites.mithril.love; enable/order a suitable certificate separately.");
  }
  blockedBy.push(publicHostingBlockedReason);
  if (!state.route && state.dnsRecords.length > 0) {
    blockedBy.push("Wildcard DNS exists without the managed Worker route; resolve this partial state manually before enabling routing.");
  }
  if (state.route && state.dnsRecords.length === 0) {
    blockedBy.push("Wildcard Worker route exists without managed wildcard DNS; resolve this partial state manually before enabling DNS.");
  }
  return blockedBy;
}

function plan(action, state, workerName) {
  const blockedBy = action === "enable" ? enableBlockers(state) : [];
  if (action === "disable") {
    const changes = [];
    if (state.route) {
      changes.push({ method: "DELETE", resource: "wildcard Worker route first", id: state.route.id });
    }
    if (state.dnsRecords.length === 1) {
      changes.push({ method: "DELETE", resource: "managed wildcard DNS record after route removal", id: state.dnsRecords[0].id });
    }
    return { blockedBy, changes };
  }
  if (action === "enable") {
    const changes = [];
    if (!state.route) changes.push({ method: "POST", resource: "wildcard Worker route", pattern: routePattern, script: workerName });
    if (state.dnsRecords.length === 0) {
      changes.push({ method: "POST", resource: "proxied wildcard DNS A record after route read-back", name: platformHost, content: placeholderIpv4 });
    }
    return { blockedBy, changes };
  }
  return { blockedBy, changes: [] };
}

async function enable(token, zoneId, state, workerName) {
  const blockers = enableBlockers(state);
  if (blockers.length > 0) fail(`Refusing to enable public hosting: ${blockers.join(" ")}`);
  let createdRouteId = null;
  let createdDnsId = null;
  let routeAttempted = false;
  let dnsAttempted = false;
  try {
    if (!state.route) {
      routeAttempted = true;
      let createError = null;
      try {
        const created = await cloudflareRequest(token, "POST", `/zones/${zoneId}/workers/routes`, {}, {
          pattern: routePattern,
          script: workerName,
        });
        createdRouteId = created.result?.id ?? null;
      } catch (error) {
        createError = error;
      }
      if (!createdRouteId) {
        const routes = await readRoutes(token, zoneId);
        const matches = routes.filter((route) => route.pattern === routePattern);
        if (matches.length === 0 && createError) {
          fail(`${createError.message}. No exact wildcard route is visible in immediate read-back; inspect Cloudflare before retrying because provider completion may be ambiguous.`);
        } else if (matches.length === 0) {
          fail("Wildcard route create returned no ID and no exact route is visible in immediate read-back; inspect Cloudflare before retrying.");
        } else {
          const candidateIds = matches.map((route) => route.id ?? "unknown").join(", ");
          fail(`Wildcard route create outcome is ambiguous; exact route candidate IDs: ${candidateIds}. Inspect Cloudflare before retrying.`);
        }
      }
      const routes = await readRoutes(token, zoneId);
      const readBack = routes.filter((route) => route.pattern === routePattern && route.script === workerName);
      if (readBack.length !== 1 || readBack[0].id !== createdRouteId) {
        fail("Wildcard route create completed but exact route read-back failed.");
      }
    }
    if (state.dnsRecords.length === 0) {
      dnsAttempted = true;
      let createError = null;
      try {
        const created = await cloudflareRequest(token, "POST", `/zones/${zoneId}/dns_records`, {}, {
          type: "A",
          name: platformHost,
          content: placeholderIpv4,
          proxied: true,
          ttl: 1,
          comment: "MithrilPress platform wildcard host",
        });
        createdDnsId = created.result?.id ?? null;
      } catch (error) {
        createError = error;
      }
      if (!createdDnsId) {
        const records = await readDnsRecords(token, zoneId);
        const matches = records.filter((record) => record.name?.toLowerCase() === platformHost);
        if (matches.length === 0 && createError) {
          fail(`${createError.message}. No exact wildcard DNS record is visible in immediate read-back; inspect Cloudflare before retrying because provider completion may be ambiguous.`);
        } else if (matches.length === 0) {
          fail("Wildcard DNS create returned no ID and no exact record is visible in immediate read-back; inspect Cloudflare before retrying.");
        } else {
          const candidateIds = matches.map((record) => record.id ?? "unknown").join(", ");
          fail(`Wildcard DNS create outcome is ambiguous; exact record candidate IDs: ${candidateIds}. Inspect Cloudflare before retrying.`);
        }
      }
      const records = await readDnsRecords(token, zoneId);
      if (records.length !== 1 || !expectedDnsRecord(records[0]) || records[0].id !== createdDnsId) {
        fail("Wildcard DNS create completed but exact record read-back failed.");
      }
    }
    const after = await inspect(token, { accountId: accountIdExpected, workerName }, zoneId);
    if (!after.route || after.route.script !== workerName
        || after.dnsRecords.length !== 1 || !after.dnsRecords[0].expected
        || !after.activeWildcardCertificate) {
      fail("Wildcard route enable did not pass DNS, route, and TLS read-back.");
    }
    return after;
  } catch (error) {
    const rollbackErrors = [];
    if (routeAttempted) {
      try {
        await rollbackCreatedRoute(token, zoneId, workerName, createdRouteId);
      } catch (rollbackError) {
        rollbackErrors.push(`route rollback failed: ${rollbackError.message}`);
      }
    }
    if (dnsAttempted) {
      try {
        await rollbackCreatedDnsRecord(token, zoneId, createdDnsId);
      } catch (rollbackError) {
        rollbackErrors.push(`DNS rollback failed: ${rollbackError.message}`);
      }
    }
    if (rollbackErrors.length > 0) {
      fail(`${error.message}. Automatic rollback is incomplete (${rollbackErrors.join("; ")}); keep hosting unpublished and inspect Cloudflare.`);
    }
    throw error;
  }
}

async function rollbackCreatedRoute(token, zoneId, workerName, createdId) {
  const routes = await readRoutes(token, zoneId);
  const exact = routes.filter((route) => route.pattern === routePattern);
  if (!createdId) {
    if (exact.length === 0) return;
    const candidateIds = exact.map((route) => route.id ?? "unknown").join(", ");
    fail(`exact wildcard route remains (candidate IDs: ${candidateIds}); refusing deletion because the create response did not identify ownership`);
  }
  if (!routes.some((route) => route.id === createdId)) {
    if (exact.length === 0) {
      fail(`created wildcard route ID ${createdId} is not visible in read-back; inspect Cloudflare before retrying`);
    }
    fail("a different exact wildcard route exists after the failed create");
  }
  if (exact.length !== 1 || exact[0].script !== workerName
      || exact[0].id !== createdId || !exact[0].id) {
    fail("the exact wildcard route is not uniquely identifiable for rollback");
  }
  await deleteRouteAndVerify(token, zoneId, exact[0].id, "Route rollback");
}

async function rollbackCreatedDnsRecord(token, zoneId, createdId) {
  const records = await readDnsRecords(token, zoneId);
  const exact = records.filter((record) => record.name?.toLowerCase() === platformHost);
  if (!createdId) {
    if (exact.length === 0) return;
    const candidateIds = exact.map((record) => record.id ?? "unknown").join(", ");
    fail(`exact wildcard DNS record remains (candidate IDs: ${candidateIds}); refusing deletion because the create response did not identify ownership`);
  }
  if (!records.some((record) => record.id === createdId)) {
    if (exact.length === 0) {
      fail(`created wildcard DNS record ID ${createdId} is not visible in read-back; inspect Cloudflare before retrying`);
    }
    fail("a different exact wildcard DNS record exists after the failed create");
  }
  if (exact.length !== 1 || !expectedDnsRecord(exact[0])
      || exact[0].id !== createdId || !exact[0].id) {
    fail("the exact wildcard DNS record is not uniquely identifiable for rollback");
  }
  await deleteDnsRecordAndVerify(token, zoneId, exact[0].id, "DNS rollback");
}

async function deleteRouteAndVerify(token, zoneId, routeId, operation) {
  let deleteError = null;
  try {
    await cloudflareRequest(token, "DELETE", `/zones/${zoneId}/workers/routes/${encodeURIComponent(routeId)}`);
  } catch (error) {
    deleteError = error;
  }
  const after = await readRoutes(token, zoneId);
  if (after.some((route) => route.pattern === routePattern)) {
    const detail = deleteError ? ` after an ambiguous delete response (${deleteError.message})` : "";
    fail(`${operation} did not remove the exact wildcard route${detail}`);
  }
}

async function deleteDnsRecordAndVerify(token, zoneId, recordId, operation) {
  let deleteError = null;
  try {
    await cloudflareRequest(token, "DELETE", `/zones/${zoneId}/dns_records/${encodeURIComponent(recordId)}`);
  } catch (error) {
    deleteError = error;
  }
  const after = await readDnsRecords(token, zoneId);
  if (after.some((record) => record.name?.toLowerCase() === platformHost)) {
    const detail = deleteError ? ` after an ambiguous delete response (${deleteError.message})` : "";
    fail(`${operation} did not remove the exact wildcard DNS record${detail}`);
  }
}

async function disable(token, zoneId, state) {
  const routes = await readRoutes(token, zoneId);
  const exactRoutes = routes.filter((route) => route.pattern === routePattern);
  if (exactRoutes.length > 1 || routes.some((route) => route.pattern !== routePattern
      && mayOverlapPlatformRoute(route))) {
    fail("Worker routes changed since inspection; refusing to disable through a conflicting route state.");
  }
  if (state.route) {
    if (exactRoutes.length === 1) {
      const liveRoute = exactRoutes[0];
      if (liveRoute.id !== state.route.id || liveRoute.script !== state.route.script) {
        fail("The wildcard route changed since inspection; refusing to delete a different route.");
      }
      await deleteRouteAndVerify(token, zoneId, liveRoute.id, "Route deletion");
    }
  } else if (exactRoutes.length > 0) {
    fail("A wildcard route appeared since inspection; refusing to delete an unplanned route.");
  }

  const dnsRecords = await readDnsRecords(token, zoneId);
  if (dnsRecords.length > 1 || (dnsRecords.length === 1 && !expectedDnsRecord(dnsRecords[0]))) {
    fail("Routing DNS records changed since inspection; refusing to delete a conflicting record.");
  }
  if (state.dnsRecords.length === 0) {
    if (dnsRecords.length > 0) {
      fail("Wildcard DNS appeared since inspection; refusing to delete an unplanned record.");
    }
  } else if (dnsRecords.length === 1) {
    const initialRecord = state.dnsRecords[0];
    const liveRecord = dnsRecords[0];
    if (liveRecord.id !== initialRecord.id || !initialRecord.expected) {
      fail("The managed wildcard DNS record changed since inspection; refusing to delete a different record.");
    }
    await deleteDnsRecordAndVerify(token, zoneId, liveRecord.id, "DNS deletion");
  }
  return { route: null, dnsRecords: [] };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage);
    return;
  }
  const config = readWorkerConfig(resolve(options.config));
  const token = requireApiToken();
  const state = await inspect(token, config, options.zone_id);
  const intended = plan(options.action, state, config.workerName);
  if (options.action === "status") {
    console.log(JSON.stringify({ action: "status", state }, null, 2));
    return;
  }
  if (!options.apply) {
    console.log(JSON.stringify({
      action: options.action,
      mode: "dry-run",
      state,
      plan: intended,
      note: "No Cloudflare resources were changed. Use --apply and the exact --confirm-platform-host only after all release gates are satisfied.",
    }, null, 2));
    return;
  }
  if (intended.blockedBy.length > 0) fail(`Refusing to apply: ${intended.blockedBy.join(" ")}`);
  const result = options.action === "enable"
    ? await enable(token, options.zone_id, state, config.workerName)
    : await disable(token, options.zone_id, state);
  console.log(JSON.stringify({
    action: options.action,
    mode: "applied",
    platform_host: platformHost,
    route_pattern: routePattern,
    state: result,
    note: "Verify public HTTPS and the application's owner-approved publication state before sharing sites.",
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
