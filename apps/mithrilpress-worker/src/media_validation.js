export const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 8_192;
export const MAX_IMAGE_PIXELS = 40_000_000;

const MIME_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function invalid(code = "invalid_image") {
  throw Object.assign(new Error(code), { code, status: 422 });
}

function dimensions(width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)
      || width < 1 || height < 1
      || width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION
      || width * height > MAX_IMAGE_PIXELS) invalid("image_dimensions_not_supported");
  return { width, height };
}

function matches(bytes, offset, values) {
  return values.every((value, index) => bytes[offset + index] === value);
}

function pngDimensions(bytes) {
  if (bytes.length < 24 || !matches(bytes, 0, [137, 80, 78, 71, 13, 10, 26, 10])
      || !matches(bytes, 12, [73, 72, 68, 82])) invalid();
  return dimensions(
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(16),
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(20),
  );
}

function gifDimensions(bytes) {
  if (bytes.length < 10 || !(matches(bytes, 0, [71, 73, 70, 56, 55, 97])
      || matches(bytes, 0, [71, 73, 70, 56, 57, 97]))) invalid();
  return dimensions(bytes[6] | (bytes[7] << 8), bytes[8] | (bytes[9] << 8));
}

function jpegDimensions(bytes) {
  if (bytes.length < 4 || !matches(bytes, 0, [255, 216])) invalid();
  let offset = 2;
  while (offset < bytes.length) {
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) invalid();
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) invalid();
    if (SOF_MARKERS.has(marker)) {
      if (length < 7) invalid();
      return dimensions(
        (bytes[offset + 5] << 8) | bytes[offset + 6],
        (bytes[offset + 3] << 8) | bytes[offset + 4],
      );
    }
    offset += length;
  }
  return invalid("image_dimensions_missing");
}

function webpDimensions(bytes) {
  if (bytes.length < 30 || !matches(bytes, 0, [82, 73, 70, 70])
      || !matches(bytes, 8, [87, 69, 66, 80])) invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const declaredSize = view.getUint32(4, true) + 8;
  if (declaredSize > bytes.length) invalid();
  const chunk = String.fromCharCode(...bytes.slice(12, 16));
  let width;
  let height;
  if (chunk === "VP8X" && bytes.length >= 30) {
    const flags = bytes[20];
    if (flags & 0x02) invalid("animated_images_not_supported");
    width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
    height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
  } else if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
    width = 1 + bytes[21] + ((bytes[22] & 0x3f) << 8);
    height = 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10);
  } else if (chunk === "VP8 " && bytes.length >= 30
      && matches(bytes, 23, [157, 1, 42])) {
    width = (bytes[26] | (bytes[27] << 8)) & 0x3fff;
    height = (bytes[28] | (bytes[29] << 8)) & 0x3fff;
  } else {
    invalid();
  }
  return dimensions(width, height);
}

export function validateImageUpload(value, contentType) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  if (!MIME_TYPES.has(contentType)) invalid("unsupported_image_type");
  if (bytes.length < 1 || bytes.length > MAX_MEDIA_BYTES) {
    throw Object.assign(new Error("media_size_limit"), { code: "media_size_limit", status: 413 });
  }
  const image = contentType === "image/png" ? pngDimensions(bytes)
    : contentType === "image/jpeg" ? jpegDimensions(bytes)
      : contentType === "image/gif" ? gifDimensions(bytes)
        : webpDimensions(bytes);
  return { contentType, byteLength: bytes.byteLength, ...image };
}
