import { randomBytes } from "node:crypto";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string) {
  return uuidPattern.test(value);
}

export function uuidv7(date = new Date()) {
  const bytes = randomBytes(16);
  bytes.writeUIntBE(date.getTime(), 0, 6);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function uuidv7Date(id: string) {
  if (!isUuid(id) || id[14] !== "7") {
    return null;
  }
  return new Date(Number.parseInt(id.replaceAll("-", "").slice(0, 12), 16));
}

export function messageCreatedAt(id: string) {
  const date = uuidv7Date(id);
  if (!date) {
    throw new Error("The id is not a UUIDv7.");
  }
  return date;
}

export function uuidv7Floor(date: Date) {
  const hex = Math.max(date.getTime(), 0).toString(16).padStart(12, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7000-8000-000000000000`;
}
