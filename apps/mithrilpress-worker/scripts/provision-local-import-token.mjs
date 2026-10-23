import { createHash } from "node:crypto";
import { accessSync, constants as fsConstants } from "node:fs";
import { lstat, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const exampleConfig = join(packageRoot, "wrangler.example.jsonc");
const usage = `Add an import-only token to the local MithrilPress D1 database.

Usage:
  node scripts/provision-local-import-token.mjs --site-id <uuid> --token-json <private-json-file>

The command is local-only, accepts only wrangler.example.jsonc and the
mithrilpress D1 binding, and prints no bearer token or secret hash.
`;

function fail(message) {
  throw new Error(message);
}

function parseArgs(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (key === "--help" || key === "-h") return { help: true };
    if (!["--site-id", "--token-json"].includes(key) || values.has(key)
        || !args[index + 1] || args[index + 1].startsWith("--")) fail(`Invalid argument: ${key ?? "<missing>"}`);
    values.set(key, args[index + 1]);
    index += 1;
  }
  if (!values.has("--site-id") || !values.has("--token-json")) fail(usage);
  const siteId = values.get("--site-id");
  if (!/^[a-f0-9-]{36}$/i.test(siteId)) fail("--site-id must be a UUID.");
  return { siteId, tokenJsonPath: resolve(values.get("--token-json")) };
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
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
    if (Object.hasOwn(value, "site_id")) rows.push(value);
    for (const item of Object.values(value)) visit(item);
  }
  visit(json);
  return rows;
}

function runLocalD1(sql) {
  const executable = join(packageRoot, "node_modules", ".bin", process.platform === "win32" ? "wrangler.cmd" : "wrangler");
  try {
    accessSync(executable, fsConstants.X_OK);
  } catch {
    fail("Wrangler is not installed in this package. Run npm ci first.");
  }
  const result = spawnSync(executable, [
    "d1", "execute", "mithrilpress", "--config", exampleConfig,
    "--local", "--json", "--command", sql,
  ], { cwd: packageRoot, encoding: "utf8", maxBuffer: 1024 * 1024, windowsHide: true });
  let json = null;
  if (result.stdout?.trim()) {
    try {
      json = JSON.parse(result.stdout);
    } catch {
      // Read-back remains authoritative; do not print raw token material.
    }
  }
  return { ok: result.status === 0, json, stderr: result.stderr?.trim() ?? "", error: result.error };
}

async function readTokenEnvelope(path) {
  const info = await lstat(path);
  if (info.isSymbolicLink() || !info.isFile() || (info.mode & 0o077) !== 0) {
    fail("The token JSON must be a private regular file outside the repository.");
  }
  let token;
  try {
    token = JSON.parse(await readFile(path, "utf8"));
  } catch {
    fail("The private token JSON is invalid.");
  }
  const scopes = JSON.parse(token.scopes_json ?? "null");
  const match = typeof token.token === "string" && /^([a-f0-9]{24})\.([A-Za-z0-9_-]{43})$/.exec(token.token);
  const expectedHash = match
    ? createHash("sha256").update(`${token.salt_hex}.${match[2]}`).digest("hex")
    : null;
  if (!match || token.token_id !== match[1]
      || !/^[a-f0-9]{32}$/.test(token.salt_hex ?? "")
      || token.secret_hash_hex !== expectedHash
      || !Array.isArray(scopes)
      || scopes.length !== 2
      || !scopes.includes("content:import")
      || !scopes.includes("media:write")
      || typeof token.owner_label !== "string"
      || typeof token.created_at !== "string"
      || typeof token.expires_at !== "string") {
    fail("The token JSON must contain exactly content:import and media:write scopes and a matching salted hash.");
  }
  return { tokenId: token.token_id, ownerLabel: token.owner_label, saltHex: token.salt_hex,
    secretHashHex: token.secret_hash_hex, scopesJson: token.scopes_json,
    createdAt: token.created_at, expiresAt: token.expires_at };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage);
    return;
  }
  const token = await readTokenEnvelope(options.tokenJsonPath);
  const insertSql = `INSERT INTO tenant_owner_tokens (site_id, token_id, owner_label, salt_hex, secret_hash_hex, scopes_json, created_at, expires_at) SELECT ${sqlString(options.siteId)}, ${sqlString(token.tokenId)}, ${sqlString(token.ownerLabel)}, ${sqlString(token.saltHex)}, ${sqlString(token.secretHashHex)}, ${sqlString(token.scopesJson)}, ${sqlString(token.createdAt)}, ${sqlString(token.expiresAt)} WHERE EXISTS (SELECT 1 FROM sites WHERE id = ${sqlString(options.siteId)} AND status = 'active');`;
  const inserted = runLocalD1(insertSql);
  if (inserted.error || !inserted.ok) fail("The local D1 insert failed. Sensitive SQL details were suppressed.");
  const readback = runLocalD1(`SELECT site_id, token_id, owner_label, salt_hex, secret_hash_hex, scopes_json, expires_at, revoked_at FROM tenant_owner_tokens WHERE site_id = ${sqlString(options.siteId)} AND token_id = ${sqlString(token.tokenId)} LIMIT 1;`);
  const row = collectRows(readback.json).find((value) => value.site_id === options.siteId && value.token_id === token.tokenId);
  const verified = readback.ok && row
    && row.owner_label === token.ownerLabel
    && row.salt_hex === token.saltHex
    && row.secret_hash_hex === token.secretHashHex
    && row.scopes_json === token.scopesJson
    && row.expires_at === token.expiresAt
    && row.revoked_at === null;
  if (!verified) fail("The token row was not verified in local D1. Sensitive SQL details were suppressed.");
  process.stdout.write(`${JSON.stringify({
    site_id: options.siteId,
    token_id: token.tokenId,
    scopes: JSON.parse(token.scopesJson),
    expires_at: token.expiresAt,
    target: "local",
    status: "verified",
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
