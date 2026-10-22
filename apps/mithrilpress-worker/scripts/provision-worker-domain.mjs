import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { instantiateMithrilNative } from "../src/platform_hostname.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apiRoot = "https://api.cloudflare.com/client/v4/";
const platformZone = "mithril.love";
const { siteHostname } = instantiateMithrilNative({});

const usage = `Attach, inspect, or detach one MithrilPress default hostname.

Usage:
  node scripts/provision-worker-domain.mjs <attach|status|detach> \\
    --config <production-wrangler.jsonc> --zone-id <mithril.love-zone-id> \\
    --hostname <label>.sites.mithril.love \\
    [--apply --confirm-hostname <same-hostname> --confirm-publication <same-hostname>]

The default action is read-only. Attach and detach require --apply and an exact
--confirm-hostname. Attach also requires --confirm-publication to acknowledge
the site owner's approval for public routing. The Wrangler config supplies the
account ID and Worker service name. CLOUDFLARE_API_TOKEN must be present in the
environment; it is never read from a command-line argument or printed.

Custom Domains create DNS records and certificates through Cloudflare. This
command does not create wildcard DNS or wildcard Worker routes.`;

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

  let withoutTrailingCommas = "";
  inString = false;
  escaped = false;
  for (let index = 0; index < output.length; index += 1) {
    const char = output[index];
    if (inString) {
      withoutTrailingCommas += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      withoutTrailingCommas += char;
    } else if (char === ",") {
      let next = index + 1;
      while (/\s/u.test(output[next] ?? "")) next += 1;
      if (output[next] !== "}" && output[next] !== "]") withoutTrailingCommas += char;
    } else withoutTrailingCommas += char;
  }
  return withoutTrailingCommas;
}

function parseArgs(argv) {
  const action = argv[0];
  if (action === "--help" || action === "-h") return { help: true };
  if (!["attach", "status", "detach"].includes(action)) fail(`Choose attach, status, or detach.\n\n${usage}`);
  const values = new Map();
  let apply = false;
  const known = new Set(["--config", "--zone-id", "--hostname", "--confirm-hostname", "--confirm-publication"]);
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
  const options = Object.fromEntries([...values].map(([key, value]) => [key.slice(2).replaceAll("-", "_"), value]));
  for (const required of ["config", "zone_id", "hostname"]) {
    if (!options[required]) fail(`Missing --${required.replaceAll("_", "-")}\n\n${usage}`);
  }
  if (apply && options.confirm_hostname !== options.hostname) {
    fail("Provider changes require --confirm-hostname to exactly match --hostname.");
  }
  if (action === "attach" && apply && options.confirm_publication !== options.hostname) {
    fail("Attaching a public hostname requires --confirm-publication to exactly match --hostname after owner approval.");
  }
  if (!apply && (options.confirm_hostname || options.confirm_publication)) {
    fail("Confirmation options are only valid with --apply.");
  }
  if (options.confirm_publication && action !== "attach") {
    fail("--confirm-publication is only valid with attach.");
  }
  if (action === "status" && apply) fail("The status action is read-only and does not accept --apply.");
  return { ...options, action, apply };
}

function readWorkerConfig(configPath) {
  let config;
  try {
    config = JSON.parse(stripJsonComments(readFileSync(configPath, "utf8")));
  } catch (error) {
    fail(`Cannot parse Wrangler config ${configPath}: ${error.message}`);
  }
  if (typeof config.name !== "string" || !/^[a-z0-9][a-z0-9-]{0,62}$/u.test(config.name)) {
    fail("Wrangler config must declare a valid Worker name.");
  }
  if (typeof config.account_id !== "string" || !/^[a-f0-9]{32}$/iu.test(config.account_id)
      || /^0{32}$/u.test(config.account_id)) {
    fail("Wrangler config must declare the exact non-placeholder account_id.");
  }
  if (config.workers_dev !== false) fail("Production Wrangler config must explicitly set workers_dev to false.");
  return { accountId: config.account_id.toLowerCase(), service: config.name };
}

