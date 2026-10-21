import { createHash, randomBytes } from "node:crypto";

const scopesAllowed = new Set([
  "content:import",
  "content:write",
  "revision:preview",
  "revision:approve",
  "site:publish",
  "site:domains",
  "site:dns-migrate",
]);

const [ownerLabel, ...requestedScopes] = process.argv.slice(2);
if (!ownerLabel || ownerLabel.length > 120 || requestedScopes.length === 0) {
  process.stderr.write("Usage: node scripts/create-owner-token.mjs <owner-label> <scope> [<scope> ...]\n");
  process.exitCode = 2;
} else if (requestedScopes.some((scope) => !scopesAllowed.has(scope))) {
  process.stderr.write(`Allowed scopes: ${[...scopesAllowed].join(", ")}\n`);
  process.exitCode = 2;
} else {
  const tokenId = randomBytes(12).toString("hex");
  const secret = randomBytes(32).toString("base64url");
  const saltHex = randomBytes(16).toString("hex");
  const secretHashHex = createHash("sha256").update(`${saltHex}.${secret}`).digest("hex");
  const createdAt = new Date();
  process.stdout.write(`${JSON.stringify({
    token: `${tokenId}.${secret}`,
    token_id: tokenId,
    owner_label: ownerLabel,
    salt_hex: saltHex,
    secret_hash_hex: secretHashHex,
    scopes_json: JSON.stringify([...new Set(requestedScopes)]),
    created_at: createdAt.toISOString(),
    expires_at: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  }, null, 2)}\n`);
}
