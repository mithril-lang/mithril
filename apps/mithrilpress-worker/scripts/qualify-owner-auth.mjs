import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, request as httpRequest } from "node:http";

const root = new URL("../", import.meta.url).pathname;
const wrangler = join(root, "node_modules/.bin/wrangler");
const config = join(root, "wrangler.example.jsonc");
const testHostname = "integration.sites.mithril.love";
const secondHostname = "other-integration.sites.mithril.love";
const siteId = randomUUID();
const secondSiteId = randomUUID();
const createdAt = new Date().toISOString();
const sourceOrigin = "https://wordpress.example";
const wxr = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:wp="http://wordpress.org/export/1.2/">
  <channel><title>Integration fixture</title><link>${sourceOrigin}</link><wp:wxr_version>1.2</wp:wxr_version>
    <item><title>Private migration preview</title><link>${sourceOrigin}/private-migration-preview/</link>
      <wp:post_id>9001</wp:post_id><wp:post_type>post</wp:post_type><wp:status>publish</wp:status>
      <wp:post_name>private-migration-preview</wp:post_name>
      <content:encoded><![CDATA[<p>Local authorization qualification fixture.</p>
        <!-- wp:image {"id":9002} -->
        <figure><img class="wp-image-9002" src="https://wordpress.example/uploads/hero.png" alt="Owner image"></figure>
        <!-- /wp:image -->
        <p><img class="wp-image-9999" src="https://wordpress.example/uploads/unmapped.png"></p>
        <!-- wp:latest-posts /-->
        <!-- wp:sample/plugin-card {"id":17} /-->
      ]]></content:encoded>
    </item>
  </channel>
