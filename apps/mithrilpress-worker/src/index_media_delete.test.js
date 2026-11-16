import assert from "node:assert/strict";
import test from "node:test";

// The delete route does not render HTML; provide the Workers global required
// while the Worker module initializes under Node's focused test runner.
globalThis.HTMLRewriter = class {
  on() { return this; }
};
const { deleteStudioMedia } = await import("./index.js");

function createD1Mock({
  site,
  asset,
  tokenId,
  salt,
  secretHash,
  uploadAction,
  onBatch,
}) {
  const calls = [];
  const db = {
    prepare(sql) {
      return {
        bind(...params) {
          calls.push({ sql, params });
          const statement = {
            sql,
            params,
            async first() {
              if (sql.includes("FROM tenant_owner_tokens")) {
                return {
                  token_id: tokenId,
                  owner_label: "owner",
                  salt_hex: salt,
                  secret_hash_hex: secretHash,
                  scopes_json: '["media:write"]',
                  expires_at: "2099-01-01T00:00:00.000Z",
                };
              }
              if (sql.includes("FROM media_assets WHERE site_id = ? AND id = ?")) return asset;
              if (sql.startsWith("INSERT INTO media_daily_operations")) return { operation_count: 1 };
              if (sql.startsWith("UPDATE media_assets SET status = 'deleting'")) return { id: asset.id };
              if (sql.startsWith("SELECT 1 FROM media_assets a WHERE")) return null;
              if (sql.startsWith("UPDATE media_assets SET delete_operation_id")) {
                return { delete_operation_id: params[0] };
              }
              throw new Error(`Unexpected D1 query: ${sql}`);
            },
            async all() {
              if (sql.includes("FROM media_actions WHERE")) return { results: [uploadAction] };
              throw new Error(`Unexpected D1 query: ${sql}`);
            },
          };
          return statement;
        },
      };
    },
    async batch(statements) {
      await onBatch?.(statements, calls);
      return [{ meta: { changes: 1 } }, { meta: { changes: 1 } }];
    },
  };
  return { db, calls };
}

function assertDeleteBatchFence(statements, calls, { siteId, mediaId }) {
  assert.equal(statements.length, 2);
  const deleteStmt = statements[0];
  assert.match(deleteStmt.sql, /DELETE FROM media_assets WHERE site_id = \? AND id = \? AND status = 'deleting' AND delete_operation_id = \?/);

  const reserveUpdate = calls.find(({ sql }) => sql.startsWith("UPDATE media_assets SET delete_operation_id"));
  assert.ok(reserveUpdate, "expected delete_operation_id reservation UPDATE");
  assert.equal(deleteStmt.params[0], siteId);
  assert.equal(deleteStmt.params[1], mediaId);
  assert.equal(deleteStmt.params[2], reserveUpdate.params[0]);
  assert.equal(reserveUpdate.params[1], siteId);
  assert.equal(reserveUpdate.params[2], mediaId);
  assert.match(
    reserveUpdate.sql,
    /UPDATE media_assets SET delete_operation_id = \? WHERE site_id = \? AND id = \? AND status = 'deleting' AND delete_operation_id IS NULL/,
  );
}

