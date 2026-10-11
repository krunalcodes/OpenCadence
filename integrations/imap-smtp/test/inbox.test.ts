import type { InboxAction } from "@workspace/integration-core";
import { describe, expect, it } from "vitest";
import {
  captureError,
  createAdapter,
  credentials,
  type FakeMailbox,
  type FakeMessage,
  imapError,
} from "./helpers";

const received = new Date("2026-10-10T08:30:00.000Z");

const since = new Date("2026-10-09T12:00:00.000Z");

function warmupMessage(overrides: Partial<FakeMessage> = {}): FakeMessage {
  return {
    uid: 7,
    messageId: "<warm-1@sender.example>",
    subject: "Lunch on Friday?",
    inReplyTo: "<warm-0@sender.example>",
    references: "<root@sender.example>\r\n <warm-0@sender.example>",
    internalDate: received,
    from: [{ name: "Grace Hopper", address: "grace@sender.example" }],
    to: [{ address: "ada@example.com" }, { name: "Nobody" }],
    ...overrides,
  };
}

function mailboxes(
  inbox: FakeMessage[],
  junk: FakeMessage[] = [],
  extra: FakeMailbox[] = [],
): FakeMailbox[] {
  return [
    { path: "INBOX", messages: inbox },
    { path: "Junk Folder", specialUse: "\\Junk", messages: junk },
    ...extra,
  ];
}

const query = {
  messageId: "<warm-1@sender.example>",
  since,
  includeSpam: true,
};

