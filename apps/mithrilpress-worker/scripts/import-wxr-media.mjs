import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { MAX_MEDIA_BYTES, validateImageUpload } from "../src/media_validation.js";
import { parseWordPressWxr } from "../src/wxr_import.js";

const MAX_WXR_BYTES = 12_000_000;
const MAX_ATTACHMENT_COUNT = 1_000;
const MAX_PACKAGE_BYTES = 250 * 1024 * 1024;
const MAX_MEDIA_REFERENCES = 5_000;
const MIME_BY_EXTENSION = new Map([
  [".gif", "image/gif"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

function problem(code) {
  return Object.assign(new Error(code), { code });
}

function parseArguments(values) {
  const options = new Map();
  let apply = false;
  for (let index = 0; index < values.length; index += 1) {
    const argument = values[index];
    if (argument === "--apply") {
      if (apply) throw problem("duplicate_option");
      apply = true;
      continue;
    }
    if (argument === "--help") return { help: true };
    if (!["--site", "--wxr", "--media-dir", "--token-file"].includes(argument)
        || options.has(argument) || !values[index + 1] || values[index + 1].startsWith("--")) {
      throw problem("invalid_arguments");
    }
    options.set(argument, values[index + 1]);
    index += 1;
  }
  for (const required of ["--site", "--wxr", "--media-dir"]) {
    if (!options.has(required)) throw problem("missing_argument");
  }
  if (apply && !options.has("--token-file")) throw problem("missing_token_file");
  return { apply, options };
}

function destinationUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw problem("invalid_site_url");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port
      || parsed.pathname !== "/" || parsed.search || parsed.hash
      || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.sites\.mithril\.love$/i.test(parsed.hostname)) {
    throw problem("invalid_site_url");
  }
  return new URL(parsed.origin);
}

async function regularFile(path, code) {
  let info;
  try {
    info = await lstat(path);
  } catch {
    throw problem(code);
  }
  if (info.isSymbolicLink() || !info.isFile()) throw problem(code);
  return info;
}

async function readWxr(path) {
  const info = await regularFile(path, "invalid_wxr_file");
  if (info.size > MAX_WXR_BYTES) throw problem("wxr_too_large");
  const bytes = await readFile(path);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw problem("invalid_wxr_encoding");
  }
}

async function mediaRoot(path) {
  let info;
  try {
    info = await lstat(path);
  } catch {
    throw problem("media_directory_unavailable");
  }
  if (info.isSymbolicLink() || !info.isDirectory()) throw problem("invalid_media_directory");
  try {
    return await realpath(path);
  } catch {
    throw problem("media_directory_unavailable");
  }
}

function sourceOrigin(channelLink) {
  let parsed;
  try {
    parsed = new URL(channelLink);
  } catch {
    throw problem("invalid_wxr_source_origin");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw problem("invalid_wxr_source_origin");
  }
  return parsed.origin;
}

function referencedMediaIds(records) {
  const ids = new Set();
  for (const record of records) {
    const featured = record.featured_media;
    if (Number.isSafeInteger(featured) && featured > 0) ids.add(featured);
    const html = record?.content?.raw ?? "";
    for (const match of html.matchAll(/\bwp-image-([1-9][0-9]{0,14})\b/g)) {
      const id = Number(match[1]);
      if (Number.isSafeInteger(id)) ids.add(id);
      if (ids.size > MAX_MEDIA_REFERENCES) throw problem("media_reference_limit_exceeded");
    }
  }
  return [...ids].sort((left, right) => left - right);
}

function fileType(path) {
  return MIME_BY_EXTENSION.get(extname(path).toLowerCase()) ?? null;
}

function isInside(root, path) {
  const rel = relative(root, path);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

async function inspectPackagePath(root, relativePath) {
  if (!relativePath) return { status: "missing", reason: "attachment_path_missing" };
  let current = root;
  const segments = relativePath.split("/");
  for (let index = 0; index < segments.length; index += 1) {
    current = join(current, segments[index]);
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return { status: "missing", reason: "file_not_found" };
      return { status: "rejected", reason: "file_read_failed" };
    }
    if (info.isSymbolicLink()) return { status: "rejected", reason: "symlink_not_allowed" };
    if (index < segments.length - 1 && !info.isDirectory()) return { status: "missing", reason: "file_not_found" };
    if (index === segments.length - 1 && !info.isFile()) return { status: "rejected", reason: "not_a_regular_file" };
  }
  try {
    const absolutePath = await realpath(current);
    return isInside(root, absolutePath)
      ? { status: "safe", reason: null }
      : { status: "rejected", reason: "path_outside_media_directory" };
  } catch {
    return { status: "missing", reason: "file_not_found" };
  }
}