test("a verified media deletion returns success after the D1 removal commits", async () => {
  const site = { id: "site-1" };
  const tokenId = "a".repeat(24);
  const secret = "b".repeat(43);
  const salt = "test-salt";
  const secretHash = Array.from(new Uint8Array(await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(`${salt}.${secret}`),
  )), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const asset = {
    id: 7, site_id: site.id, object_key: `${site.id}/image-7`,
    content_type: "image/png", byte_length: 24, width: 2, height: 3,
    sha256: "c".repeat(64), alt_text: "", wordpress_source_id: null,
    status: "pending", uploaded_by_token_id: tokenId,
    created_at: "2026-10-24T00:00:00.000Z", delete_operation_id: null,
  };
  const uploadAction = {
    id: "upload-7", token_id: tokenId, created_at: asset.created_at,
    metadata_json: JSON.stringify({
      byte_length: asset.byte_length, content_type: asset.content_type,
      width: asset.width, height: asset.height, sha256: asset.sha256,
      wordpress_source_id: null, alt_text: asset.alt_text,
    }),
  };
  const { db, calls } = createD1Mock({
    site,
    asset,
    tokenId,
    salt,
    secretHash,
    uploadAction,
    onBatch(statements) {
      assertDeleteBatchFence(statements, calls, { siteId: site.id, mediaId: asset.id });
    },
  });
  const env = {
    MEDIA: { async head(key) { assert.equal(key, asset.object_key); return null; } },
    DB: db,
  };

  const request = new Request("https://press.example/_mithrilpress/api/media/7", {
    method: "DELETE", headers: { Authorization: `Bearer ${tokenId}.${secret}` },
  });
  const result = await deleteStudioMedia(request, env, site, asset.id);
  assert.ok(result instanceof Response);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { media_id: asset.id, deleted: true });
  assert.ok(calls.some(({ sql }) => sql.startsWith("DELETE FROM media_assets")));
});

test("deletes the bound R2 object before the D1 batch when storage matches metadata", async () => {
  const site = { id: "site-1" };
  const tokenId = "a".repeat(24);
  const secret = "b".repeat(43);
  const salt = "test-salt";
  const secretHash = Array.from(new Uint8Array(await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(`${salt}.${secret}`),
  )), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const asset = {
    id: 7, site_id: site.id, object_key: `${site.id}/image-7`,
    content_type: "image/png", byte_length: 24, width: 2, height: 3,
    sha256: "c".repeat(64), alt_text: "", wordpress_source_id: null,
    status: "pending", uploaded_by_token_id: tokenId,
    created_at: "2026-10-24T00:00:00.000Z", delete_operation_id: null,
  };
  const uploadAction = {
    id: "upload-7", token_id: tokenId, created_at: asset.created_at,
    metadata_json: JSON.stringify({
      byte_length: asset.byte_length, content_type: asset.content_type,
      width: asset.width, height: asset.height, sha256: asset.sha256,
      wordpress_source_id: null, alt_text: asset.alt_text,
    }),
  };
  let batchCommitted = false;
  const mediaTimeline = [];
  let storedObject = {
    size: asset.byte_length,
    httpMetadata: { contentType: asset.content_type },
    customMetadata: { mediaId: String(asset.id), sha256: asset.sha256 },
  };
  const { db, calls } = createD1Mock({
    site,
    asset,
    tokenId,
    salt,
    secretHash,
    uploadAction,
    onBatch(statements) {
      assert.ok(
        mediaTimeline.includes("delete") && mediaTimeline.at(-1) === "head-after-delete",
        "R2 verification and removal must finish before the D1 batch",
      );
      assert.equal(batchCommitted, false);
      batchCommitted = true;
      assertDeleteBatchFence(statements, calls, { siteId: site.id, mediaId: asset.id });
    },
  });
  const env = {
    MEDIA: {
      async head(key) {
        assert.equal(key, asset.object_key);
        mediaTimeline.push(batchCommitted ? "head-after-batch" : (storedObject ? "head" : "head-after-delete"));
        return storedObject;
      },
      async delete(key) {
        assert.equal(key, asset.object_key);
        assert.equal(batchCommitted, false, "R2 delete must run before the D1 batch");
        mediaTimeline.push("delete");
        storedObject = null;
      },
    },
    DB: db,
  };

  const request = new Request("https://press.example/_mithrilpress/api/media/7", {
    method: "DELETE", headers: { Authorization: `Bearer ${tokenId}.${secret}` },
  });
  const result = await deleteStudioMedia(request, env, site, asset.id);
  assert.ok(result instanceof Response);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { media_id: asset.id, deleted: true });
  assert.deepEqual(mediaTimeline, ["head", "delete", "head-after-delete"]);
  assert.equal(storedObject, null);
});