describe("inbox.search", () => {
  it("finds the message in INBOX without reading the body", async () => {
    const { inbox, imap } = createAdapter({
      imap: { mailboxes: mailboxes([warmupMessage({ flags: ["\\Flagged"] })]) },
    });
    const found = await inbox.search(credentials, query);

    expect(found).toEqual({
      providerMessageId: "7",
      folder: "INBOX",
      messageId: "<warm-1@sender.example>",
      inReplyTo: "<warm-0@sender.example>",
      references: ["<root@sender.example>", "<warm-0@sender.example>"],
      from: { email: "grace@sender.example", name: "Grace Hopper" },
      to: [{ email: "ada@example.com" }],
      subject: "Lunch on Friday?",
      receivedAt: received,
      flags: {
        isSpam: false,
        isUnread: true,
        isInInbox: true,
        isStarred: true,
      },
    });
    expect(imap.calls).toEqual([
      ["on", "error"],
      ["connect"],
      ["list"],
      ["mailboxOpen", "INBOX", { readOnly: true }],
      [
        "search",
        "INBOX",
        {
          header: { "Message-ID": "<warm-1@sender.example>" },
          since: new Date("2026-10-08T12:00:00.000Z"),
        },
        { uid: true },
      ],
      [
        "fetchOne",
        "INBOX",
        "7",
        {
          uid: true,
          flags: true,
          envelope: true,
          internalDate: true,
          headers: ["references"],
        },
        { uid: true },
      ],
      ["logout"],
    ]);
  });

  it("accepts a Message-ID without angle brackets", async () => {
    const { inbox } = createAdapter({
      imap: { mailboxes: mailboxes([warmupMessage({ flags: ["\\Seen"] })]) },
    });
    const found = await inbox.search(credentials, {
      ...query,
      messageId: "warm-1@sender.example",
    });
    expect(found?.providerMessageId).toBe("7");
    expect(found?.flags.isUnread).toBe(false);
  });

  it("falls back to the special-use Junk mailbox when includeSpam is set", async () => {
    const { inbox, imap } = createAdapter({
      imap: {
        mailboxes: mailboxes(
          [],
          [warmupMessage({ uid: 31 })],
          [{ path: "Spam", messages: [warmupMessage({ uid: 99 })] }],
        ),
      },
    });
    const found = await inbox.search(credentials, query);

    expect(found).toMatchObject({
      providerMessageId: "31",
      folder: "Junk Folder",
      flags: { isSpam: true, isInInbox: false, isUnread: true },
    });
    expect(found?.flags).not.toHaveProperty("isImportant");
    expect(
      imap.calls.filter((call) => call[0] === "mailboxOpen").map((c) => c[1]),
    ).toEqual(["INBOX", "Junk Folder"]);
  });

  it("does not look in Junk unless includeSpam is set", async () => {
    const { inbox, imap } = createAdapter({
      imap: { mailboxes: mailboxes([], [warmupMessage({ uid: 31 })]) },
    });
    const found = await inbox.search(credentials, {
      ...query,
      includeSpam: false,
    });

    expect(found).toBeNull();
    expect(
      imap.calls.filter((call) => call[0] === "mailboxOpen").map((c) => c[1]),
    ).toEqual(["INBOX"]);
    expect(imap.allClosed()).toBe(true);
  });

  it("uses a common folder name when no mailbox is flagged as Junk", async () => {
    const { inbox } = createAdapter({
      imap: {
        mailboxes: [
          { path: "INBOX" },
          { path: "Archive" },
          { path: "Bulk Mail", messages: [warmupMessage({ uid: 4 })] },
        ],
      },
    });
    const found = await inbox.search(credentials, query);
    expect(found).toMatchObject({
      providerMessageId: "4",
      folder: "Bulk Mail",
      flags: { isSpam: true },
    });
  });

  it("returns null when the message is nowhere", async () => {
    const { inbox, imap } = createAdapter({
      imap: { mailboxes: mailboxes([warmupMessage({ messageId: "<x@y>" })]) },
    });
    expect(await inbox.search(credentials, query)).toBeNull();
    expect(imap.names().filter((name) => name === "fetchOne")).toEqual([]);
    expect(imap.allClosed()).toBe(true);
  });

  it("ignores messages received before the since date", async () => {
    const { inbox } = createAdapter({
      imap: {
        mailboxes: mailboxes([
          warmupMessage({ internalDate: new Date("2026-09-01T00:00:00Z") }),
        ]),
      },
    });
    expect(await inbox.search(credentials, query)).toBeNull();
  });

  it("skips a partial Message-ID match", async () => {
    const { inbox } = createAdapter({
      imap: {
        mailboxes: mailboxes([
          warmupMessage({ uid: 8, messageId: "<x<warm-1@sender.example>y>" }),
        ]),
      },
    });
    expect(await inbox.search(credentials, query)).toBeNull();
  });

  it("searches All Mail last on Gmail and reads the labels", async () => {
    const { inbox, imap } = createAdapter({
      imap: {
        gmail: true,
        mailboxes: [
          { path: "INBOX" },
          { path: "[Gmail]/Spam", specialUse: "\\Junk" },
          {
            path: "[Gmail]/All Mail",
            specialUse: "\\All",
            messages: [
              warmupMessage({ uid: 12, labels: ["\\Important", "Clients"] }),
            ],
          },
        ],
      },
    });
    const found = await inbox.search(credentials, query);

    expect(found).toMatchObject({
      providerMessageId: "12",
      folder: "[Gmail]/All Mail",
      flags: {
        isSpam: false,
        isInInbox: false,
        isImportant: true,
        isStarred: false,
      },
    });
    expect(
      imap.calls.filter((call) => call[0] === "mailboxOpen").map((c) => c[1]),
    ).toEqual(["INBOX", "[Gmail]/Spam", "[Gmail]/All Mail"]);
    const fetch = imap.calls.find((call) => call[0] === "fetchOne");
    expect(fetch?.[3]).toMatchObject({ labels: true });
    expect(fetch?.[3]).not.toHaveProperty("source");
    expect(fetch?.[3]).not.toHaveProperty("bodyParts");
  });

  it("reports isImportant false on Gmail when the label is missing", async () => {
    const { inbox } = createAdapter({
      imap: {
        gmail: true,
        mailboxes: [{ path: "INBOX", messages: [warmupMessage()] }],
      },
    });
    const found = await inbox.search(credentials, query);
    expect(found?.flags).toMatchObject({ isImportant: false, isInInbox: true });
  });

  it("does not search All Mail on other servers", async () => {
    const { inbox, imap } = createAdapter({
      imap: {
        mailboxes: [
          { path: "INBOX" },
          {
            path: "Archive",
            specialUse: "\\All",
            messages: [warmupMessage()],
          },
        ],
      },
    });
    expect(await inbox.search(credentials, query)).toBeNull();
    expect(imap.names().filter((name) => name === "mailboxOpen")).toHaveLength(
      1,
    );
  });

  it("raises the server's reason when the search command fails", async () => {
    const { inbox, imap } = createAdapter({
      imap: {
        mailboxes: mailboxes([warmupMessage()]),
        reports: {
          search: imapError("Command failed", {
            responseStatus: "NO",
            serverResponseCode: "THROTTLED",
            responseText: "Slow down",
          }),
        },
      },
    });
    const error = await captureError(() => inbox.search(credentials, query));
    expect(error).toMatchObject({
      code: "rate_limited",
      providerCode: "THROTTLED",
      providerMessage: "Slow down",
    });
    expect(imap.allClosed()).toBe(true);
  });

  it("reports an unknown failure when the server gives no reason", async () => {
    const { inbox } = createAdapter({
      imap: {
        mailboxes: mailboxes([warmupMessage()]),
        reports: { search: null },
      },
    });
    const error = await captureError(() => inbox.search(credentials, query));
    expect(error).toMatchObject({
      code: "unknown",
      message: "The IMAP server did not complete the request.",
    });
  });
});