async function readPackageImage(root, relativePath, tracker, validateImage = true) {
  const segments = relativePath.split("/");
  let current = root;
  for (let index = 0; index < segments.length; index += 1) {
    current = join(current, segments[index]);
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return { status: "missing", reason: "file_not_found" };
      return { status: "rejected", reason: "file_read_failed" };
    }
    if (info.isSymbolicLink()) return { status: "rejected", reason: "symlink_not_allowed" };
    if (index < segments.length - 1 && !info.isDirectory()) return { status: "missing", reason: "file_not_found" };
    if (index === segments.length - 1 && !info.isFile()) return { status: "rejected", reason: "not_a_regular_file" };
  }

  let absolutePath;
  try {
    absolutePath = await realpath(current);
  } catch {
    return { status: "missing", reason: "file_not_found" };
  }
  if (!isInside(root, absolutePath)) return { status: "rejected", reason: "path_outside_media_directory" };

  const contentType = validateImage ? fileType(relativePath) : null;
  if (validateImage && !contentType) return { status: "rejected", reason: "unsupported_file_type" };
  const before = await lstat(absolutePath);
  if (before.size < 1 || before.size > MAX_MEDIA_BYTES) return { status: "rejected", reason: "media_size_limit" };
  if (!tracker.paths.has(relativePath)) {
    if (tracker.totalBytes + before.size > MAX_PACKAGE_BYTES) return { status: "rejected", reason: "package_size_limit" };
    tracker.totalBytes += before.size;
    tracker.paths.add(relativePath);
  }

  let bytes;
  try {
    bytes = await readFile(absolutePath);
  } catch {
    return { status: "rejected", reason: "file_read_failed" };
  }
  if (bytes.byteLength !== before.size) return { status: "rejected", reason: "file_changed_during_read" };
  let details = null;
  if (validateImage) {
    try {
      details = validateImageUpload(bytes, contentType);
    } catch (error) {
      return { status: "rejected", reason: error?.code ?? "invalid_image" };
    }
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return { status: "ready", bytes, contentType, details, sha256 };
}

async function readToken(path) {
  const info = await regularFile(path, "invalid_token_file");
  if ((info.mode & 0o077) !== 0) throw problem("token_file_permissions_too_open");
  const token = (await readFile(path, "utf8")).trim();
  if (!/^[a-f0-9]{24}\.[A-Za-z0-9_-]{43}$/.test(token)) throw problem("invalid_owner_token");
  return token;
}

async function responseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function sendJsonRequest(url, token, init) {
  let response;
  try {
    response = await fetch(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
      headers: { Authorization: `Bearer ${token}`, ...init.headers },
    });
  } catch {
    throw problem("site_request_failed");
  }
  const data = await responseJson(response);
  if (!response.ok) {
    throw Object.assign(problem(data?.error?.code ?? `site_http_${response.status}`), {
      httpStatus: response.status,
    });
  }
  return { status: response.status, data };
}

async function safeBytesForUpload(root, path, expectedSha256) {
  const tracker = { totalBytes: 0, paths: new Set() };
  const result = await readPackageImage(root, path, tracker);
  if (result.status !== "ready" || result.sha256 !== expectedSha256) throw problem("media_file_changed_after_plan");
  return result;
}

