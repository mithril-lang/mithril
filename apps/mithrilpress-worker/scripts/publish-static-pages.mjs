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
    if (file.path === "/_routes.json" || file.path === "/_worker.js"
        || file.path.startsWith("/functions/") || file.path.startsWith("/.wrangler/")) {
      fail("Only static assets may be published; Pages Functions and runtime bundles are disabled.");
    }
    paths.add(file.path);
    previousPath = file.path;
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

async function cloudflareJson(pathname, token, method = "GET") {
  const url = new URL(pathname, PAGES_API_ORIGIN);
  if (url.origin !== PAGES_API_ORIGIN || !url.pathname.startsWith("/client/v4/accounts/")) {
    fail("Refusing a Cloudflare API request outside the selected account.");
  }
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    fail(`Cloudflare returned a non-JSON response for ${method} ${url.pathname}.`);
  }
  if (!response.ok || parsed.success !== true) {
    const codes = Array.isArray(parsed.errors) ? parsed.errors.map((item) => item.code).filter(Number.isSafeInteger) : [];
    fail(`Cloudflare Pages API ${method} failed with HTTP ${response.status}${codes.length ? ` (error ${codes.join(",")})` : ""}.`);
  }
  return parsed.result;
}

function accountApiPath(accountId, projectName, suffix = "") {
  return `/client/v4/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(projectName)}${suffix}`;
}

async function readProjectAndDomain(accountId, projectName, hostname, token) {
  const project = await cloudflareJson(accountApiPath(accountId, projectName), token);
  if (!project || project.name !== projectName || project.uses_functions !== false
      || !project.production_branch || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/.test(project.production_branch)
      || project.subdomain !== `${projectName}.pages.dev`
      || (project.source && Object.keys(project.source).length > 0)) {
    fail("The existing Pages project is not the expected static-only Direct Upload project.");
  }
  const domains = await cloudflareJson(accountApiPath(accountId, projectName, "/domains"), token);
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
  const result = await cloudflareJson(
    `${accountApiPath(accountId, projectName, "/deployments")}?env=production&per_page=10`, token,
  );
  if (!Array.isArray(result)) fail("Cloudflare returned an invalid Pages deployment list.");
  return result.filter((item) => item?.environment === "production" && !item.is_skipped)
    .sort((a, b) => String(b.created_on).localeCompare(String(a.created_on)));
}

function validateDeployment(deployment, projectName) {
  if (!deployment || deployment.project_name !== projectName || !deployment.id
      || deployment.environment !== "production" || deployment.is_skipped
      || deployment.latest_stage?.status !== "success" || deployment.uses_functions !== false) {
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
      || receipt.verified_file_count !== previousManifest.files.filter((file) => file.path !== "/_headers").length
      || !receipt.deployment_commit_message
      || receipt.deployment_commit_message !== activeDeployment.deployment_trigger?.metadata?.commit_message) {
    fail("The previous receipt's publication identity or read-back count is inconsistent with its manifest.");
  }
  const deploymentUrl = new URL(receipt.deployment_url);
  if (deploymentUrl.protocol !== "https:"
      || !(deploymentUrl.hostname === `${projectName}.pages.dev` || deploymentUrl.hostname.endsWith(`.${projectName}.pages.dev`))) {
    fail("The previous receipt does not contain a verified Pages deployment URL.");
  }
  return receipt;
}

function publicAssetPath(pathname) {
  if (pathname === "/_headers") return null;
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
  const files = manifest.files.filter((file) => file.path !== "/_headers");
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
  await cloudflareJson(accountApiPath(accountId, projectName, `/deployments/${encodeURIComponent(previousDeployment.id)}/rollback`), token, "POST");
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

async function main() {
  if (!process.argv.slice(2).includes("--confirm-publication")
      || process.argv.slice(2).some((arg) => arg !== "--confirm-publication")) {
    fail("Run this command with --confirm-publication only after reviewing the exact owner-approved revision.");
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
  const cloudflareToken = requiredEnvironment("CLOUDFLARE_API_TOKEN");
  const publishReceiptPath = requiredEnvironment("MITHRILPRESS_PUBLISH_RECEIPT_PATH");
  const previousReceiptPath = requiredEnvironment("MITHRILPRESS_PREVIOUS_RECEIPT_PATH");
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

  try {
    await lstat(publishReceiptPath);
    fail("MITHRILPRESS_PUBLISH_RECEIPT_PATH already exists; choose a fresh path.");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
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
    if (manifest.site_id !== siteId || manifest.revision_id !== expectedRevision
        || exported.artifact_sha256 !== manifest.artifact_sha256) {
      fail("The exported artifact is not bound to the requested site and owner-approved revision.");
    }
    await inspectArtifact(artifactRoot, manifest);

    const { project } = await readProjectAndDomain(accountId, projectName, manifest.hostname, cloudflareToken);
    const activeDeployments = await listProductionDeployments(accountId, projectName, cloudflareToken);
    previous = validateDeployment(activeDeployments[0], projectName);
    previousReceipt = await loadPreviousReceipt(previousReceiptPath, accountId, projectName, manifest, previous);
    await verifyManifestAtHostname(manifest.hostname, previousReceipt.artifact_manifest);
    await assertHttpsHostReady(manifest.hostname);
    await assertRevisionStillCurrent(siteId, ownerToken, manifest);

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
    validateDeployment(deployment, projectName);
    const verifiedFiles = await verifyManifestAtHostname(manifest.hostname, manifest);
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
