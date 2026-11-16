import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { writeMigrationDemoFixtures } from "./migration-demo-fixtures.mjs";

function usage() {
  return `Run the local-only synthetic WordPress migration demonstration.

Usage:
  node scripts/run-migration-demo.mjs --site-host demo.sites.mithril.love \\
    --site-id <provisioned-local-site-uuid> --import-token-file <private-import-token-file> \\
    --owner-token-file <private-owner-token-file> \\
    --output-dir <new-output-directory> [--base-url http://127.0.0.1:8787]

The Worker must already be running locally. The demo refuses non-loopback HTTP
targets, writes only synthetic content, and pauses for an operator to review,
approve, publish, and restore each exact revision.
`;
}

function parseArgs(args) {
  const options = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (key === "--help") return { help: true };
    if (!["--site-host", "--site-id", "--import-token-file", "--owner-token-file", "--output-dir", "--base-url"].includes(key)
        || options.has(key) || !args[index + 1] || args[index + 1].startsWith("--")) {
      throw new Error("invalid_arguments");
    }
    options.set(key, args[index + 1]);
    index += 1;
  }
  for (const key of ["--site-host", "--site-id", "--import-token-file", "--owner-token-file", "--output-dir"]) {
    if (!options.has(key)) throw new Error(`missing_${key.slice(2).replaceAll("-", "_")}`);
  }
  const siteHost = options.get("--site-host").toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.sites\.mithril\.love$/.test(siteHost)) {
    throw new Error("invalid_site_host");
  }
  const siteId = options.get("--site-id");
  if (!/^[a-f0-9-]{36}$/i.test(siteId)) throw new Error("invalid_site_id");
  const baseUrl = new URL(options.get("--base-url") ?? "http://127.0.0.1:8787");
  if (baseUrl.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(baseUrl.hostname)
      || baseUrl.username || baseUrl.password || baseUrl.pathname !== "/" || baseUrl.search || baseUrl.hash) {
    throw new Error("local_loopback_http_required");
  }
  return {
    siteHost,
    siteId,
    importTokenFile: resolve(options.get("--import-token-file")),
    ownerTokenFile: resolve(options.get("--owner-token-file")),
    outputDirectory: resolve(options.get("--output-dir")),
    baseUrl,
  };
}

async function readPrivateToken(path) {
  const info = await lstat(path);
  if (info.isSymbolicLink() || !info.isFile() || (info.mode & 0o077) !== 0) throw new Error("token_file_must_be_private_regular_file");
  const token = (await readFile(path, "utf8")).trim();
  if (!/^[a-f0-9]{24}\.[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("invalid_owner_token_file");
  return token;
}

function localRequest(baseUrl, host, path, { method = "GET", token = null, contentType = null, body = null, headers = {} } = {}) {
  const bytes = body === null ? null : Buffer.isBuffer(body) ? body : Buffer.from(body);
  const requestHeaders = {
    host,
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(contentType ? { "content-type": contentType } : {}),
    ...(bytes ? { "content-length": String(bytes.byteLength) } : {}),
    ...headers,
  };
  return new Promise((resolveRequest, rejectRequest) => {
    const request = http.request({
      hostname: baseUrl.hostname.replace(/^\[|\]$/g, ""),
      port: baseUrl.port || 80,
      method,
      path,
      headers: requestHeaders,
      timeout: 30_000,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolveRequest({
        status: response.statusCode ?? 0,
        headers: response.headers,
        body: Buffer.concat(chunks),
      }));
    });
    request.on("timeout", () => request.destroy(new Error("local_worker_timeout")));
    request.on("error", rejectRequest);
    if (bytes) request.write(bytes);
    request.end();
  });
}

async function jsonRequest(baseUrl, host, path, options = {}, expected = [200]) {
  const result = await localRequest(baseUrl, host, path, options);
  let data = null;
  try {
    data = JSON.parse(result.body.toString("utf8"));
  } catch {
    // Preserve a safe, bounded code in the error below rather than echoing any response body.
  }
  if (!expected.includes(result.status)) {
    throw new Error(data?.error?.code ?? `http_${result.status}`);
  }
  return { ...result, data };
}

async function saveExclusive(path, data) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, data, { flag: "wx", mode: 0o600 });
}

async function exactConfirmation(readline, prompt, expected) {
  const answer = await readline.question(`${prompt}\nType exactly: ${expected}\n> `);
  return answer.trim() === expected;
}