function validateOptions(options) {
  const hostname = siteHostname(options.hostname);
  if (!hostname || hostname !== options.hostname) {
    fail("--hostname must be a canonical lowercase, single-label hostname under .sites.mithril.love.");
  }
  if (!/^[a-f0-9]{32}$/iu.test(options.zone_id) || /^0{32}$/u.test(options.zone_id)) {
    fail("--zone-id must be the exact non-placeholder zone ID for mithril.love.");
  }
  return { ...options, zone_id: options.zone_id.toLowerCase(), hostname };
}

function requireApiToken() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (typeof token !== "string" || token.length < 20 || token.length > 512 || /[\r\n]/u.test(token)) {
    fail("Set CLOUDFLARE_API_TOKEN in the operator environment; the CLI never accepts or prints it.");
  }
  return token;
}

async function cloudflareRequest(token, method, path, query = {}, body) {
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
  if (!response.ok || payload.success !== true) {
    const details = Array.isArray(payload.errors)
      ? payload.errors.map((item) => `${item.code ?? "?"}: ${item.message ?? "Cloudflare API error"}`).join("; ")
      : "Cloudflare API request failed";
    fail(`Cloudflare API ${method} ${url.pathname} returned HTTP ${response.status}: ${details}`);
  }
  return payload;
}

async function verifyZone(token, accountId, zoneId) {
  const { result: zone } = await cloudflareRequest(token, "GET", `/zones/${zoneId}`);
  if (zone.id !== zoneId || zone.account?.id?.toLowerCase() !== accountId || zone.name !== platformZone || zone.status !== "active") {
    fail("The selected zone must be active mithril.love in the account named by the Wrangler config.");
  }
  return zone;
}

async function listWorkerDomains(token, accountId, zoneId, hostname) {
  const { result } = await cloudflareRequest(token, "GET", `/accounts/${accountId}/workers/domains`, {
    zone_id: zoneId,
    hostname,
  });
  if (!Array.isArray(result)) fail("Cloudflare returned an invalid Worker Domains list.");
  return result.filter((domain) => domain.hostname?.toLowerCase() === hostname && domain.zone_id?.toLowerCase() === zoneId);
}

async function listDnsRecords(token, zoneId, hostname) {
  const { result } = await cloudflareRequest(token, "GET", `/zones/${zoneId}/dns_records`, { "name.exact": hostname });
  if (!Array.isArray(result)) fail("Cloudflare returned an invalid DNS record list.");
  return result.filter((record) => record.name?.toLowerCase() === hostname);
}

function summarizeDomain(domain) {
  return {
    id: domain.id,
    hostname: domain.hostname,
    service: domain.service,
    zone_id: domain.zone_id,
    enabled: domain.enabled,
    previews_enabled: domain.previews_enabled,
    cert_id: domain.cert_id,
  };
}

function summarizeDns(records) {
  return records.map((record) => ({
    id: record.id,
    type: record.type,
    name: record.name,
    proxied: record.proxied,
  }));
}

function assertDomainBelongsToService(domain, service, hostname, zoneId) {
  if (domain.hostname?.toLowerCase() !== hostname
      || domain.zone_id?.toLowerCase() !== zoneId
      || domain.service !== service) {
    fail("The hostname is already attached to a different Worker or zone; no provider change was made.");
  }
}

