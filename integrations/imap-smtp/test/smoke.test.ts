import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { afterEach, describe, expect, it } from "vitest";
import { createImapSmtpAdapter } from "../src/index";
import { captureError, exposed } from "./helpers";
import {
  createCertificate,
  type ImapScript,
  type ScriptedServer,
  type ScriptedSmtpServer,
  type Security,
  type SmtpScript,
  startImapServer,
  startSmtpServer,
} from "./servers";

const certificate = createCertificate();

const account = { username: "ada@example.com", password: "s3cret-Passw0rd!" };

const running: ScriptedServer[] = [];

afterEach(async () => {
  await Promise.all(running.splice(0).map((server) => server.close()));
});

async function start(
  options: {
    security?: Security;
    imap?: Partial<ImapScript>;
    smtp?: Partial<SmtpScript>;
  } = {},
) {
  if (!certificate) {
    throw new Error("No test certificate.");
  }
  const security = options.security ?? "tls";
  const imap = await startImapServer(certificate, security, {
    account,
    ...options.imap,
  });
  const smtp: ScriptedSmtpServer = await startSmtpServer(
    certificate,
    security,
    { account, ...options.smtp },
  );
  running.push(imap, smtp);
  const trusted = createImapSmtpAdapter({
    connect: (given) =>
      new ImapFlow({ ...given, tls: { ...given.tls, ca: certificate.cert } }),
    transport: (given) =>
      nodemailer.createTransport({
        ...given,
        tls: { ...given.tls, ca: certificate.cert },
      }),
    timeoutMs: 5_000,
  });
  const credentials = {
    kind: "password" as const,
    ...account,
    smtp: { host: "127.0.0.1", port: smtp.port, security },
    imap: { host: "127.0.0.1", port: imap.port, security },
  };
  if (!trusted.inbox) {
    throw new Error("The adapter has no inbox support.");
  }
  return { adapter: trusted, inbox: trusted.inbox, credentials, imap, smtp };
}

const query = {
  messageId: "<warm-1@sender.example>",
  since: new Date("2026-10-09T12:00:00.000Z"),
  includeSpam: true,
};

