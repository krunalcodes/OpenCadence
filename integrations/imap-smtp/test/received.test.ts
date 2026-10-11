import type { ReceivedQuery } from "@workspace/integration-core";
import type { MessageStructureObject } from "imapflow";
import { describe, expect, it } from "vitest";
import {
  captureError,
  createAdapter,
  credentials,
  type FakeMailbox,
  type FakeMessage,
  imapError,
} from "./helpers";

const since = new Date("2026-10-09T12:00:00.000Z");

const arrived = new Date("2026-10-10T08:30:00.000Z");

const root = "<0199a000-0000-7000-8000-000000000001@sender.example>";

const headerNames = [
  "references",
  "auto-submitted",
  "x-autoreply",
  "x-autorespond",
  "precedence",
  "x-failed-recipients",
  "content-type",
];

function reply(uid: number, overrides: Partial<FakeMessage> = {}): FakeMessage {
  return {
    uid,
    messageId: `<reply-${uid}@customer.example>`,
    subject: "Re: A private subject",
    inReplyTo: root,
    references: root,
    internalDate: arrived,
    from: [{ name: "Grace Hopper", address: "grace@customer.example" }],
    to: [{ address: "ada@example.com" }],
    rawHeaders: [
      "Content-Type: text/plain; charset=utf-8",
      "Subject: Re: A private subject",
      "X-Mailer: Something",
    ],
    ...overrides,
  };
}

const reportStructure: MessageStructureObject = {
  type: "multipart/report",
  parameters: { "report-type": "delivery-status", boundary: "b1" },
  childNodes: [
    { part: "1", type: "text/plain", encoding: "7bit" },
    { part: "2", type: "message/delivery-status", encoding: "7bit" },
    {
      part: "3",
      type: "message/rfc822",
      childNodes: [{ part: "3", type: "text/plain" }],
    },
  ],
};

function report(
  uid: number,
  parts: Record<string, string>,
  overrides: Partial<FakeMessage> = {},
): FakeMessage {
  return reply(uid, {
    messageId: `<dsn-${uid}@mx.customer.example>`,
    subject: "Undelivered Mail Returned to Sender",
    inReplyTo: undefined,
    references: undefined,
    from: [{ address: "MAILER-DAEMON@mx.customer.example" }],
    rawHeaders: [
      'Content-Type: multipart/report;\r\n\tREPORT-TYPE="delivery-status";\r\n boundary="b1"',
      "Auto-Submitted: auto-replied",
    ],
    bodyStructure: reportStructure,
    parts,
    ...overrides,
  });
}

const hardStatus = [
  "Reporting-MTA: dns; mx.customer.example",
  "Arrival-Date: Sat, 10 Oct 2026 08:29:58 +0000",
  "",
  "Final-Recipient: rfc822; Lead@Customer.example",
  "Original-Recipient: rfc822;lead@customer.example",
  "Action: failed",
  "Status: 5.1.1",
  "Diagnostic-Code: smtp; 550 5.1.1 The email account that you tried to reach",
  "    does not exist.",
  "",
].join("\r\n");

const softStatus = [
  "Reporting-MTA: dns; mx.customer.example",
  "",
  "final-recipient:RFC822;lead@customer.example",
  "ACTION:   Delayed  ",
  "status:\t4.4.1 (connection timed out)",
  "Will-Retry-Until: Mon, 12 Oct 2026 08:29:58 +0000",
  "",
].join("\n");

const originalHeaders = [
  "Received: from sender.example by mx.customer.example;",
  " Sat, 10 Oct 2026 08:29:58 +0000",
  "From: Ada <ada@example.com>",
  "MESSAGE-ID:",
  ` ${root}`,
  "Subject: A private subject",
  "",
  "",
].join("\r\n");

function inboxOf(
  messages: FakeMessage[],
  extra: Partial<FakeMailbox> = {},
): FakeMailbox[] {
  return [
    { path: "INBOX", messages, ...extra },
    { path: "Junk", specialUse: "\\Junk", messages: [reply(900)] },
  ];
}