const allActions: InboxAction[] = [
  {
    type: "fileUnder",
    folder: { providerFolderId: "Warm-up", name: "Warm-up" },
  },
  { type: "markImportant" },
  { type: "star" },
  { type: "markRead" },
  { type: "notSpam" },
];

function steps(calls: unknown[][]) {
  return calls
    .filter(
      (call) => call[0] === "messageMove" || call[0] === "messageFlagsAdd",
    )
    .map((call) => call.slice(0, 5));
}

describe("inbox.applyActions", () => {
  it("applies the actions in a fixed order whatever order they arrive in", async () => {
    const { inbox, imap } = createAdapter({
      imap: {
        gmail: true,
        mailboxes: mailboxes(
          [],
          [warmupMessage({ uid: 31 })],
          [{ path: "Warm-up", nextUid: 3 }],
        ),
      },
    });
    const result = await inbox.applyActions(
      credentials,
      { providerMessageId: "31", folder: "Junk Folder" },
      allActions,
    );

    expect(steps(imap.calls)).toEqual([
      ["messageMove", "Junk Folder", "31", "INBOX", { uid: true }],
      ["messageFlagsAdd", "INBOX", "500", ["\\Seen"], { uid: true }],
      ["messageFlagsAdd", "INBOX", "500", ["\\Flagged"], { uid: true }],
      [
        "messageFlagsAdd",
        "INBOX",
        "500",
        ["\\Important"],
        { uid: true, useLabels: true },
      ],
      ["messageMove", "INBOX", "500", "Warm-up", { uid: true }],
    ]);
    expect(result).toEqual({
      ref: { providerMessageId: "3", folder: "Warm-up" },
      unsupported: [],
    });
    expect(imap.mailbox("Warm-up")?.messages[0]).toMatchObject({
      uid: 3,
      flags: ["\\Seen", "\\Flagged"],
      labels: ["\\Important"],
    });
    expect(imap.names().at(-1)).toBe("logout");
  });

  it("tracks the new UID from COPYUID after the notSpam move", async () => {
    const { inbox, imap } = createAdapter({
      imap: { mailboxes: mailboxes([], [warmupMessage({ uid: 31 })]) },
    });
    const result = await inbox.applyActions(
      credentials,
      {
        providerMessageId: "31",
        folder: "Junk Folder",
        providerThreadId: "t-1",
      },
      [{ type: "markRead" }, { type: "notSpam" }],
    );

    expect(result).toEqual({
      ref: {
        providerMessageId: "500",
        providerThreadId: "t-1",
        folder: "INBOX",
      },
      unsupported: [],
    });
    expect(imap.mailbox("INBOX")?.messages[0]).toMatchObject({
      uid: 500,
      flags: ["\\Seen"],
    });
    expect(imap.mailbox("Junk Folder")?.messages).toEqual([]);
    expect(imap.names().filter((name) => name === "search")).toEqual([]);
  });

  it("finds the moved message by Message-ID when the server has no UIDPLUS", async () => {
    const { inbox, imap } = createAdapter({
      imap: {
        uidPlus: false,
        mailboxes: mailboxes(
          [warmupMessage({ uid: 2, messageId: "<other@sender.example>" })],
          [warmupMessage({ uid: 31 })],
        ),
      },
    });
    const result = await inbox.applyActions(
      credentials,
      { providerMessageId: "31", folder: "Junk Folder" },
      [{ type: "notSpam" }, { type: "star" }],
    );

    expect(result.ref).toEqual({ providerMessageId: "500", folder: "INBOX" });
    expect(imap.calls.filter((call) => call[0] === "search")).toEqual([
      [
        "search",
        "INBOX",
        { header: { "Message-ID": "<warm-1@sender.example>" } },
        { uid: true },
      ],
    ]);
    expect(steps(imap.calls).at(-1)).toEqual([
      "messageFlagsAdd",
      "INBOX",
      "500",
      ["\\Flagged"],
      { uid: true },
    ]);
  });

  it("treats notSpam as a no-op when the message is not in Junk", async () => {
    const { inbox, imap } = createAdapter({
      imap: { mailboxes: mailboxes([warmupMessage()]) },
    });
    const result = await inbox.applyActions(
      credentials,
      { providerMessageId: "7" },
      [{ type: "notSpam" }],
    );

    expect(result).toEqual({
      ref: { providerMessageId: "7", folder: "INBOX" },
      unsupported: [],
    });
    expect(steps(imap.calls)).toEqual([]);
  });

  it("reports markImportant as unsupported on servers without Gmail labels", async () => {
    const { inbox, imap } = createAdapter({
      imap: { mailboxes: mailboxes([warmupMessage()]) },
    });
    const result = await inbox.applyActions(
      credentials,
      { providerMessageId: "7", folder: "INBOX" },
      [{ type: "markImportant" }, { type: "star" }],
    );

    expect(result).toEqual({
      ref: { providerMessageId: "7", folder: "INBOX" },
      unsupported: ["markImportant"],
    });
    expect(steps(imap.calls)).toEqual([
      ["messageFlagsAdd", "INBOX", "7", ["\\Flagged"], { uid: true }],
    ]);
  });

  it("files the message under a folder and returns the new ref", async () => {
    const { inbox, imap } = createAdapter({
      imap: {
        mailboxes: mailboxes(
          [warmupMessage()],
          [],
          [{ path: "Warm-up", nextUid: 41 }],
        ),
      },
    });
    const result = await inbox.applyActions(
      credentials,
      { providerMessageId: "7", folder: "INBOX" },
      [
        {
          type: "fileUnder",
          folder: { providerFolderId: "Warm-up", name: "Warm-up" },
        },
      ],
    );

    expect(result.ref).toEqual({ providerMessageId: "41", folder: "Warm-up" });
    expect(imap.mailbox("INBOX")?.messages).toEqual([]);
  });

  it("does not move a message that is already in the target folder", async () => {
    const { inbox, imap } = createAdapter({
      imap: {
        mailboxes: mailboxes(
          [],
          [],
          [{ path: "Warm-up", messages: [warmupMessage()] }],
        ),
      },
    });
    const result = await inbox.applyActions(
      credentials,
      { providerMessageId: "7", folder: "Warm-up" },
      [
        {
          type: "fileUnder",
          folder: { providerFolderId: "Warm-up", name: "Warm-up" },
        },
      ],
    );
    expect(result.ref).toEqual({ providerMessageId: "7", folder: "Warm-up" });
    expect(steps(imap.calls)).toEqual([]);
  });

  it("fails clearly when the message is gone", async () => {
    const { inbox, imap } = createAdapter({
      imap: { mailboxes: mailboxes([]) },
    });
    const error = await captureError(() =>
      inbox.applyActions(credentials, { providerMessageId: "7" }, [
        { type: "markRead" },
      ]),
    );
    expect(error).toMatchObject({
      code: "validation",
      message: "The message is no longer in the mailbox.",
    });
    expect(steps(imap.calls)).toEqual([]);
    expect(imap.allClosed()).toBe(true);
  });

  it("fails the same way when the folder is gone or the ref is not a UID", async () => {
    const { inbox, imap } = createAdapter({
      imap: { mailboxes: mailboxes([]) },
    });
    const missingFolder = await captureError(() =>
      inbox.applyActions(
        credentials,
        { providerMessageId: "7", folder: "Removed" },
        [{ type: "star" }],
      ),
    );
    expect(missingFolder).toMatchObject({
      code: "validation",
      message: "The message is no longer in the mailbox.",
    });
    expect(imap.allClosed()).toBe(true);

    const badRef = await captureError(() =>
      inbox.applyActions(credentials, { providerMessageId: "abc" }, []),
    );
    expect(badRef).toMatchObject({
      message: "The message is no longer in the mailbox.",
    });
  });

  it("reports a missing target folder and closes the connection", async () => {
    const { inbox, imap } = createAdapter({
      imap: {
        mailboxes: mailboxes([warmupMessage()]),
        reports: {
          messageMove: imapError("Command failed", {
            responseStatus: "NO",
            serverResponseCode: "TRYCREATE",
            responseText: "Mailbox doesn't exist: Warm-up",
          }),
        },
      },
    });
    const error = await captureError(() =>
      inbox.applyActions(credentials, { providerMessageId: "7" }, [
        {
          type: "fileUnder",
          folder: { providerFolderId: "Warm-up", name: "Warm-up" },
        },
      ]),
    );
    expect(error).toMatchObject({
      code: "validation",
      message: "The folder does not exist in the mailbox.",
      providerCode: "TRYCREATE",
    });
    expect(imap.names().at(-1)).toBe("logout");
  });

  it("fails when the server does not apply a flag", async () => {
    const { inbox, imap } = createAdapter({
      imap: {
        mailboxes: mailboxes([warmupMessage()]),
        reports: { messageFlagsAdd: null },
      },
    });
    const error = await captureError(() =>
      inbox.applyActions(credentials, { providerMessageId: "7" }, [
        { type: "markRead" },
      ]),
    );
    expect(error).toMatchObject({ code: "unknown" });
    expect(imap.allClosed()).toBe(true);
  });
});

