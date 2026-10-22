import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_FILES = 5_000;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_BYTES = 300_000_000;
const CONTROL_ORIGIN = "https://control.mithril.love";
const PAGES_API_ORIGIN = "https://api.cloudflare.com/client/v4";
const PINNED_ZONE_NAME = "mithril.love";
const MAX_MITHRILPRESS_PAGES_PROJECTS = 90;
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  throw new Error(message);
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value || value.trim() !== value) fail(`${name} must be set without surrounding whitespace.`);
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function checkedManifest(manifest) {
  if (!manifest || manifest.schema_version !== 1
      || !/^[a-f0-9-]{36}$/.test(manifest.site_id ?? "")
      || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.sites\.mithril\.love$/.test(manifest.hostname ?? "")
      || !/^[a-f0-9-]{36}$/.test(manifest.revision_id ?? "")
      || !/^[a-f0-9]{64}$/.test(manifest.snapshot_sha256 ?? "")
      || (manifest.pages_function_sha256 !== undefined && !/^[a-f0-9]{64}$/.test(manifest.pages_function_sha256))
      || !Array.isArray(manifest.files) || manifest.files.length < 1 || manifest.files.length > MAX_FILES
      || !/^[a-f0-9]{64}$/.test(manifest.artifact_sha256 ?? "")) {
    fail("The exporter returned a malformed or unsupported publication manifest.");
  }
  const paths = new Set();
  let previousPath = "";
  for (const file of manifest.files) {
    if (!file || typeof file.path !== "string" || !file.path.startsWith("/")
        || file.path === "/" || file.path.endsWith("/")
        || file.path.includes("\\") || file.path.includes("//")
        || file.path.split("/").some((segment) => segment === "." || segment === "..")
        || !Number.isSafeInteger(file.byte_length) || file.byte_length < 0 || file.byte_length > MAX_FILE_BYTES
        || !/^[a-f0-9]{64}$/.test(file.sha256 ?? "") || paths.has(file.path)
        || (previousPath && file.path < previousPath)) {
      fail("The publication manifest contains an unsafe, duplicate, unsorted, or oversized file entry.");
    }
    let decoded;
    try {
      decoded = file.path.split("/").map((segment) => decodeURIComponent(segment));
    } catch {
      fail("The publication manifest contains a malformed encoded path.");
    }
    if (decoded.some((segment) => segment.includes("/") || segment.includes("\\")
        || segment === "." || segment === ".." || segment.includes("\0"))) {
      fail("The publication manifest contains a path separator or traversal after decoding.");
    }
    if ((file.path === "/_routes.json" && !manifest.pages_function_sha256) || file.path === "/_worker.js"
        || file.path.startsWith("/functions/") || file.path.startsWith("/.wrangler/")) {
      fail("The publication contains an unsupported Pages runtime or route file.");
    }
    paths.add(file.path);
    previousPath = file.path;
  }
  if (Boolean(manifest.pages_function_sha256) !== paths.has("/_routes.json")) {
    fail("The publication manifest must bind Pages Function routing to its exact runtime source.");
  }
  const base = { ...manifest };
  delete base.artifact_sha256;
  if (sha256(JSON.stringify(base)) !== manifest.artifact_sha256) {
    fail("The publication manifest digest does not match its contents.");
  }
  return manifest;
}

async function inspectArtifact(root, suppliedManifest) {
  const manifest = checkedManifest(suppliedManifest);
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) fail("The Pages artifact root must be a real directory.");
  const actual = new Map();
  let totalBytes = 0;

  async function visit(directory) {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const child of children) {
      const target = resolve(directory, child.name);
      const relativePath = relative(root, target);
      if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
        fail("The Pages artifact contains a path outside its root.");
      }
      if (child.isDirectory()) {
        const info = await lstat(target);
        if (!info.isDirectory() || info.isSymbolicLink()) fail("The Pages artifact contains a symlink.");
        await visit(target);
        continue;
      }
      const info = await lstat(target);
      if (!child.isFile() || !info.isFile() || info.isSymbolicLink() || info.size > MAX_FILE_BYTES) {
        fail("The Pages artifact contains a symlink, special file, or oversized file.");
      }
      const pathname = `/${relativePath.split(sep).join("/")}`;
      const bytes = await readFile(target);
      if (bytes.byteLength !== info.size) fail("A Pages artifact file changed while it was being read.");
      actual.set(pathname, { path: pathname, byte_length: bytes.byteLength, sha256: sha256(bytes) });
      totalBytes += bytes.byteLength;
      if (actual.size > MAX_FILES || totalBytes > MAX_TOTAL_BYTES) {
        fail("The Pages artifact exceeds the product's static publication caps.");
      }
    }
  }

  await visit(root);
  if (actual.size !== manifest.files.length) fail("The artifact file set does not match the approved manifest.");
  for (const expected of manifest.files) {
    const found = actual.get(expected.path);
    if (!found || found.byte_length !== expected.byte_length || found.sha256 !== expected.sha256) {
      fail("A Pages artifact file differs from the owner-approved manifest.");
    }
  }
  if (manifest.pages_function_sha256) {
    const functionsRoot = resolve(PACKAGE_ROOT, "functions");
    const runtimePath = resolve(functionsRoot, "wp-json/wp/v2/[[path]].js");
    const runtimeFiles = [];
    async function visitFunctions(directory) {
      const directoryInfo = await lstat(directory);
      if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) fail("The Pages Functions tree contains a symlink or special directory.");
      for (const child of await readdir(directory, { withFileTypes: true })) {
        const childPath = resolve(directory, child.name);
        const childInfo = await lstat(childPath);
        if (child.isDirectory()) await visitFunctions(childPath);
        else if (child.isFile() && childInfo.isFile() && !childInfo.isSymbolicLink()) {
          runtimeFiles.push(relative(functionsRoot, childPath).split(sep).join("/"));
        } else fail("The Pages Functions tree contains an unsupported file.");
      }
    }
    await visitFunctions(functionsRoot);
    const runtimeInfo = await lstat(runtimePath);
    if (runtimeFiles.length !== 1 || runtimeFiles[0] !== "wp-json/wp/v2/[[path]].js"
        || !runtimeInfo.isFile() || runtimeInfo.isSymbolicLink()
        || sha256(await readFile(runtimePath)) !== manifest.pages_function_sha256) {
      fail("Only the digest-bound WordPress REST Pages Function may be deployed.");
    }
    let routeConfig;
    try { routeConfig = JSON.parse(await readFile(resolve(root, "_routes.json"), "utf8")); }
    catch { fail("The Pages Function route manifest is invalid JSON."); }
    if (JSON.stringify(routeConfig) !== JSON.stringify({ version: 1, include: ["/wp-json/wp/v2/*"], exclude: [] })) {
      fail("Pages Functions may run only on the fixed read-only WordPress REST path.");
    }
  }
  return { manifest, totalBytes };
}

