import type { OutboundMessage } from "@workspace/integration-core";
import { IntegrationError } from "@workspace/integration-core";
import { describe, expect, it } from "vitest";
import { sesMessageIdHeader } from "../src/index";
import { accessKey, captureError, createAdapter } from "./helpers";

const message: OutboundMessage = {
  from: { email: "ada@example.com", name: "Ada Lovelace" },
  to: ["grace@example.org"],
  subject: "Hello",
  html: "<p>Hello</p>",
  text: "Hello",
};

const sent = { SendEmailCommand: { MessageId: "0102018c-ses-id-000000" } };

function rawText(input: Record<string, unknown>) {
  const content = input.Content as { Raw?: { Data: Uint8Array } };
  if (!content.Raw) {
    throw new Error("Expected raw content.");
  }
  return Buffer.from(content.Raw.Data).toString("ascii");
}

describe("send", () => {
  it("sends simple content with the exact command input", async () => {
    const { adapter, commands } = createAdapter(sent);

    const result = await adapter.send(accessKey, message);

    expect(commands).toEqual([
      {
        name: "SendEmailCommand",
        input: {
          FromEmailAddress: "Ada Lovelace <ada@example.com>",
          Destination: {
            ToAddresses: ["grace@example.org"],
            CcAddresses: undefined,
            BccAddresses: undefined,
          },
          ConfigurationSetName: undefined,
          EmailTags: undefined,
          ReplyToAddresses: undefined,
          Content: {
            Simple: {
              Subject: { Data: "Hello", Charset: "UTF-8" },
              Body: {
                Html: { Data: "<p>Hello</p>", Charset: "UTF-8" },
                Text: { Data: "Hello", Charset: "UTF-8" },
              },
              Headers: undefined,
            },
          },
        },
      },
    ]);
    expect(result).toEqual({
      providerMessageId: "0102018c-ses-id-000000",
      messageId: "<0102018c-ses-id-000000@eu-west-1.amazonses.com>",
    });
  });

  it("carries every field of the message", async () => {
    const { adapter, commands } = createAdapter(sent);

    await adapter.send(accessKey, {
      ...message,
      cc: ["cc@example.org"],
      bcc: ["bcc@example.org"],
      replyTo: "replies@example.com",
      messageId: "<0198c1f0-aaaa@example.com>",
      thread: {
        inReplyTo: "<parent@example.com>",
        references: ["<root@example.com>", "<parent@example.com>"],
      },
      headers: {
        "List-Unsubscribe": "<https://app.example.com/u/1>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        "Message-ID": "<ignored@example.com>",
        "In-Reply-To": "<overridden@example.com>",
        "Reply-To": "dropped@example.com",
        "Content-Type": "text/calendar",
        "X-SES-CONFIGURATION-SET": "campaigns",
      },
      tags: { campaign: "october news", "message id": "42", empty: "" },
      idempotencyKey: "key-1",
    });

    expect(commands[0]?.input).toEqual({
      FromEmailAddress: "Ada Lovelace <ada@example.com>",
      Destination: {
        ToAddresses: ["grace@example.org"],
        CcAddresses: ["cc@example.org"],
        BccAddresses: ["bcc@example.org"],
      },
      ConfigurationSetName: "campaigns",
      EmailTags: [
        { Name: "campaign", Value: "october_news" },
        { Name: "message_id", Value: "42" },
      ],
      ReplyToAddresses: ["replies@example.com"],
      Content: {
        Simple: {
          Subject: { Data: "Hello", Charset: "UTF-8" },
          Body: {
            Html: { Data: "<p>Hello</p>", Charset: "UTF-8" },
            Text: { Data: "Hello", Charset: "UTF-8" },
          },
          Headers: [
            { Name: "In-Reply-To", Value: "<parent@example.com>" },
            {
              Name: "References",
              Value: "<root@example.com> <parent@example.com>",
            },
            {
              Name: "List-Unsubscribe",
              Value: "<https://app.example.com/u/1>",
            },
            {
              Name: "List-Unsubscribe-Post",
              Value: "List-Unsubscribe=One-Click",
            },
          ],
        },
      },
    });
  });

  it("uses threading headers supplied as plain headers", async () => {
    const { adapter, commands } = createAdapter(sent);

    await adapter.send(accessKey, {
      ...message,
      headers: {
        "in-reply-to": "parent@example.com",
        references: "<root@example.com>  <parent@example.com>",
      },
    });

    const content = commands[0]?.input.Content as {
      Simple: { Headers: unknown };
    };
    expect(content.Simple.Headers).toEqual([
      { Name: "In-Reply-To", Value: "<parent@example.com>" },
      { Name: "References", Value: "<root@example.com> <parent@example.com>" },
    ]);
  });

  it("uses the configuration set from the adapter configuration", async () => {
    const { adapter, commands } = createAdapter(sent, {
      configurationSetName: "default-set",
    });

    await adapter.send(accessKey, message);
    await adapter.send(accessKey, {
      ...message,
      headers: { "X-SES-Configuration-Set": "per-source" },
    });

    expect(commands[0]?.input.ConfigurationSetName).toBe("default-set");
    expect(commands[1]?.input.ConfigurationSetName).toBe("per-source");
  });

  it("encodes a display name outside ASCII and sends a text only body", async () => {
    const { adapter, commands } = createAdapter(sent);

    await adapter.send(accessKey, {
      from: { email: "jose@example.com", name: "José" },
      to: ["grace@example.org"],
      subject: "Résumé\r\nBcc: eve@example.com",
      text: "Hola",
    });

    expect(commands[0]?.input).toMatchObject({
      FromEmailAddress: "=?UTF-8?B?Sm9zw6k=?= <jose@example.com>",
      Content: {
        Simple: {
          Subject: { Data: "Résumé Bcc: eve@example.com", Charset: "UTF-8" },
          Body: { Html: undefined, Text: { Data: "Hola", Charset: "UTF-8" } },
        },
      },
    });
  });

  it("returns the message ID host of us-east-1", () => {
    expect(sesMessageIdHeader("abc", "us-east-1")).toBe(
      "<abc@email.amazonses.com>",
    );
    expect(sesMessageIdHeader("abc", "ap-south-1")).toBe(
      "<abc@ap-south-1.amazonses.com>",
    );
  });

  it("switches to raw MIME when a header value is outside ASCII", async () => {
    const now = new Date("2026-10-11T09:30:05.000Z");
    const { adapter, commands } = createAdapter(sent, { now: () => now });

    await adapter.send(accessKey, {
      ...message,
      cc: ["cc@example.org"],
      bcc: ["bcc@example.org"],
      replyTo: "replies@example.com",
      messageId: "<0198c1f0-aaaa@example.com>",
      thread: { inReplyTo: "<parent@example.com>" },
      headers: { "X-Note": "Grüße", "X-SES-CONFIGURATION-SET": "campaigns" },
      tags: { campaign: "october" },
    });

    const input = commands[0]?.input ?? {};
    expect(input).toMatchObject({
      FromEmailAddress: "ada@example.com",
      Destination: {
        ToAddresses: ["grace@example.org"],
        CcAddresses: ["cc@example.org"],
        BccAddresses: ["bcc@example.org"],
      },
      ConfigurationSetName: "campaigns",
      EmailTags: [{ Name: "campaign", Value: "october" }],
    });
    expect(input.ReplyToAddresses).toBeUndefined();
    const raw = rawText(input);
    const boundary = /boundary="([^"]+)"/.exec(raw)?.[1] ?? "";
    expect(boundary).toMatch(/^=_[0-9a-f]{36}$/);
    expect(raw).toBe(
      [
        "Date: Sun, 11 Oct 2026 09:30:05 +0000",
        "From: Ada Lovelace <ada@example.com>",
        "To: grace@example.org",
        "Cc: cc@example.org",
        "Reply-To: replies@example.com",
        "Subject: Hello",
        "Message-ID: <0198c1f0-aaaa@example.com>",
        "In-Reply-To: <parent@example.com>",
        "X-Note: =?UTF-8?B?R3LDvMOfZQ==?=",
        "MIME-Version: 1.0",
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        "",
        `--${boundary}`,
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: quoted-printable",
        "",
        "Hello",
        `--${boundary}`,
        "Content-Type: text/html; charset=UTF-8",
        "Content-Transfer-Encoding: quoted-printable",
        "",
        "<p>Hello</p>",
        `--${boundary}--`,
        "",
      ].join("\r\n"),
    );
  });

  it("switches to raw MIME for more than 15 headers", async () => {
    const { adapter, commands } = createAdapter(sent);
    const headers = Object.fromEntries(
      Array.from({ length: 16 }, (_, index) => [`X-Header-${index}`, "v"]),
    );

    await adapter.send(accessKey, { ...message, headers });

    expect(rawText(commands[0]?.input ?? {})).toContain("X-Header-15: v\r\n");
  });

  it("switches to raw MIME for a references chain over 995 characters", async () => {
    const { adapter, commands } = createAdapter(sent);
    const references = Array.from(
      { length: 30 },
      (_, index) => `<message-${index}-0198c1f0-aaaa-bbbb@mail.example.com>`,
    );

    await adapter.send(accessKey, { ...message, thread: { references } });

    const raw = rawText(commands[0]?.input ?? {});
    const unfolded = raw.replace(/\r\n /g, " ");
    expect(unfolded).toContain(`References: ${references.join(" ")}\r\n`);
  });

  it.each([
    ["no recipients", { to: [] }],
    [
      "more than 50 recipients",
      {
        to: Array.from({ length: 30 }, (_, index) => `to${index}@example.org`),
        cc: Array.from({ length: 21 }, (_, index) => `cc${index}@example.org`),
      },
    ],
    ["no body", { html: undefined, text: undefined }],
    ["a recipient outside ASCII", { to: ["josé@example.org"] }],
    [
      "a bad configuration set name",
      { headers: { "X-SES-CONFIGURATION-SET": "has spaces" } },
    ],
    ["a bad header name", { headers: { "Bad Name": "Grüße" } }],
  ])("rejects %s before calling AWS", async (_, overrides) => {
    const { adapter, commands } = createAdapter(sent);

    const error = await captureError(() =>
      adapter.send(accessKey, { ...message, ...overrides }),
    );

    expect(error).toBeInstanceOf(IntegrationError);
    expect((error as IntegrationError).code).toBe("validation");
    expect(commands).toHaveLength(0);
  });

  it("accepts exactly 50 recipients across to, cc and bcc", async () => {
    const { adapter, commands } = createAdapter(sent);

    await adapter.send(accessKey, {
      ...message,
      to: Array.from({ length: 20 }, (_, index) => `to${index}@example.org`),
      cc: Array.from({ length: 20 }, (_, index) => `cc${index}@example.org`),
      bcc: Array.from({ length: 10 }, (_, index) => `bcc${index}@example.org`),
    });

    expect(commands).toHaveLength(1);
  });

  it("fails when AWS returns no message ID", async () => {
    const { adapter } = createAdapter({ SendEmailCommand: {} });

    const error = (await captureError(() =>
      adapter.send(accessKey, message),
    )) as IntegrationError;

    expect(error.code).toBe("unknown");
  });
});
