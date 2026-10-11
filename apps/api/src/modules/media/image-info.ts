export const imageTypes = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
} as const;

export type ImageContentType = keyof typeof imageTypes;

export type ImageInfo = {
  contentType: ImageContentType;
  width: number | null;
  height: number | null;
};

const pngSignature = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export function isImageContentType(value: string): value is ImageContentType {
  return Object.hasOwn(imageTypes, value);
}

function size(width: number, height: number) {
  return width > 0 && height > 0
    ? { width, height }
    : { width: null, height: null };
}

const unknownSize = { width: null, height: null };

function pngSize(body: Buffer) {
  if (body.length < 24 || body.toString("latin1", 12, 16) !== "IHDR") {
    return unknownSize;
  }
  return size(body.readUInt32BE(16), body.readUInt32BE(20));
}

function gifSize(body: Buffer) {
  if (body.length < 10) {
    return unknownSize;
  }
  return size(body.readUInt16LE(6), body.readUInt16LE(8));
}

function jpegSize(body: Buffer) {
  let offset = 2;
  while (offset + 4 <= body.length) {
    if (body[offset] !== 0xff) {
      return unknownSize;
    }
    const marker = body[offset + 1] ?? 0;
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) {
      return unknownSize;
    }
    const length = body.readUInt16BE(offset + 2);
    const isFrameStart =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    if (isFrameStart) {
      if (offset + 9 > body.length) {
        return unknownSize;
      }
      return size(body.readUInt16BE(offset + 7), body.readUInt16BE(offset + 5));
    }
    if (length < 2) {
      return unknownSize;
    }
    offset += 2 + length;
  }
  return unknownSize;
}

function webpSize(body: Buffer) {
  if (body.length < 30) {
    return unknownSize;
  }
  const chunk = body.toString("latin1", 12, 16);
  if (chunk === "VP8X") {
    return size(body.readUIntLE(24, 3) + 1, body.readUIntLE(27, 3) + 1);
  }
  if (chunk === "VP8L" && body[20] === 0x2f) {
    const bits = body.readUInt32LE(21);
    return size((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  if (
    chunk === "VP8 " &&
    body[23] === 0x9d &&
    body[24] === 0x01 &&
    body[25] === 0x2a
  ) {
    return size(body.readUInt16LE(26) & 0x3fff, body.readUInt16LE(28) & 0x3fff);
  }
  return unknownSize;
}

export function inspectImage(body: Buffer): ImageInfo | null {
  if (body.length >= 8 && body.subarray(0, 8).equals(pngSignature)) {
    return { contentType: "image/png", ...pngSize(body) };
  }
  if (
    body.length >= 3 &&
    body[0] === 0xff &&
    body[1] === 0xd8 &&
    body[2] === 0xff
  ) {
    return { contentType: "image/jpeg", ...jpegSize(body) };
  }
  const head = body.toString("latin1", 0, 6);
  if (head === "GIF87a" || head === "GIF89a") {
    return { contentType: "image/gif", ...gifSize(body) };
  }
  if (
    body.length >= 12 &&
    body.toString("latin1", 0, 4) === "RIFF" &&
    body.toString("latin1", 8, 12) === "WEBP"
  ) {
    return { contentType: "image/webp", ...webpSize(body) };
  }
  return null;
}

export function safeFileName(raw: string | undefined, type: ImageContentType) {
  let decoded = raw ?? "";
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    decoded = "";
  }
  const leaf = decoded.split(/[\\/]/).pop() ?? "";
  const base = leaf
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\.[a-z0-9]{1,5}$/, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/[-_.]{2,}/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, 80)
    .replace(/[-_.]+$/, "");
  return `${base || "image"}.${imageTypes[type]}`;
}