function packageProjectName(siteId) {
  return `mp-${siteId}`;
}

function deploymentMessage(manifest, attemptId) {
  return `MithrilPress site ${manifest.site_id} revision ${manifest.revision_id} artifact ${manifest.artifact_sha256} attempt ${attemptId}`;
}

function publicationEndpoint(siteId) {
  return `${CONTROL_ORIGIN}/_mithrilpress/api/control/sites/${encodeURIComponent(siteId)}/publication/current`;
}

async function assertRevisionStillCurrent(siteId, token, manifest) {
  const response = await fetch(publicationEndpoint(siteId), {
    method: "HEAD",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok
      || response.headers.get("X-MithrilPress-Revision") !== manifest.revision_id
      || response.headers.get("X-MithrilPress-Snapshot-SHA256") !== manifest.snapshot_sha256) {
    fail("The published revision or digest changed after export; no Pages upload was attempted.");
  }
}

class CloudflareApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "CloudflareApiError";
    this.status = status;
  }
}

async function cloudflareJson(pathname, token, method, body, scopePrefix) {
  const url = new URL(pathname, PAGES_API_ORIGIN);
  if (url.origin !== PAGES_API_ORIGIN || !scopePrefix || !url.pathname.startsWith(scopePrefix)) {
    fail("Refusing a Cloudflare API request outside the pinned Pages account or DNS zone.");
  }
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  const responseBody = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(responseBody);
  } catch {
    fail(`Cloudflare returned a non-JSON response for ${method} ${url.pathname}.`);
  }
  if (!response.ok || parsed.success !== true) {
    const codes = Array.isArray(parsed.errors) ? parsed.errors.map((item) => item.code).filter(Number.isSafeInteger) : [];
    throw new CloudflareApiError(
      `Cloudflare API ${method} failed with HTTP ${response.status}${codes.length ? ` (error ${codes.join(",")})` : ""}.`,
      response.status,
    );
  }
  return parsed.result;
}

function accountPagesPrefix(accountId) {
  return `/client/v4/accounts/${encodeURIComponent(accountId)}/pages/`;
}

function zoneDnsPrefix(zoneId) {
  return `/client/v4/zones/${encodeURIComponent(zoneId)}/dns_records`;
}

async function cloudflarePagesJson(accountId, pathname, token, method = "GET", body) {
  return cloudflareJson(pathname, token, method, body, accountPagesPrefix(accountId));
}

async function cloudflareDnsJson(zoneId, pathname, token, method = "GET", body) {
  return cloudflareJson(pathname, token, method, body, zoneDnsPrefix(zoneId));
}

function accountApiPath(accountId, projectName, suffix = "") {
  return `/client/v4/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(projectName)}${suffix}`;
}

async function readProjectAndDomain(accountId, projectName, hostname, token) {
  const project = await cloudflarePagesJson(accountId, accountApiPath(accountId, projectName), token);
  if (!project || project.name !== projectName || typeof project.uses_functions !== "boolean"
      || !project.production_branch || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/.test(project.production_branch)
      || project.subdomain !== `${projectName}.pages.dev`
      || (project.source && Object.keys(project.source).length > 0)) {
    fail("The existing Pages project is not the expected static-only Direct Upload project.");
  }
  const domains = await cloudflarePagesJson(accountId, accountApiPath(accountId, projectName, "/domains"), token);
  if (!Array.isArray(domains) || domains.length !== 1) {
    fail("The Pages project must have exactly one custom domain attached.");
  }
  const domain = domains[0];
  if (domain.name !== hostname || domain.status !== "active"
      || domain.validation_data?.status !== "active" || domain.verification_data?.status !== "active") {
    fail("The exact MithrilPress hostname and its Cloudflare validation must already be active.");
  }
  return { project, domain };
}

async function listProductionDeployments(accountId, projectName, token) {
  const result = await cloudflarePagesJson(
    accountId, `${accountApiPath(accountId, projectName, "/deployments")}?env=production&per_page=10`, token,
  );
  if (!Array.isArray(result)) fail("Cloudflare returned an invalid Pages deployment list.");
  return result.filter((item) => item?.environment === "production" && !item.is_skipped)
    .sort((a, b) => String(b.created_on).localeCompare(String(a.created_on)));
}

function validateDeployment(deployment, projectName, requireFunctions = false) {
  if (!deployment || deployment.project_name !== projectName || !deployment.id
      || deployment.environment !== "production" || deployment.is_skipped
      || deployment.latest_stage?.status !== "success" || typeof deployment.uses_functions !== "boolean"
      || (requireFunctions && deployment.uses_functions !== true)) {
    fail("The Pages production deployment is not in a successful, readable state.");
  }
  const url = new URL(deployment.url);
  if (url.protocol !== "https:"
      || !(url.hostname === `${projectName}.pages.dev` || url.hostname.endsWith(`.${projectName}.pages.dev`))
      || url.username || url.password) {
    fail("Cloudflare returned an unexpected Pages deployment URL.");
  }
  return deployment;
}

async function loadPreviousReceipt(path, accountId, projectName, manifest, activeDeployment) {
  if (!path || !isAbsolute(path)) fail("MITHRILPRESS_PREVIOUS_RECEIPT_PATH must point to the last successful local receipt.");
  let receipt;
  try {
    receipt = JSON.parse(await readFile(path, "utf8"));
  } catch {
    fail("The previous publication receipt is missing or invalid JSON.");
  }
  const base = { ...receipt };
  const suppliedDigest = base.receipt_sha256;
  delete base.receipt_sha256;
  if (receipt.schema_version !== 1 || suppliedDigest !== sha256(JSON.stringify(base))
      || receipt.account_id !== accountId || receipt.project_name !== projectName
      || receipt.site_id !== manifest.site_id || receipt.hostname !== manifest.hostname
      || receipt.deployment_id !== activeDeployment?.id || !receipt.artifact_manifest
      || receipt.status !== "production-readback-passed") {
    fail("The previous receipt does not match the active Pages project, site, hostname, and production deployment.");
  }
  const previousManifest = checkedManifest(receipt.artifact_manifest);
  if (receipt.revision_id !== previousManifest.revision_id
      || receipt.artifact_sha256 !== previousManifest.artifact_sha256
      || receipt.snapshot_sha256 !== previousManifest.snapshot_sha256
      || receipt.verified_file_count !== previousManifest.files.filter((file) => file.path !== "/_headers" && file.path !== "/_routes.json").length
      || !receipt.deployment_commit_message
      || receipt.deployment_commit_message !== activeDeployment.deployment_trigger?.metadata?.commit_message) {
    fail("The previous receipt's publication identity or read-back count is inconsistent with its manifest.");
  }
  if (activeDeployment.uses_functions !== Boolean(previousManifest.pages_function_sha256)) {
    fail("The previous receipt's runtime manifest does not match the active Pages deployment.");
  }
  const deploymentUrl = new URL(receipt.deployment_url);
  if (deploymentUrl.protocol !== "https:"
      || !(deploymentUrl.hostname === `${projectName}.pages.dev` || deploymentUrl.hostname.endsWith(`.${projectName}.pages.dev`))) {
    fail("The previous receipt does not contain a verified Pages deployment URL.");
  }
  return receipt;
}

