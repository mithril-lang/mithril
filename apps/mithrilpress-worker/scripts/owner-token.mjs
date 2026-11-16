import { createHash, randomBytes } from "node:crypto";

export const OWNER_TOKEN_SCOPES = Object.freeze([
  "content:import",
  "content:write",
  "media:write",
  "revision:preview",
  "revision:approve",
  "site:publish",
  "site:domains",
  "site:dns-migrate",
]);

export function createOwnerToken(ownerLabel, requestedScopes, now = new Date()) {
  if (typeof ownerLabel !== "string" || ownerLabel.trim() !== ownerLabel
      || ownerLabel.trim().length === 0 || ownerLabel.length > 120
      || /[\u0000-\u001f\u007f]/u.test(ownerLabel)) {
    throw new TypeError("Owner label must be 1 to 120 characters without control characters.");
  }
  if (!Array.isArray(requestedScopes) || requestedScopes.length === 0
      || requestedScopes.some((scope) => !OWNER_TOKEN_SCOPES.includes(scope))) {
    throw new TypeError(`Scopes must be selected from: ${OWNER_TOKEN_SCOPES.join(", ")}.`);
  }

  const scopes = [...new Set(requestedScopes)];
  const tokenId = randomBytes(12).toString("hex");
  const secret = randomBytes(32).toString("base64url");
  const saltHex = randomBytes(16).toString("hex");
  const secretHashHex = createHash("sha256").update(`${saltHex}.${secret}`).digest("hex");
  const createdAt = new Date(now);

  return {
    token: `${tokenId}.${secret}`,
    token_id: tokenId,
    owner_label: ownerLabel,
    salt_hex: saltHex,
    secret_hash_hex: secretHashHex,
    scopes_json: JSON.stringify(scopes),
    created_at: createdAt.toISOString(),
    expires_at: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  };
}
