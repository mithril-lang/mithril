import assert from "node:assert/strict";
import test from "node:test";
import { validateImageUpload } from "./media_validation.js";

function png(width = 800, height = 600) {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  bytes.set([73, 72, 68, 82], 12);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

function gif(width = 2, height = 3) {
  return new Uint8Array([71, 73, 70, 56, 57, 97, width & 255, width >> 8, height & 255, height >> 8]);
}

function webp(width = 40, height = 30) {
  const bytes = new Uint8Array(30);
  bytes.set([82, 73, 70, 70], 0);
  new DataView(bytes.buffer).setUint32(4, 22, true);
  bytes.set([87, 69, 66, 80, 86, 80, 56, 88], 8);
  bytes[20] = 0;
  const w = width - 1;
  const h = height - 1;
  bytes[24] = w & 255;
  bytes[25] = (w >> 8) & 255;
  bytes[26] = (w >> 16) & 255;
  bytes[27] = h & 255;
  bytes[28] = (h >> 8) & 255;
  bytes[29] = (h >> 16) & 255;
  return bytes;
}

function jpeg(width = 320, height = 240) {
  const bytes = new Uint8Array(21);
  bytes.set([255, 216, 255, 192, 0, 17, 8, (height >> 8) & 255, height & 255,
    (width >> 8) & 255, width & 255]);
  return bytes;
}

test("accepts bounded JPEG, PNG, GIF and WebP raster images", () => {
  assert.deepEqual(validateImageUpload(jpeg(), "image/jpeg"), {
    contentType: "image/jpeg", byteLength: 21, width: 320, height: 240,
  });
  assert.deepEqual(validateImageUpload(png(), "image/png"), {
    contentType: "image/png", byteLength: 24, width: 800, height: 600,
  });
  assert.equal(validateImageUpload(gif(), "image/gif").height, 3);
  assert.equal(validateImageUpload(webp(), "image/webp").width, 40);
});

test("rejects MIME spoofing and active or unsupported formats", () => {
  assert.throws(() => validateImageUpload(png(), "image/jpeg"), { code: "invalid_image" });
  assert.throws(() => validateImageUpload(png(), "image/svg+xml"), { code: "unsupported_image_type" });
});

test("rejects unreasonable pixel dimensions", () => {
  assert.throws(() => validateImageUpload(png(8192, 8192), "image/png"), { code: "image_dimensions_not_supported" });
});

test("rejects animated extended WebP images", () => {
  const animated = webp();
  animated[20] = 0x02;
  assert.throws(() => validateImageUpload(animated, "image/webp"), { code: "animated_images_not_supported" });
});

test("rejects empty and oversized images", () => {
  assert.throws(() => validateImageUpload(new Uint8Array(), "image/png"), { code: "media_size_limit" });
  assert.throws(() => validateImageUpload(new Uint8Array(8 * 1024 * 1024 + 1), "image/png"), { code: "media_size_limit" });
});
