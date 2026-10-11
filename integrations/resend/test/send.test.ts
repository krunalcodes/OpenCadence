import type { OutboundMessage } from "@workspace/integration-core";
import { describe, expect, it } from "vitest";
import { captureError, createAdapter, fullKey } from "./helpers";

const message: OutboundMessage = {
  from: { email: "ada@example.com", name: "Ada Lovelace" },
  to: ["grace@example.com"],
  subject: "Hello",
  html: "<p>Hello</p>",
};

describe("send", () => {
  it("maps a full message to the Resend body", async () => {
    const { adapter, calls } = createAdapter({ body: { id: "email_1" } });

    const result = await adapter.send(fullKey, {
      ...message,
      cc: ["cc@example.com"],
      bcc: ["bcc@example.com"],
      replyTo: "replies@example.com",
      text: "Hello",
      headers: {
        "X-Campaign": "spring",
        "message-id": "<stale@example.com>",
        "List-Unsubscribe": "<https://example.com/u>",
      },
      messageId: "<m1@example.com>",
      thread: {
        inReplyTo: "<m0@example.com>",
        references: ["<a@example.com>", "<m0@example.com>"],
      },
      idempotencyKey: "send-1",
      tags: {
        campaign: "spring sale",
        "step id": "welcome.1",
        plain: "ok_1-a",
      },
    });

    expect(result).toEqual({
      providerMessageId: "email_1",
      messageId: "<m1@example.com>",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.resend.com/emails");
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.headers).toEqual({
      Authorization: "Bearer re_full_access_key",
      "User-Agent": "OpenCadence",
      "Content-Type": "application/json",
      "Idempotency-Key": "send-1",
    });
    expect(calls[0]?.body).toEqual({
      from: "Ada Lovelace <ada@example.com>",
      to: ["grace@example.com"],
      subject: "Hello",
      cc: ["cc@example.com"],
      bcc: ["bcc@example.com"],
      reply_to: "replies@example.com",
      html: "<p>Hello</p>",
      text: "Hello",
      headers: {
        "X-Campaign": "spring",
        "List-Unsubscribe": "<https://example.com/u>",
        "Message-ID": "<m1@example.com>",
        "In-Reply-To": "<m0@example.com>",
        References: "<a@example.com> <m0@example.com>",
      },
      tags: [
        { name: "campaign", value: "spring_sale" },
        { name: "step_id", value: "welcome_1" },
        { name: "plain", value: "ok_1-a" },
      ],
    });
  });

  it("sends only what a minimal message needs", async () => {
    const { adapter, calls } = createAdapter({ body: { id: "email_2" } });

    const result = await adapter.send(fullKey, {
      from: { email: "ada@example.com" },
      to: ["grace@example.com"],
      subject: "Hello",
      text: "Hello",
    });

    expect(result).toEqual({
      providerMessageId: "email_2",
      messageId: undefined,
    });
    expect(calls[0]?.body).toEqual({
      from: "ada@example.com",
      to: ["grace@example.com"],
      subject: "Hello",
      text: "Hello",
    });
    expect(calls[0]?.headers).not.toHaveProperty("Idempotency-Key");
  });

  it("quotes a sender name with special characters", async () => {
    const { adapter, calls } = createAdapter({ body: { id: "email_3" } });
    await adapter.send(fullKey, {
      ...message,
      from: { email: "team@example.com", name: 'Lovelace, "Ada"' },
    });
    expect(calls[0]?.body).toMatchObject({
      from: '"Lovelace, \\"Ada\\"" <team@example.com>',
    });
  });

  it("keeps a caller header when no message id is given", async () => {
    const { adapter, calls } = createAdapter({ body: { id: "email_4" } });
    await adapter.send(fullKey, {
      ...message,
      headers: { "Message-ID": "<own@example.com>" },
    });
    expect(calls[0]?.body).toMatchObject({
      headers: { "Message-ID": "<own@example.com>" },
    });
  });

  it.each([
    ["no recipients", { to: [] }],
    [
      "more than 50 recipients",
      { to: Array.from({ length: 51 }, (_, index) => `u${index}@example.com`) },
    ],
    ["an empty idempotency key", { idempotencyKey: "" }],
    [
      "an idempotency key that is too long",
      { idempotencyKey: "k".repeat(257) },
    ],
  ])("rejects %s before calling Resend", async (_, overrides) => {
    const { adapter, calls } = createAdapter({ body: { id: "email_5" } });
    const error = await captureError(() =>
      adapter.send(fullKey, { ...message, ...overrides }),
    );
    expect(error).toMatchObject({ code: "validation" });
    expect(calls).toHaveLength(0);
  });

  it("fails when Resend returns no id", async () => {
    const { adapter } = createAdapter({ body: {} });
    const error = await captureError(() => adapter.send(fullKey, message));
    expect(error).toMatchObject({ code: "unknown", providerStatus: 200 });
  });
});
