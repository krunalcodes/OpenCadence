import type { OutboundMessage } from "@workspace/integration-core";
import { describe, expect, it } from "vitest";
import {
  addressHeader,
  buildMimeMessage,
  encodeBase64Lines,
  encodeQuotedPrintable,
  encodeWords,
  formatDate,
  textHeader,
} from "../src/mime";
import { captureError } from "./helpers";

const options = {
  messageId: "<step-2@example.com>",
  date: new Date("2026-10-11T08:05:09Z"),
  boundary: "=_boundary",
};

const base: OutboundMessage = {
  from: { email: "ada@example.com", name: "Ada Lovelace" },
  to: ["grace@example.org"],
  subject: "Quarterly update",
  text: "Hello Grace",
};

function decodeWords(value: string) {
  return value
    .replace(/\?=\r\n (?==\?)/g, "?=")
    .replace(/=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=/g, (_match, data: string) =>
      Buffer.from(data, "base64").toString("utf8"),
    );
}

function decodeQuotedPrintable(value: string) {
  const bytes: number[] = [];
  const joined = value.replace(/=\r\n/g, "");
  for (let index = 0; index < joined.length; index += 1) {
    if (joined[index] === "=") {
      bytes.push(Number.parseInt(joined.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(joined.charCodeAt(index));
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

function parse(mime: string) {
  const split = mime.indexOf("\r\n\r\n");
  const head = mime.slice(0, split);
  const headers = new Map<string, string>();
  for (const line of head.replace(/\r\n[ \t]+/g, " ").split("\r\n")) {
    const colon = line.indexOf(":");
    headers.set(
      line.slice(0, colon).toLowerCase(),
      line.slice(colon + 1).trim(),
    );
  }
  return { head, headers, body: mime.slice(split + 4) };
}

function expectWellFormed(mime: string, softLimit = 78) {
  expect(mime.endsWith("\r\n")).toBe(true);
  expect(mime.replaceAll("\r\n", "")).not.toMatch(/[\r\n]/);
  expect(mime).toMatch(/^[\t\r\n -~]*$/);
  for (const line of mime.split("\r\n")) {
    expect(line.length).toBeLessThanOrEqual(softLimit);
  }
}

describe("formatDate", () => {
  it("writes an RFC 5322 date in UTC", () => {
    expect(formatDate(options.date)).toBe("Sun, 11 Oct 2026 08:05:09 +0000");
  });
});

describe("buildMimeMessage", () => {
  it("builds a single text part exactly", () => {
    expect(buildMimeMessage(base, options)).toBe(
      [
        "Date: Sun, 11 Oct 2026 08:05:09 +0000",
        "From: Ada Lovelace <ada@example.com>",
        "To: grace@example.org",
        "Subject: Quarterly update",
        "Message-ID: <step-2@example.com>",
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=utf-8",
        "Content-Transfer-Encoding: quoted-printable",
        "",
        "Hello Grace",
        "",
      ].join("\r\n"),
    );
  });

  it("builds multipart/alternative with text first and html last", () => {
    const mime = buildMimeMessage(
      { ...base, html: "<p>Hello Grace</p>" },
      options,
    );
    expect(mime).toBe(
      [
        "Date: Sun, 11 Oct 2026 08:05:09 +0000",
        "From: Ada Lovelace <ada@example.com>",
        "To: grace@example.org",
        "Subject: Quarterly update",
        "Message-ID: <step-2@example.com>",
        "MIME-Version: 1.0",
        'Content-Type: multipart/alternative; boundary="=_boundary"',
        "",
        "--=_boundary",
        "Content-Type: text/plain; charset=utf-8",
        "Content-Transfer-Encoding: quoted-printable",
        "",
        "Hello Grace",
        "--=_boundary",
        "Content-Type: text/html; charset=utf-8",
        "Content-Transfer-Encoding: quoted-printable",
        "",
        "<p>Hello Grace</p>",
        "--=_boundary--",
        "",
      ].join("\r\n"),
    );
  });

  it("sends html alone as a single part and an empty text part when there is no body", () => {
    const html = parse(
      buildMimeMessage(
        { ...base, text: undefined, html: "<b>Hi</b>" },
        options,
      ),
    );
    expect(html.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(html.body).toBe("<b>Hi</b>\r\n");
    const empty = parse(
      buildMimeMessage({ ...base, text: undefined }, options),
    );
    expect(empty.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(empty.body).toBe("\r\n");
  });

  it("writes recipients, reply-to, threading and custom headers", () => {
    const mime = buildMimeMessage(
      {
        ...base,
        cc: ["cc@example.org"],
        bcc: ["hidden@example.org"],
        replyTo: "replies@example.com",
        headers: {
          "List-Unsubscribe": "<https://example.com/u/abc>",
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          "X-Campaign": "autumn",
          Subject: "ignored",
          "message-id": "<ignored@example.com>",
          Bcc: "ignored@example.com",
        },
        messageId: "<step-2@example.com>",
        thread: {
          inReplyTo: "step-1@example.com",
          references: ["<step-0@example.com>", "<step-1@example.com>"],
        },
      },
      options,
    );
    const { headers, head } = parse(mime);
    expect(headers.get("cc")).toBe("cc@example.org");
    expect(headers.get("bcc")).toBe("hidden@example.org");
    expect(headers.get("reply-to")).toBe("replies@example.com");
    expect(headers.get("message-id")).toBe("<step-2@example.com>");
    expect(headers.get("in-reply-to")).toBe("<step-1@example.com>");
    expect(headers.get("references")).toBe(
      "<step-0@example.com> <step-1@example.com>",
    );
    expect(headers.get("list-unsubscribe")).toBe("<https://example.com/u/abc>");
    expect(headers.get("list-unsubscribe-post")).toBe(
      "List-Unsubscribe=One-Click",
    );
    expect(headers.get("x-campaign")).toBe("autumn");
    expect(headers.get("subject")).toBe("Quarterly update");
    expect(head.match(/^message-id:/gim)).toHaveLength(1);
    expect(head.match(/^bcc:/gim)).toHaveLength(1);
    expect(head).not.toContain("ignored");
    expectWellFormed(mime);
  });

  it("encodes a non-ASCII subject and sender name as UTF-8 encoded words", () => {
    const subject =
      "Zażółć gęślą jaźń: 日本語のテキスト, это длинная тема письма";
    const name = "Zoë Åström 山田";
    const mime = buildMimeMessage(
      { ...base, from: { email: "zoe@example.com", name }, subject },
      options,
    );
    expectWellFormed(mime, 76);
    const subjectHeader = mime.match(/^Subject: [\s\S]*?\r\n(?! )/m)?.[0] ?? "";
    expect(subjectHeader.split("\r\n").length).toBeGreaterThan(2);
    expect(decodeWords(subjectHeader.trimEnd())).toBe(`Subject: ${subject}`);
    for (const word of subjectHeader.match(/=\?UTF-8\?B\?[^?]+\?=/g) ?? []) {
      expect(word.length).toBeLessThanOrEqual(75);
      const decoded = Buffer.from(word.slice(10, -2), "base64");
      expect(
        Buffer.from(decoded.toString("utf8"), "utf8").equals(decoded),
      ).toBe(true);
    }
    const fromHeader = mime.match(/^From: .*\r\n/m)?.[0].trimEnd() ?? "";
    expect(decodeWords(fromHeader)).toBe(`From: ${name} <zoe@example.com>`);
  });

  it("folds a long ASCII subject without changing it", () => {
    const subject = Array.from(
      { length: 40 },
      (_, index) => `word${index}`,
    ).join(" ");
    const mime = buildMimeMessage({ ...base, subject }, options);
    expectWellFormed(mime);
    expect(parse(mime).headers.get("subject")).toBe(subject);
    expect(mime.match(/^Subject: [\s\S]*?\r\n(?! )/m)?.[0]).toContain("\r\n ");
  });

  it("drops line breaks and control characters from the subject", () => {
    const mime = buildMimeMessage(
      { ...base, subject: "Hello\r\nBcc: evil@example.com\u0007" },
      options,
    );
    expect(parse(mime).headers.get("subject")).toBe(
      "Hello Bcc: evil@example.com",
    );
    expect(mime.match(/^bcc:/gim)).toBeNull();
  });

  it("folds long recipient lists between addresses", () => {
    const to = Array.from(
      { length: 12 },
      (_, index) => `recipient-number-${index}@example.org`,
    );
    const mime = buildMimeMessage({ ...base, to }, options);
    expectWellFormed(mime);
    expect(parse(mime).headers.get("to")).toBe(to.join(", "));
  });

  it("folds a long References header between identifiers", () => {
    const references = Array.from(
      { length: 8 },
      (_, index) => `<message-number-${index}@mail.example.com>`,
    );
    const mime = buildMimeMessage({ ...base, thread: { references } }, options);
    expectWellFormed(mime);
    expect(parse(mime).headers.get("references")).toBe(references.join(" "));
  });

  it("encodes a non-ASCII custom header value", () => {
    const mime = buildMimeMessage(
      { ...base, headers: { "X-Topic": "Café élan" } },
      options,
    );
    expectWellFormed(mime);
    expect(decodeWords(parse(mime).headers.get("x-topic") ?? "")).toBe(
      "Café élan",
    );
  });

  it("rejects header injection and invalid values", async () => {
    const bad: Partial<OutboundMessage>[] = [
      { headers: { "X-Test": "one\r\nBcc: evil@example.com" } },
      { headers: { "X Bad:Name": "value" } },
      { headers: { "X-Long": "a".repeat(1200) } },
      { to: ["not-an-address"] },
      { to: ["a@example.org\r\nBcc: evil@example.com"] },
      { to: ["Grace <grace@example.org>"] },
      { from: { email: "josé@example.com" } },
      { replyTo: "two@@example.com" },
      { thread: { inReplyTo: "<has space@example.com>" } },
      { thread: { references: ["<ok@example.com>", "<bad\r\n@example.com>"] } },
    ];
    for (const patch of bad) {
      const error = await captureError(async () =>
        buildMimeMessage({ ...base, ...patch }, options),
      );
      expect(error.code).toBe("validation");
    }
    const error = await captureError(async () =>
      buildMimeMessage(base, { ...options, messageId: "<a b@example.com>" }),
    );
    expect(error.code).toBe("validation");
  });

  it("keeps long bodies within the line limit and round-trips them", () => {
    const text = [
      `A very long line: ${"lorem ipsum dolor sit amet ".repeat(20)}`,
      "Trailing space ",
      "Equals = sign and a tab\there",
      "Żółw, naïve café",
      "",
      "Last line",
    ].join("\n");
    const html = `<p style="color: #333">${"déjà vu ".repeat(40)}</p>\r\n<a href="https://example.com/?a=1&b=2">link</a>`;
    const mime = buildMimeMessage({ ...base, text, html }, options);
    expectWellFormed(mime);
    const parts = mime.split("--=_boundary");
    const body = (part: string | undefined) =>
      (part ?? "")
        .slice((part ?? "").indexOf("\r\n\r\n") + 4)
        .replace(/\r\n$/, "");
    expect(parts[1]).toContain("Content-Transfer-Encoding: quoted-printable");
    expect(decodeQuotedPrintable(body(parts[1]))).toBe(
      text.replaceAll("\n", "\r\n"),
    );
    expect(decodeQuotedPrintable(body(parts[2]))).toBe(html);
    expect(parts[3]).toBe("--\r\n");
  });

  it("uses base64 for bodies that are mostly non-ASCII", () => {
    const text = "これは日本語の本文です。".repeat(30);
    const mime = buildMimeMessage({ ...base, text }, options);
    expectWellFormed(mime, 76);
    const { headers, body } = parse(mime);
    expect(headers.get("content-transfer-encoding")).toBe("base64");
    expect(
      Buffer.from(body.replaceAll("\r\n", ""), "base64").toString("utf8"),
    ).toBe(text);
  });
});

describe("encodeWords", () => {
  it("never splits a multi-byte character and respects the first line room", () => {
    const text = "😀".repeat(40);
    const encoded = encodeWords(text, 9);
    const lines = encoded.split("\r\n");
    expect(9 + (lines[0]?.length ?? 0)).toBeLessThanOrEqual(76);
    for (const line of lines.slice(1)) {
      expect(line.length).toBeLessThanOrEqual(76);
      expect(line.startsWith(" =?UTF-8?B?")).toBe(true);
    }
    expect(decodeWords(encoded)).toBe(text);
  });
});

describe("textHeader", () => {
  it("starts encoded words on a new line after a long header name", () => {
    const name = `X-${"N".repeat(50)}`;
    const header = textHeader(name, "naïve");
    expect(header.startsWith(`${name}:\r\n =?UTF-8?B?`)).toBe(true);
  });
});

describe("addressHeader", () => {
  it("quotes display names with special characters", () => {
    expect(
      addressHeader("From", [
        { email: "sales@example.com", name: 'Acme, Inc. "Sales" \\ Team' },
      ]),
    ).toBe('From: "Acme, Inc. \\"Sales\\" \\\\ Team" <sales@example.com>');
  });

  it("moves the address to its own line after a long encoded name", () => {
    const name = "Ångström Vertriebsgesellschaft für Bürobedarf und Zubehör";
    const header = addressHeader("From", [
      { email: "kontakt@example.com", name },
    ]);
    for (const line of header.split("\r\n")) {
      expect(line.length).toBeLessThanOrEqual(78);
    }
    expect(decodeWords(header).replace(/\r\n /g, " ")).toBe(
      `From: ${name} <kontakt@example.com>`,
    );
  });
});

describe("body encoders", () => {
  it("escapes what quoted-printable requires", () => {
    expect(encodeQuotedPrintable("a=b")).toBe("a=3Db");
    expect(encodeQuotedPrintable("end \r\ntab\t")).toBe("end=20\r\ntab=09");
    expect(encodeQuotedPrintable("é")).toBe("=C3=A9");
    const long = encodeQuotedPrintable("x".repeat(200));
    expect(long.split("\r\n").map((line) => line.length)).toEqual([76, 76, 50]);
    expect(long.split("\r\n")[0]?.endsWith("=")).toBe(true);
  });

  it("wraps base64 at 76 characters", () => {
    const lines = encodeBase64Lines(new Uint8Array(120)).split("\r\n");
    expect(lines.map((line) => line.length)).toEqual([76, 76, 8]);
  });
});
