import { signToken, verifyToken } from "@workspace/email-renderer";

const confirmPurpose = Buffer.from("form-confirm\0", "utf8");
const renderPurpose = Buffer.from("form-render\0", "utf8");
const uuidBytes = 16;
const timeBytes = 6;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function encode(purpose: Buffer, id: string, at: Date, secret: Buffer) {
  if (!uuidPattern.test(id)) {
    throw new TypeError("A form token needs an id that is a UUID.");
  }
  const time = Buffer.alloc(timeBytes);
  time.writeUIntBE(Math.max(Math.trunc(at.getTime()), 0), 0, timeBytes);
  return signToken(
    Buffer.concat([purpose, Buffer.from(id.replaceAll("-", ""), "hex"), time]),
    secret,
  );
}

function decode(purpose: Buffer, token: unknown, secret: Buffer) {
  if (typeof token !== "string") {
    return null;
  }
  const body = verifyToken(token, secret);
  if (
    !body ||
    body.length !== purpose.length + uuidBytes + timeBytes ||
    !body.subarray(0, purpose.length).equals(purpose)
  ) {
    return null;
  }
  const hex = body
    .subarray(purpose.length, purpose.length + uuidBytes)
    .toString("hex");
  return {
    id: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
    at: new Date(body.readUIntBE(purpose.length + uuidBytes, timeBytes)),
  };
}

export function confirmToken(
  submissionId: string,
  expiresAt: Date,
  secret: Buffer,
) {
  return encode(confirmPurpose, submissionId, expiresAt, secret);
}

export function readConfirmToken(
  token: unknown,
  secret: Buffer,
  now = new Date(),
): { submissionId: string; expired: boolean } | null {
  const decoded = decode(confirmPurpose, token, secret);
  return decoded
    ? {
        submissionId: decoded.id,
        expired: decoded.at.getTime() <= now.getTime(),
      }
    : null;
}

export function renderToken(formId: string, renderedAt: Date, secret: Buffer) {
  return encode(renderPurpose, formId, renderedAt, secret);
}

export function readRenderToken(
  token: unknown,
  formId: string,
  secret: Buffer,
): Date | null {
  const decoded = decode(renderPurpose, token, secret);
  return decoded && decoded.id === formId.toLowerCase() ? decoded.at : null;
}