async function uploadImages({ baseUrl, siteHost, token, fixtures }) {
  for (let index = 1; index <= fixtures.images; index += 1) {
    const mediaId = 1000 + index;
    const imagePath = join(fixtures.uploadsPath, `demo-image-${String(index).padStart(2, "0")}.png`);
    const bytes = await readFile(imagePath);
    await jsonRequest(baseUrl, siteHost, "/_mithrilpress/api/media", {
      method: "POST",
      token,
      contentType: "image/png",
      body: bytes,
      headers: {
        "x-wordpress-media-id": String(mediaId),
        "x-mithrilpress-alt": encodeURIComponent(`Original generated demo image ${index}`),
      },
    }, [200, 201]);
  }
}

async function createPrivateRevision({ baseUrl, siteHost, importToken, directory, update }) {
  const fixtures = await writeMigrationDemoFixtures(directory, { update });
  await uploadImages({ baseUrl, siteHost, token: importToken, fixtures });
  const wxr = await readFile(fixtures.wxrPath);
  const result = await jsonRequest(baseUrl, siteHost, "/api/wordpress/import", {
    method: "POST",
    token: importToken,
    contentType: "application/rss+xml",
    body: wxr,
  }, [201]);
  return { fixtures, importResult: result.data };
}

async function savePrivatePreview({ baseUrl, siteHost, token, revisionId, directory, label }) {
  const report = await jsonRequest(baseUrl, siteHost,
    `/_mithrilpress/api/revisions/${revisionId}/migration-report`, { token });
  await saveExclusive(join(directory, `${label}-migration-report.json`), `${JSON.stringify(report.data, null, 2)}\n`);
  const preview = await localRequest(baseUrl, siteHost,
    `/_mithrilpress/preview/${revisionId}/company/`, { token });
  if (preview.status !== 200 || !String(preview.headers["x-robots-tag"] ?? "").toLowerCase().includes("noindex")) {
    throw new Error(`private_preview_unavailable_${preview.status}`);
  }
  await saveExclusive(join(directory, `${label}-private-preview.html`), preview.body);
  return report.data;
}

async function approveAndPublish({ readline, baseUrl, siteHost, token, revisionId }) {
  if (!await exactConfirmation(readline,
    "Review the saved migration report and private preview. Approve this exact revision?", revisionId)) return false;
  await jsonRequest(baseUrl, siteHost, `/_mithrilpress/api/revisions/${revisionId}/approve`, {
    method: "POST", token, contentType: "application/json", body: "{}",
  }, [200]);
  if (!await exactConfirmation(readline,
    "Publish the separately approved revision?", revisionId)) return false;
  await jsonRequest(baseUrl, siteHost, `/_mithrilpress/api/revisions/${revisionId}/publish`, {
    method: "POST", token, contentType: "application/json", body: "{}",
  }, [200]);
  return true;
}