function publicAssetPath(pathname) {
  if (pathname === "/_headers" || pathname === "/_routes.json") return null;
  if (pathname.endsWith("/index.html")) return pathname.slice(0, -"index.html".length);
  if (pathname === "/index.html") return "/";
  return pathname;
}

async function fetchBounded(response, expectedLength) {
  if (!response.body) fail("Cloudflare returned an empty static asset response.");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > expectedLength || size > MAX_FILE_BYTES) {
      await reader.cancel();
      fail("A public Pages asset exceeded its manifest size.");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, size);
}

async function verifyManifestAtHostname(hostname, manifest) {
  const files = manifest.files.filter((file) => file.path !== "/_headers" && file.path !== "/_routes.json");
  let next = 0;
  let firstError = null;
  const workers = Array.from({ length: Math.min(4, files.length) }, async () => {
    while (!firstError && next < files.length) {
      const index = next;
      next += 1;
      const file = files[index];
      const path = publicAssetPath(file.path);
      const encodedPath = path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
      const url = `https://${hostname}${encodedPath}`;
      let verified = false;
      let lastReason = "the response did not match the manifest";
      for (let attempt = 0; attempt < 8 && !verified; attempt += 1) {
        try {
          const response = await fetch(url, {
            headers: { Accept: "*/*", "Accept-Encoding": "identity" },
            redirect: "error",
            signal: AbortSignal.timeout(20_000),
          });
          if (response.status !== 200) {
            lastReason = `HTTP ${response.status}`;
          } else {
            const bytes = await fetchBounded(response, file.byte_length);
            if (bytes.byteLength === file.byte_length && sha256(bytes) === file.sha256) verified = true;
            else lastReason = "the response length or SHA-256 differed";
          }
        } catch (error) {
          lastReason = error?.message ?? "the HTTPS read-back failed";
        }
        if (!verified && attempt < 7) await new Promise((resolveDelay) => setTimeout(resolveDelay, Math.min(500 * (attempt + 1), 2_000)));
      }
      if (!verified) firstError ??= new Error(`Public read-back failed for ${file.path}: ${lastReason}.`);
    }
  });
  await Promise.all(workers);
  if (firstError) throw firstError;
  return files.length;
}

async function fetchWordPressApiJson(hostname, pathname, expected) {
  const response = await fetch(`https://${hostname}${pathname}`, {
    headers: { Accept: "application/json", "Accept-Encoding": "identity" },
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  const contentType = response.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
  if (response.status !== 200 || contentType !== "application/json") {
    fail(`The published WordPress REST endpoint ${pathname} did not return JSON HTTP 200.`);
  }
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > 8 * 1024 * 1024) fail("A WordPress REST read-back exceeded its 8 MiB check limit.");
  let actual;
  try { actual = JSON.parse(text); } catch { fail(`The published WordPress REST endpoint ${pathname} returned invalid JSON.`); }
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`The published WordPress REST endpoint ${pathname} does not match the approved static API data.`);
  }
}

async function verifyWordPressApiAtHostname(hostname, artifactRoot) {
  let catalog;
  try { catalog = JSON.parse(await readFile(resolve(artifactRoot, "_mithrilpress-wp-api/index.json"), "utf8")); }
  catch { fail("The exported WordPress REST index is unavailable for publication read-back."); }
  const entries = Array.isArray(catalog?.entries) ? catalog.entries : [];
  for (const [endpoint, kind] of [["posts", "post"], ["pages", "page"]]) {
    const candidates = entries.filter((entry) => entry.kind === kind).sort((left, right) => {
      const date = (entry) => {
        const value = entry.date_gmt ?? entry.date;
        const timestamp = value ? Date.parse(value) : Number.NaN;
        return Number.isFinite(timestamp) ? timestamp : -1;
      };
      return date(right) - date(left) || left.api_id - right.api_id;
    });
    const expected = candidates.length
      ? [JSON.parse(await readFile(resolve(artifactRoot, `.${candidates[0].record_path}`), "utf8"))]
      : [];
    await fetchWordPressApiJson(hostname, `/wp-json/wp/v2/${endpoint}?page=1&per_page=1`, expected);
  }
  for (const [endpoint, taxonomy] of [["categories", "category"], ["tags", "post_tag"]]) {
    const terms = (Array.isArray(catalog.terms) ? catalog.terms : [])
      .filter((term) => term.taxonomy === taxonomy)
      .sort((a, b) => {
        const left = a.name.toLowerCase();
        const right = b.name.toLowerCase();
        return (left < right ? -1 : left > right ? 1 : a.term_id - b.term_id);
      });
    const first = terms[0];
    const expected = first ? [{
      id: first.term_id,
      count: first.count,
      description: first.description_html,
      link: `https://${hostname}/${taxonomy === "category" ? "category" : "tag"}/${encodeURIComponent(first.slug)}/`,
      name: first.name,
      slug: first.slug,
      taxonomy,
      meta: {},
      ...(taxonomy === "category" ? { parent: first.parent_term_id } : {}),
    }] : [];
    await fetchWordPressApiJson(hostname, `/wp-json/wp/v2/${endpoint}?hide_empty=false&page=1&per_page=1`, expected);
  }
  const media = Array.isArray(catalog.media) ? catalog.media : [];
  if (media.length) {
    const asset = media.find((item) => item.wordpress_source_id !== null) ?? media[0];
    const id = asset.wordpress_source_id ?? asset.id;
    const link = `https://${hostname}${asset.path}`;
    await fetchWordPressApiJson(hostname, `/wp-json/wp/v2/media/${id}`, {
      id,
      date: asset.created_at,
      slug: `media-${asset.id}`,
      status: "inherit",
      type: "attachment",
      link,
      title: { rendered: asset.alt_text || `Image ${asset.id}` },
      author: 0,
      media_type: "image",
      mime_type: asset.content_type,
      media_details: { width: asset.width, height: asset.height, file: `media-${asset.id}` },
      post: 0,
      source_url: link,
      alt_text: asset.alt_text,
    });
  }
}

