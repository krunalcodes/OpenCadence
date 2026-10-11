import type { MessageStructureObject } from "imapflow";
import { describe, expect, it } from "vitest";
import {
  bodyPartLimit,
  decodeBody,
  decodeCharset,
  decodeTransferBytes,
  parseReceivedRef,
  receivedRef,
  selectBodyParts,
} from "../src/content";
import { createImapSmtpAdapter } from "../src/index";
import {
  captureError,
  createAdapter,
  createFakeImap,
  credentials,
  type FakeMessage,
  imapError,
} from "./helpers";

const alternative: MessageStructureObject = {
  type: "multipart/alternative",
  childNodes: [
    {
      part: "1",
      type: "text/plain",
      encoding: "quoted-printable",
      parameters: { charset: "ISO-8859-1" },
    },
    {
      part: "2",
      type: "text/html",
      encoding: "base64",
      parameters: { charset: "utf-8" },
    },
  ],
};

describe("selectBodyParts", () => {
  it("uses part 1 for a message that is one text part", () => {
    expect(
      selectBodyParts({
        type: "text/plain",
        encoding: "7bit",
        parameters: { charset: "us-ascii" },
      }),
    ).toEqual({ text: { key: "1", encoding: "7bit", charset: "us-ascii" } });
    expect(selectBodyParts({ type: "text/html" })).toEqual({
      html: { key: "1" },
    });
  });

  it("takes both sides of an alternative", () => {
    expect(selectBodyParts(alternative)).toEqual({
      text: { key: "1", encoding: "quoted-printable", charset: "ISO-8859-1" },
      html: { key: "2", encoding: "base64", charset: "utf-8" },
    });
  });

  it("finds the body inside mixed and related parts and skips every attachment", () => {
    const structure: MessageStructureObject = {
      type: "multipart/mixed",
      childNodes: [
        {
          part: "1",
          type: "multipart/related",
          childNodes: [
            { ...alternative, part: "1.1", childNodes: undefined },
            {
              part: "1.1",
              type: "multipart/alternative",
              childNodes: [
                { part: "1.1.1", type: "text/plain", encoding: "7bit" },
                { part: "1.1.2", type: "text/html", encoding: "7bit" },
              ],
            },
            {
              part: "1.2",
              type: "image/png",
              encoding: "base64",
              disposition: "inline",
              id: "<logo@customer.example>",
            },
          ],
        },
        {
          part: "2",
          type: "text/plain",
          encoding: "base64",
          disposition: "attachment",
          dispositionParameters: { filename: "notes.txt" },
        },
        {
          part: "3",
          type: "text/html",
          encoding: "base64",
          parameters: { NAME: "page.html" },
        },
        { part: "4", type: "application/pdf", encoding: "base64" },
      ],
    };
    expect(selectBodyParts(structure)).toEqual({
      text: { key: "1.1.1", encoding: "7bit" },
      html: { key: "1.1.2", encoding: "7bit" },
    });
  });

  it("does not read a forwarded message, a calendar invite or an inline file", () => {
    expect(
      selectBodyParts({
        type: "multipart/mixed",
        childNodes: [
          {
            part: "1",
            type: "message/rfc822",
            childNodes: [{ part: "1", type: "text/plain" }],
          },
          { part: "2", type: "text/calendar" },
          {
            part: "3",
            type: "text/plain",
            disposition: "inline",
            dispositionParameters: { filename: "log.txt" },
          },
        ],
      }),
    ).toEqual({});
  });

  it("keeps the first plain and the first HTML part only", () => {
    expect(
      selectBodyParts({
        type: "multipart/mixed",
        childNodes: [
          { part: "1", type: "TEXT/PLAIN" },
          { part: "2", type: "text/plain" },
          { part: "3", type: "text/html" },
          { part: "4", type: "text/html" },
        ],
      }),
    ).toEqual({ text: { key: "1" }, html: { key: "3" } });
  });

  it("returns nothing for no structure and survives a very deep one", () => {
    expect(selectBodyParts(undefined)).toEqual({});
    let deep: MessageStructureObject = { part: "9", type: "text/plain" };
    for (let level = 0; level < 500; level += 1) {
      deep = { type: "multipart/mixed", childNodes: [deep] };
    }
    expect(selectBodyParts(deep)).toEqual({});
  });
});

