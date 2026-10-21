import { OWNER_TOKEN_SCOPES, createOwnerToken } from "./owner-token.mjs";

const [ownerLabel, ...requestedScopes] = process.argv.slice(2);
if (!ownerLabel || ownerLabel.length > 120 || requestedScopes.length === 0) {
  process.stderr.write("Usage: node scripts/create-owner-token.mjs <owner-label> <scope> [<scope> ...]\n");
  process.exitCode = 2;
} else if (requestedScopes.some((scope) => !OWNER_TOKEN_SCOPES.includes(scope))) {
  process.stderr.write(`Allowed scopes: ${OWNER_TOKEN_SCOPES.join(", ")}\n`);
  process.exitCode = 2;
} else {
  try {
    process.stdout.write(`${JSON.stringify(createOwnerToken(ownerLabel, requestedScopes), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