async function assertHttpsHostReady(hostname) {
  const response = await fetch(`https://${hostname}/`, {
    method: "HEAD",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status >= 500) fail("The exact MithrilPress hostname is not serving through HTTPS yet.");
}

async function writeNewReceipt(path, baseReceipt) {
  if (!path || !isAbsolute(path)) fail("MITHRILPRESS_PUBLISH_RECEIPT_PATH must be an absolute new file path.");
  await mkdir(dirname(path), { recursive: true });
  const receipt = { ...baseReceipt, receipt_sha256: sha256(JSON.stringify(baseReceipt)) };
  try {
    await writeFile(path, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error?.code === "EEXIST") fail("The publication receipt path already exists; choose a new path to preserve prior evidence.");
    throw error;
  }
  return receipt;
}

function runWrangler(wranglerPath, outputFile, projectName, branch, commitMessage, artifactRoot, env) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [
      wranglerPath, "pages", "deploy", artifactRoot,
      "--project-name", projectName,
      "--branch", branch,
      "--commit-message", commitMessage,
    ], { cwd: PACKAGE_ROOT, env: { ...env, WRANGLER_OUTPUT_FILE_PATH: outputFile }, stdio: "inherit" });
    child.once("error", rejectRun);
    child.once("exit", (code, signal) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`Wrangler Pages Direct Upload failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}.`));
    });
  });
}

async function readStructuredDeployResult(outputFile) {
  let lines;
  try {
    lines = (await readFile(outputFile, "utf8")).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  } catch {
    fail("Wrangler did not write a valid structured Pages deployment result.");
  }
  if (lines.some((item) => item.type === "command-failed") || !lines.some((item) => item.type === "pages-deploy")) {
    fail("Wrangler did not confirm a completed Pages Direct Upload.");
  }
}

async function findPublicationDeployment(accountId, projectName, previousId, token, startedAt, expectedMessage, attempts) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const deployments = await listProductionDeployments(accountId, projectName, token);
    const match = deployments.find((item) => item.id !== previousId
      && Date.parse(item.created_on) >= startedAt - 120_000
      && item.deployment_trigger?.metadata?.commit_message === expectedMessage);
    if (match) return match;
    if (attempt + 1 < attempts) await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_000));
  }
  return null;
}

async function waitForNewProduction(accountId, projectName, previousId, token, startedAt, expectedMessage) {
  const deployment = await findPublicationDeployment(
    accountId, projectName, previousId, token, startedAt, expectedMessage, 30,
  );
  if (deployment) return deployment;
  fail("Cloudflare did not read back a new production deployment after Direct Upload.");
}

async function rollbackAndVerify(accountId, projectName, previousDeployment, failedDeployment, failedMessage, previousManifest, hostname, token) {
  if (!previousDeployment) fail("No prior production deployment exists for automatic rollback.");
  const current = (await listProductionDeployments(accountId, projectName, token))[0];
  if (!current || current.id !== failedDeployment?.id
      || current.deployment_trigger?.metadata?.commit_message !== failedMessage) {
    fail("A newer Pages publication exists; automatic rollback was withheld to avoid overwriting another publisher.");
  }
  await cloudflarePagesJson(accountId, accountApiPath(accountId, projectName, `/deployments/${encodeURIComponent(previousDeployment.id)}/rollback`), token, "POST");
  let restored = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const deployments = await listProductionDeployments(accountId, projectName, token);
    const latest = deployments[0];
    if (latest && latest.id !== failedDeployment.id && latest.latest_stage?.status === "success") {
      await verifyManifestAtHostname(hostname, previousManifest);
      restored = true;
      break;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_000));
  }
  if (!restored) fail("The previous Pages deployment rollback could not be verified.");
}

function assertExpectedPageHostname(hostname) {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.sites\.mithril\.love$/.test(hostname ?? "")) {
    fail("The initial-publication confirmation must be one canonical hostname under sites.mithril.love.");
  }
}

function bootstrapManifest(sourceManifest) {
  const files = [
    {
      path: "/_routes.json",
      bytes: Buffer.from('{"version":1,"include":["/wp-json/wp/v2/*"],"exclude":[]}\n', "utf8"),
    },
    {
      path: "/_headers",
      bytes: Buffer.from("/*\n  X-Robots-Tag: noindex, nofollow, noarchive\n  Cache-Control: no-store\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Content-Security-Policy: default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'\n", "utf8"),
    },
    {
      path: "/index.html",
      bytes: Buffer.from("<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"robots\" content=\"noindex,nofollow,noarchive\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Site setup in progress</title><body><main><h1>Site setup in progress</h1><p>The site owner has not published this site yet.</p></main></body></html>\n", "utf8"),
    },
    {
      path: "/robots.txt",
      bytes: Buffer.from("User-agent: *\nDisallow: /\n", "utf8"),
    },
  ].map(({ path, bytes }) => ({ path, bytes, byte_length: bytes.byteLength, sha256: sha256(bytes) }))
    .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const base = {
    schema_version: 1,
    site_id: sourceManifest.site_id,
    hostname: sourceManifest.hostname,
    revision_id: sourceManifest.revision_id,
    snapshot_sha256: sourceManifest.snapshot_sha256,
    pages_function_sha256: sourceManifest.pages_function_sha256,
    files: files.map(({ path, byte_length, sha256: digest }) => ({ path, byte_length, sha256: digest })),
  };
  return {
    manifest: { ...base, artifact_sha256: sha256(JSON.stringify(base)) },
    files,
  };
}

async function writeBootstrapArtifact(root, sourceManifest) {
  const built = bootstrapManifest(sourceManifest);
  await mkdir(root, { recursive: true });
  for (const file of built.files) {
    const target = resolve(root, `.${file.path}`);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.bytes, { flag: "wx", mode: 0o644 });
  }
  await inspectArtifact(root, built.manifest);
  return built.manifest;
}

async function listPagesProjects(accountId, token) {
  const projects = await cloudflarePagesJson(
    accountId,
    `/client/v4/accounts/${encodeURIComponent(accountId)}/pages/projects?page=1&per_page=100`,
    token,
  );
  if (!Array.isArray(projects)) fail("Cloudflare returned an invalid Pages project inventory.");
  return projects;
}

async function readProjectOrMissing(accountId, projectName, token) {
  try {
    return await cloudflarePagesJson(accountId, accountApiPath(accountId, projectName), token);
  } catch (error) {
    if (error instanceof CloudflareApiError && error.status === 404) return null;
    throw error;
  }
}

function validateBootstrapProject(project, projectName) {
  if (!project || typeof project.id !== "string" || !project.id || project.name !== projectName
      || project.subdomain !== `${projectName}.pages.dev`
      || project.production_branch !== "main"
      || (project.source && Object.keys(project.source).length > 0)) {
    fail("The Pages project is not the expected direct-upload static project for this site.");
  }
  return project;
}

async function getPagesDomains(accountId, projectName, token) {
  const result = await cloudflarePagesJson(accountId, accountApiPath(accountId, projectName, "/domains"), token);
  if (!Array.isArray(result)) fail("Cloudflare returned an invalid Pages custom-domain list.");
  return result;
}