describe("decoding", () => {
  it("decodes quoted-printable with soft line breaks and keeps a bare equals sign", () => {
    const decoded = decodeTransferBytes(
      Buffer.from("Caf=E9 = 2 + 2 =3D four, a long li=\r\nne and =\n more"),
      "Quoted-Printable",
    );
    expect(decoded.toString("latin1")).toBe(
      "Café = 2 + 2 = four, a long line and  more",
    );
  });

  it("drops an escape cut in half at the end of a capped part", () => {
    expect(
      decodeTransferBytes(Buffer.from("abc=E"), "quoted-printable").toString(),
    ).toBe("abc");
    expect(
      decodeTransferBytes(Buffer.from("abc="), "quoted-printable").toString(),
    ).toBe("abc");
  });

  it("decodes base64 with line breaks and a cut at any length", () => {
    const encoded = Buffer.from("Hello there, world").toString("base64");
    const wrapped = `${encoded.slice(0, 8)}\r\n${encoded.slice(8)}`;
    expect(decodeTransferBytes(Buffer.from(wrapped), "BASE64").toString()).toBe(
      "Hello there, world",
    );
    expect(
      decodeTransferBytes(
        Buffer.from(encoded.slice(0, 10)),
        "base64",
      ).toString(),
    ).toBe("Hello t");
    expect(
      decodeTransferBytes(
        Buffer.from(encoded.slice(0, 9)),
        "base64",
      ).toString(),
    ).toBe("Hello ");
  });

  it("leaves 7bit, 8bit and binary bytes alone", () => {
    const bytes = Buffer.from([72, 105, 0xe9]);
    expect(decodeTransferBytes(bytes, "8bit")).toBe(bytes);
    expect(decodeTransferBytes(bytes, undefined)).toBe(bytes);
  });

  it("decodes the declared charset", () => {
    expect(
      decodeCharset(Buffer.from([0x63, 0x61, 0x66, 0xe9]), "iso-8859-1"),
    ).toBe("café");
    expect(
      decodeCharset(Buffer.from([0x93, 0x68, 0x69, 0x94]), '"Windows-1252"'),
    ).toBe("“hi”");
    expect(decodeCharset(Buffer.from("grüße 日本"), " UTF-8 ")).toBe(
      "grüße 日本",
    );
    expect(
      decodeCharset(Buffer.from([0x93, 0xfa, 0x96, 0x7b]), "shift_jis"),
    ).toBe("日本");
    expect(
      decodeCharset(Buffer.from([0xef, 0xbb, 0xbf, 0x68, 0x69]), "utf-8"),
    ).toBe("hi");
  });

  it("falls back to UTF-8, then to Windows-1252, when the charset is missing or unknown", () => {
    expect(decodeCharset(Buffer.from("naïve"), undefined)).toBe("naïve");
    expect(decodeCharset(Buffer.from("naïve"), "x-made-up")).toBe("naïve");
    expect(
      decodeCharset(Buffer.from([0x6e, 0x61, 0xef, 0x76, 0x65]), undefined),
    ).toBe("naïve");
    expect(decodeCharset(Buffer.from([0x6e, 0x61, 0xef]), "utf-7")).toBe("naï");
  });

  it("never throws on bytes that are wrong for the charset", () => {
    expect(decodeCharset(Buffer.from([0x68, 0xff, 0x69]), "utf-8")).toBe("h�i");
  });

  it("caps a part, removes NUL bytes and trims a character cut at the cap", () => {
    expect(decodeBody(Buffer.from("a\u0000b"), {})).toBe("ab");
    const cut = Buffer.concat([Buffer.from("abc"), Buffer.from([0xe6, 0x97])]);
    expect(decodeBody(cut, { charset: "utf-8" }, cut.length)).toBe("abc");
    expect(decodeBody(Buffer.from("abcdef"), {}, 4)).toBe("abcd");
    expect(bodyPartLimit).toBe(256 * 1024);
  });
});