async function publicationSnapshot({ baseUrl, siteId, token }) {
  const path = `/_mithrilpress/api/control/sites/${siteId}/publication/current`;
  return jsonRequest(baseUrl, "control.mithril.love", path, { token });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    stdout.write(usage());
    return;
  }
  const importToken = await readPrivateToken(options.importTokenFile);
  const ownerToken = await readPrivateToken(options.ownerTokenFile);
  await mkdir(options.outputDirectory, { recursive: false, mode: 0o700 });
  const readline = createInterface({ input: stdin, output: stdout });
  try {
    stdout.write("Creating the first private revision from synthetic local fixtures.\n");
    const first = await createPrivateRevision({
      baseUrl: options.baseUrl,
      siteHost: options.siteHost,
      importToken,
      directory: join(options.outputDirectory, "first"),
      update: false,
    });
    const firstId = first.importResult.revision_id;
    const firstReport = await savePrivatePreview({
      baseUrl: options.baseUrl,
      siteHost: options.siteHost,
      token: ownerToken,
      revisionId: firstId,
      directory: options.outputDirectory,
      label: "first",
    });
    stdout.write(`First private revision: ${firstId}\nParity: ${firstReport.migration_report?.parity_status ?? "not-reported"}\n`);
    if (!await approveAndPublish({ readline, ...options, token: ownerToken, revisionId: firstId })) {
      stdout.write("Stopped before publication. The unapproved revision remains private.\n");
      return;
    }
    const firstSnapshot = await publicationSnapshot({ baseUrl: options.baseUrl, siteId: options.siteId, token: ownerToken });
    if (firstSnapshot.data?.revision?.id !== firstId) throw new Error("first_publication_snapshot_mismatch");
    await saveExclusive(join(options.outputDirectory, "publication-first.json"), `${JSON.stringify(firstSnapshot.data, null, 2)}\n`);
    const firstPage = await localRequest(options.baseUrl, options.siteHost, "/company/", {});
    if (firstPage.status !== 200 || !firstPage.body.toString("utf8").includes("Northstar company page 01")) {
      throw new Error(`first_public_readback_${firstPage.status}`);
    }
    await saveExclusive(join(options.outputDirectory, "publication-first.html"), firstPage.body);

    stdout.write("Creating an updated synthetic revision with the same owner-supplied media.\n");
    const update = await createPrivateRevision({
      baseUrl: options.baseUrl,
      siteHost: options.siteHost,
      importToken,
      directory: join(options.outputDirectory, "update"),
      update: true,
    });
    const updateId = update.importResult.revision_id;
    const updateReport = await savePrivatePreview({
      baseUrl: options.baseUrl,
      siteHost: options.siteHost,
      token: ownerToken,
      revisionId: updateId,
      directory: options.outputDirectory,
      label: "update",
    });
    stdout.write(`Update private revision: ${updateId}\nParity: ${updateReport.migration_report?.parity_status ?? "not-reported"}\n`);
    if (!await approveAndPublish({ readline, ...options, token: ownerToken, revisionId: updateId })) {
      stdout.write("Stopped before update publication. The second revision remains private or approved.\n");
      return;
    }
    const updateSnapshot = await publicationSnapshot({ baseUrl: options.baseUrl, siteId: options.siteId, token: ownerToken });
    if (updateSnapshot.data?.revision?.id !== updateId) throw new Error("update_publication_snapshot_mismatch");
    await saveExclusive(join(options.outputDirectory, "publication-update.json"), `${JSON.stringify(updateSnapshot.data, null, 2)}\n`);
    const updatePage = await localRequest(options.baseUrl, options.siteHost, "/company/", {});
    if (updatePage.status !== 200 || !updatePage.body.toString("utf8").includes("About Northstar Fictional Services, updated")) {
      throw new Error(`update_public_readback_${updatePage.status}`);
    }
    await saveExclusive(join(options.outputDirectory, "publication-update.html"), updatePage.body);

    const restoreConfirmation = `${firstId}/${updateId}`;
    if (!await exactConfirmation(readline,
      "Restore the earlier owner-approved revision? This confirms target/current revision IDs.", restoreConfirmation)) {
      stdout.write("Stopped before restore. The updated revision remains the current publication.\n");
      return;
    }
    await jsonRequest(options.baseUrl, options.siteHost, `/_mithrilpress/api/revisions/${firstId}/restore`, {
      method: "POST",
      token: ownerToken,
      contentType: "application/json",
      body: JSON.stringify({ revision_id: firstId, current_revision_id: updateId }),
    }, [200]);
    const restoredSnapshot = await publicationSnapshot({ baseUrl: options.baseUrl, siteId: options.siteId, token: ownerToken });
    if (restoredSnapshot.data?.revision?.id !== firstId) throw new Error("restore_readback_mismatch");
    await saveExclusive(join(options.outputDirectory, "publication-restored.json"), `${JSON.stringify(restoredSnapshot.data, null, 2)}\n`);
    const restoredPage = await localRequest(options.baseUrl, options.siteHost, "/company/", {});
    if (restoredPage.status !== 200 || !restoredPage.body.toString("utf8").includes("Northstar company page 01")) {
      throw new Error(`restore_public_readback_${restoredPage.status}`);
    }
    await saveExclusive(join(options.outputDirectory, "publication-restored.html"), restoredPage.body);
    const receipt = {
      site_host: options.siteHost,
      site_id: options.siteId,
      synthetic_fixture: "Northstar Fictional Services",
      supported_records: { pages: 24, posts: 6 },
      generated_images: 10,
      first_revision_id: firstId,
      update_revision_id: updateId,
      restored_revision_id: restoredSnapshot.data.revision.id,
      publication_snapshot_sha256: restoredSnapshot.data.digest_sha256,
      fixture_license: "Original deterministic images generated by migration-demo-fixtures.mjs; no third-party or prospect content.",
    };
    await saveExclusive(join(options.outputDirectory, "demo-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
    stdout.write(`Completed local migration demo. Evidence directory: ${options.outputDirectory}\n`);
  } finally {
    readline.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    stdout.write(`Migration demo stopped: ${error?.message ?? "unknown_error"}\n`);
    process.exitCode = 1;
  });
}