function setup(messages: FakeMessage[], extra: Partial<FakeMailbox> = {}) {
  const { inbox, imap } = createAdapter({
    imap: { mailboxes: inboxOf(messages, extra) },
  });
  const list = (input: Partial<ReceivedQuery> = {}) => {
    if (!inbox.listReceived) {
      throw new Error("The adapter cannot list received mail.");
    }
    return inbox.listReceived(credentials, {
      since,
      state: null,
      limit: 50,
      ...input,
    });
  };
  return { list, imap };
}

const changingMethods = [
  "messageFlagsAdd",
  "messageMove",
  "mailboxCreate",
  "messageDelete",
  "messageFlagsSet",
  "messageFlagsRemove",
  "messageCopy",
  "append",
];

describe("inbox.listReceived", () => {
  it("returns a person's reply with only what classification needs", async () => {
    const { list, imap } = setup([reply(7)]);
    const page = await list();

    expect(page).toEqual({
      messages: [
        {
          messageId: "<reply-7@customer.example>",
          inReplyTo: root,
          references: [root],
          from: { email: "grace@customer.example" },
          receivedAt: arrived,
          headers: { "content-type": "text/plain; charset=utf-8" },
        },
      ],
      state: { uidValidity: "1", lastUid: 7 },
      more: false,
    });
    expect(JSON.stringify(page)).not.toContain("private subject");
    expect(JSON.stringify(page)).not.toContain("Grace");
    expect(imap.calls).toEqual([
      ["on", "error"],
      ["connect"],
      ["mailboxOpen", "INBOX", { readOnly: true }],
      [
        "search",
        "INBOX",
        { since: new Date("2026-10-08T12:00:00.000Z") },
        { uid: true },
      ],
      [
        "fetchAll",
        "INBOX",
        "7",
        {
          uid: true,
          envelope: true,
          internalDate: true,
          bodyStructure: true,
          headers: headerNames,
        },
        { uid: true },
      ],
      ["logout"],
    ]);
  });

  it("opens the inbox read-only and never changes a message", async () => {
    const { list, imap } = setup([
      reply(7),
      report(8, { "2": hardStatus, "3.HEADER": originalHeaders }),
    ]);
    await list();
    const state = { uidValidity: "1", lastUid: 7 };
    await list({ state });

    const opens = imap.calls.filter((call) => call[0] === "mailboxOpen");
    expect(opens).toEqual([
      ["mailboxOpen", "INBOX", { readOnly: true }],
      ["mailboxOpen", "INBOX", { readOnly: true }],
    ]);
    expect(
      imap.names().filter((name) => changingMethods.includes(name)),
    ).toEqual([]);
    expect(new Set(imap.names())).toEqual(
      new Set([
        "on",
        "connect",
        "mailboxOpen",
        "search",
        "fetchAll",
        "fetchOne",
        "logout",
      ]),
    );
    for (const call of imap.calls) {
      if (call[0] === "fetchAll" || call[0] === "fetchOne") {
        expect(call[3]).not.toHaveProperty("source");
        expect(call[3]).not.toHaveProperty("flags");
      }
    }
    expect(imap.mailbox("INBOX")?.messages.map((entry) => entry.flags)).toEqual(
      [undefined, undefined],
    );
    expect(imap.allClosed()).toBe(true);
  });

  it("starts from the since date, oldest first, and skips earlier mail", async () => {
    const { list } = setup([
      reply(12, { internalDate: new Date("2026-10-10T09:00:00.000Z") }),
      reply(3, { internalDate: new Date("2026-09-01T00:00:00.000Z") }),
      reply(9, { internalDate: new Date("2026-10-09T11:59:00.000Z") }),
      reply(10, { internalDate: new Date("2026-10-09T12:00:00.000Z") }),
    ]);
    const page = await list();
    expect(page.messages.map((message) => message.messageId)).toEqual([
      "<reply-10@customer.example>",
      "<reply-12@customer.example>",
    ]);
    expect(page.state).toEqual({ uidValidity: "1", lastUid: 12 });
    expect(page.more).toBe(false);
  });

  it("starts the cursor at the newest message when nothing arrived since", async () => {
    const old = new Date("2026-09-01T00:00:00.000Z");
    const first = setup([reply(40, { internalDate: old })], { nextUid: 41 });
    expect(await first.list()).toEqual({
      messages: [],
      state: { uidValidity: "1", lastUid: 40 },
      more: false,
    });

    const hidden = setup([reply(40, { internalDate: old })], {
      hideUidNext: true,
    });
    expect((await hidden.list()).state).toEqual({
      uidValidity: "1",
      lastUid: 40,
    });
    expect(
      hidden.imap.calls.filter((call) => call[0] === "search").at(-1)?.[2],
    ).toEqual({ uid: "*" });

    const empty = setup([], { nextUid: 1 });
    expect((await empty.list()).state).toEqual({
      uidValidity: "1",
      lastUid: 0,
    });
  });

  it("continues after the last UID on later runs, whatever the since date", async () => {
    const { list, imap } = setup([
      reply(7),
      reply(8, { internalDate: new Date("2020-01-01T00:00:00.000Z") }),
      reply(9),
    ]);
    const page = await list({ state: { uidValidity: "1", lastUid: 7 } });

    expect(page.messages.map((message) => message.messageId)).toEqual([
      "<reply-8@customer.example>",
      "<reply-9@customer.example>",
    ]);
    expect(page.state).toEqual({ uidValidity: "1", lastUid: 9 });
    expect(imap.calls.find((call) => call[0] === "search")?.[2]).toEqual({
      uid: "8:*",
    });
    expect(imap.calls.find((call) => call[0] === "fetchAll")?.[2]).toBe("8,9");
  });

  it("returns nothing when the server answers n:* with an older last message", async () => {
    const { list, imap } = setup([reply(5), reply(7)]);
    const state = { uidValidity: "1", lastUid: 7 };
    const page = await list({ state });

    expect(page).toEqual({ messages: [], state, more: false });
    expect(imap.calls.find((call) => call[0] === "search")?.[2]).toEqual({
      uid: "8:*",
    });
    expect(imap.names()).not.toContain("fetchAll");
  });

  it("starts over from the since date when UIDVALIDITY changed", async () => {
    const { list, imap } = setup(
      [reply(2), reply(3, { internalDate: new Date("2026-09-01T00:00:00Z") })],
      { uidValidity: 77n },
    );
    const page = await list({ state: { uidValidity: "1", lastUid: 400 } });

    expect(page.messages.map((message) => message.messageId)).toEqual([
      "<reply-2@customer.example>",
    ]);
    expect(page.state).toEqual({ uidValidity: "77", lastUid: 2 });
    expect(imap.calls.find((call) => call[0] === "search")?.[2]).toEqual({
      since: new Date("2026-10-08T12:00:00.000Z"),
    });
  });

  it("treats an unreadable cursor as a first run", async () => {
    const { list, imap } = setup([reply(2)]);
    const unreadable: Record<string, string | number>[] = [
      { uidValidity: 1, lastUid: 1 },
      { uidValidity: "1", lastUid: "1" },
      { uidValidity: "1", lastUid: -4 },
      { seen: 3 },
    ];
    for (const state of unreadable) {
      expect((await list({ state })).state).toEqual({
        uidValidity: "1",
        lastUid: 2,
      });
    }
    expect(
      imap.calls
        .filter((call) => call[0] === "search")
        .every((call) => "since" in (call[2] as object)),
    ).toBe(true);
  });

  it("caps a page at the limit and continues without gaps or repeats", async () => {
    const { list } = setup([1, 2, 3, 4, 5].map((uid) => reply(uid)));
    const seen: (string | undefined)[] = [];
    const first = await list({ limit: 2 });
    seen.push(...first.messages.map((message) => message.messageId));
    expect(first.more).toBe(true);
    expect(first.state).toEqual({ uidValidity: "1", lastUid: 2 });

    const second = await list({ limit: 2, state: first.state });
    seen.push(...second.messages.map((message) => message.messageId));
    expect(second.more).toBe(true);
    expect(second.state).toEqual({ uidValidity: "1", lastUid: 4 });

    const third = await list({ limit: 2, state: second.state });
    seen.push(...third.messages.map((message) => message.messageId));
    expect(third.more).toBe(false);
    expect(third.state).toEqual({ uidValidity: "1", lastUid: 5 });

    const fourth = await list({ limit: 2, state: third.state });
    expect(fourth).toEqual({ messages: [], state: third.state, more: false });
    expect(seen).toEqual(
      [1, 2, 3, 4, 5].map((uid) => `<reply-${uid}@customer.example>`),
    );
  });

  it("reports the headers that mark an automatic answer", async () => {
    const { list } = setup([
      reply(7, {
        rawHeaders: [
          "AUTO-SUBMITTED:   auto-replied;\r\n  reason=vacation",
          "X-Autoreply: yes",
          "x-autorespond: Out of office",
          "Precedence:\tauto_reply",
          "Content-Type: text/plain",
          "X-Secret: do not carry this",
        ],
      }),
    ]);
    const [message] = (await list()).messages;
    expect(message?.headers).toEqual({
      "auto-submitted": "auto-replied; reason=vacation",
      "x-autoreply": "yes",
      "x-autorespond": "Out of office",
      precedence: "auto_reply",
      "content-type": "text/plain",
    });
    expect(message?.deliveryStatus).toBeUndefined();
  });

  it("reads a permanent failure from a delivery report", async () => {
    const { list, imap } = setup([
      report(8, { "2": hardStatus, "3.HEADER": originalHeaders }),
    ]);
    const [message] = (await list()).messages;

    expect(message).toEqual({
      messageId: "<dsn-8@mx.customer.example>",
      references: [],
      from: { email: "MAILER-DAEMON@mx.customer.example" },
      receivedAt: arrived,
      headers: {
        "content-type":
          'multipart/report; REPORT-TYPE="delivery-status"; boundary="b1"',
        "auto-submitted": "auto-replied",
      },
      deliveryStatus: {
        action: "failed",
        status: "5.1.1",
        originalMessageId: root,
        failedRecipient: "lead@customer.example",
      },
    });
    expect(imap.calls.find((call) => call[0] === "fetchOne")).toEqual([
      "fetchOne",
      "INBOX",
      "8",
      {
        uid: true,
        bodyParts: [
          { key: "2", start: 0, maxLength: 32768 },
          { key: "3.HEADER", start: 0, maxLength: 32768 },
        ],
      },
      { uid: true },
    ]);
  });

  it("reads a delay notice as a temporary failure", async () => {
    const structure: MessageStructureObject = {
      type: "multipart/report",
      childNodes: [
        { part: "1", type: "text/plain" },
        { part: "2", type: "message/delivery-status" },
        { part: "3", type: "text/rfc822-headers", encoding: "BASE64" },
      ],
    };
    const { list, imap } = setup([
      report(
        8,
        {
          "2": softStatus,
          "3": Buffer.from(originalHeaders).toString("base64"),
        },
        { bodyStructure: structure, inReplyTo: root, references: root },
      ),
    ]);
    const [message] = (await list()).messages;

    expect(message?.deliveryStatus).toEqual({
      action: "delayed",
      status: "4.4.1",
      originalMessageId: root,
      failedRecipient: "lead@customer.example",
    });
    expect(message?.inReplyTo).toBe(root);
    const detail = imap.calls.find((call) => call[0] === "fetchOne")?.[3];
    expect(detail).toMatchObject({
      bodyParts: [{ key: "2" }, { key: "3" }],
    });
  });

  it("picks the failed recipient out of a report about several", async () => {
    const status = [
      "Reporting-MTA: dns; mx.customer.example",
      "",
      "Final-Recipient: rfc822; fine@customer.example",
      "Action: delivered",
      "Status: 2.0.0",
      "",
      "Final-Recipient: rfc822; <gone@customer.example>",
      "Action: failed (mailbox unavailable)",
      "Status: 5.2.1 (disabled)",
    ].join("\r\n");
    const { list } = setup([report(8, { "2": status })]);
    expect((await list()).messages[0]?.deliveryStatus).toEqual({
      action: "failed",
      status: "5.2.1",
      failedRecipient: "gone@customer.example",
    });
  });

  it("decodes a quoted-printable report", async () => {
    const structure: MessageStructureObject = {
      type: "multipart/report",
      childNodes: [
        {
          part: "1",
          type: "message/delivery-status",
          encoding: "quoted-printable",
        },
      ],
    };
    const { list } = setup([
      report(
        8,
        {
          "1": "Final-Recipient: rfc822; lead=40customer.example\r\nAct=\r\nion: failed\r\nStatus: 5.0.0",
        },
        { bodyStructure: structure },
      ),
    ]);
    expect((await list()).messages[0]?.deliveryStatus).toEqual({
      action: "failed",
      status: "5.0.0",
      failedRecipient: "lead@customer.example",
    });
  });

  it("never throws on a malformed delivery report", async () => {
    const garbage = [
      "",
      "\r\n\r\n\r\n",
      "no colon here\r\n: empty name\r\nAction\r\nStatus:\r\n",
      "Action: \r\nStatus: five\r\nFinal-Recipient: nobody",
      "Status: 15.1.1.9\r\nAction: 12345",
      "\u0000\u0001�:�\r\n\tfolded: with nothing before it",
      `Action: failed\r\n${"x".repeat(200_000)}`,
    ];
    const messages = garbage.map((content, index) =>
      report(20 + index, { "2": content, "3.HEADER": content }),
    );
    const { list } = setup([
      ...messages,
      report(40, {}),
      report(41, { "2": hardStatus }, { bodyStructure: undefined }),
      report(
        42,
        { "2": hardStatus },
        { bodyStructure: { type: "multipart/report", childNodes: [] } },
      ),
      report(
        43,
        { "2": hardStatus },
        { bodyStructure: { type: "text/plain", part: "1" } },
      ),
    ]);
    const page = await list();

    expect(page.messages).toHaveLength(11);
    expect(page.state).toEqual({ uidValidity: "1", lastUid: 43 });
    expect(page.messages.map((message) => message.deliveryStatus)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { action: "failed" },
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it("reads no more than the capped part of a huge report", async () => {
    const padding = `X-Padding: ${"p".repeat(40_000)}\r\n`;
    const { list } = setup([
      report(8, {
        "2": `Reporting-MTA: dns; mx\r\n\r\n${padding}Action: failed\r\nStatus: 5.1.1\r\n`,
        "3.HEADER": `${padding}Message-ID: ${root}\r\n`,
      }),
    ]);
    expect((await list()).messages[0]?.deliveryStatus).toBeUndefined();
  });

  it("keeps the rest of the page when the server refuses a report part", async () => {
    const { inbox, imap } = createAdapter({
      imap: {
        mailboxes: inboxOf([
          report(8, { "2": hardStatus, "3.HEADER": originalHeaders }),
          reply(9),
        ]),
        throws: {
          fetchOne: imapError("Command failed", {
            responseStatus: "NO",
            responseText: "Unknown section",
          }),
        },
      },
    });
    const page = await inbox.listReceived?.(credentials, {
      since,
      state: null,
      limit: 50,
    });
    expect(page?.messages.map((message) => message.deliveryStatus)).toEqual([
      undefined,
      undefined,
    ]);
    expect(page?.state).toEqual({ uidValidity: "1", lastUid: 9 });
    expect(imap.allClosed()).toBe(true);
  });

  it("raises the server's reason when listing fails", async () => {
    const { inbox, imap } = createAdapter({
      imap: {
        mailboxes: inboxOf([reply(7)]),
        reports: {
          search: imapError("Command failed", {
            responseStatus: "NO",
            serverResponseCode: "THROTTLED",
            responseText: "Slow down",
          }),
        },
      },
    });
    const error = await captureError(() =>
      inbox.listReceived?.(credentials, { since, state: null, limit: 50 }),
    );
    expect(error).toMatchObject({ code: "rate_limited" });
    expect(imap.allClosed()).toBe(true);

    const broken = createAdapter({
      imap: {
        mailboxes: inboxOf([reply(7)]),
        throws: { fetchAll: imapError("Socket closed", { code: "ETIMEDOUT" }) },
      },
    });
    const failure = await captureError(() =>
      broken.inbox.listReceived?.(credentials, {
        since,
        state: null,
        limit: 50,
      }),
    );
    expect(failure).toMatchObject({ name: "IntegrationError" });
    expect(broken.imap.allClosed()).toBe(true);
  });
});
