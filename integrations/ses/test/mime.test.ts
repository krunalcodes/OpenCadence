import { IntegrationError } from "@workspace/integration-core";
import { describe, expect, it } from "vitest";
import {
  buildMime,
  encodeWords,
  foldHeader,
  formatAddress,
  formatDate,
  type MimeInput,
  quotedPrintable,
  unstructuredHeader,
} from "../src/mime";

const base: MimeInput = {
  from: { email: "ada@example.com", name: "Ada Lovelace" },
  to: ["grace@example.org"],
  subject: "Hello",
  text: "Plain body",
  date: new Date("2026-10-11T09:30:05.000Z"),
  boundary: "=_boundary",
};

function decodeWords(value: string) {
  return value
    .replace(/\r\n /g, " ")
    .replace(/\?= =\?UTF-8\?B\?/g, "?==?UTF-8?B?")
    .replace(/=\?UTF-8\?B\?([^?]*)\?=/g, (_, encoded: string) =>
      Buffer.from(encoded, "base64").toString("utf8"),
    );
}

function decodeQuotedPrintable(value: string) {
  const joined = value.replace(/=\r\n/g, "");
  const bytes: number[] = [];
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

function lines(mime: string) {
  return mime.split("\r\n");
}

describe("formatDate", () => {
  it("writes an RFC 5322 date in UTC", () => {
    expect(formatDate(new Date("2026-10-11T09:30:05.000Z"))).toBe(
      "Sun, 11 Oct 2026 09:30:05 +0000",
    );
  });
});

describe("formatAddress", () => {
  it("leaves a plain name bare and quotes a name with specials", () => {
    expect(formatAddress({ email: "ada@example.com", name: "Ada" })).toBe(
      "Ada <ada@example.com>",
    );
    expect(
      formatAddress({ email: "ada@example.com", name: 'Lovelace, "Ada"' }),
    ).toBe('"Lovelace, \\"Ada\\"" <ada@example.com>');
  });

  it("encodes a name outside ASCII as encoded words", () => {
    const formatted = formatAddress({
      email: "jose@example.com",
      name: "José Álvarez",
    });

    expect(formatted).toMatch(
      /^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?= <jose@example.com>$/,
    );
    expect(decodeWords(formatted)).toBe("José Álvarez <jose@example.com>");
  });

  it("removes line breaks from a name", () => {
    expect(
      formatAddress({ email: "ada@example.com", name: "Ada\r\nBcc: x@y.z" }),
    ).toBe('"Ada Bcc: x@y.z" <ada@example.com>');
  });

  it("converts an international domain to its ASCII form", () => {
    expect(formatAddress({ email: "ada@bücher.example" })).toBe(
      "ada@xn--bcher-kva.example",
    );
  });

  it.each([
    "no-at-sign",
    "josé@example.com",
    "a b@example.com",
    "@example.com",
  ])("rejects the address %s", (email) => {
    expect(() => formatAddress({ email })).toThrow(IntegrationError);
  });
});

describe("encodeWords", () => {
  it("keeps every encoded word within 75 characters and whole characters", () => {
    const value = "日本語のメール件名はとても長い".repeat(6);

    const words = encodeWords(value);

    expect(words.length).toBeGreaterThan(1);
    for (const word of words) {
      expect(word.length).toBeLessThanOrEqual(75);
      expect(word).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/);
    }
    expect(decodeWords(words.join(" "))).toBe(value);
  });

  it("does not split a surrogate pair", () => {
    const value = "😀".repeat(40);

    expect(decodeWords(encodeWords(value).join(" "))).toBe(value);
  });
});

describe("unstructuredHeader", () => {
  it("writes a short ASCII header on one line", () => {
    expect(unstructuredHeader("X-Campaign", "october")).toBe(
      "X-Campaign: october",
    );
  });

  it("folds a long ASCII header at spaces within 78 characters", () => {
    const value = Array.from({ length: 40 }, (_, index) => `word${index}`).join(
      " ",
    );

    const header = unstructuredHeader("X-Long", value);

    for (const line of lines(header)) {
      expect(line.length).toBeLessThanOrEqual(78);
    }
    expect(
      lines(header)
        .slice(1)
        .every((line) => line.startsWith(" ")),
    ).toBe(true);
    expect(header.replace(/\r\n/g, "")).toBe(`X-Long: ${value}`);
  });

  it("encodes a value outside ASCII and keeps lines within 76 characters", () => {
    const value = "Grüße aus Köln, hier ist die Übersicht für den Oktober 2026";

    const header = unstructuredHeader("Subject", value);

    for (const line of lines(header)) {
      expect(line.length).toBeLessThanOrEqual(76);
    }
    expect(header).toMatch(/^Subject: =\?UTF-8\?B\?/);
    expect(decodeWords(header)).toBe(`Subject: ${value}`);
  });

  it("starts the encoded words on a new line after a very long name", () => {
    const name = `X-${"N".repeat(70)}`;

    const header = unstructuredHeader(name, "é");

    expect(lines(header)).toEqual([`${name}:`, " =?UTF-8?B?w6k=?="]);
  });

  it("removes line breaks so a value cannot add a header", () => {
    expect(unstructuredHeader("X-Note", "one\r\nBcc: eve@example.com")).toBe(
      "X-Note: one Bcc: eve@example.com",
    );
  });

  it.each(["Bad Name", "Bad:Name", "Ünicode", ""])(
    "rejects the header name %j",
    (name) => {
      expect(() => unstructuredHeader(name, "value")).toThrow(IntegrationError);
    },
  );

  it("rejects a header that cannot be folded under 998 characters", () => {
    expect(() => unstructuredHeader("X-Url", "a".repeat(1200))).toThrow(
      IntegrationError,
    );
  });
});