async function run(options, worker) {
  const token = requireApiToken();
  await verifyZone(token, worker.accountId, options.zone_id);
  const domains = await listWorkerDomains(token, worker.accountId, options.zone_id, options.hostname);
  if (domains.length > 1) fail("Cloudflare returned multiple Worker Domains for the same exact hostname.");
  const domain = domains[0] ?? null;
  const dnsRecords = await listDnsRecords(token, options.zone_id, options.hostname);

  if (options.action === "status") {
    process.stdout.write(`${JSON.stringify({
      action: "status",
      account_id: worker.accountId,
      service: worker.service,
      hostname: options.hostname,
      domain: domain ? summarizeDomain(domain) : null,
      dns_records: summarizeDns(dnsRecords),
    }, null, 2)}\n`);
    return;
  }

  if (options.action === "attach") {
    if (domain) {
      assertDomainBelongsToService(domain, worker.service, options.hostname, options.zone_id);
      if (domain.enabled !== true || domain.previews_enabled !== false) {
        fail("The exact Worker Domain exists but is not in the expected enabled, non-preview state; no provider change was made.");
      }
      process.stdout.write(`${JSON.stringify({
        action: "attach",
        status: "already_attached",
        domain: summarizeDomain(domain),
        dns_records: summarizeDns(dnsRecords),
      }, null, 2)}\n`);
      return;
    }
    if (dnsRecords.length > 0) fail("DNS records already exist for this hostname; inspect them before attaching a Worker Domain.");
    if (!options.apply) {
      process.stdout.write(`${JSON.stringify({
        action: "attach",
        status: "planned",
        account_id: worker.accountId,
        zone_id: options.zone_id,
        service: worker.service,
        hostname: options.hostname,
        attaches_exact_host_and_routes_all_paths_to_worker: true,
        requires_owner_approved_publication: true,
        requires_exact_confirmation: true,
      }, null, 2)}\n`);
      return;
    }
    await cloudflareRequest(token, "PUT", `/accounts/${worker.accountId}/workers/domains`, {}, {
      hostname: options.hostname,
      service: worker.service,
      zone_id: options.zone_id,
      enabled: true,
      previews_enabled: false,
    });
    const readback = await listWorkerDomains(token, worker.accountId, options.zone_id, options.hostname);
    if (readback.length !== 1) fail("Attach completed but exact Worker Domain read-back did not return one record; inspect Cloudflare before retrying.");
    assertDomainBelongsToService(readback[0], worker.service, options.hostname, options.zone_id);
    if (readback[0].enabled !== true || readback[0].previews_enabled !== false) {
      fail("Attach completed but the Worker Domain read-back is not enabled in the expected non-preview state.");
    }
    const dnsReadback = await listDnsRecords(token, options.zone_id, options.hostname);
    process.stdout.write(`${JSON.stringify({
      action: "attach",
      status: dnsReadback.length > 0 && dnsReadback.every((record) => record.proxied === true)
        ? "attached_provider_readback_ok"
        : "attached_dns_or_tls_pending",
      domain: summarizeDomain(readback[0]),
      dns_records: summarizeDns(dnsReadback),
      next_step: "This exact hostname now routes all paths to the Worker. Verify owner approval, public DNS, and HTTPS before sharing it.",
    }, null, 2)}\n`);
    return;
  }

  if (!domain) {
    process.stdout.write(`${JSON.stringify({ action: "detach", status: "already_detached", dns_records: summarizeDns(dnsRecords) }, null, 2)}\n`);
    return;
  }
  assertDomainBelongsToService(domain, worker.service, options.hostname, options.zone_id);
  if (!options.apply) {
    process.stdout.write(`${JSON.stringify({
      action: "detach",
      status: "planned",
      domain: summarizeDomain(domain),
      dns_records: summarizeDns(dnsRecords),
      requires_exact_confirmation: true,
    }, null, 2)}\n`);
    return;
  }
  await cloudflareRequest(token, "DELETE", `/accounts/${worker.accountId}/workers/domains/${encodeURIComponent(domain.id)}`);
  const readback = await listWorkerDomains(token, worker.accountId, options.zone_id, options.hostname);
  if (readback.length !== 0) fail("Detach completed but the Worker Domain still appears in read-back; keep the site suspended and inspect Cloudflare.");
  const dnsReadback = await listDnsRecords(token, options.zone_id, options.hostname);
  process.stdout.write(`${JSON.stringify({
    action: "detach",
    status: dnsReadback.length === 0 ? "detached_readback_ok" : "detached_dns_records_remain",
    hostname: options.hostname,
    dns_records: summarizeDns(dnsReadback),
    next_step: dnsReadback.length === 0
      ? "Confirm HTTPS no longer serves MithrilPress content."
      : "The Worker Domain is detached. Review remaining DNS records manually; this command does not delete DNS records.",
  }, null, 2)}\n`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage}\n`);
    return;
  }
  const validated = validateOptions(options);
  const configPath = resolve(packageRoot, validated.config);
  const worker = readWorkerConfig(configPath);
  await run(validated, worker);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
