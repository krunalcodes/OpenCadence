import { createHmac, timingSafeEqual } from "node:crypto";

const MAC_BYTES = 16;
const UUID_BYTES = 16;
const MAX_TOKEN_LENGTH = 1024;
const MAX_CLICK_TARGET_LENGTH = 8192;
const base64UrlPattern = /^[A-Za-z0-9_-]+$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clickLabel = Buffer.from("opencadence-click\0", "utf8");
const utf8 = new TextDecoder("utf-8", { fatal: true });

function mac(payload: Buffer, secret: Buffer) {
  return createHmac("sha256", secret)
    .update(payload)
    .digest()
    .subarray(0, MAC_BYTES);
}

function decodeBase64Url(value: unknown, maxLength: number) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maxLength ||
    !base64UrlPattern.test(value)
  ) {
    return null;
  }
  const bytes = Buffer.from(value, "base64url");
  return bytes.toString("base64url") === value ? bytes : null;
}

function uuidBytes(id: string) {
  if (typeof id !== "string" || !uuidPattern.test(id)) {
    return null;
  }
  return Buffer.from(id.replaceAll("-", ""), "hex");
}

export function signToken(payload: Buffer | string, secret: Buffer): string {
  const body =
    typeof payload === "string" ? Buffer.from(payload, "utf8") : payload;
  return Buffer.concat([body, mac(body, secret)]).toString("base64url");
}

export function verifyToken(token: string, secret: Buffer): Buffer | null {
  const bytes = decodeBase64Url(token, MAX_TOKEN_LENGTH);
  if (!bytes || bytes.length <= MAC_BYTES) {
    return null;
  }
  const body = bytes.subarray(0, bytes.length - MAC_BYTES);
  const given = bytes.subarray(bytes.length - MAC_BYTES);
  return timingSafeEqual(given, mac(body, secret)) ? Buffer.from(body) : null;
}

export function messageToken(messageId: string, secret: Buffer): string {
  const bytes = uuidBytes(messageId);
  if (!bytes) {
    throw new TypeError("messageToken needs a message id that is a UUID.");
  }
  return signToken(bytes, secret);
}

export function readMessageToken(token: string, secret: Buffer): string | null {
  const body = verifyToken(token, secret);
  if (!body || body.length !== UUID_BYTES) {
    return null;
  }
  const hex = body.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function clickMac(messageId: string, url: string, secret: Buffer) {
  const id = uuidBytes(messageId);
  if (!id || typeof url !== "string") {
    return null;
  }
  return mac(Buffer.concat([clickLabel, id, Buffer.from(url, "utf8")]), secret);
}

export function clickSignature(
  messageId: string,
  url: string,
  secret: Buffer,
): string {
  const signature = clickMac(messageId, url, secret);
  if (!signature) {
    throw new TypeError("clickSignature needs a message id that is a UUID.");
  }
  return signature.toString("base64url");
}

export function verifyClickSignature(
  messageId: string,
  url: string,
  signature: string,
  secret: Buffer,
): boolean {
  const given = decodeBase64Url(signature, MAC_BYTES * 2);
  const expected = clickMac(messageId, url, secret);
  if (!given || !expected || given.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(given, expected);
}

export function encodeClickTarget(url: string): string {
  return Buffer.from(url, "utf8").toString("base64url");
}

export function decodeClickTarget(value: string): string | null {
  const bytes = decodeBase64Url(value, MAX_CLICK_TARGET_LENGTH);
  if (!bytes) {
    return null;
  }
  try {
    return utf8.decode(bytes);
  } catch {
    return null;
  }
}

export function trackedClickUrl(input: {
  baseUrl: string;
  messageToken: string;
  messageId: string;
  url: string;
  secret: Buffer;
}): string {
  const base = input.baseUrl.replace(/\/+$/, "");
  const target = encodeClickTarget(input.url);
  const signature = clickSignature(input.messageId, input.url, input.secret);
  return `${base}/t/c/${input.messageToken}?u=${target}&s=${signature}`;
}