describe("foldHeader", () => {
  it("keeps repeated spaces when unfolded", () => {
    const line = `X-Spaces: ${"alpha  beta ".repeat(12)}end`;

    expect(foldHeader(line).replace(/\r\n/g, "")).toBe(line);
  });
});

describe("quotedPrintable", () => {
  it("leaves printable ASCII untouched", () => {
    expect(quotedPrintable("Hello, world!")).toBe("Hello, world!");
  });

  it("encodes the equals sign and bytes outside ASCII in upper case hex", () => {
    expect(quotedPrintable("1+1=2 café")).toBe("1+1=3D2 caf=C3=A9");
  });

  it("uses CRLF for every kind of line ending", () => {
    expect(quotedPrintable("one\ntwo\r\nthree\rfour")).toBe(
      "one\r\ntwo\r\nthree\r\nfour",
    );
  });

  it("encodes trailing whitespace on a line", () => {
    expect(quotedPrintable("ends with space \nand tab\t")).toBe(
      "ends with space=20\r\nand tab=09",
    );
  });

  it("soft wraps long lines at 76 characters without splitting an escape", () => {
    const input = `${"x".repeat(74)}é${"y".repeat(100)} ${"ü".repeat(60)}`;

    const encoded = quotedPrintable(input);

    for (const line of lines(encoded)) {
      expect(line.length).toBeLessThanOrEqual(76);
      expect(line).not.toMatch(/=[0-9A-F]$/);
    }
    expect(decodeQuotedPrintable(encoded)).toBe(input);
  });
});

describe("buildMime", () => {
  it("builds a single text part", () => {
    expect(buildMime(base)).toBe(
      [
        "Date: Sun, 11 Oct 2026 09:30:05 +0000",
        "From: Ada Lovelace <ada@example.com>",
        "To: grace@example.org",
        "Subject: Hello",
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: quoted-printable",
        "",
        "Plain body",
        "",
      ].join("\r\n"),
    );
  });

  it("builds a single HTML part", () => {
    const mime = buildMime({ ...base, text: undefined, html: "<p>Hi</p>" });

    expect(mime).toContain("Content-Type: text/html; charset=UTF-8\r\n");
    expect(mime).not.toContain("multipart");
    expect(mime.endsWith("\r\n\r\n<p>Hi</p>\r\n")).toBe(true);
  });

  it("builds multipart/alternative with text before HTML", () => {
    const mime = buildMime({
      ...base,
      cc: ["cc@example.org"],
      replyTo: "replies@example.com",
      subject: "Résumé reçu",
      text: "Plain café",
      html: '<p class="a">Café</p>',
      messageId: "<0198c1f0-aaaa@example.com>",
      inReplyTo: "<parent@example.com>",
      references: ["<root@example.com>", "parent@example.com"],
      headers: [
        ["List-Unsubscribe", "<https://app.example.com/u/1>"],
        ["X-Note", "Grüße"],
      ],
    });

    expect(mime).toBe(
      [
        "Date: Sun, 11 Oct 2026 09:30:05 +0000",
        "From: Ada Lovelace <ada@example.com>",
        "To: grace@example.org",
        "Cc: cc@example.org",
        "Reply-To: replies@example.com",
        "Subject: =?UTF-8?B?UsOpc3Vtw6kgcmXDp3U=?=",
        "Message-ID: <0198c1f0-aaaa@example.com>",
        "In-Reply-To: <parent@example.com>",
        "References: <root@example.com> <parent@example.com>",
        "List-Unsubscribe: <https://app.example.com/u/1>",
        "X-Note: =?UTF-8?B?R3LDvMOfZQ==?=",
        "MIME-Version: 1.0",
        'Content-Type: multipart/alternative; boundary="=_boundary"',
        "",
        "--=_boundary",
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: quoted-printable",
        "",
        "Plain caf=C3=A9",
        "--=_boundary",
        "Content-Type: text/html; charset=UTF-8",
        "Content-Transfer-Encoding: quoted-printable",
        "",
        '<p class=3D"a">Caf=C3=A9</p>',
        "--=_boundary--",
        "",
      ].join("\r\n"),
    );
  });

  it("produces 7 bit ASCII, CRLF line endings and lines within 998 characters", () => {
    const mime = buildMime({
      ...base,
      from: { email: "ada@example.com", name: "Ада Лавлейс" },
      to: Array.from({ length: 30 }, (_, index) => `user${index}@example.org`),
      subject: "Тема письма с очень длинным заголовком ".repeat(5),
      text: `${"длинная строка ".repeat(200)}\nвторая`,
      html: `<p>${"é".repeat(2000)}</p>`,
      references: Array.from(
        { length: 40 },
        (_, index) => `<message-${index}@mail.example.com>`,
      ),
    });

    expect(/^[\r\n\x20-\x7e]*$/.test(mime)).toBe(true);
    expect(mime.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    for (const line of lines(mime)) {
      expect(line.length).toBeLessThanOrEqual(998);
    }
    const header = mime.slice(0, mime.indexOf("\r\n\r\n"));
    for (const line of lines(header)) {
      expect(line.length).toBeLessThanOrEqual(78);
    }
    expect(decodeWords(header)).toContain(
      "From: Ада Лавлейс <ada@example.com>",
    );
  });

  it("leaves Bcc out of the headers", () => {
    expect(buildMime(base)).not.toMatch(/^Bcc:/im);
  });

  it("rejects an email without a body", () => {
    expect(() => buildMime({ ...base, text: undefined })).toThrow(
      IntegrationError,
    );
  });
});