</rss>`;

function cleanEnvironment() {
  const env = { ...process.env, WRANGLER_SEND_METRICS: "false", WRANGLER_DISABLE_UPDATE_CHECK: "true" };
  for (const key of Object.keys(env)) {
    if (/^(CLOUDFLARE_(API_TOKEN|API_KEY)|CF_API_TOKEN|CLOUDFLARE_ACCOUNT_ID)$/.test(key)) delete env[key];
  }
  return env;
}

function runWrangler(args, cwd = root) {
  const result = spawnSync(wrangler, args, {
    cwd,
    env: cleanEnvironment(),
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`Local Wrangler command failed (${args[0]}): ${result.error?.message ?? result.stderr ?? `exit ${result.status}`}`);
  }
  return result.stdout;
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function makeToken(ownerLabel, scopes) {
  const result = spawnSync(process.execPath, [join(root, "scripts/create-owner-token.mjs"), ownerLabel, ...scopes], {
    cwd: root,
    env: cleanEnvironment(),
    encoding: "utf8",
    timeout: 10_000,
  });
  if (result.error || result.status !== 0) throw new Error("Could not create an ephemeral owner token fixture.");
  return JSON.parse(result.stdout);
}

function request(port, method, pathname, { hostname = testHostname, token, body, contentType, headers: extraHeaders = {} } = {}) {
  return new Promise((resolve, reject) => {
    const headers = { host: hostname, connection: "close", ...extraHeaders };
    if (token) headers.authorization = `Bearer ${token}`;
    if (contentType) headers["content-type"] = contentType;
    if (body !== undefined) headers["content-length"] = typeof body === "string" ? Buffer.byteLength(body) : body.byteLength;
    const req = httpRequest({ hostname: "127.0.0.1", port, method, path: pathname, headers, timeout: 5_000 }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    req.on("timeout", () => req.destroy(new Error("Local Worker request timed out.")));
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

function png(width = 1, height = 1) {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  bytes.set([73, 72, 68, 82], 12);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

const tempBase = process.env.MITHRILPRESS_QUALIFICATION_TMP
  ?? (process.platform === "darwin" ? "/Volumes/MithrilWork/scratch" : tmpdir());
await access(tempBase);
const tempRoot = await mkdtemp(join(tempBase, "mithrilpress-owner-auth-"));
const persistPath = join(tempRoot, "wrangler-state");
const siteToken = makeToken("MithrilPress local integration", ["content:import", "revision:preview", "media:write"]);
const otherSiteToken = makeToken("MithrilPress cross-tenant integration", ["content:import", "revision:preview"]);
let worker;

try {
  runWrangler([
    "d1", "migrations", "apply", "mithrilpress", "--local", "--persist-to", persistPath, "--config", config,
  ]);

  const seed = [
    `INSERT INTO sites (id, hostname, source_origin, status, created_at) VALUES (${sqlText(siteId)}, ${sqlText(testHostname)}, ${sqlText(sourceOrigin)}, 'active', ${sqlText(createdAt)});`,
    `INSERT INTO sites (id, hostname, source_origin, status, created_at) VALUES (${sqlText(secondSiteId)}, ${sqlText(secondHostname)}, ${sqlText(sourceOrigin)}, 'active', ${sqlText(createdAt)});`,
    ...[
      [siteId, siteToken],
      [secondSiteId, otherSiteToken],
    ].map(([id, token]) => `INSERT INTO tenant_owner_tokens (site_id, token_id, owner_label, salt_hex, secret_hash_hex, scopes_json, created_at, expires_at) VALUES (${sqlText(id)}, ${sqlText(token.token_id)}, ${sqlText(token.owner_label)}, ${sqlText(token.salt_hex)}, ${sqlText(token.secret_hash_hex)}, ${sqlText(token.scopes_json)}, ${sqlText(token.created_at)}, ${sqlText(token.expires_at)});`),
  ].join("\n");
  runWrangler([
    "d1", "execute", "mithrilpress", "--local", "--persist-to", persistPath, "--config", config, "--command", seed,
  ]);

  const port = await freePort();
  worker = spawn(wrangler, [
    "dev", "--local", "--ip", "127.0.0.1", "--port", String(port), "--persist-to", persistPath, "--config", config, "--log-level", "error",
  ], { cwd: root, env: cleanEnvironment(), stdio: "ignore" });
  worker.on("error", () => {});

  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (worker.exitCode !== null) throw new Error("Local Worker exited before becoming ready.");
    try {
      await request(port, "GET", "/", { hostname: testHostname });
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  assert.equal(ready, true, "Local Worker did not become ready.");

  const deniedAnonymous = await request(port, "POST", "/api/wordpress/import", {
    body: wxr,
    contentType: "application/rss+xml",
  });
  assert.equal(deniedAnonymous.status, 401, "Anonymous WordPress imports must be denied.");

  const deniedCrossTenant = await request(port, "POST", "/api/wordpress/import", {
    token: otherSiteToken.token,
    body: wxr,
    contentType: "application/rss+xml",
  });
  assert.equal(deniedCrossTenant.status, 401, "A different tenant's owner token must be denied.");

  const uploaded = await request(port, "POST", "/_mithrilpress/api/media", {
    token: siteToken.token,
    body: png(),
    contentType: "image/png",
    headers: {
      origin: `https://${testHostname}`,
      "x-mithrilpress-request": "1",
      "x-wordpress-media-id": "9002",
      "x-mithrilpress-alt": "Migrated image",
    },
  });
  assert.equal(uploaded.status, 201, `Owner media upload failed: ${uploaded.body}`);
  const uploadedBody = JSON.parse(uploaded.body);
  const uploadedMediaId = uploadedBody.media.id;
  assert.equal(uploadedBody.media.wordpress_source_id, 9002);

  const imported = await request(port, "POST", "/api/wordpress/import", {
    token: siteToken.token,
    body: wxr,
    contentType: "application/rss+xml",
  });
  assert.equal(imported.status, 201, `Scoped owner import failed: ${imported.body}`);
  const importedBody = JSON.parse(imported.body);
  assert.equal(importedBody.state, "private-preview");
  assert.equal(importedBody.entry_count, 1);
  assert.equal(importedBody.migration_report.gutenberg.dynamic_blocks, 1);
  assert.equal(importedBody.migration_report.gutenberg.unknown_blocks, 1);
  assert.equal(importedBody.migration_report.inline_media.rewritten_images, 1);
  assert.equal(importedBody.migration_report.inline_media.omitted_images, 1);
  assert.equal(importedBody.migration_report.needs_owner_review, true);

  const savedReport = await request(port, "GET", `/_mithrilpress/api/revisions/${importedBody.revision_id}/migration-report`, {
    token: siteToken.token,
  });
  assert.equal(savedReport.status, 200, `Owner migration report read failed: ${savedReport.body}`);
  assert.deepEqual(JSON.parse(savedReport.body).migration_report, importedBody.migration_report);

  const privatePreview = await request(port, "GET", `/_mithrilpress/preview/${importedBody.revision_id}/private-migration-preview`, {
    token: siteToken.token,
  });
  assert.equal(privatePreview.status, 200, "An authorized owner must be able to view the private preview.");
  assert.match(privatePreview.headers["x-robots-tag"] ?? "", /noindex/);
  assert.match(privatePreview.body, /Local authorization qualification fixture/);
  assert.match(privatePreview.body, new RegExp(`/_mithrilpress/media/${uploadedMediaId}\\?revision=${importedBody.revision_id}`));
  assert.equal(privatePreview.body.includes("https://wordpress.example/uploads/hero.png"), false);
  assert.equal(privatePreview.body.includes("https://wordpress.example/uploads/unmapped.png"), false);

  const privateInlineMedia = await request(port, "GET", `/_mithrilpress/media/${uploadedMediaId}?revision=${importedBody.revision_id}`, {
    token: siteToken.token,
  });
  assert.equal(privateInlineMedia.status, 200, "An authorized preview must be able to read its linked inline media.");
  assert.equal(privateInlineMedia.body.length, 24);
  const crossTenantInlineMedia = await request(port, "GET", `/_mithrilpress/media/${uploadedMediaId}?revision=${importedBody.revision_id}`, {
    hostname: secondHostname,
    token: otherSiteToken.token,
  });
  assert.equal(crossTenantInlineMedia.status, 404, "Inline media must remain inaccessible from another tenant.");

  const publicPage = await request(port, "GET", "/");
  assert.equal(publicPage.status, 404, "Imported content must stay private until an owner publishes it.");
  const publicWordPressApi = await request(port, "GET", "/wp-json/wp/v2/posts");
  assert.equal(publicWordPressApi.status, 200);
  assert.deepEqual(JSON.parse(publicWordPressApi.body), [], "Private imports must not appear in the public WordPress-compatible API.");

  process.stdout.write("MithrilPress local owner-auth qualification passed: anonymous denial, tenant-token isolation, owner-uploaded inline media mapping, Gutenberg migration report, private owner preview, and pre-publication privacy.\n");
} finally {
  if (worker && worker.exitCode === null) {
    worker.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => worker.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ]);
    if (worker.exitCode === null) worker.kill("SIGKILL");
  }
  await rm(tempRoot, { recursive: true, force: true });
}