describe("received refs", () => {
  it("round-trips and rejects anything else", () => {
    expect(receivedRef("9", 41)).toBe("9:41");
    expect(parseReceivedRef("9:41")).toEqual({ uidValidity: "9", uid: 41 });
    for (const bad of [
      "",
      "41",
      "9:0",
      "9:-1",
      "a:1",
      "9:1:2",
      "9:1 ",
      "9:*",
    ]) {
      expect(parseReceivedRef(bad)).toBeNull();
    }
  });
});

const arrived = new Date("2026-10-10T08:30:00.000Z");

const html =
  "<html><body><p>Sounds good, <b>Thursday</b> works.</p></body></html>";

function reply(overrides: Partial<FakeMessage> = {}): FakeMessage {
  return {
    uid: 41,
    messageId: "<reply-41@customer.example>",
    subject: "Re: Quick question",
    internalDate: arrived,
    date: new Date("2026-10-10T08:29:00.000Z"),
    from: [{ name: " Grace Hopper ", address: "grace@customer.example" }],
    to: [{ address: "ada@example.com" }, { name: "No address" }],
    bodyStructure: {
      type: "multipart/mixed",
      childNodes: [
        {
          ...alternative,
          part: "1",
          childNodes: [
            { ...alternative.childNodes?.[0], part: "1.1", type: "text/plain" },
            { ...alternative.childNodes?.[1], part: "1.2", type: "text/html" },
          ],
        },
        {
          part: "2",
          type: "application/pdf",
          encoding: "base64",
          disposition: "attachment",
          dispositionParameters: { filename: "contract.pdf" },
        },
      ],
    },
    parts: {
      "1.1": "Sounds good, Thursday works. =A0Caf=E9?",
      "1.2": Buffer.from(html).toString("base64"),
      "2": "JVBERi0xLjQK",
    },
    ...overrides,
  };
}