async function readPinnedZone(accountId, zoneId, token) {
  const zone = await cloudflareJson(
    `/client/v4/zones/${encodeURIComponent(zoneId)}`,
    token,
    "GET",
    undefined,
    `/client/v4/zones/${encodeURIComponent(zoneId)}`,
  );
  if (zone?.id !== zoneId || zone?.name !== PINNED_ZONE_NAME || zone?.account?.id !== accountId) {
    fail("The pinned Cloudflare zone does not belong to the selected Pages account.");
  }
  return zone;
}

async function getHostnameDnsRecords(zoneId, hostname, token) {
  const query = new URLSearchParams({ name: hostname, per_page: "100" });
  const records = await cloudflareDnsJson(
    zoneId,
    `${zoneDnsPrefix(zoneId)}?${query.toString()}`,
    token,
  );
  if (!Array.isArray(records)) fail("Cloudflare returned an invalid DNS record list for the exact hostname.");
  return records;
}

function isExpectedPagesCname(record, hostname, pagesSubdomain) {
  return record?.type === "CNAME"
    && record.name === hostname
    && String(record.content).replace(/\.$/u, "") === pagesSubdomain
    && record.proxied === true;
}

async function ensurePagesCname(zoneId, hostname, pagesSubdomain, token) {
  let records = await getHostnameDnsRecords(zoneId, hostname, token);
  if (records.length === 0) {
    try {
      await cloudflareDnsJson(zoneId, zoneDnsPrefix(zoneId), token, "POST", {
        type: "CNAME",
        name: hostname,
        content: pagesSubdomain,
        proxied: true,
        ttl: 1,
      });
    } catch (error) {
      records = await getHostnameDnsRecords(zoneId, hostname, token);
      if (records.length !== 1 || !isExpectedPagesCname(records[0], hostname, pagesSubdomain)) throw error;
    }
    records = await getHostnameDnsRecords(zoneId, hostname, token);
  }
  if (records.length !== 1 || !isExpectedPagesCname(records[0], hostname, pagesSubdomain)) {
    fail("The exact Pages hostname has a DNS record that does not match this site's proxied Pages CNAME.");
  }
  return records[0];
}

async function ensurePagesProject(accountId, projectName, hostname, token) {
  let project = await readProjectOrMissing(accountId, projectName, token);
  if (project) return { project: validateBootstrapProject(project, projectName), created: false };

  let projects = await listPagesProjects(accountId, token);
  if (projects.some((item) => item.name !== projectName && Array.isArray(item.domains) && item.domains.includes(hostname))) {
    fail("The requested hostname is already attached to another Pages project.");
  }
  if (projects.length >= MAX_MITHRILPRESS_PAGES_PROJECTS) {
    fail(`MithrilPress reached its ${MAX_MITHRILPRESS_PAGES_PROJECTS}-project account cap; onboarding stopped before a provider write.`);
  }

  // Re-read immediately before the create to minimize races with other account users.
  projects = await listPagesProjects(accountId, token);
  if (projects.length >= MAX_MITHRILPRESS_PAGES_PROJECTS || projects.some((item) => item.name === projectName)) {
    fail("The Pages inventory changed during bootstrap preflight; no project was created.");
  }
  const created = await cloudflarePagesJson(
    accountId,
    `/client/v4/accounts/${encodeURIComponent(accountId)}/pages/projects`,
    token,
    "POST",
    { name: projectName, production_branch: "main" },
  );
  if (!created || created.name !== projectName || !created.id
      || created.subdomain !== `${projectName}.pages.dev`
      || created.production_branch !== "main") {
    fail("Cloudflare did not return the expected new Direct Upload Pages project.");
  }
  return { project: validateBootstrapProject(created, projectName), created: true };
}

async function addOrResumePagesDomain(accountId, projectName, hostname, project, zoneId, token) {
  let domains = await getPagesDomains(accountId, projectName, token);
  if (domains.length === 0) {
    const projects = await listPagesProjects(accountId, token);
    if (projects.some((item) => item.name !== projectName && Array.isArray(item.domains) && item.domains.includes(hostname))) {
      fail("The requested hostname was claimed by another Pages project during bootstrap.");
    }
    const dnsBefore = await getHostnameDnsRecords(zoneId, hostname, token);
    if (dnsBefore.length > 0) {
      fail("The exact hostname already has DNS records; bootstrap will not replace or adopt them.");
    }
    await cloudflarePagesJson(
      accountId,
      accountApiPath(accountId, projectName, "/domains"),
      token,
      "POST",
      { name: hostname },
    );
    domains = await getPagesDomains(accountId, projectName, token);
  }
  if (domains.length !== 1 || domains[0]?.name !== hostname) {
    fail("The Pages project must have exactly the requested custom hostname before activation.");
  }
  await ensurePagesCname(zoneId, hostname, project.subdomain, token);
  for (let attempt = 0; attempt < 30; attempt += 1) {
    domains = await getPagesDomains(accountId, projectName, token);
    if (domains.length !== 1 || domains[0]?.name !== hostname) {
      fail("The Pages custom-domain association changed during activation.");
    }
    const domain = domains[0];
    if (domain.status === "active"
        && domain.validation_data?.status === "active"
        && domain.verification_data?.status === "active") {
      await assertHttpsHostReady(hostname);
      return domain;
    }
    const domainStatuses = [domain.status, domain.validation_data?.status, domain.verification_data?.status];
    const rejectedStatus = domainStatuses.find((status) => ["deactivated", "blocked", "error"].includes(status));
    if (rejectedStatus) {
      fail(`The Pages custom hostname validation entered status ${rejectedStatus}.`);
    }
    const knownStatuses = new Set(["initializing", "pending", "pending_validation", "pending_ssl", "active"]);
    if (domainStatuses.some((status) => !knownStatuses.has(status))) {
      fail("Cloudflare returned an unknown custom-domain validation status; refusing publication.");
    }
    if (attempt < 29) await new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000));
  }
  fail("The exact Pages hostname remains pending TLS or DNS validation. The project and owner-approved content remain available on pages.dev; rerun the same initial-publication command after provider validation completes.");
}

function deploymentMatchesManifest(deployment, projectName, manifest) {
  const message = deployment?.deployment_trigger?.metadata?.commit_message;
  const prefix = `MithrilPress site ${manifest.site_id} revision ${manifest.revision_id} artifact ${manifest.artifact_sha256} attempt `;
  return deployment?.project_name === projectName
    && deployment.environment === "production"
    && typeof message === "string"
    && message.startsWith(prefix)
    && /^[0-9a-f-]{36}$/u.test(message.slice(prefix.length));
}