describe.skipIf(!certificate)("real protocol", () => {
  it("verifies against real IMAP and SMTP sessions over implicit TLS", async () => {
    const { adapter, credentials, imap, smtp } = await start();
    const result = await adapter.verify(credentials);

    expect(result).toEqual({
      account: { email: "ada@example.com" },
      settings: {
        smtpHost: "127.0.0.1",
        smtpPort: smtp.port,
        imapHost: "127.0.0.1",
        imapPort: imap.port,
        spamFolder: "Junk",
        supportsGmailLabels: false,
      },
    });
    expect(smtp.commands.at(-1)).toBe("QUIT");
    expect(smtp.commands).toContain("AUTH");
    expect(imap.commands).toContain("AUTHENTICATE PLAIN");
    expect(imap.commands.some((command) => command.startsWith("LIST"))).toBe(
      true,
    );
    expect(imap.commands.at(-1)).toBe("LOGOUT");
  });

  it("verifies over STARTTLS and never signs in before the upgrade", async () => {
    const { adapter, credentials, imap, smtp } = await start({
      security: "starttls",
      imap: { gmail: true },
    });
    const result = await adapter.verify(credentials);

    expect(result.settings).toMatchObject({
      spamFolder: "Junk",
      supportsGmailLabels: true,
    });
    expect(imap.commands.indexOf("STARTTLS")).toBeGreaterThanOrEqual(0);
    expect(imap.commands.indexOf("STARTTLS")).toBeLessThan(
      imap.commands.indexOf("AUTHENTICATE PLAIN"),
    );
    expect(smtp.commands.indexOf("STARTTLS")).toBeLessThan(
      smtp.commands.indexOf("AUTH"),
    );
  });

  it("refuses a certificate it cannot verify on either side", async () => {
    const { credentials, imap, smtp } = await start();
    const strict = createImapSmtpAdapter({ timeoutMs: 5_000 });

    const smtpFailure = await captureError(() => strict.verify(credentials));
    expect(smtpFailure).toMatchObject({
      code: "validation",
      message: "The SMTP server's certificate could not be verified.",
    });
    expect(smtp.commands).toEqual([]);

    const imapFailure = await captureError(() =>
      strict.inbox?.ensureFolder(credentials, "Warm-up"),
    );
    expect(imapFailure).toMatchObject({
      code: "validation",
      message: "The IMAP server's certificate could not be verified.",
    });
    expect(imap.commands).toEqual([]);
  });

  it("maps a rejected password on each side without leaking it", async () => {
    const { adapter, inbox, credentials } = await start();
    const wrong = { ...credentials, password: "wrong-Passw0rd-123" };

    const smtpFailure = await captureError(() => adapter.verify(wrong));
    expect(smtpFailure).toMatchObject({
      code: "invalid_credentials",
      providerStatus: 535,
      providerCode: "5.7.8",
    });
    expect((smtpFailure as Error).message).toContain(
      "The SMTP server rejected the sign-in.",
    );
    expect(exposed(smtpFailure)).not.toContain(wrong.password);

    const imapFailure = await captureError(() => inbox.search(wrong, query));
    expect(imapFailure).toMatchObject({
      code: "invalid_credentials",
      providerCode: "AUTHENTICATIONFAILED",
    });
    expect((imapFailure as Error).message).toContain(
      "The IMAP server rejected the sign-in.",
    );
    expect(exposed(imapFailure)).not.toContain(wrong.password);
  });

  it("reports a refused connection as temporary", async () => {
    const { adapter, credentials, smtp } = await start();
    await smtp.close();
    const error = await captureError(() => adapter.verify(credentials));
    expect(error).toMatchObject({ code: "temporary", retryable: true });
  });

  it("sends a message over SMTP with the threading headers", async () => {
    const { adapter, credentials, smtp } = await start();
    const result = await adapter.send(credentials, {
      from: { email: "ada@example.com", name: "Ada Lovelace" },
      to: ["grace@example.org"],
      bcc: ["hidden@example.org"],
      replyTo: "replies@example.com",
      subject: "Quarterly update",
      text: "Hello Grace",
      headers: { "List-Unsubscribe": "<https://example.com/u/abc>" },
      messageId: "<step-2@example.com>",
      thread: {
        inReplyTo: "<step-1@example.com>",
        references: ["<step-0@example.com>", "<step-1@example.com>"],
      },
    });

    expect(result).toEqual({
      providerMessageId: "<step-2@example.com>",
      messageId: "<step-2@example.com>",
    });
    expect(smtp.commands).toEqual(
      expect.arrayContaining([
        "MAIL FROM:<ada@example.com>",
        "RCPT TO:<grace@example.org>",
        "RCPT TO:<hidden@example.org>",
      ]),
    );
    const raw = smtp.messages[0] ?? "";
    expect(raw).toContain("From: Ada Lovelace <ada@example.com>");
    expect(raw).toContain("Message-ID: <step-2@example.com>");
    expect(raw).toContain("In-Reply-To: <step-1@example.com>");
    expect(raw).toContain(
      "References: <step-0@example.com> <step-1@example.com>",
    );
    expect(raw).toContain("Reply-To: replies@example.com");
    expect(raw).toContain("List-Unsubscribe: <https://example.com/u/abc>");
    expect(raw).not.toMatch(/^Bcc:/im);
    expect(raw).toContain("Hello Grace");
  });

  it("maps a recipient rejected by the SMTP server", async () => {
    const { adapter, credentials } = await start({
      smtp: { rejectRecipient: "nobody@example.org" },
    });
    const error = await captureError(() =>
      adapter.send(credentials, {
        from: { email: "ada@example.com" },
        to: ["nobody@example.org"],
        subject: "Hello",
        text: "Hello",
      }),
    );
    expect(error).toMatchObject({
      code: "validation",
      providerStatus: 550,
      providerCode: "5.1.1",
    });
  });

  it("finds a message in Junk by its Message-ID header", async () => {
    const { inbox, credentials, imap } = await start();
    const found = await inbox.search(credentials, query);

    expect(found).toEqual({
      providerMessageId: "31",
      folder: "Junk",
      messageId: "<warm-1@sender.example>",
      inReplyTo: "<warm-0@sender.example>",
      references: ["<root@sender.example>", "<warm-0@sender.example>"],
      from: { email: "grace@sender.example", name: "Grace Hopper" },
      to: [{ email: "ada@example.com" }],
      subject: "Lunch on Friday?",
      receivedAt: new Date("2026-10-10T08:30:00.000Z"),
      flags: {
        isSpam: true,
        isUnread: true,
        isInInbox: false,
        isStarred: false,
      },
    });
    const searches = imap.commands.filter((command) =>
      command.startsWith("UID SEARCH"),
    );
    expect(searches).toHaveLength(2);
    expect(searches[0]).toMatch(
      /HEADER "?MESSAGE-ID"? "?<warm-1@sender\.example>"?/i,
    );
    expect(searches[0]).toMatch(/SINCE "?0?8-Oct-2026"?/i);
    expect(imap.commands.filter((c) => c.startsWith("EXAMINE"))).toHaveLength(
      2,
    );
    const fetch = imap.commands.find((c) => c.startsWith("UID FETCH")) ?? "";
    expect(fetch).toMatch(/ENVELOPE/);
    expect(fetch).toMatch(/BODY\.PEEK\[HEADER\.FIELDS \(REFERENCES\)\]/i);
    expect(fetch).not.toMatch(/BODY\.PEEK\[\]|RFC822|BODY\[TEXT\]/i);
    expect(imap.commands.at(-1)).toBe("LOGOUT");
  });

  it("lists received mail over a read-only session without marking anything read", async () => {
    const root = "<0199a000-0000-7000-8000-000000000001@example.com>";
    const status =
      "Reporting-MTA: dns; mx.customer.example\r\n\r\nFinal-Recipient: rfc822; lead@customer.example\r\nAction: failed\r\nStatus: 5.1.1\r\n";
    const original = `From: ada@example.com\r\nMessage-ID: ${root}\r\nSubject: Hello\r\n\r\n`;
    const { inbox, credentials, imap } = await start({
      imap: {
        received: [
          {
            uid: 41,
            internalDate: "10-Oct-2026 08:30:00 +0000",
            envelope: `("Sat, 10 Oct 2026 08:30:00 +0000" "Re: Hello" (("Lead" NIL "lead" "customer.example")) NIL NIL ((NIL NIL "ada" "example.com")) NIL NIL "${root}" "<reply-41@customer.example>")`,
            headers: `References: ${root}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n`,
            bodyStructure:
              '("TEXT" "PLAIN" ("CHARSET" "utf-8") NIL NIL "7BIT" 12 1 NIL NIL NIL NIL)',
          },
          {
            uid: 42,
            internalDate: "10-Oct-2026 08:31:00 +0000",
            envelope:
              '("Sat, 10 Oct 2026 08:31:00 +0000" "Undelivered Mail Returned to Sender" ((NIL NIL "MAILER-DAEMON" "mx.customer.example")) NIL NIL ((NIL NIL "ada" "example.com")) NIL NIL NIL "<dsn-42@mx.customer.example>")',
            headers:
              'Content-Type: multipart/report; report-type=delivery-status;\r\n boundary="b1"\r\nAuto-Submitted: auto-replied\r\n\r\n',
            bodyStructure:
              '(("TEXT" "PLAIN" ("CHARSET" "us-ascii") NIL NIL "7BIT" 20 1 NIL NIL NIL NIL)("MESSAGE" "DELIVERY-STATUS" NIL NIL NIL "7BIT" 120 NIL NIL NIL NIL)("TEXT" "RFC822-HEADERS" ("CHARSET" "us-ascii") NIL NIL "7BIT" 90 3 NIL NIL NIL NIL) "REPORT" ("REPORT-TYPE" "delivery-status" "BOUNDARY" "b1") NIL NIL NIL)',
            parts: { "2": status, "3": original },
          },
        ],
      },
    });
    const since = new Date("2026-10-09T12:00:00.000Z");
    const first = await inbox.listReceived?.(credentials, {
      since,
      state: null,
      limit: 1,
    });

    expect(first).toEqual({
      messages: [
        {
          ref: "9:41",
          messageId: "<reply-41@customer.example>",
          inReplyTo: root,
          references: [root],
          from: { email: "lead@customer.example" },
          receivedAt: new Date("2026-10-10T08:30:00.000Z"),
          headers: { "content-type": "text/plain; charset=utf-8" },
        },
      ],
      state: { uidValidity: "9", lastUid: 41 },
      more: true,
    });

    const second = await inbox.listReceived?.(credentials, {
      since,
      state: first?.state ?? null,
      limit: 1,
    });
    expect(second).toEqual({
      messages: [
        {
          ref: "9:42",
          messageId: "<dsn-42@mx.customer.example>",
          references: [],
          from: { email: "MAILER-DAEMON@mx.customer.example" },
          receivedAt: new Date("2026-10-10T08:31:00.000Z"),
          headers: {
            "content-type":
              'multipart/report; report-type=delivery-status; boundary="b1"',
            "auto-submitted": "auto-replied",
          },
          deliveryStatus: {
            action: "failed",
            status: "5.1.1",
            originalMessageId: root,
            failedRecipient: "lead@customer.example",
          },
        },
      ],
      state: { uidValidity: "9", lastUid: 42 },
      more: false,
    });

    const third = await inbox.listReceived?.(credentials, {
      since,
      state: second?.state ?? null,
      limit: 1,
    });
    expect(third).toEqual({
      messages: [],
      state: { uidValidity: "9", lastUid: 42 },
      more: false,
    });

    const used = new Set(
      imap.commands.map((command) =>
        command.startsWith("UID ")
          ? command.split(" ").slice(0, 2).join(" ")
          : command.split(" ")[0],
      ),
    );
    for (const changing of [
      "SELECT",
      "UID STORE",
      "STORE",
      "UID MOVE",
      "UID COPY",
      "UID EXPUNGE",
      "EXPUNGE",
      "APPEND",
      "CREATE",
      "DELETE",
      "CLOSE",
    ]) {
      expect(used.has(changing)).toBe(false);
    }
    expect(
      imap.commands.filter((command) => command.startsWith("EXAMINE")),
    ).toEqual(["EXAMINE INBOX", "EXAMINE INBOX", "EXAMINE INBOX"]);
    const fetches = imap.commands.filter((command) =>
      command.startsWith("UID FETCH"),
    );
    expect(fetches).toHaveLength(3);
    expect(fetches[0]).toMatch(
      /BODY\.PEEK\[HEADER\.FIELDS \(references auto-submitted x-autoreply x-autorespond precedence x-failed-recipients content-type\)\]/i,
    );
    expect(fetches[2]).toMatch(/BODY\.PEEK\[2\]<0\.32768>/i);
    expect(fetches[2]).toMatch(/BODY\.PEEK\[3\]<0\.32768>/i);
    for (const fetch of fetches) {
      expect(fetch.replace(/BODY\.PEEK\[/gi, "")).not.toMatch(
        /BODY\[|RFC822(?!\.SIZE)|BINARY\[/i,
      );
    }
    expect(
      imap.commands.filter((command) => command.startsWith("UID SEARCH")),
    ).toEqual([
      expect.stringMatching(/^UID SEARCH SINCE "?0?8-Oct-2026"?$/i),
      "UID SEARCH UID 42:*",
      "UID SEARCH UID 43:*",
    ]);
    expect(imap.flagsOf("INBOX")).toEqual([[], []]);
  });

  it("fetches one reply's text over a read-only session with PEEK, a size cap and no attachment", async () => {
    const html = "<p>Thursday works. <b>See you then.</b></p>";
    const { inbox, credentials, imap } = await start({
      imap: {
        received: [
          {
            uid: 41,
            internalDate: "10-Oct-2026 08:30:00 +0000",
            envelope:
              '("Sat, 10 Oct 2026 08:29:00 +0000" "=?UTF-8?Q?Re:_Caf=C3=A9_on_Thursday=3F?=" (("Grace Hopper" NIL "grace" "customer.example")) NIL NIL ((NIL NIL "ada" "example.com")) NIL NIL "<root@example.com>" "<reply-41@customer.example>")',
            headers: "Content-Type: multipart/mixed\r\n\r\n",
            bodyStructure:
              '((("TEXT" "PLAIN" ("CHARSET" "iso-8859-1") NIL NIL "QUOTED-PRINTABLE" 40 1 NIL NIL NIL NIL)("TEXT" "HTML" ("CHARSET" "utf-8") NIL NIL "BASE64" 90 2 NIL NIL NIL NIL) "ALTERNATIVE" ("BOUNDARY" "b2") NIL NIL NIL)("APPLICATION" "PDF" ("NAME" "contract.pdf") NIL NIL "BASE64" 1200 NIL ("ATTACHMENT" ("FILENAME" "contract.pdf")) NIL NIL) "MIXED" ("BOUNDARY" "b1") NIL NIL NIL)',
            parts: {
              "1.1": "Thursday works at the caf=E9. See you =\r\nthen.",
              "1.2": Buffer.from(html).toString("base64"),
              "2": "JVBERi0xLjQK",
            },
          },
        ],
      },
    });

    const content = await inbox.fetchReceived?.(credentials, "9:41");
    expect(content).toEqual({
      subject: "Re: Caf\u00e9 on Thursday?",
      text: "Thursday works at the caf\u00e9. See you then.",
      html,
      from: { email: "grace@customer.example", name: "Grace Hopper" },
      to: ["ada@example.com"],
      date: new Date("2026-10-10T08:29:00.000Z"),
    });
    expect(await inbox.fetchReceived?.(credentials, "8:41")).toBeNull();
    expect(await inbox.fetchReceived?.(credentials, "9:77")).toBeNull();

    const used = new Set(
      imap.commands.map((command) =>
        command.startsWith("UID ")
          ? command.split(" ").slice(0, 2).join(" ")
          : command.split(" ")[0],
      ),
    );
    for (const changing of [
      "SELECT",
      "UID STORE",
      "STORE",
      "UID MOVE",
      "UID COPY",
      "UID EXPUNGE",
      "EXPUNGE",
      "APPEND",
      "CREATE",
      "DELETE",
      "CLOSE",
    ]) {
      expect(used.has(changing)).toBe(false);
    }
    expect(
      imap.commands.filter((command) => command.startsWith("EXAMINE")),
    ).toEqual(["EXAMINE INBOX", "EXAMINE INBOX", "EXAMINE INBOX"]);
    expect(
      imap.commands.filter((command) => command.startsWith("UID SEARCH")),
    ).toEqual([]);
    const fetches = imap.commands.filter((command) =>
      command.startsWith("UID FETCH"),
    );
    expect(fetches).toHaveLength(3);
    expect(fetches[0]).toMatch(/^UID FETCH 41 /);
    expect(fetches[0]).toMatch(/ENVELOPE/);
    expect(fetches[0]).toMatch(/BODYSTRUCTURE/);
    expect(fetches[0]).not.toMatch(/BODY\.PEEK\[|BODY\[/i);
    expect(fetches[1]).toMatch(/^UID FETCH 41 /);
    expect(fetches[1]).toMatch(/BODY\.PEEK\[1\.1\]<0\.262144>/i);
    expect(fetches[1]).toMatch(/BODY\.PEEK\[1\.2\]<0\.262144>/i);
    expect(fetches[2]).toMatch(/^UID FETCH 77 /);
    for (const fetch of fetches) {
      expect(fetch).not.toMatch(/\[2\]|\[\]|\[TEXT\]|\[1\]/i);
      expect(fetch.replace(/BODY\.PEEK\[/gi, "")).not.toMatch(
        /BODY\[|RFC822(?!\.SIZE)|BINARY\[/i,
      );
    }
    expect(imap.flagsOf("INBOX")).toEqual([[]]);
    expect(imap.commands.at(-1)).toBe("LOGOUT");
  });

  it("returns null when the search excludes spam", async () => {
    const { inbox, credentials } = await start();
    expect(
      await inbox.search(credentials, { ...query, includeSpam: false }),
    ).toBeNull();
  });

  it("moves a message out of Junk and applies flags with the new UID", async () => {
    const { inbox, credentials, imap } = await start({ imap: { gmail: true } });
    const result = await inbox.applyActions(
      credentials,
      { providerMessageId: "31", folder: "Junk" },
      [
        { type: "star" },
        { type: "markImportant" },
        { type: "markRead" },
        { type: "notSpam" },
      ],
    );

    expect(result).toEqual({
      ref: { providerMessageId: "500", folder: "INBOX" },
      unsupported: [],
    });
    const changes = imap.commands.filter(
      (command) =>
        command.startsWith("UID MOVE") || command.startsWith("UID STORE"),
    );
    expect(changes).toHaveLength(4);
    expect(changes[0]).toMatch(/^UID MOVE 31 "?INBOX"?$/);
    expect(changes[1]).toMatch(/^UID STORE 500 \+FLAGS(\.SILENT)? \(\\Seen\)$/);
    expect(changes[2]).toMatch(
      /^UID STORE 500 \+FLAGS(\.SILENT)? \(\\Flagged\)$/,
    );
    expect(changes[3]).toMatch(/^UID STORE 500 \+X-GM-LABELS \(\\Important\)$/);

    const after = await inbox.search(credentials, query);
    expect(after).toMatchObject({
      providerMessageId: "500",
      folder: "INBOX",
      flags: {
        isSpam: false,
        isUnread: false,
        isInInbox: true,
        isStarred: true,
        isImportant: true,
      },
    });
  });

  it("finds the moved message again when the server has no UIDPLUS", async () => {
    const { inbox, credentials } = await start({ imap: { uidPlus: false } });
    const result = await inbox.applyActions(
      credentials,
      { providerMessageId: "31", folder: "Junk" },
      [{ type: "notSpam" }, { type: "markImportant" }],
    );
    expect(result).toEqual({
      ref: { providerMessageId: "500", folder: "INBOX" },
      unsupported: ["markImportant"],
    });
  });

  it("reports a message that is gone and a missing target folder", async () => {
    const { inbox, credentials } = await start();
    const gone = await captureError(() =>
      inbox.applyActions(
        credentials,
        { providerMessageId: "77", folder: "Junk" },
        [{ type: "markRead" }],
      ),
    );
    expect(gone).toMatchObject({
      code: "validation",
      message: "The message is no longer in the mailbox.",
    });

    const missingSource = await captureError(() =>
      inbox.applyActions(
        credentials,
        { providerMessageId: "31", folder: "Nope" },
        [{ type: "markRead" }],
      ),
    );
    expect(missingSource).toMatchObject({
      message: "The message is no longer in the mailbox.",
    });

    const missingTarget = await captureError(() =>
      inbox.applyActions(
        credentials,
        { providerMessageId: "31", folder: "Junk" },
        [
          {
            type: "fileUnder",
            folder: { providerFolderId: "Nope", name: "Nope" },
          },
        ],
      ),
    );
    expect(missingTarget).toMatchObject({
      code: "validation",
      message: "The folder does not exist in the mailbox.",
      providerCode: "TRYCREATE",
    });
  });

  it("creates a folder, tolerates a second create and files a message under it", async () => {
    const { inbox, credentials, imap } = await start();
    const created = await inbox.ensureFolder(credentials, "Warm-up");
    const again = await inbox.ensureFolder(credentials, "Warm-up");

    expect(created).toEqual({ providerFolderId: "Warm-up", name: "Warm-up" });
    expect(again).toEqual(created);
    expect(
      imap.commands.filter((command) => command.startsWith("CREATE")),
    ).toHaveLength(2);

    const result = await inbox.applyActions(
      credentials,
      { providerMessageId: "31", folder: "Junk" },
      [{ type: "fileUnder", folder: created }],
    );
    expect(result.ref).toEqual({ providerMessageId: "1", folder: "Warm-up" });
  });
});
