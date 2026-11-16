import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const workerRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const importer = join(workerRoot, "scripts/import-wxr-media.mjs");

function png() {
  const bytes = Buffer.alloc(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  bytes.set([73, 72, 68, 82], 12);
  bytes.writeUInt32BE(1, 16);
  bytes.writeUInt32BE(1, 20);
  return bytes;
}

function wxr(attachments, { featured = 77 } = {}) {
  const image = `<img class="wp-image-${featured}" src="https://wordpress.example/uploads/image.png" alt="Hero">`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:wp="http://wordpress.org/export/1.2/">
  <channel><title>Local media import fixture</title><link>https://wordpress.example</link><wp:wxr_version>1.2</wp:wxr_version>
    <item><title>Image post</title><link>https://wordpress.example/image-post/</link>
      <wp:post_id>100</wp:post_id><wp:post_type>post</wp:post_type><wp:status>publish</wp:status><wp:post_name>image-post</wp:post_name>
      <wp:postmeta><wp:meta_key>_thumbnail_id</wp:meta_key><wp:meta_value>${featured}</wp:meta_value></wp:postmeta>
      <content:encoded><![CDATA[${image}]]></content:encoded>
    </item>
    ${attachments.map(({ id = 77, path, alt = "Hero alt" }) => `<item><title>Hero image</title><link>https://wordpress.example/uploads/image.png</link>
      <wp:post_id>${id}</wp:post_id><wp:post_type>attachment</wp:post_type><wp:status>inherit</wp:status><wp:post_name>hero-image</wp:post_name>
      ${path === null ? "" : `<wp:postmeta><wp:meta_key>_wp_attached_file</wp:meta_key><wp:meta_value>${path}</wp:meta_value></wp:postmeta>`}
      <wp:postmeta><wp:meta_key>_wp_attachment_image_alt</wp:meta_key><wp:meta_value>${alt}</wp:meta_value></wp:postmeta>
    </item>`).join("\n")}
  </channel>
</rss>`;
}

async function runDryRun({ attachments, files = {}, symlinks = {}, site = "https://preview.sites.mithril.love" }) {
  const root = await mkdtemp(join(tmpdir(), "mithrilpress-wxr-media-test-"));
  try {
    const wxrPath = join(root, "export.xml");
    const mediaRoot = join(root, "uploads");
    await mkdir(mediaRoot);
    await writeFile(wxrPath, wxr(attachments));
    for (const [path, bytes] of Object.entries(files)) {
      const target = join(mediaRoot, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes);
    }
    for (const [path, targetPath] of Object.entries(symlinks)) {
      const target = join(mediaRoot, path);
      await mkdir(dirname(target), { recursive: true });
      await symlink(targetPath, target);
    }
    const result = spawnSync(process.execPath, [importer, "--site", site, "--wxr", wxrPath, "--media-dir", mediaRoot], {
      cwd: workerRoot,
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    const output = result.stdout.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
    return { ...result, output };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("WordPress media bundle dry-run admits referenced local images without a token", async () => {
  const result = await runDryRun({
    attachments: [{ path: "2026/10/hero.png" }],
    files: { "2026/10/hero.png": png() },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.output.length, 1);
  assert.equal(result.output[0].phase, "preflight");
  assert.equal(result.output[0].apply, false);
  assert.deepEqual(result.output[0].references, [77]);
  assert.equal(result.output[0].attachment_counts.ready, 1);
  assert.equal(result.output[0].attachment_counts.missing, 0);
  assert.equal(result.output[0].attachment_counts.rejected, 0);
  assert.equal(result.output[0].publication_state, "not-published");
});

test("WordPress media bundle dry-run reports missing local images without uploading", async () => {
  const result = await runDryRun({ attachments: [{ path: "2026/10/missing.png" }] });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.output[0].attachment_counts.missing, 1);
  assert.equal(result.output[0].missing[0].id, 77);
  assert.equal(result.output[0].publication_state, "not-published");
});

test("WordPress media bundle dry-run rejects traversal and symlink paths", async (t) => {
  await t.test("path traversal", async () => {
    const result = await runDryRun({ attachments: [{ path: "../outside.png" }] });
    assert.equal(result.status, 1);
    assert.equal(result.output[0].attachment_counts.rejected, 1);
    assert.equal(result.output[0].rejected[0].reason, "invalid_wordpress_attachment_path");
  });

  await t.test("symlinked media", async () => {
    const root = await mkdtemp(join(tmpdir(), "mithrilpress-wxr-symlink-test-"));
    try {
      const outside = join(root, "outside.png");
      await writeFile(outside, png());
      const result = await runDryRun({
        attachments: [{ path: "2026/10/hero.png" }],
        symlinks: { "2026/10/hero.png": outside },
      });
      assert.equal(result.status, 1);
      assert.equal(result.output[0].attachment_counts.rejected, 1);
      assert.equal(result.output[0].rejected[0].reason, "symlink_not_allowed");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

test("WordPress media bundle dry-run rejects conflicting duplicate attachment metadata", async () => {
  const result = await runDryRun({
    attachments: [
      { path: "2026/10/hero.png", alt: "Hero alt" },
      { path: "2026/10/hero.png", alt: "Different alt" },
    ],
    files: { "2026/10/hero.png": png() },
  });
  assert.equal(result.status, 1);
  assert.equal(result.output[0].attachment_counts.rejected, 1);
  assert.equal(result.output[0].rejected[0].reason, "duplicate_attachment_alt_conflict");
});

test("WordPress media bundle dry-run rejects destinations outside MithrilPress site hosts", async () => {
  const result = await runDryRun({
    site: "https://attacker.example",
    attachments: [{ path: "2026/10/hero.png" }],
    files: { "2026/10/hero.png": png() },
  });
  assert.equal(result.status, 1);
  assert.deepEqual(result.output, []);
  assert.match(result.stderr, /invalid_site_url/);
});