async function pathExists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function deployBootstrapPlaceholder({
  accountId,
  projectName,
  project,
  sourceManifest,
  previousReceiptPath,
  scratch,
  wranglerPath,
  token,
  env,
}) {
  const placeholderRoot = resolve(scratch, "bootstrap-placeholder");
  const placeholderManifest = await writeBootstrapArtifact(placeholderRoot, sourceManifest);
  const deployments = await listProductionDeployments(accountId, projectName, token);
  if (deployments.length > 0) {
    const active = validateDeployment(deployments[0], projectName);
    if (deploymentMatchesManifest(active, projectName, sourceManifest)) {
      await verifyManifestAtHostname(project.subdomain, sourceManifest);
      return { deployment: active, previousReceipt: null, alreadyPublished: true, manifest: sourceManifest };
    }

    let receipt = null;
    if (await pathExists(previousReceiptPath)) {
      try {
        receipt = await loadPreviousReceipt(previousReceiptPath, accountId, projectName, sourceManifest, active);
      } catch (error) {
        // A previous successful first publish may have completed before its final receipt was written.
        // It is accepted only when the current deployment independently matches the owner-approved manifest.
        throw error;
      }
      const recordedManifest = checkedManifest(receipt.artifact_manifest);
      await verifyManifestAtHostname(project.subdomain, recordedManifest);
      return { deployment: active, previousReceipt: receipt, alreadyPublished: false, manifest: recordedManifest };
    }

    if (!deploymentMatchesManifest(active, projectName, placeholderManifest)) {
      fail("The Pages project has an unrecognized production deployment and no matching bootstrap receipt; refusing to overwrite it.");
    }
    const verifiedFiles = await verifyManifestAtHostname(project.subdomain, placeholderManifest);
    receipt = await writeNewReceipt(previousReceiptPath, {
      schema_version: 1,
      account_id: accountId,
      project_name: projectName,
      site_id: placeholderManifest.site_id,
      hostname: placeholderManifest.hostname,
      revision_id: placeholderManifest.revision_id,
      artifact_sha256: placeholderManifest.artifact_sha256,
      snapshot_sha256: placeholderManifest.snapshot_sha256,
      previous_deployment_id: null,
      deployment_id: active.id,
      deployment_commit_message: active.deployment_trigger?.metadata?.commit_message,
      deployment_url: active.url,
      production_branch: project.production_branch,
      artifact_manifest: placeholderManifest,
      verified_file_count: verifiedFiles,
      verified_at: new Date().toISOString(),
      status: "production-readback-passed",
    });
    return { deployment: active, previousReceipt: receipt, alreadyPublished: false, manifest: placeholderManifest };
  }

  if (await pathExists(previousReceiptPath)) {
    fail("A bootstrap receipt exists but the Pages project has no production deployment; reconcile the receipt before retrying.");
  }
  const attemptId = randomUUID();
  const message = deploymentMessage(placeholderManifest, attemptId);
  const startedAt = Date.now();
  const outputPath = resolve(scratch, "wrangler-bootstrap-output.ndjson");
  await writeFile(outputPath, "", { flag: "wx", mode: 0o600 });
  await runWrangler(wranglerPath, outputPath, projectName, project.production_branch, message, placeholderRoot, env);
  await readStructuredDeployResult(outputPath);
  const deployment = validateDeployment(
    await waitForNewProduction(accountId, projectName, null, token, startedAt, message),
    projectName,
    true,
  );
  const verifiedFiles = await verifyManifestAtHostname(project.subdomain, placeholderManifest);
  const previousReceipt = await writeNewReceipt(previousReceiptPath, {
    schema_version: 1,
    account_id: accountId,
    project_name: projectName,
    site_id: placeholderManifest.site_id,
    hostname: placeholderManifest.hostname,
    revision_id: placeholderManifest.revision_id,
    artifact_sha256: placeholderManifest.artifact_sha256,
    snapshot_sha256: placeholderManifest.snapshot_sha256,
    previous_deployment_id: null,
    deployment_id: deployment.id,
    deployment_commit_message: message,
    deployment_url: deployment.url,
    production_branch: project.production_branch,
    artifact_manifest: placeholderManifest,
    verified_file_count: verifiedFiles,
    verified_at: new Date().toISOString(),
    status: "production-readback-passed",
  });
  return { deployment, previousReceipt, alreadyPublished: false, manifest: placeholderManifest };
}

