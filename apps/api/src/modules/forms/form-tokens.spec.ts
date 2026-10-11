import { messageToken, readMessageToken } from "@workspace/email-renderer";
import { describe, expect, it } from "vitest";
import {
  confirmToken,
  readConfirmToken,
  readRenderToken,
  renderToken,
} from "./form-tokens";

const secret = Buffer.alloc(32, 7);
const otherSecret = Buffer.alloc(32, 8);
const submissionId = "0198c1de-7a10-7c3e-9f00-0123456789ab";
const formId = "0198c1de-7a10-7c3e-9f00-00000000f0f0";
const now = new Date("2026-10-11T12:00:00.000Z");
const later = new Date(now.getTime() + 60_000);

describe("confirm tokens", () => {
  it("round-trips a submission id until it expires", () => {
    const token = confirmToken(submissionId, later, secret);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(readConfirmToken(token, secret, now)).toEqual({
      submissionId,
      expired: false,
    });
    expect(readConfirmToken(token, secret, later)).toEqual({
      submissionId,
      expired: true,
    });
    expect(
      readConfirmToken(token, secret, new Date(later.getTime() + 1)),
    ).toEqual({ submissionId, expired: true });
  });

  it("refuses a token signed with another key or changed in any character", () => {
    const token = confirmToken(submissionId, later, secret);
    expect(readConfirmToken(token, otherSecret, now)).toBeNull();
    for (let index = 0; index < token.length; index += 1) {
      const swapped = token[index] === "A" ? "B" : "A";
      const changed = token.slice(0, index) + swapped + token.slice(index + 1);
      expect(readConfirmToken(changed, secret, now)).toBeNull();
    }
  });

  it("refuses anything that is not a token", () => {
    for (const value of [undefined, null, 42, "", "abc", "a".repeat(2000)]) {
      expect(readConfirmToken(value, secret, now)).toBeNull();
    }
  });

  it("cannot be made from, or used as, a message token", () => {
    const message = messageToken(submissionId, secret);
    expect(readConfirmToken(message, secret, now)).toBeNull();
    const confirm = confirmToken(submissionId, later, secret);
    expect(readMessageToken(confirm, secret)).toBeNull();
  });

  it("cannot be swapped with a render token for the same id", () => {
    const render = renderToken(submissionId, later, secret);
    expect(readConfirmToken(render, secret, now)).toBeNull();
    const confirm = confirmToken(formId, later, secret);
    expect(readRenderToken(confirm, formId, secret)).toBeNull();
  });

  it("needs a UUID", () => {
    expect(() => confirmToken("not-an-id", later, secret)).toThrow(TypeError);
  });
});

describe("render tokens", () => {
  it("carry the render time for one form only", () => {
    const token = renderToken(formId, now, secret);
    expect(readRenderToken(token, formId, secret)).toEqual(now);
    expect(readRenderToken(token, formId.toUpperCase(), secret)).toEqual(now);
    expect(readRenderToken(token, submissionId, secret)).toBeNull();
    expect(readRenderToken(token, formId, otherSecret)).toBeNull();
    expect(readRenderToken("forged", formId, secret)).toBeNull();
  });
});