async function buildPlan(parsed, root) {
  if (parsed.attachments.length > MAX_ATTACHMENT_COUNT) throw problem("attachment_count_limit");
  const references = referencedMediaIds(parsed.records);
  const referenceSet = new Set(references);
  const groups = new Map();
  const rejected = [];
  const unreferenced = [];
  const unreferencedGroups = new Map();
  const tracker = { totalBytes: 0, paths: new Set() };

  for (const attachment of parsed.attachments) {
    if (attachment.admission_error) {
      rejected.push({ id: attachment.source_id, path: attachment.path, reason: attachment.admission_error });
      continue;
    }
    if (!Number.isSafeInteger(attachment.source_id) || attachment.source_id < 1) {
      rejected.push({ id: attachment.source_id ?? null, path: attachment.path, reason: "invalid_attachment_id" });
      continue;
    }
    if (!referenceSet.has(attachment.source_id)) {
      const inspected = await inspectPackagePath(root, attachment.path);
      if (inspected.status === "rejected") {
        rejected.push({ id: attachment.source_id, path: attachment.path, reason: inspected.reason });
      } else {
        unreferenced.push({ id: attachment.source_id, path: attachment.path, file_status: inspected.status, reason: "not_referenced_by_imported_content" });
        const group = unreferencedGroups.get(attachment.source_id) ?? [];
        group.push(attachment);
        unreferencedGroups.set(attachment.source_id, group);
      }
      continue;
    }
    const group = groups.get(attachment.source_id) ?? [];
    group.push(attachment);
    groups.set(attachment.source_id, group);
  }

  for (const [id, group] of unreferencedGroups) {
    const paths = [...new Set(group.map((attachment) => attachment.path).filter(Boolean))];
    if (paths.length < 2) continue;
    const candidates = [];
    for (const path of paths) {
      const image = await readPackageImage(root, path, tracker, false);
      if (image.status === "rejected") rejected.push({ id, path, reason: image.reason });
      if (image.status === "ready") candidates.push({ path, sha256: image.sha256 });
    }
    if (new Set(candidates.map((candidate) => candidate.sha256)).size > 1) {
      rejected.push({ id, paths: candidates.map((candidate) => candidate.path), reason: "duplicate_attachment_bytes_conflict" });
    }
  }

  const missing = [];
  const ready = [];
  for (const id of references) {
    const group = groups.get(id) ?? [];
    if (group.length === 0) {
      missing.push({ id, reason: "attachment_not_in_wxr" });
      continue;
    }
    const altValues = [...new Set(group.map((attachment) => attachment.alt_text).filter(Boolean))];
    if (altValues.length > 1) {
      rejected.push({ id, paths: group.map((attachment) => attachment.path), reason: "duplicate_attachment_alt_conflict" });
      continue;
    }
    const paths = [...new Set(group.map((attachment) => attachment.path).filter(Boolean))];
    if (paths.length === 0) {
      missing.push({ id, reason: "attachment_path_missing" });
      continue;
    }

    const candidates = [];
    let missingPath = false;
    for (const path of paths) {
      const image = await readPackageImage(root, path, tracker);
      if (image.status === "missing") {
        missingPath = true;
      } else if (image.status === "rejected") {
        rejected.push({ id, path, reason: image.reason });
      } else {
        candidates.push({ path, ...image });
      }
    }
    if (candidates.length === 0) {
      if (!rejected.some((item) => item.id === id)) missing.push({ id, paths, reason: "file_not_found" });
      continue;
    }
    const hashes = new Set(candidates.map((candidate) => candidate.sha256));
    if (hashes.size > 1) {
      rejected.push({ id, paths: candidates.map((candidate) => candidate.path), reason: "duplicate_attachment_bytes_conflict" });
      continue;
    }
    if (rejected.some((item) => item.id === id)) continue;
    ready.push({
      id,
      path: candidates[0].path,
      alt_text: altValues[0] ?? "",
      content_type: candidates[0].contentType,
      byte_length: candidates[0].details.byteLength,
      sha256: candidates[0].sha256,
      duplicate_paths: paths.length > 1 ? paths : [],
      missing_alternate_path: missingPath,
    });
  }

  const indexed = new Set([...groups.keys()]);
  for (const id of references) {
    if (!indexed.has(id) && !missing.some((item) => item.id === id)) missing.push({ id, reason: "attachment_not_in_wxr" });
  }
  return {
    version: 1,
    source_origin: sourceOrigin(parsed.channelLink),
    attachment_counts: {
      referenced: references.length,
      ready: ready.length,
      missing: missing.length,
      rejected: rejected.length,
      unreferenced: unreferenced.length,
    },
    references,
    ready,
    mapped: [],
    missing,
    rejected,
    unreferenced,
    revision: null,
    publication_state: "not-published",
  };
}

async function cleanupNewUploads(plan, siteUrl, token, uncertainUploads = []) {
  const uploaded = plan.mapped.filter((item) => item.status === "uploaded");
  const pending = [...uncertainUploads];
  let deleted = 0;
  for (const item of [...uploaded].reverse()) {
    try {
      await sendJsonRequest(
        new URL(`/_mithrilpress/api/media/${encodeURIComponent(item.media_id)}`, siteUrl),
        token,
        { method: "DELETE" },
      );
      item.cleanup_status = "deleted";
      deleted += 1;
    } catch (error) {
      item.cleanup_status = "pending";
      pending.push({ media_id: item.media_id, reason: error?.code ?? "cleanup_failed" });
    }
  }
  plan.cleanup = {
    attempted: uploaded.length,
    deleted,
    pending,
  };
}

function importResponseIsDefiniteRejection(error) {
  if (error?.httpStatus >= 400 && error.httpStatus < 500) return true;
  return [
    "import_not_committed",
    "site_daily_hosting_request_limit",
    "deployment_daily_hosting_request_limit",
  ].includes(error?.code);
}