describe("inbox.ensureFolder", () => {
  it("creates the folder and returns its path", async () => {
    const { inbox, imap } = createAdapter();
    const folder = await inbox.ensureFolder(credentials, " Warm-up ");

    expect(folder).toEqual({ providerFolderId: "Warm-up", name: "Warm-up" });
    expect(imap.names()).toEqual(["on", "connect", "mailboxCreate", "logout"]);
    expect(imap.mailbox("Warm-up")).toBeDefined();
  });

  it("treats an already exists response as success", async () => {
    const { inbox, imap } = createAdapter({
      imap: {
        mailboxes: [{ path: "INBOX" }, { path: "INBOX/Warm-up" }],
        throws: {
          mailboxCreate: imapError("Command failed", {
            responseStatus: "NO",
            responseText: "Mailbox already exists",
            response: "A5 NO Mailbox already exists",
          }),
        },
      },
    });
    const folder = await inbox.ensureFolder(credentials, "Warm-up");

    expect(folder).toEqual({
      providerFolderId: "INBOX/Warm-up",
      name: "Warm-up",
    });
    expect(imap.names()).toEqual([
      "on",
      "connect",
      "mailboxCreate",
      "list",
      "logout",
    ]);
  });

  it("recognises the ALREADYEXISTS response code", async () => {
    const { inbox } = createAdapter({
      imap: {
        mailboxes: [{ path: "INBOX" }, { path: "Warm-up" }],
        throws: {
          mailboxCreate: imapError("Command failed", {
            responseStatus: "NO",
            serverResponseCode: "ALREADYEXISTS",
          }),
        },
      },
    });
    expect(await inbox.ensureFolder(credentials, "Warm-up")).toEqual({
      providerFolderId: "Warm-up",
      name: "Warm-up",
    });
  });

  it("maps other failures and still closes the connection", async () => {
    const { inbox, imap } = createAdapter({
      imap: {
        throws: {
          mailboxCreate: imapError("Command failed", {
            responseStatus: "NO",
            responseText: "Permission denied",
          }),
        },
      },
    });
    const error = await captureError(() =>
      inbox.ensureFolder(credentials, "Warm-up"),
    );
    expect(error).toMatchObject({
      code: "unknown",
      providerMessage: "Permission denied",
    });
    expect(imap.names().at(-1)).toBe("logout");
  });

  it("refuses an empty name before connecting", async () => {
    const { inbox, imap } = createAdapter();
    const error = await captureError(() =>
      inbox.ensureFolder(credentials, " "),
    );
    expect(error).toMatchObject({ code: "validation" });
    expect(imap.calls).toEqual([]);
  });
});