async function prepareInitialPagesPublication({
  accountId,
  zoneId,
  projectName,
  hostname,
  manifest,
  previousReceiptPath,
  scratch,
  wranglerPath,
  cloudflareToken,
  wranglerEnv,
}) {
  await readPinnedZone(accountId, zoneId, cloudflareToken);
  let project = await readProjectOrMissing(accountId, projectName, cloudflareToken);
  const projectWasPresent = Boolean(project);
  if (!project) {
    if (await pathExists(previousReceiptPath)) {
      fail("A bootstrap receipt exists without its Pages project; reconcile the orphaned receipt before creating provider resources.");
    }
    const records = await getHostnameDnsRecords(zoneId, hostname, cloudflareToken);
    if (records.length > 0) fail("The requested hostname already has DNS records; no Pages project was created.");
  }
  const ensured = await ensurePagesProject(accountId, projectName, hostname, cloudflareToken);
  project = ensured.project;
  if (!projectWasPresent && !ensured.created) {
    fail("A Pages project appeared during bootstrap preflight; refusing to adopt it.");
  }
  const projectDomains = await getPagesDomains(accountId, projectName, cloudflareToken);
  if (projectDomains.some((domain) => domain?.name !== hostname)) {
    fail("The Pages project already has a different custom domain; bootstrap will not detach it.");
  }

  const bootstrap = await deployBootstrapPlaceholder({
    accountId,
    projectName,
    project,
    sourceManifest: manifest,
    previousReceiptPath,
    scratch,
    wranglerPath,
    token: cloudflareToken,
    env: wranglerEnv,
  });

  if (bootstrap.alreadyPublished) {
    await addOrResumePagesDomain(accountId, projectName, hostname, project, zoneId, cloudflareToken);
    await readProjectAndDomain(accountId, projectName, hostname, cloudflareToken);
    const verifiedFiles = await verifyManifestAtHostname(hostname, manifest);
    return { project, deployment: bootstrap.deployment, previousReceipt: bootstrap.previousReceipt, alreadyPublished: true, verifiedFiles };
  }

  // A newly initialized project contains only the noindex placeholder until the custom
  // hostname has a verified Pages association, exact CNAME, active TLS, and HTTPS read-back.
  await addOrResumePagesDomain(accountId, projectName, hostname, project, zoneId, cloudflareToken);
  await readProjectAndDomain(accountId, projectName, hostname, cloudflareToken);
  await verifyManifestAtHostname(hostname, bootstrap.manifest);
  return {
    project,
    deployment: bootstrap.deployment,
    previousReceipt: bootstrap.previousReceipt,
    alreadyPublished: false,
    verifiedFiles: 0,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const initializeIndex = args.indexOf("--initialize-hostname");
  const initialHostname = initializeIndex >= 0 ? args[initializeIndex + 1] : null;
  const isInitialPublication = initialHostname !== null;
  if (!args.includes("--confirm-publication")
      || (isInitialPublication
        ? args.length !== 3 || args.filter((arg) => arg === "--confirm-publication").length !== 1
          || args.filter((arg) => arg === "--initialize-hostname").length !== 1
          || !initialHostname || initialHostname.startsWith("--")
        : args.length !== 1 || args[0] !== "--confirm-publication")) {
    fail("Use --confirm-publication after reviewing the approved revision. For the first publish, also pass --initialize-hostname <exact-site-hostname>.");
  }
  if (isInitialPublication) assertExpectedPageHostname(initialHostname);
  if (requiredEnvironment("MITHRILPRESS_FUNCTIONS_PLAN_CONFIRMATION") !== "workers-free") {
    fail("Pages Functions publication requires the account to be verified on Workers Free to prevent paid overage.");
  }
  if (requiredEnvironment("MITHRILPRESS_FUNCTIONS_EXHAUSTION_CONFIRMATION") !== "fail-closed") {
    fail("Pages Functions publication requires the project runtime to be verified as fail-closed at its free request limit.");
  }
  const controlUrl = new URL(requiredEnvironment("MITHRILPRESS_CONTROL_URL"));
  if (controlUrl.origin !== CONTROL_ORIGIN || controlUrl.pathname !== "/" || controlUrl.search || controlUrl.hash
      || controlUrl.username || controlUrl.password) {
    fail(`MITHRILPRESS_CONTROL_URL must be the exact ${CONTROL_ORIGIN} origin.`);
  }
  const siteId = requiredEnvironment("MITHRILPRESS_SITE_ID");
  if (!/^[a-f0-9-]{36}$/.test(siteId)) fail("MITHRILPRESS_SITE_ID must be a MithrilPress site UUID.");
  const ownerToken = requiredEnvironment("MITHRILPRESS_OWNER_TOKEN");
  const expectedRevision = requiredEnvironment("MITHRILPRESS_EXPECTED_REVISION");
  if (!/^[a-f0-9-]{36}$/.test(expectedRevision)) fail("MITHRILPRESS_EXPECTED_REVISION must be the reviewed revision UUID.");
  const accountId = requiredEnvironment("CLOUDFLARE_ACCOUNT_ID");
  const expectedAccountId = requiredEnvironment("MITHRILPRESS_EXPECTED_CLOUDFLARE_ACCOUNT_ID");
  if (!/^[a-f0-9]{32}$/.test(accountId) || accountId !== expectedAccountId) {
    fail("CLOUDFLARE_ACCOUNT_ID must exactly match the standalone publisher's pinned account ID.");
  }
  const zoneId = isInitialPublication ? requiredEnvironment("CLOUDFLARE_ZONE_ID") : null;
  const expectedZoneId = isInitialPublication
    ? requiredEnvironment("MITHRILPRESS_EXPECTED_CLOUDFLARE_ZONE_ID")
    : null;
  if (isInitialPublication
      && (!/^[a-f0-9]{32}$/.test(zoneId) || zoneId !== expectedZoneId)) {
    fail("CLOUDFLARE_ZONE_ID must exactly match the standalone publisher's pinned mithril.love zone ID.");
  }
  const cloudflareToken = requiredEnvironment("CLOUDFLARE_API_TOKEN");
  const publishReceiptPath = requiredEnvironment("MITHRILPRESS_PUBLISH_RECEIPT_PATH");
  const previousReceiptPath = requiredEnvironment("MITHRILPRESS_PREVIOUS_RECEIPT_PATH");
  if (resolve(publishReceiptPath) === resolve(previousReceiptPath)) {
    fail("MITHRILPRESS_PUBLISH_RECEIPT_PATH and MITHRILPRESS_PREVIOUS_RECEIPT_PATH must be different files.");
  }
  if (!isAbsolute(publishReceiptPath) || !isAbsolute(previousReceiptPath)) {
    fail("Publisher receipt paths must be absolute local paths.");
  }
  const scratchRoot = requiredEnvironment("MITHRILPRESS_SCRATCH_DIR");
  if (!isAbsolute(scratchRoot)) fail("MITHRILPRESS_SCRATCH_DIR must be an existing absolute scratch directory.");
  const scratchInfo = await lstat(scratchRoot);
  if (!scratchInfo.isDirectory() || scratchInfo.isSymbolicLink()) {
    fail("MITHRILPRESS_SCRATCH_DIR must be a real directory on the selected work volume.");
  }
  const packageLock = JSON.parse(await readFile(resolve(PACKAGE_ROOT, "package-lock.json"), "utf8"));
  const wranglerVersion = packageLock.packages?.["node_modules/wrangler"]?.version;
  const wranglerPath = resolve(PACKAGE_ROOT, "node_modules/wrangler/bin/wrangler.js");
  if (!wranglerVersion || !/^4\./.test(wranglerVersion)) fail("Install the package's locked Wrangler v4 before publishing.");
  try {
    const wranglerInfo = await lstat(wranglerPath);
    if (!wranglerInfo.isFile() || wranglerInfo.isSymbolicLink()) fail("The locked Wrangler entrypoint is not a regular file.");
  } catch {
    fail("Install this package with npm ci before invoking the Pages publisher; network installs are disabled here.");
  }

  if (await pathExists(publishReceiptPath)) {
    fail("MITHRILPRESS_PUBLISH_RECEIPT_PATH already exists; choose a fresh path.");
  }

  const scratch = await mkdtemp(resolve(scratchRoot, "mithrilpress-pages-publish-"));
  const artifactRoot = resolve(scratch, "site");
  const wranglerOutput = resolve(scratch, "wrangler-output.ndjson");
  let manifest;
  let deployment;
  let previous;
  let previousReceipt;
  let deploymentStartedAt;
  let attemptId;
  let expectedDeploymentMessage;
  const projectName = packageProjectName(siteId);
  try {
    const exportEnv = {
      ...process.env,
      MITHRILPRESS_OUTPUT_DIR: artifactRoot,
      MITHRILPRESS_EXPECTED_REVISION: expectedRevision,
    };
    const exporterPath = resolve(PACKAGE_ROOT, "scripts/export-static-pages.mjs");
    const exported = await new Promise((resolveExport, rejectExport) => {
      const child = spawn(process.execPath, [exporterPath], {
        cwd: PACKAGE_ROOT,
        env: exportEnv,
        stdio: ["ignore", "pipe", "inherit"],
      });
      const stdout = [];
      let outputBytes = 0;
      child.stdout.on("data", (chunk) => {
        outputBytes += chunk.byteLength;
        if (outputBytes > 8 * 1024 * 1024) {
          child.kill("SIGTERM");
          rejectExport(new Error("The local exporter result exceeded its safety limit."));
          return;
        }
        stdout.push(Buffer.from(chunk));
      });
      child.once("error", rejectExport);
      child.once("exit", (code) => {
        if (code !== 0) rejectExport(new Error(`The local Pages artifact export failed with exit code ${code}.`));
        else {
          try {
            resolveExport(JSON.parse(Buffer.concat(stdout).toString("utf8")));
          } catch {
            rejectExport(new Error("The local exporter did not return valid JSON."));
          }
        }
      });
    });
    if (exported.deployed !== false || resolve(exported.output_directory) !== artifactRoot
        || exported.revision_id !== expectedRevision) {
      fail("The local exporter returned an unexpected destination or revision.");
    }
    manifest = checkedManifest(exported.artifact_manifest);
    if (!manifest.pages_function_sha256
        || manifest.site_id !== siteId || manifest.revision_id !== expectedRevision
        || exported.artifact_sha256 !== manifest.artifact_sha256) {
      fail("The exported artifact is not bound to the requested site and owner-approved revision.");
    }
    await inspectArtifact(artifactRoot, manifest);

    let project;
    if (isInitialPublication) {
      if (manifest.hostname !== initialHostname) {
        fail("The confirmed initial hostname does not match the owner-approved publication snapshot.");
      }
      const bootstrap = await prepareInitialPagesPublication({
        accountId,
        zoneId,
        projectName,
        hostname: initialHostname,
        manifest,
        previousReceiptPath,
        scratch,
        wranglerPath,
        cloudflareToken,
        wranglerEnv: {
          ...process.env,
          CLOUDFLARE_ACCOUNT_ID: accountId,
          CLOUDFLARE_API_TOKEN: cloudflareToken,
        },
      });
      project = bootstrap.project;
      if (bootstrap.alreadyPublished) {
        await verifyWordPressApiAtHostname(manifest.hostname, artifactRoot);
        await assertRevisionStillCurrent(siteId, ownerToken, manifest);
        const receipt = await writeNewReceipt(publishReceiptPath, {
          schema_version: 1,
          account_id: accountId,
          project_name: projectName,
          site_id: siteId,
          hostname: manifest.hostname,
          revision_id: manifest.revision_id,
          artifact_sha256: manifest.artifact_sha256,
          snapshot_sha256: manifest.snapshot_sha256,
          previous_deployment_id: bootstrap.previousReceipt?.deployment_id ?? null,
          deployment_id: bootstrap.deployment.id,
          deployment_commit_message: bootstrap.deployment.deployment_trigger?.metadata?.commit_message,
          deployment_url: bootstrap.deployment.url,
          production_branch: project.production_branch,
          artifact_manifest: manifest,
          verified_file_count: bootstrap.verifiedFiles,
          verified_at: new Date().toISOString(),
          status: "production-readback-passed",
        });
        process.stdout.write(`${JSON.stringify({ ...receipt, receipt_path: publishReceiptPath }, null, 2)}\n`);
        return;
      }
      previous = bootstrap.deployment;
      previousReceipt = bootstrap.previousReceipt;
    } else {
      const established = await readProjectAndDomain(accountId, projectName, manifest.hostname, cloudflareToken);
      project = established.project;
      const activeDeployments = await listProductionDeployments(accountId, projectName, cloudflareToken);
      previous = validateDeployment(activeDeployments[0], projectName);
      previousReceipt = await loadPreviousReceipt(previousReceiptPath, accountId, projectName, manifest, previous);
      await verifyManifestAtHostname(manifest.hostname, previousReceipt.artifact_manifest);
      await assertHttpsHostReady(manifest.hostname);
      await assertRevisionStillCurrent(siteId, ownerToken, manifest);
    }

    const recheckedDeployments = await listProductionDeployments(accountId, projectName, cloudflareToken);
    if (recheckedDeployments[0]?.id !== previous.id) {
      fail("The current production deployment changed during preflight; refusing a concurrent publish.");
    }
    attemptId = randomUUID();
    expectedDeploymentMessage = deploymentMessage(manifest, attemptId);
    deploymentStartedAt = Date.now();
    await inspectArtifact(artifactRoot, manifest);
    await assertRevisionStillCurrent(siteId, ownerToken, manifest);
    await writeFile(wranglerOutput, "", { flag: "wx", mode: 0o600 });
    await runWrangler(wranglerPath, wranglerOutput, projectName, project.production_branch, expectedDeploymentMessage, artifactRoot, {
      ...process.env,
      CLOUDFLARE_ACCOUNT_ID: accountId,
      CLOUDFLARE_API_TOKEN: cloudflareToken,
    });
    await readStructuredDeployResult(wranglerOutput);
    deployment = await waitForNewProduction(
      accountId, projectName, previous.id, cloudflareToken, deploymentStartedAt, expectedDeploymentMessage,
    );
    validateDeployment(deployment, projectName, true);
    const verifiedFiles = await verifyManifestAtHostname(manifest.hostname, manifest);
    await verifyWordPressApiAtHostname(manifest.hostname, artifactRoot);
    await assertRevisionStillCurrent(siteId, ownerToken, manifest);
    const receipt = await writeNewReceipt(publishReceiptPath, {
      schema_version: 1,
      account_id: accountId,
      project_name: projectName,
      site_id: siteId,
      hostname: manifest.hostname,
      revision_id: manifest.revision_id,
      artifact_sha256: manifest.artifact_sha256,
      snapshot_sha256: manifest.snapshot_sha256,
      previous_deployment_id: previous.id,
      deployment_id: deployment.id,
      deployment_commit_message: expectedDeploymentMessage,
      deployment_url: deployment.url,
      production_branch: project.production_branch,
      artifact_manifest: manifest,
      verified_file_count: verifiedFiles,
      verified_at: new Date().toISOString(),
      status: "production-readback-passed",
    });
    process.stdout.write(`${JSON.stringify({ ...receipt, receipt_path: publishReceiptPath }, null, 2)}\n`);
  } catch (error) {
    if (!deployment && previous && expectedDeploymentMessage && deploymentStartedAt) {
      try {
        deployment = await findPublicationDeployment(
          accountId, projectName, previous.id, cloudflareToken, deploymentStartedAt, expectedDeploymentMessage, 4,
        );
      } catch {
        // Preserve the original failure; rollback is attempted only after the API identifies this exact attempt.
      }
    }
    if (deployment && previous && previousReceipt) {
      try {
        await rollbackAndVerify(
          accountId, projectName, previous, deployment, expectedDeploymentMessage,
          previousReceipt.artifact_manifest, manifest.hostname, cloudflareToken,
        );
        process.stderr.write("The new deployment failed read-back; the previous verified static publication was restored.\n");
      } catch (rollbackError) {
        process.stderr.write(`Automatic Pages rollback was not verified: ${rollbackError.message}\n`);
      }
    }
    throw error;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
