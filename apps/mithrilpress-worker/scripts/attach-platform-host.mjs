import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { instantiateMithrilNative } from "../src/platform_hostname.js";

const API_ORIGIN = "https://api.cloudflare.com/client/v4";
const EXPECTED_ACCOUNT_NAME = "fund-mithril";
const EXPECTED_ZONE_NAME = "mithril.love";
const WORKER_SERVICE = "mithrilpress";
const MAX_WORKER_DOMAINS_PER_ZONE = 90;
const { siteHostname } = instantiateMithrilNative({});

const usage = `Attach one registered MithrilPress platform hostname to the shared Worker.

Required:
  --account-id <Cloudflare account ID>
  --zone-id <mithril.love zone ID>
  --hostname <label>.sites.mithril.love
  --confirm-hostname <same exact hostname>

Optional:
  --apply     Create the exact Worker Custom Domain after read-only preflight.
  --help

Without --apply, the command performs the same identity, Worker, DNS, and quota
read checks and prints a plan. It never creates a wildcard DNS record or route.
Set CLOUDFLARE_API_TOKEN in the operator environment; never pass it as an argument.

The selected account and zone must read back as fund-mithril / mithril.love.
The shared zone-wide Worker Custom Domain cap is 90, preserving ten slots under
Cloudflare's 100-domain zone limit. An applied domain is retained for manual
reconciliation if TLS or HTTPS read-back is incomplete; this command never
deletes provider resources automatically.`;

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const values = new Map();
  const known = new Set(["--account-id", "--zone-id", "--hostname", "--confirm-hostname"]);
  let apply = false;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--help" || flag === "-h") return { help: true };
    if (flag === "--apply") {
      if (apply) fail("--apply may only be used once.");
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

  const options = Object.fromEntries([...values].map(([key, value]) => [key.slice(2).replaceAll("-", "_"), value]));
  for (const key of ["account_id", "zone_id", "hostname", "confirm_hostname"]) {
    if (!options[key]) fail(`Missing --${key.replaceAll("_", "-")}\n\n${usage}`);
  }
  if (!/^[a-f0-9]{32}$/iu.test(options.account_id)) fail("--account-id must be a 32-character Cloudflare ID.");
  if (!/^[a-f0-9]{32}$/iu.test(options.zone_id)) fail("--zone-id must be a 32-character Cloudflare ID.");
  const hostname = siteHostname(options.hostname);
  if (!hostname || hostname !== options.hostname || options.confirm_hostname !== hostname) {
    fail("--hostname must be canonical lowercase and --confirm-hostname must match it exactly.");
  }
  return { ...options, apply };
}

function apiErrorMessage(payload) {
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];
  const descriptions = errors
    .map((entry) => `${Number.isInteger(entry?.code) ? `${entry.code}: ` : ""}${String(entry?.message ?? "").slice(0, 240)}`)
    .filter(Boolean);
  return descriptions.length ? descriptions.join("; ") : "Cloudflare returned an unsuccessful response.";
}

