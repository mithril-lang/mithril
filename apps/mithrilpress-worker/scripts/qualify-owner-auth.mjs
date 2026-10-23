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
const collectionFixtures = [
  {
    apiId: 9101,
    slug: "mithril-exact-match",
    title: "Signal",
    content: "<p>Exact title match.</p>",
    date: "2026-05-12T09:00:00Z",
    modified: "2026-06-15T10:00:00Z",
  },
  {
    apiId: 9102,
    slug: "mithril-migration",
    title: "Signal migration",
    content: "<p>Partial title match.</p>",
    date: "2026-05-12T12:00:00Z",
    modified: "2026-06-15T18:30:00Z",
  },
  {
    apiId: 9103,
    slug: "security-notes",
    title: "Security notes",
    content: "<p>Content-only Signal match.</p>",
    date: "2026-05-13T08:00:00Z",
    modified: "2026-06-17T11:00:00Z",
  },
];
const wxr = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:wp="http://wordpress.org/export/1.2/">
  <channel><title>Integration fixture</title><link>${sourceOrigin}</link><wp:wxr_version>1.2</wp:wxr_version>
    <item><title>Private migration preview</title><link>${sourceOrigin}/private-migration-preview/</link>
      <wp:post_id>9001</wp:post_id><wp:post_type>post</wp:post_type><wp:status>publish</wp:status>
      <wp:post_name>private-migration-preview</wp:post_name>
      <wp:postmeta><wp:meta_key><![CDATA[custom_field]]></wp:meta_key><wp:meta_value><![CDATA[owner-review-required]]></wp:meta_value></wp:postmeta>
      <wp:postmeta><wp:meta_key><![CDATA[_yoast_wpseo_title]]></wp:meta_key><wp:meta_value><![CDATA[Owner SEO & summary]]></wp:meta_value></wp:postmeta>
      <wp:postmeta><wp:meta_key><![CDATA[_yoast_wpseo_metadesc]]></wp:meta_key><wp:meta_value><![CDATA[Description <safe> & careful]]></wp:meta_value></wp:postmeta>
      <content:encoded><![CDATA[<p>Local authorization qualification fixture.</p>
        <a href="${sourceOrigin}/private-migration-preview/#intro">Imported self link</a>
        <a href="/not-imported/">Unmapped source link</a>
        <a href="javascript:alert(1)">Unsafe source link</a>
        <!-- wp:image {"id":9002} -->
        <figure><img class="wp-image-9002" src="https://wordpress.example/uploads/hero.png" alt="Owner image"></figure>
        <!-- /wp:image -->
        <p><img class="wp-image-9999" src="https://wordpress.example/uploads/unmapped.png"></p>
        <!-- wp:latest-posts /-->
        <!-- wp:sample/plugin-card {"id":17} /-->
      ]]></content:encoded>
    </item>
    ${collectionFixtures.map((entry) => `
    <item><title>${entry.title}</title><link>${sourceOrigin}/${entry.slug}/</link>
      <wp:post_id>${entry.apiId}</wp:post_id><wp:post_type>post</wp:post_type><wp:status>publish</wp:status>
      <wp:post_name>${entry.slug}</wp:post_name><wp:post_date>${entry.date}</wp:post_date><wp:post_date_gmt>${entry.date}</wp:post_date_gmt>
      <wp:post_modified>${entry.modified}</wp:post_modified><wp:post_modified_gmt>${entry.modified}</wp:post_modified_gmt>
      <content:encoded><![CDATA[${entry.content}]]></content:encoded>
    </item>`).join("")}
    <item><title>Single read page</title><link>${sourceOrigin}/single-read-page/</link>
      <wp:post_id>9201</wp:post_id><wp:post_type>page</wp:post_type><wp:status>publish</wp:status>
      <wp:post_name>single-read-page</wp:post_name><content:encoded><![CDATA[<p>Published page fixture.</p>]]></content:encoded>
    </item>
    <item><title>Unpublished fixture</title><link>${sourceOrigin}/unpublished-fixture/</link>
      <wp:post_id>9202</wp:post_id><wp:post_type>post</wp:post_type><wp:status>draft</wp:status>
      <wp:post_name>unpublished-fixture</wp:post_name><content:encoded><![CDATA[<p>This draft must remain private.</p>]]></content:encoded>
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
const siteToken = makeToken("MithrilPress local integration", ["content:import", "content:write", "revision:preview", "media:write", "revision:approve", "site:publish"]);
const otherSiteToken = makeToken("MithrilPress cross-tenant integration", ["content:import", "revision:preview"]);
let worker;
let workerDiagnostics = "";

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
    "dev", "--local", "--ip", "127.0.0.1", "--port", String(port), "--persist-to", persistPath, "--config", config,
    "--log-level", "warn", "--var", "MITHRILPRESS_OWNER_AUTH_DIAGNOSTICS:true",
  ], { cwd: root, env: cleanEnvironment(), stdio: ["ignore", "pipe", "pipe"] });
  const captureWorkerDiagnostics = (chunk) => {
    workerDiagnostics = `${workerDiagnostics}${chunk.toString("utf8")}`.slice(-8192);
  };
  worker.stdout?.on("data", captureWorkerDiagnostics);
  worker.stderr?.on("data", captureWorkerDiagnostics);
  const waitForOwnerAuthDiagnostic = async () => {
    const marker = "mithrilpress_owner_auth_diagnostic";
    const deadline = Date.now() + 2_000;
    while (!workerDiagnostics.includes(marker) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  };
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
  const repeatedUpload = await request(port, "POST", "/_mithrilpress/api/media", {
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
  assert.equal(repeatedUpload.status, 200, `Identical owner media retry was not idempotent: ${repeatedUpload.body}`);
  assert.equal(JSON.parse(repeatedUpload.body).media.id, uploadedMediaId);
  const conflictingMediaAlt = await request(port, "POST", "/_mithrilpress/api/media", {
    token: siteToken.token,
    body: png(),
    contentType: "image/png",
    headers: {
      origin: `https://${testHostname}`,
      "x-mithrilpress-request": "1",
      "x-wordpress-media-id": "9002",
      "x-mithrilpress-alt": "Different alt text",
    },
  });
  assert.equal(conflictingMediaAlt.status, 409);
  assert.equal(JSON.parse(conflictingMediaAlt.body).error.code, "wordpress_media_conflict");
  const conflictingMediaBytes = await request(port, "POST", "/_mithrilpress/api/media", {
    token: siteToken.token,
    body: png(2, 1),
    contentType: "image/png",
    headers: {
      origin: `https://${testHostname}`,
      "x-mithrilpress-request": "1",
      "x-wordpress-media-id": "9002",
      "x-mithrilpress-alt": "Migrated image",
    },
  });
  assert.equal(conflictingMediaBytes.status, 409);
  assert.equal(JSON.parse(conflictingMediaBytes.body).error.code, "wordpress_media_conflict");

  const imported = await request(port, "POST", "/api/wordpress/import", {
    token: siteToken.token,
    body: wxr,
    contentType: "application/rss+xml",
  });
  assert.equal(imported.status, 201, `Scoped owner import failed: ${imported.body}`);
  const importedBody = JSON.parse(imported.body);
  assert.equal(importedBody.state, "private-preview");
  assert.equal(importedBody.entry_count, 6);
  assert.equal(importedBody.migration_report.gutenberg.dynamic_blocks, 1);
  assert.equal(importedBody.migration_report.gutenberg.unknown_blocks, 1);
  assert.equal(importedBody.migration_report.inline_media.rewritten_images, 1);
  assert.equal(importedBody.migration_report.inline_media.omitted_images, 1);
  assert.equal(importedBody.migration_report.content_links.source_site_links, 2);
  assert.equal(importedBody.migration_report.content_links.rewritten_links, 1);
  assert.equal(importedBody.migration_report.content_links.unresolved_source_site_links, 1);
  assert.equal(importedBody.migration_report.content_links.removed_unsafe_links, 1);
  assert.deepEqual(importedBody.migration_report.seo_metadata, {
    entries_with_metadata: 1,
    imported_fields: 2,
    omitted_fields: 1,
  });
  assert.equal(importedBody.migration_report.needs_owner_review, true);

  const manualPrefix = "Manual draft original start: ";
  const manualSuffix = " :manual-original-end";
  const longManualContent = `${manualPrefix}${"あ".repeat(100_000 - manualPrefix.length - manualSuffix.length)}${manualSuffix}`;
  assert.equal(longManualContent.length, 100_000);
  const manualDraft = await request(port, "POST", "/_mithrilpress/api/studio/manual-draft", {
    token: siteToken.token,
    body: JSON.stringify({ title: "Long manual draft", content: longManualContent, kind: "post" }),
    contentType: "application/json",
    headers: { origin: `https://${testHostname}`, "x-mithrilpress-request": "1" },
  });
  if (manualDraft.status !== 201) {
    const responseDiagnostic = manualDraft.headers["x-mithrilpress-owner-auth-diagnostic"];
    if (responseDiagnostic) workerDiagnostics = `mithrilpress_owner_auth_diagnostic ${responseDiagnostic}`;
    else await waitForOwnerAuthDiagnostic();
  }
  assert.equal(manualDraft.status, 201, `A 100,000-character manual draft should save: ${manualDraft.body}\nWorker diagnostics: ${workerDiagnostics || "none emitted"}`);
  const manualDraftBody = JSON.parse(manualDraft.body);
  assert.equal(manualDraftBody.draft.state, "private-preview");
  const longManualPreview = await request(port, "GET", manualDraftBody.preview_url, { token: siteToken.token });
  assert.equal(longManualPreview.status, 200, `A long manual draft should remain privately previewable: ${longManualPreview.body}`);
  assert.match(longManualPreview.headers["x-robots-tag"] ?? "", /noindex/);
  assert.ok(longManualPreview.body.includes(manualSuffix), "The private preview should retain the end of the full manual draft.");

  const updatedManualContent = "Updated manual draft paragraph. ".repeat(140);
  const updatedManualDraft = await request(port, "POST", "/_mithrilpress/api/studio/manual-draft", {
    token: siteToken.token,
    body: JSON.stringify({
      title: "Updated manual draft",
      content: updatedManualContent,
      kind: "post",
      conversation_id: manualDraftBody.conversation_id,
    }),
    contentType: "application/json",
    headers: { origin: `https://${testHostname}`, "x-mithrilpress-request": "1" },
  });
  assert.equal(updatedManualDraft.status, 201, `An existing private draft should be replaceable: ${updatedManualDraft.body}`);
  const updatedManualDraftBody = JSON.parse(updatedManualDraft.body);
  assert.equal(updatedManualDraftBody.conversation_id, manualDraftBody.conversation_id);
  assert.notEqual(updatedManualDraftBody.draft.revision_id, manualDraftBody.draft.revision_id);
  const updatedManualPreview = await request(port, "GET", updatedManualDraftBody.preview_url, { token: siteToken.token });
  assert.equal(updatedManualPreview.status, 200);
  assert.match(updatedManualPreview.body, /Updated manual draft paragraph/);
  assert.equal(updatedManualPreview.body.includes(manualSuffix), false, "The revised preview should no longer expose the superseded draft body.");

  // Seed a ready chat-origin draft to exercise API-ID lookup without a live AI provider.
  const chatApiId = 9500;
  const chatEntryId = "mithrilpress:chat:single-item-read-fixture";
  const chatFixtureSql = [
    `INSERT INTO entries (site_id, revision_id, entry_id, kind, slug, route_path, title, source_html, safe_html, entry_origin, publication_status, language_code, api_id, source_id, source_status, source_date, source_date_gmt, source_modified, source_modified_gmt, source_permalink, categories_json, tags_json, featured_media_id, rendering_admission) VALUES (${sqlText(siteId)}, ${sqlText(importedBody.revision_id)}, ${sqlText(chatEntryId)}, 'post', 'chat-authored-api-id', '/chat-authored-api-id/', 'Chat authored API ID', '<p>Chat-authored item fixture.</p>', '<p>Chat-authored item fixture.</p>', 'chat', 'draft', 'en', ${chatApiId}, NULL, 'draft', ${sqlText(createdAt)}, ${sqlText(createdAt)}, ${sqlText(createdAt)}, ${sqlText(createdAt)}, NULL, '[]', '[]', NULL, 'ready');`,
    `UPDATE site_revisions SET entry_count = entry_count + 1 WHERE site_id = ${sqlText(siteId)} AND id = ${sqlText(importedBody.revision_id)} AND state = 'private-preview';`,
  ].join("\n");
  runWrangler([
    "d1", "execute", "mithrilpress", "--local", "--persist-to", persistPath, "--config", config, "--command", chatFixtureSql,
  ]);

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
  assert.match(privatePreview.body, /<title>Owner SEO &amp; summary<\/title>/);
  assert.match(privatePreview.body, /<meta name="description" content="Description &lt;safe&gt; &amp; careful">/);
  assert.match(privatePreview.body, /Local authorization qualification fixture/);
  assert.match(privatePreview.body, new RegExp(`/_mithrilpress/media/${uploadedMediaId}\\?revision=${importedBody.revision_id}`));
  assert.match(privatePreview.body, /href="https:\/\/integration\.sites\.mithril\.love\/private-migration-preview\/#intro"/);
  assert.match(privatePreview.body, /href="https:\/\/wordpress\.example\/not-imported\/"/);
  assert.equal(privatePreview.body.includes("javascript:alert(1)"), false);
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
  const privateWordPressItem = await request(port, "GET", "/wp-json/wp/v2/posts/9001");
  assert.equal(privateWordPressItem.status, 404, "A private-preview entry must not be readable by source ID.");
  const privateChatItem = await request(port, "GET", `/wp-json/wp/v2/posts/${chatApiId}`);
  assert.equal(privateChatItem.status, 404, "A chat draft must not be readable before owner publication.");

  const approved = await request(port, "POST", `/_mithrilpress/api/revisions/${importedBody.revision_id}/approve`, { token: siteToken.token });
  assert.equal(approved.status, 200, `Owner approval failed: ${approved.body}`);
  const published = await request(port, "POST", `/_mithrilpress/api/revisions/${importedBody.revision_id}/publish`, { token: siteToken.token });
  assert.equal(published.status, 200, `Owner publication failed: ${published.body}`);

  const publicationPath = `/_mithrilpress/api/control/sites/${siteId}/publication/current`;
  const publicationOnSiteHost = await request(port, "GET", publicationPath, { hostname: testHostname, token: siteToken.token });
  assert.equal(publicationOnSiteHost.status, 404, "Publication control routes must not be exposed on public site hosts.");
  const anonymousPublication = await request(port, "GET", publicationPath, { hostname: "control.mithril.love" });
  assert.equal(anonymousPublication.status, 401, "Publication snapshots must require a site:publish owner token.");
  const crossTenantPublication = await request(port, "GET", publicationPath, { hostname: "control.mithril.love", token: otherSiteToken.token });
  assert.equal(crossTenantPublication.status, 401, "A different tenant token must not read a publication snapshot.");
  const currentPublication = await request(port, "GET", publicationPath, { hostname: "control.mithril.love", token: siteToken.token });
  assert.equal(currentPublication.status, 200, `Owner publication snapshot failed: ${currentPublication.body}`);
  const currentPublicationBody = JSON.parse(currentPublication.body);
  assert.equal(currentPublicationBody.site_id, siteId);
  assert.equal(currentPublicationBody.revision.id, importedBody.revision_id);
  assert.ok(currentPublicationBody.media.length > 0, "The published fixture must include owner-mapped media.");
  const publicationMedia = currentPublicationBody.media[0];
  const publicationMediaPath = `/_mithrilpress/api/control/sites/${siteId}/publication/revisions/${importedBody.revision_id}/media/${publicationMedia.id}`;
  const mediaOnSiteHost = await request(port, "GET", publicationMediaPath, { hostname: testHostname, token: siteToken.token });
  assert.equal(mediaOnSiteHost.status, 404, "Publication media routes must not be exposed on public site hosts.");
  const currentPublicationMedia = await request(port, "GET", publicationMediaPath, { hostname: "control.mithril.love", token: siteToken.token });
  assert.equal(currentPublicationMedia.status, 200, `Owner publication media failed: ${currentPublicationMedia.body}`);
  assert.match(currentPublicationMedia.headers["content-type"] ?? "", /^image\//);
  const publicSeoPage = await request(port, "GET", "/private-migration-preview/");
  assert.equal(publicSeoPage.status, 200);
  assert.match(publicSeoPage.body, /<title>Owner SEO &amp; summary<\/title>/);
  assert.match(publicSeoPage.body, /<meta name="description" content="Description &lt;safe&gt; &amp; careful">/);
  const publishedWordPressApi = await request(port, "GET", "/wp-json/wp/v2/posts?slug=private-migration-preview");
  assert.equal(publishedWordPressApi.status, 200);
  assert.deepEqual(JSON.parse(publishedWordPressApi.body)[0].meta, {
    _yoast_wpseo_title: "Owner SEO & summary",
    _yoast_wpseo_metadesc: "Description <safe> & careful",
  });

  const publishedWordPressItem = await request(port, "GET", "/wp-json/wp/v2/posts/9001");
  assert.equal(publishedWordPressItem.status, 200, `WordPress source-ID lookup failed: ${publishedWordPressItem.body}`);
  const publishedWordPressItemBody = JSON.parse(publishedWordPressItem.body);
  assert.equal(publishedWordPressItemBody.id, 9001);
  assert.equal(publishedWordPressItemBody.type, "post");
  assert.equal(publishedWordPressItemBody.status, "publish");
  assert.equal(publishedWordPressItemBody.link, `https://${testHostname}/private-migration-preview/`);
  assert.equal(publishedWordPressItemBody.title.rendered, "Private migration preview");
  assert.equal(publishedWordPressItemBody.meta._yoast_wpseo_title, "Owner SEO & summary");
  const chatWordPressItem = await request(port, "GET", `/wp-json/wp/v2/posts/${chatApiId}`);
  assert.equal(chatWordPressItem.status, 200, `MithrilPress API-ID lookup failed: ${chatWordPressItem.body}`);
  assert.equal(JSON.parse(chatWordPressItem.body).id, chatApiId);
  assert.equal(JSON.parse(chatWordPressItem.body).slug, "chat-authored-api-id");

  const publishedWordPressPage = await request(port, "GET", "/wp-json/wp/v2/pages/9201");
  assert.equal(publishedWordPressPage.status, 200, `WordPress page lookup failed: ${publishedWordPressPage.body}`);
  assert.equal(JSON.parse(publishedWordPressPage.body).type, "page");
  assert.equal(JSON.parse(publishedWordPressPage.body).id, 9201);
  const headWordPressPage = await request(port, "HEAD", "/wp-json/wp/v2/pages/9201");
  assert.equal(headWordPressPage.status, 200);
  assert.equal(headWordPressPage.body, "");
  assert.match(headWordPressPage.headers["content-type"] ?? "", /application\/json/);
  for (const pathname of [
    "/wp-json/wp/v2/posts/9201",
    "/wp-json/wp/v2/posts/9202",
    "/wp-json/wp/v2/posts/99999999999999999",
  ]) {
    const unavailable = await request(port, "GET", pathname);
    assert.equal(unavailable.status, 404, `${pathname} must not reveal a missing, draft, or other-kind entry.`);
  }
  const editWordPressItem = await request(port, "GET", "/wp-json/wp/v2/posts/9001?context=edit");
  assert.equal(editWordPressItem.status, 401);
  const writeWordPressItem = await request(port, "POST", "/wp-json/wp/v2/posts/9001");
  assert.equal(writeWordPressItem.status, 405);

  const relevance = await request(port, "GET", "/wp-json/wp/v2/posts?search=Signal&orderby=relevance&per_page=100");
  assert.equal(relevance.status, 200, `WordPress relevance query failed: ${relevance.body}`);
  assert.deepEqual(JSON.parse(relevance.body).map((entry) => entry.id), [9101, 9102, 9103]);

  const calendarDay = await request(port, "GET", "/wp-json/wp/v2/posts?after=2026-05-12&before=2026-05-12&orderby=id&order=asc&per_page=100");
  assert.equal(calendarDay.status, 200, `WordPress calendar-day query failed: ${calendarDay.body}`);
  assert.deepEqual(JSON.parse(calendarDay.body).map((entry) => entry.id), [9101, 9102]);
  assert.equal(calendarDay.headers["x-wp-total"], "2");

  const modifiedDay = await request(port, "GET", "/wp-json/wp/v2/posts?modified_after=2026-06-15&modified_before=2026-06-15&orderby=id&order=asc&per_page=100");
  assert.equal(modifiedDay.status, 200, `WordPress modified-day query failed: ${modifiedDay.body}`);
  assert.deepEqual(JSON.parse(modifiedDay.body).map((entry) => entry.id), [9101, 9102]);

  const ascendingDate = await request(port, "GET", "/wp-json/wp/v2/posts?after=2026-05-12&before=2026-05-13&orderby=date&order=asc&per_page=100");
  assert.deepEqual(JSON.parse(ascendingDate.body).map((entry) => entry.id), [9101, 9102, 9103]);
  const descendingDate = await request(port, "GET", "/wp-json/wp/v2/posts?after=2026-05-12&before=2026-05-13&orderby=date&order=desc&per_page=100");
  assert.deepEqual(JSON.parse(descendingDate.body).map((entry) => entry.id), [9103, 9102, 9101]);

  const invalidCalendarDate = await request(port, "GET", "/wp-json/wp/v2/posts?before=2026-02-30");
  assert.equal(invalidCalendarDate.status, 400);
  const invalidDateRange = await request(port, "GET", "/wp-json/wp/v2/posts?after=2026-06-01&before=2026-05-31");
  assert.equal(invalidDateRange.status, 400);
  const invalidOrder = await request(port, "GET", "/wp-json/wp/v2/posts?order=desc%20LIMIT%201");
  assert.equal(invalidOrder.status, 400);
  const missingRelevanceSearch = await request(port, "GET", "/wp-json/wp/v2/posts?orderby=relevance");
  assert.equal(missingRelevanceSearch.status, 400);

  process.stdout.write("MithrilPress local owner-auth qualification passed: anonymous denial, tenant-token isolation, owner media idempotency/conflicts, owner-uploaded inline media mapping, Gutenberg and SEO metadata reports, escaped private and published SEO tags, publication control host isolation, WordPress REST source/API item and collection reads, and pre-publication privacy.\n");
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
