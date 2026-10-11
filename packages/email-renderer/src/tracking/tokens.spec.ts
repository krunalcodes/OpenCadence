import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  clickSignature,
  decodeClickTarget,
  encodeClickTarget,
  messageToken,
  readMessageToken,
  signToken,
  trackedClickUrl,
  verifyClickSignature,
  verifyToken,
} from "./tokens";

const secret = Buffer.alloc(32, 7);
const otherSecret = Buffer.alloc(32, 8);
const messageId = "0198c1de-7a10-7c3e-9f00-0123456789ab";

function flip(token: string, index: number) {
  const replacement = token[index] === "A" ? "B" : "A";
  return token.slice(0, index) + replacement + token.slice(index + 1);
}

describe("signToken and verifyToken", () => {
  it("round trips text and binary payloads", () => {
    expect(verifyToken(signToken("hello", secret), secret)?.toString()).toBe(
      "hello",
    );
    const payload = randomBytes(40);
    expect(verifyToken(signToken(payload, secret), secret)).toEqual(payload);
  });

  it("is base64url with a 16 byte signature", () => {
    const token = signToken(Buffer.alloc(16), secret);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
  });

  it("rejects a token signed with another secret", () => {
    expect(verifyToken(signToken("hello", otherSecret), secret)).toBeNull();
  });

  it("rejects every single character change", () => {
    const token = signToken("a payload that is long enough", secret);
    for (let index = 0; index < token.length; index += 1) {
      expect(verifyToken(flip(token, index), secret)).toBeNull();
    }
  });

  it("rejects truncated, extended, empty and malformed tokens", () => {
    const token = signToken("hello", secret);
    expect(verifyToken(token.slice(0, -1), secret)).toBeNull();
    expect(verifyToken(`${token}A`, secret)).toBeNull();
    expect(verifyToken("", secret)).toBeNull();
    expect(verifyToken("not a token!", secret)).toBeNull();
    expect(verifyToken(`${token}=`, secret)).toBeNull();
    expect(verifyToken("ab+/cd==", secret)).toBeNull();
    expect(verifyToken("A".repeat(5000), secret)).toBeNull();
    expect(verifyToken(undefined as unknown as string, secret)).toBeNull();
    expect(verifyToken(42 as unknown as string, secret)).toBeNull();
  });

  it("rejects a signature with no payload", () => {
    expect(verifyToken(signToken("", secret), secret)).toBeNull();
  });

  it("rejects a non canonical encoding of a valid token", () => {
    const token = signToken("ab", secret);
    const last = token.charCodeAt(token.length - 1);
    const alphabet =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const sibling = alphabet[alphabet.indexOf(String.fromCharCode(last)) ^ 1];
    const altered = token.slice(0, -1) + sibling;
    expect(verifyToken(altered, secret)).toBeNull();
  });
});

describe("messageToken and readMessageToken", () => {
  it("round trips a message id", () => {
    const token = messageToken(messageId, secret);
    expect(token).toHaveLength(43);
    expect(readMessageToken(token, secret)).toBe(messageId);
  });

  it("normalises the id to lower case", () => {
    const token = messageToken(messageId.toUpperCase(), secret);
    expect(readMessageToken(token, secret)).toBe(messageId);
  });

  it("refuses an id that is not a UUID", () => {
    expect(() => messageToken("nope", secret)).toThrow(TypeError);
  });

  it("returns null for a valid token that does not hold a message id", () => {
    expect(readMessageToken(signToken("hello", secret), secret)).toBeNull();
    expect(
      readMessageToken(signToken(Buffer.alloc(17), secret), secret),
    ).toBeNull();
  });

  it("returns null for another secret or a changed token", () => {
    const token = messageToken(messageId, secret);
    expect(readMessageToken(token, otherSecret)).toBeNull();
    expect(readMessageToken(flip(token, 3), secret)).toBeNull();
    expect(readMessageToken(flip(token, 40), secret)).toBeNull();
    expect(readMessageToken("", secret)).toBeNull();
  });
});

describe("click signatures", () => {
  const url = "https://example.com/pricing?a=1&b=two#top";

  it("accepts the signature for the same message and address", () => {
    const signature = clickSignature(messageId, url, secret);
    expect(signature).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(verifyClickSignature(messageId, url, signature, secret)).toBe(true);
  });

  it("rejects another address, message or secret", () => {
    const signature = clickSignature(messageId, url, secret);
    const otherMessage = "0198c1de-7a10-7c3e-9f00-0123456789ac";
    expect(verifyClickSignature(messageId, `${url}x`, signature, secret)).toBe(
      false,
    );
    expect(
      verifyClickSignature(
        messageId,
        "https://evil.example",
        signature,
        secret,
      ),
    ).toBe(false);
    expect(verifyClickSignature(otherMessage, url, signature, secret)).toBe(
      false,
    );
    expect(verifyClickSignature(messageId, url, signature, otherSecret)).toBe(
      false,
    );
  });

  it("rejects malformed signatures without throwing", () => {
    for (const bad of ["", "x", "!!!!", "A".repeat(22), "A".repeat(500)]) {
      expect(verifyClickSignature(messageId, url, bad, secret)).toBe(false);
    }
    expect(
      verifyClickSignature(messageId, url, null as unknown as string, secret),
    ).toBe(false);
    expect(verifyClickSignature("nope", url, "AAAA", secret)).toBe(false);
  });

  it("does not accept a message token as a click signature or the reverse", () => {
    const token = messageToken(messageId, secret);
    expect(verifyClickSignature(messageId, url, token, secret)).toBe(false);
    expect(
      readMessageToken(clickSignature(messageId, url, secret), secret),
    ).toBeNull();
  });

  it("encodes and decodes the target", () => {
    for (const target of [url, "https://example.com/café?q=☃"]) {
      expect(decodeClickTarget(encodeClickTarget(target))).toBe(target);
    }
    expect(decodeClickTarget("")).toBeNull();
    expect(decodeClickTarget("a b")).toBeNull();
    expect(
      decodeClickTarget(Buffer.from([0xff, 0xfe]).toString("base64url")),
    ).toBeNull();
    expect(decodeClickTarget("A".repeat(9000))).toBeNull();
  });

  it("builds the tracked address", () => {
    const token = messageToken(messageId, secret);
    const tracked = new URL(
      trackedClickUrl({
        baseUrl: "https://mail.example.com/api/v1/",
        messageToken: token,
        messageId,
        url,
        secret,
      }),
    );
    expect(tracked.origin + tracked.pathname).toBe(
      `https://mail.example.com/api/v1/t/c/${token}`,
    );
    expect(decodeClickTarget(tracked.searchParams.get("u") ?? "")).toBe(url);
    expect(
      verifyClickSignature(
        messageId,
        url,
        tracked.searchParams.get("s") ?? "",
        secret,
      ),
    ).toBe(true);
  });
});