async function cloudflareRequest(token, method, path, query = undefined, body = undefined) {
  const url = new URL(`${API_ORIGIN}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, String(value));
  const headers = new Headers({ Authorization: `Bearer ${token}`, Accept: "application/json" });
  const init = { method, headers, signal: AbortSignal.timeout(15_000) };
  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
    init.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    fail(`Cloudflare ${method} ${path} could not be reached: ${String(error?.message ?? error).slice(0, 200)}.`);
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    fail(`Cloudflare ${method} ${path} returned unreadable JSON (HTTP ${response.status}).`);
  }
  if (!response.ok || payload?.success !== true) {
    fail(`Cloudflare ${method} ${path} failed (HTTP ${response.status}): ${apiErrorMessage(payload)}`);
  }
  return payload;
}

function assertDomain(domain, hostname, zoneId) {
  if (domain?.hostname?.toLowerCase() !== hostname
      || domain?.service !== WORKER_SERVICE
      || domain?.zone_id?.toLowerCase() !== zoneId.toLowerCase()
      || domain?.enabled !== true
      || domain?.previews_enabled !== false
      || typeof domain?.id !== "string"
      || !domain.id
      || typeof domain?.cert_id !== "string"
      || !domain.cert_id) {
    fail("Worker Domain read-back did not match the exact hostname, zone, service, routing, and certificate expectations. Leave the provider state unchanged and reconcile it manually.");
  }
  return domain;
}

async function listDomains(token, accountId, query) {
  const payload = await cloudflareRequest(
    token,
    "GET",
    `/accounts/${encodeURIComponent(accountId)}/workers/domains`,
    { ...query, per_page: 100, page: 1 },
  );
  if (!Array.isArray(payload.result)) fail("Worker Domains API returned an invalid result list.");
  return payload;
}

async function verifyHttps(hostname) {
  const url = `https://${hostname}/_mithrilpress/studio`;
  let lastFailure = "HTTPS endpoint did not become ready.";
  for (let attempt = 0; attempt < 7; attempt += 1) {
    if (attempt > 0) await delay(5_000);
    let response;
    try {
      response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
    } catch (error) {
      lastFailure = `HTTPS request failed: ${String(error?.message ?? error).slice(0, 160)}`;
      continue;
    }
    const contentType = response.headers.get("Content-Type")?.toLowerCase() ?? "";
    const body = response.status === 200 ? await response.text() : "";
    if (response.status === 200
        && contentType.includes("text/html")
        && body.includes("<title>MithrilPress Studio</title>")
        && /<meta\s+name=["']robots["']\s+content=["']noindex, nofollow, noarchive["']/iu.test(body)
        && response.headers.get("X-Content-Type-Options") === "nosniff") {
      return { status: response.status, content_type: contentType, private_studio_shell: true };
    }
    lastFailure = `HTTPS returned ${response.status} with Content-Type ${contentType || "(missing)"}.`;
  }
  fail(`${lastFailure} The Worker Domain was created and was not deleted; rerun without --apply to inspect provider state, then reconcile manually.`);
}

async function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage);
    return;
  }
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token || /[\r\n]/u.test(token)) fail("Set CLOUDFLARE_API_TOKEN in the operator environment.");

  const accountPath = `/accounts/${encodeURIComponent(options.account_id)}`;
  const account = await cloudflareRequest(token, "GET", accountPath);
  if (account.result?.id?.toLowerCase() !== options.account_id.toLowerCase()
      || account.result?.name !== EXPECTED_ACCOUNT_NAME) {
    fail(`The selected account did not read back as ${EXPECTED_ACCOUNT_NAME}. No provider write was made.`);
  }

  const zone = await cloudflareRequest(token, "GET", `/zones/${encodeURIComponent(options.zone_id)}`);
  if (zone.result?.id?.toLowerCase() !== options.zone_id.toLowerCase()
      || zone.result?.name !== EXPECTED_ZONE_NAME
      || zone.result?.account?.id?.toLowerCase() !== options.account_id.toLowerCase()
      || zone.result?.status !== "active") {
    fail(`The selected zone is not the active ${EXPECTED_ZONE_NAME} zone in ${EXPECTED_ACCOUNT_NAME}. No provider write was made.`);
  }

  const scripts = await cloudflareRequest(token, "GET", `${accountPath}/workers/scripts`);
  if (!Array.isArray(scripts.result) || !scripts.result.some((script) => script?.id === WORKER_SERVICE)) {
    fail(`Worker ${WORKER_SERVICE} is not present in ${EXPECTED_ACCOUNT_NAME}. No provider write was made.`);
  }

  const exactDomains = await listDomains(token, options.account_id, {
    zone_id: options.zone_id,
    hostname: options.hostname,
  });
  const matches = exactDomains.result.filter((domain) => domain?.hostname?.toLowerCase() === options.hostname);
  if (matches.length > 1) fail("Cloudflare returned multiple Worker Domains for this exact hostname; operator review is required.");

  let domain;
  let created = false;
  if (matches.length === 1) {
    domain = assertDomain(matches[0], options.hostname, options.zone_id);
  } else {
    const dns = await cloudflareRequest(token, "GET", `/zones/${encodeURIComponent(options.zone_id)}/dns_records`, {
      name: options.hostname,
      per_page: 100,
      page: 1,
    });
    const conflicts = (Array.isArray(dns.result) ? dns.result : [])
      .filter((record) => record?.name?.toLowerCase() === options.hostname);
    if (conflicts.length > 0) {
      fail("An exact-host DNS record already exists. Worker Custom Domains cannot safely replace it; inspect and reconcile the record before retrying.");
    }

    const zoneDomains = await listDomains(token, options.account_id, { zone_id: options.zone_id });
    const total = Number(zoneDomains.result_info?.total_count);
    if (!Number.isSafeInteger(total) || total < zoneDomains.result.length) {
      fail("Cloudflare did not return a reliable zone Worker Domain count; refusing to approach the provider cap.");
    }
    if (total >= MAX_WORKER_DOMAINS_PER_ZONE) {
      fail(`The shared hosting cap is ${MAX_WORKER_DOMAINS_PER_ZONE} Worker Domains in this zone; no new hostname was created.`);
    }

    if (!options.apply) {
      console.log(JSON.stringify({
        plan: "attach_exact_worker_custom_domain",
        account: EXPECTED_ACCOUNT_NAME,
        zone: EXPECTED_ZONE_NAME,
        hostname: options.hostname,
        worker: WORKER_SERVICE,
        existing_zone_worker_domains: total,
        next_zone_worker_domains: total + 1,
        provider_writes: 0,
        command: "rerun with --apply after the tenant exists in the pinned D1 database",
      }, null, 2));
      return;
    }

    const attached = await cloudflareRequest(token, "PUT", `${accountPath}/workers/domains`, undefined, {
      hostname: options.hostname,
      service: WORKER_SERVICE,
      enabled: true,
      previews_enabled: false,
    });
    if (attached.result?.hostname?.toLowerCase() !== options.hostname
        || attached.result?.service !== WORKER_SERVICE
        || typeof attached.result?.id !== "string"
        || !attached.result.id) {
      fail("Worker Domain attach returned an incomplete result. No automatic deletion was attempted; inspect the exact hostname before retrying.");
    }
    created = true;

    const readback = await cloudflareRequest(token, "GET", `${accountPath}/workers/domains/${encodeURIComponent(attached.result.id)}`);
    domain = assertDomain(readback.result, options.hostname, options.zone_id);
  }

  const https = await verifyHttps(options.hostname);
  console.log(JSON.stringify({
    result: created ? "attached_and_verified" : "already_attached_and_verified",
    account: EXPECTED_ACCOUNT_NAME,
    zone: EXPECTED_ZONE_NAME,
    hostname: domain.hostname,
    worker: domain.service,
    worker_domain_id: domain.id,
    certificate_id: domain.cert_id,
    enabled: domain.enabled,
    previews_enabled: domain.previews_enabled,
    https,
    provider_writes: created ? 1 : 0,
  }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`Error: ${String(error?.message ?? error)}`);
    process.exitCode = 1;
  });
}
