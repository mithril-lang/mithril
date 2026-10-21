import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { accessSync, constants as fsConstants, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { instantiateMithrilNative } from "../src/platform_hostname.js";
import { createOwnerToken } from "./owner-token.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { siteHostname } = instantiateMithrilNative({});
const CHAT_STUDIO_SCOPES = Object.freeze([
  "content:write",
  "media:write",
  "revision:preview",
  "revision:approve",
  "site:publish",
]);

const usage = `Provision a MithrilPress tenant and its first chat-first owner token.

Required:
  --target local|remote
  --config <wrangler-config.jsonc>
  --database <database-name>
  --hostname <label>.sites.mithril.love
  --owner-label <label>

Remote writes also require:
  --wrangler-profile <dedicated-operator-profile>
  --confirm-hostname <same exact hostname>

Optional:
  --source-origin <owner-approved https://wordpress.example origin>
  --help

Examples:
  node scripts/provision-site.mjs --target local --config wrangler.example.jsonc \\
    --database mithrilpress --hostname studio-demo.sites.mithril.love --owner-label "Demo owner"
  node scripts/provision-site.mjs --target remote --config wrangler.production.jsonc \\
    --database mithrilpress --hostname studio-demo.sites.mithril.love \\
    --owner-label "Demo owner" --wrangler-profile mithrilpress-provision \\
    --confirm-hostname studio-demo.sites.mithril.love

Remote mode writes only to the configured D1 database. It does not deploy a Worker,
create DNS records, or change a Cloudflare route.`;

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const values = new Map();
  const known = new Set([
    "--target", "--config", "--database", "--hostname", "--owner-label",
    "--confirm-hostname", "--source-origin", "--wrangler-profile",
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--help" || flag === "-h") return { help: true };
    if (!known.has(flag)) fail(`Unknown option: ${flag}\n\n${usage}`);
    if (values.has(flag)) fail(`Option may only be used once: ${flag}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail(`Missing value for ${flag}`);
    values.set(flag, value);
    index += 1;
  }
  const options = Object.fromEntries([...values].map(([key, value]) => [key.slice(2).replaceAll("-", "_"), value]));
  for (const required of ["target", "config", "database", "hostname", "owner_label"]) {
    if (!options[required]) fail(`Missing --${required.replaceAll("_", "-")}\n\n${usage}`);
  }
  if (options.target !== "local" && options.target !== "remote") fail("--target must be local or remote.");
  if (options.target === "remote" && options.confirm_hostname !== options.hostname) {
    fail("Remote provisioning requires --confirm-hostname to exactly match --hostname.");
  }
  if (options.target === "remote" && !options.wrangler_profile) {
    fail("Remote provisioning requires a dedicated --wrangler-profile.");
  }
  if (options.target === "local" && options.wrangler_profile) {
    fail("--wrangler-profile is only valid with --target remote.");
  }
  if (options.target === "local" && options.confirm_hostname) fail("--confirm-hostname is only valid with --target remote.");
  if (options.wrangler_profile && /[\u0000-\u001f\u007f]/u.test(options.wrangler_profile)) {
    fail("--wrangler-profile must not contain control characters.");
  }
  return options;
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
        if (source[index] === "\n" || source[index] === "\r") output += source[index];
        else output += " ";
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

function parseWranglerConfig(configPath) {
  let parsed;
  try {
    parsed = JSON.parse(stripJsonComments(readFileSync(configPath, "utf8")));
  } catch (error) {
    fail(`Cannot parse Wrangler config ${configPath}: ${error.message}`);
  }
  if (!Array.isArray(parsed.d1_databases)) fail("Wrangler config must declare a top-level d1_databases binding.");
  return parsed;
}

function assertDatabaseConfig(configPath, databaseName, target) {
  const config = parseWranglerConfig(configPath);
  const binding = config.d1_databases.find((item) => item.database_name === databaseName);
  if (!binding) fail(`Wrangler config does not declare D1 database_name ${databaseName}.`);
  if (typeof binding.database_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(binding.database_id)) {
    fail(`Wrangler config has no valid database_id for ${databaseName}.`);
  }
  if (target === "remote" && /^0{8}-0{4}-0{4}-0{4}-0{12}$/u.test(binding.database_id)) {
    fail("Remote provisioning refuses the all-zero example D1 database_id.");
  }
  if (target === "remote" && (typeof config.account_id !== "string"
      || !/^[0-9a-f]{32}$/iu.test(config.account_id)
      || /^0{32}$/u.test(config.account_id))) {
    fail("Remote provisioning requires the intended non-placeholder account_id in the Wrangler config.");
  }
}

function normalizeHostname(input) {
  const admitted = siteHostname(input);
  if (!admitted || admitted !== input) {
    fail("--hostname must be a canonical lowercase, single-label hostname under .sites.mithril.love.");
  }
  return admitted;
}

function validateSourceOrigin(input) {
  if (!input) return null;
  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    fail("--source-origin must be an HTTPS origin such as https://wordpress.example.");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password
      || parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.origin !== input) {
    fail("--source-origin must be a bare HTTPS origin without credentials, path, query, or fragment.");
  }
  return parsed.origin;
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function wranglerPath() {
  const path = join(packageRoot, "node_modules", ".bin", process.platform === "win32" ? "wrangler.cmd" : "wrangler");
  try {
    accessSync(path, fsConstants.X_OK);
  } catch {
    fail("Wrangler is not installed in this package. Run npm ci in apps/mithrilpress-worker first.");
  }
  return path;
}

function runD1({ executable, database, config, target, profile, sql }) {
  const args = ["d1", "execute", database, "--config", config, `--${target}`, "--json"];
  if (profile) args.push("--profile", profile);
  args.push("--command", sql);
  if (target === "remote") args.push("--yes");
  const result = spawnSync(executable, args, {
    cwd: packageRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
  let json = null;
  if (result.stdout?.trim()) {
    try {
      json = JSON.parse(result.stdout);
    } catch {
      // A later read-back is the authority; preserve output only for diagnostics.
    }
  }
  return {
    ok: result.status === 0,
    json,
    stderr: result.stderr?.trim() ?? "",
    error: result.error,
  };
}

function collectRows(json) {
  const rows = [];
  const visited = new Set();
  function visit(value) {
    if (!value || typeof value !== "object" || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (Object.hasOwn(value, "site_id") || Object.hasOwn(value, "existing_site_id")) rows.push(value);
    for (const item of Object.values(value)) visit(item);
  }
  visit(json);
  return rows;
}

function d1Request(options, sql, action) {
  const result = runD1({ ...options, sql });
  if (result.error) fail(`Wrangler could not start while ${action}: ${result.error.message}`);
  return result;
}

function rowBySite(rows, siteId) {
  return rows.find((row) => row.site_id === siteId);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage}\n`);
    return;
  }
  const hostname = normalizeHostname(options.hostname);
  const sourceOrigin = validateSourceOrigin(options.source_origin);
  if (options.owner_label.trim() !== options.owner_label || /[\u0000-\u001f\u007f]/u.test(options.owner_label)) {
    fail("--owner-label must not contain leading/trailing whitespace or control characters.");
  }
  const config = resolve(options.config);
  assertDatabaseConfig(config, options.database, options.target);
  const executable = wranglerPath();
  const d1 = {
    executable,
    database: options.database,
    config,
    target: options.target,
    profile: options.wrangler_profile,
  };

  const existing = d1Request(d1,
    `SELECT id AS existing_site_id FROM sites WHERE hostname = ${sqlString(hostname)} LIMIT 1;`,
    "checking the requested hostname");
  const existingRow = collectRows(existing.json).find((row) => typeof row.existing_site_id === "string");
  if (existingRow) fail(`Hostname ${hostname} is already registered. No token was created.`);
  if (!existing.ok) fail(`Could not confirm that ${hostname} is unused. No provisioning was attempted.${existing.stderr ? ` ${existing.stderr}` : ""}`);

  const siteId = randomUUID();
  const token = createOwnerToken(options.owner_label, CHAT_STUDIO_SCOPES);
  const createdAt = token.created_at;
  const insertSql = [
    `INSERT INTO sites (id, hostname, source_origin, status, created_at) VALUES (${sqlString(siteId)}, ${sqlString(hostname)}, ${sourceOrigin === null ? "NULL" : sqlString(sourceOrigin)}, 'active', ${sqlString(createdAt)}) ON CONFLICT(hostname) DO NOTHING;`,
    `INSERT INTO tenant_owner_tokens (site_id, token_id, owner_label, salt_hex, secret_hash_hex, scopes_json, created_at, expires_at) SELECT ${sqlString(siteId)}, ${sqlString(token.token_id)}, ${sqlString(token.owner_label)}, ${sqlString(token.salt_hex)}, ${sqlString(token.secret_hash_hex)}, ${sqlString(token.scopes_json)}, ${sqlString(token.created_at)}, ${sqlString(token.expires_at)} WHERE EXISTS (SELECT 1 FROM sites WHERE id = ${sqlString(siteId)} AND hostname = ${sqlString(hostname)});`,
  ].join("\n");
  const insertResult = d1Request(d1, insertSql, "creating the tenant");

  const readback = d1Request(d1,
    `SELECT s.id AS site_id, s.hostname, s.source_origin, t.token_id, t.owner_label, t.salt_hex, t.secret_hash_hex, t.scopes_json, t.expires_at FROM sites s JOIN tenant_owner_tokens t ON t.site_id = s.id WHERE s.id = ${sqlString(siteId)} AND s.hostname = ${sqlString(hostname)} AND t.token_id = ${sqlString(token.token_id)} AND t.revoked_at IS NULL LIMIT 1;`,
    "verifying the tenant and owner token");
  const row = rowBySite(collectRows(readback.json), siteId);
  const verified = readback.ok && row
    && row.hostname === hostname
    && row.source_origin === sourceOrigin
    && row.token_id === token.token_id
    && row.owner_label === token.owner_label
    && row.salt_hex === token.salt_hex
    && row.secret_hash_hex === token.secret_hash_hex
    && row.scopes_json === token.scopes_json
    && row.expires_at === token.expires_at;
  if (!verified) {
    const cleanup = d1Request(d1,
      `DELETE FROM tenant_owner_tokens WHERE site_id = ${sqlString(siteId)} AND token_id = ${sqlString(token.token_id)} AND secret_hash_hex = ${sqlString(token.secret_hash_hex)}; DELETE FROM sites WHERE id = ${sqlString(siteId)} AND hostname = ${sqlString(hostname)} AND current_revision_id IS NULL AND NOT EXISTS (SELECT 1 FROM tenant_owner_tokens WHERE site_id = ${sqlString(siteId)}) AND NOT EXISTS (SELECT 1 FROM site_revisions WHERE site_id = ${sqlString(siteId)});`,
      "cleaning up an incomplete tenant record");
    const details = [insertResult.stderr, readback.stderr, cleanup.stderr].filter(Boolean).join(" ");
    fail(`Provisioning did not pass read-back; no owner token was returned. A newly inserted empty site row was removed when safe. Reconcile ${hostname} in D1 before retrying.${details ? ` ${details}` : ""}`);
  }

  process.stdout.write(`${JSON.stringify({
    site_id: siteId,
    hostname,
    source_origin: sourceOrigin,
    owner_label: token.owner_label,
    owner_token: token.token,
    token_expires_at: token.expires_at,
    scopes: CHAT_STUDIO_SCOPES,
    target: options.target,
    status: "active",
    note: "Store owner_token in the owner's secret manager now. It is shown once; only its salted hash is stored in D1.",
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
