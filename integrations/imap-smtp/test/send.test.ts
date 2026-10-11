import type { OutboundMessage } from "@workspace/integration-core";
import { describe, expect, it } from "vitest";
import { captureError, createAdapter, credentials, smtpError } from "./helpers";

const message: OutboundMessage = {
  from: { email: "ada@example.com", name: "Ada Lovelace" },
  to: ["grace@example.org", "alan@example.org"],
  cc: ["cc@example.org"],
  bcc: ["hidden@example.org"],
  replyTo: "replies@example.com",
  subject: "Quarterly update",
  html: "<p>Hello Grace</p>",
  text: "Hello Grace",
  headers: {
    "List-Unsubscribe": "<https://example.com/u/abc>",
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  },
  messageId: "<step-2@example.com>",
  thread: {
    inReplyTo: "<step-1@example.com>",
    references: ["<step-0@example.com>", "<step-1@example.com>"],
  },
};

describe("send", () => {
  it("maps every field onto the SMTP message and returns the Message-ID", async () => {
    const { adapter, smtp, imap } = createAdapter();
    const result = await adapter.send(credentials, message);

    expect(result).toEqual({
      providerMessageId: "<step-2@example.com>",
      messageId: "<step-2@example.com>",
    });
    expect(smtp.mails).toEqual([
      {
        from: { name: "Ada Lovelace", address: "ada@example.com" },
        to: ["grace@example.org", "alan@example.org"],
        cc: ["cc@example.org"],
        bcc: ["hidden@example.org"],
        replyTo: "replies@example.com",
        subject: "Quarterly update",
        html: "<p>Hello Grace</p>",
        text: "Hello Grace",
        headers: {
          "List-Unsubscribe": "<https://example.com/u/abc>",
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
        messageId: "<step-2@example.com>",
        inReplyTo: "<step-1@example.com>",
        references: ["<step-0@example.com>", "<step-1@example.com>"],
        disableFileAccess: true,
        disableUrlAccess: true,
      },
    ]);
    expect(smtp.options[0]).toMatchObject({
      host: "smtp.example.com",
      tls: { rejectUnauthorized: true },
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    expect(smtp.calls).toEqual(["sendMail", "close"]);
    expect(imap.calls).toEqual([]);
  });

  it("generates a Message-ID on the sender's domain", async () => {
    const { adapter, smtp } = createAdapter();
    const result = await adapter.send(credentials, {
      from: { email: "ada@mail.example.com" },
      to: ["grace@example.org"],
      subject: "Hello",
      text: "Hello",
    });

    expect(result.messageId).toMatch(
      /^<[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@mail\.example\.com>$/,
    );
    expect(result.providerMessageId).toBe(result.messageId);
    expect(smtp.mails[0]).toMatchObject({
      from: "ada@mail.example.com",
      messageId: result.messageId,
      inReplyTo: undefined,
      references: undefined,
    });
  });

  it("wraps a bare Message-ID in angle brackets", async () => {
    const { adapter } = createAdapter();
    const result = await adapter.send(credentials, {
      ...message,
      messageId: "bare@example.com",
    });
    expect(result.messageId).toBe("<bare@example.com>");
  });

  it("refuses a message without recipients before connecting", async () => {
    const { adapter, smtp } = createAdapter();
    const error = await captureError(() =>
      adapter.send(credentials, { ...message, to: [] }),
    );
    expect(error).toMatchObject({
      code: "validation",
      message: "The message has no recipients.",
    });
    expect(smtp.calls).toEqual([]);
  });

  it("closes the transport when sending fails", async () => {
    const { adapter, smtp } = createAdapter({
      smtp: {
        sendError: smtpError("Connection timeout", "ETIMEDOUT"),
      },
    });
    const error = await captureError(() => adapter.send(credentials, message));
    expect(error).toMatchObject({
      code: "temporary",
      message: "The SMTP server could not be reached.",
      retryable: true,
    });
    expect(smtp.calls).toEqual(["sendMail", "close"]);
  });
});