function setup(messages: FakeMessage[], uidValidity = 9n) {
  const { inbox, imap } = createAdapter({
    imap: {
      mailboxes: [
        { path: "INBOX", messages, uidValidity },
        { path: "Junk", specialUse: "\\Junk" },
      ],
    },
  });
  const fetch = (ref: string) => {
    if (!inbox.fetchReceived) {
      throw new Error("The adapter cannot fetch received mail.");
    }
    return inbox.fetchReceived(credentials, ref);
  };
  return { fetch, imap };
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

describe("inbox.fetchReceived", () => {
  it("returns the decoded text and HTML of one message and nothing else", async () => {
    const { fetch, imap } = setup([reply()]);
    const content = await fetch("9:41");

    expect(content).toEqual({
      subject: "Re: Quick question",
      text: "Sounds good, Thursday works.  Café?",
      html,
      from: { email: "grace@customer.example", name: "Grace Hopper" },
      to: ["ada@example.com"],
      date: new Date("2026-10-10T08:29:00.000Z"),
    });
    expect(imap.calls).toEqual([
      ["on", "error"],
      ["connect"],
      ["mailboxOpen", "INBOX", { readOnly: true }],
      [
        "fetchOne",
        "INBOX",
        "41",
        { uid: true, envelope: true, internalDate: true, bodyStructure: true },
        { uid: true },
      ],
      [
        "fetchOne",
        "INBOX",
        "41",
        {
          uid: true,
          bodyParts: [
            { key: "1.1", start: 0, maxLength: bodyPartLimit },
            { key: "1.2", start: 0, maxLength: bodyPartLimit },
          ],
        },
        { uid: true },
      ],
      ["logout"],
    ]);
  });

  it("opens the inbox read-only, changes nothing and never asks for the source or an attachment", async () => {
    const { fetch, imap } = setup([reply()]);
    await fetch("9:41");

    expect(
      imap.names().filter((name) => changingMethods.includes(name)),
    ).toEqual([]);
    expect(new Set(imap.names())).toEqual(
      new Set(["on", "connect", "mailboxOpen", "fetchOne", "logout"]),
    );
    for (const call of imap.calls.filter((entry) => entry[0] === "fetchOne")) {
      expect(call[3]).not.toHaveProperty("source");
      expect(call[3]).not.toHaveProperty("flags");
      expect(call[3]).not.toHaveProperty("headers");
      expect(call[4]).toEqual({ uid: true });
      expect(JSON.stringify(call[3])).not.toContain('"key":"2"');
    }
    expect(imap.mailbox("INBOX")?.messages[0]?.flags).toBeUndefined();
    expect(imap.allClosed()).toBe(true);
  });

  it("caps each part at the limit", async () => {
    const long = "x".repeat(bodyPartLimit + 5000);
    const { fetch } = setup([
      reply({
        bodyStructure: { type: "text/plain", encoding: "7bit" },
        parts: { "1": long },
      }),
    ]);
    const content = await fetch("9:41");
    expect(content?.text).toHaveLength(bodyPartLimit);
    expect(content?.html).toBeNull();
  });

  it("returns the envelope with no body when there is no readable text part", async () => {
    const { fetch, imap } = setup([
      reply({
        date: undefined,
        from: [{ address: "grace@customer.example" }],
        subject: undefined,
        bodyStructure: {
          type: "multipart/mixed",
          childNodes: [
            {
              part: "1",
              type: "application/pdf",
              disposition: "attachment",
              dispositionParameters: { filename: "a.pdf" },
            },
          ],
        },
      }),
    ]);
    expect(await fetch("9:41")).toEqual({
      subject: "",
      text: null,
      html: null,
      from: { email: "grace@customer.example" },
      to: ["ada@example.com"],
      date: arrived,
    });
    expect(imap.names().filter((name) => name === "fetchOne")).toHaveLength(1);
  });

  it("returns null for a reference from another version of the inbox, a missing message or a malformed reference", async () => {
    const { fetch, imap } = setup([reply()]);
    expect(await fetch("8:41")).toBeNull();
    expect(imap.names()).not.toContain("fetchOne");
    expect(await fetch("9:77")).toBeNull();

    const untouched = setup([reply()]);
    expect(await untouched.fetch("9:41; DELETE")).toBeNull();
    expect(await untouched.fetch("")).toBeNull();
    expect(untouched.imap.calls).toEqual([]);
  });

  it("keeps the envelope when the server refuses the body fetch", async () => {
    const imap = createFakeImap({
      mailboxes: [{ path: "INBOX", messages: [reply()], uidValidity: 9n }],
    });
    const adapter = createImapSmtpAdapter({
      connect: (options) => {
        const client = imap.connect(options);
        return {
          ...client,
          fetchOne: async (seq, query, fetchOptions) => {
            if (query.bodyParts) {
              throw imapError("Command failed", {
                responseStatus: "NO",
                responseText: "Unknown body section",
              });
            }
            return client.fetchOne(seq, query, fetchOptions);
          },
        };
      },
    });
    expect(await adapter.inbox?.fetchReceived?.(credentials, "9:41")).toEqual({
      subject: "Re: Quick question",
      text: null,
      html: null,
      from: { email: "grace@customer.example", name: "Grace Hopper" },
      to: ["ada@example.com"],
      date: new Date("2026-10-10T08:29:00.000Z"),
    });
    expect(imap.allClosed()).toBe(true);
  });

  it("maps a connection failure and closes the session", async () => {
    const { inbox, imap } = createAdapter({
      imap: {
        throws: {
          fetchOne: imapError("Connection not available", {
            code: "NoConnection",
          }),
        },
        mailboxes: [{ path: "INBOX", messages: [reply()], uidValidity: 9n }],
      },
    });
    const error = await captureError(() =>
      inbox.fetchReceived?.(credentials, "9:41"),
    );
    expect(error).toMatchObject({ retryable: true });
    expect(JSON.stringify(error)).not.toContain(credentials.password);
    expect(imap.allClosed()).toBe(true);
  });

  it("rejects credentials of the wrong kind before connecting", async () => {
    const { inbox, imap } = createAdapter();
    const error = await captureError(() =>
      inbox.fetchReceived?.({ kind: "api_key", apiKey: "nope" }, "9:41"),
    );
    expect(error).toMatchObject({ code: "invalid_credentials" });
    expect(imap.calls).toEqual([]);
  });
});
