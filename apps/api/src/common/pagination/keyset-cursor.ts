import { isUuid } from "../uuid";

export type KeysetCursor = { at: string; id: string };

const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

export const keysetTimestampFormat = 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"';

export function encodeKeysetCursor(cursor: KeysetCursor) {
  return Buffer.from(`${cursor.at}|${cursor.id}`, "utf8").toString("base64url");
}

export function decodeKeysetCursor(value: string): KeysetCursor | null {
  const [at, id, ...rest] = Buffer.from(value, "base64url")
    .toString("utf8")
    .split("|");
  if (
    rest.length > 0 ||
    !at ||
    !id ||
    !timestampPattern.test(at) ||
    Number.isNaN(Date.parse(at)) ||
    !isUuid(id)
  ) {
    return null;
  }
  return { at, id };
}

export function clampLimit(
  value: number | undefined,
  fallback: number,
  max: number,
) {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(Math.max(Math.trunc(value), 1), max);
}