async function applyPlan(plan, wxr, siteUrl, root, token) {
  let importRequestStarted = false;
  let currentUpload = null;
  let unverifiedUpload = null;
  try {
    for (const item of plan.ready) {
      const image = await safeBytesForUpload(root, item.path, item.sha256);
      let altHeader;
      try {
        altHeader = encodeURIComponent(item.alt_text);
      } catch {
        plan.rejected.push({ id: item.id, path: item.path, reason: "invalid_attachment_alt_text" });
        throw problem("invalid_attachment_alt_text");
      }
      currentUpload = item;
      const upload = await sendJsonRequest(new URL("/_mithrilpress/api/media", siteUrl), token, {
        method: "POST",
        headers: {
          "Content-Type": image.contentType,
          "X-WordPress-Media-ID": String(item.id),
          "X-MithrilPress-Alt": altHeader,
        },
        body: image.bytes,
      });
      const media = upload.data?.media;
      currentUpload = null;
      if (!media || media.wordpress_source_id !== item.id) {
        unverifiedUpload = { wordpress_media_id: item.id, reason: "upload_response_unverified" };
        throw problem("invalid_media_upload_response");
      }
      plan.mapped.push({
        wordpress_media_id: item.id,
        media_id: media.id,
        sha256: item.sha256,
        path: item.path,
        status: upload.status === 201 ? "uploaded" : "already_mapped",
      });
    }

    importRequestStarted = true;
    const imported = await sendJsonRequest(new URL("/api/wordpress/import", siteUrl), token, {
      method: "POST",
      headers: { "Content-Type": "application/xml" },
      body: wxr,
    });
    if (imported.data?.state !== "private-preview" || !imported.data?.revision_id) {
      throw problem("import_result_uncertain");
    }
    plan.revision = {
      id: imported.data.revision_id,
      state: imported.data.state,
      entry_count: imported.data.entry_count,
      migration_report: imported.data.migration_report ?? null,
    };
    plan.attachment_counts.mapped = plan.mapped.length;
    plan.publication_state = "private-preview-not-published";
    return plan;
  } catch (error) {
    if (!importRequestStarted || importResponseIsDefiniteRejection(error)) {
      const uncertainUploads = [];
      if (currentUpload && error?.code === "site_request_failed") {
        uncertainUploads.push({
          wordpress_media_id: currentUpload.id,
          reason: "upload_result_uncertain",
        });
      }
      if (unverifiedUpload) uncertainUploads.push(unverifiedUpload);
      await cleanupNewUploads(plan, siteUrl, token, uncertainUploads);
    } else {
      const uploaded = plan.mapped
        .filter((item) => item.status === "uploaded")
        .map((item) => item.media_id);
      plan.cleanup = {
        attempted: 0,
        deleted: 0,
        pending: [{ media_ids: uploaded, reason: "import_result_uncertain" }],
      };
    }
    throw error;
  }
}

function help() {
  return [
    "Owner-authorized, local-only WordPress WXR and image migration.",
    "",
    "Usage:",
    "  npm run import:wordpress -- --site https://<site>.sites.mithril.love --wxr export.xml --media-dir wp-content/uploads",
    "  npm run import:wordpress -- --site https://<site>.sites.mithril.love --wxr export.xml --media-dir wp-content/uploads --token-file owner.token --apply",
    "",
    "The default is a dry run. --apply uploads referenced local images and creates a private preview; it never approves or publishes it.",
    "On a definite import rejection, newly uploaded images are removed. Cleanup failures and ambiguous responses are reported for owner review.",
  ].join("\n");
}

let args;
try {
  args = parseArguments(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${JSON.stringify({ error: { code: error?.code ?? "invalid_arguments" }, publication_state: "not-published" })}\n`);
  process.exitCode = 1;
}

if (args?.help) {
  process.stdout.write(`${help()}\n`);
} else if (args) {
  let activeReport = null;
  try {
    const siteUrl = destinationUrl(args.options.get("--site"));
    const wxrPath = resolve(args.options.get("--wxr"));
    const mediaDir = resolve(args.options.get("--media-dir"));
    const wxr = await readWxr(wxrPath);
    const parsed = parseWordPressWxr(wxr);
    const root = await mediaRoot(mediaDir);
    const report = await buildPlan(parsed, root);
    activeReport = report;
    process.stdout.write(`${JSON.stringify({ phase: "preflight", apply: args.apply, site: siteUrl.hostname, ...report })}\n`);

    if (report.rejected.length > 0) throw problem("package_rejected");
    if (args.apply) {
      const token = await readToken(resolve(args.options.get("--token-file")));
      const completed = await applyPlan(report, wxr, siteUrl, root, token);
      process.stdout.write(`${JSON.stringify({ phase: "private-preview-created", site: siteUrl.hostname, ...completed })}\n`);
    }
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ error: { code: error?.code ?? "import_failed" }, report: activeReport, publication_state: activeReport?.publication_state ?? "not-published" })}\n`);
    process.exitCode = 1;
  }
}
