import type { FetchLike } from "@workspace/integration-core";
import { describe, expect, it } from "vitest";
import { createGmailAdapter, gmailReadScope } from "../src/index";
import { clientConfig, credentials, sendScope } from "./helpers";

type Reply = { status?: number; body?: unknown };

type Call = { url: URL; method: string; body: unknown };

type Mailbox = {
  historyId: string;
  messages: Record<string, unknown>;
  history?: (url: URL) => Reply;
  list?: (url: URL) => Reply;
  get?: (id: string, url: URL) => Reply | undefined;
};

const base = "/gmail/v1/users/me";

const readCredentials = {
  ...credentials,
  scopes: ["openid", "email", sendScope, gmailReadScope],
};

function encode(text: string) {
  return Buffer.from(text, "utf8").toString("base64url");
}

function metadata(
  id: string,
  headers: Record<string, string>,
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    threadId: `thread-${id}`,
    labelIds: ["INBOX", "UNREAD"],
    historyId: "900",
    internalDate: String(Date.parse("2026-03-02T10:00:00Z")),
    payload: {
      headers: Object.entries(headers).map(([name, value]) => ({
        name,
        value,
      })),
    },
    ...extra,
  };
}

function setup(mailbox: Mailbox) {
  const calls: Call[] = [];
  const fetch: FetchLike = async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url, method: init?.method ?? "GET", body: init?.body });
    let reply: Reply | undefined;
    if (url.pathname === `${base}/profile`) {
      reply = { body: { historyId: mailbox.historyId } };
    } else if (url.pathname === `${base}/history`) {
      reply = mailbox.history?.(url);
    } else if (url.pathname === `${base}/messages`) {
      reply = mailbox.list?.(url);
    } else if (url.pathname.startsWith(`${base}/messages/`)) {
      const id = decodeURIComponent(url.pathname.split("/").pop() ?? "");
      reply =
        mailbox.get?.(id, url) ??
        (mailbox.messages[id]
          ? { body: mailbox.messages[id] }
          : { status: 404, body: { error: { code: 404 } } });
    }
    if (!reply) {
      throw new Error(`Unexpected request to ${url.pathname}`);
    }
    return new Response(JSON.stringify(reply.body ?? {}), {
      status: reply.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  };
  const adapter = createGmailAdapter({
    ...clientConfig,
    inboxAccess: true,
    fetch,
  });
  const inbox = adapter.inbox;
  if (!inbox?.listReceived || !inbox.fetchReceived) {
    throw new Error("The adapter has no inbox.");
  }
  return {
    adapter,
    calls,
    listReceived: inbox.listReceived,
    fetchReceived: inbox.fetchReceived,
    inbox,
  };
}

const since = new Date("2026-03-02T00:00:00Z");

const reply = metadata("m1", {
  "Message-ID": "<reply-1@customer.test>",
  "In-Reply-To": "<step-1@example.com>",
  References: "<step-0@example.com> <step-1@example.com>",
  From: '"Grace Hopper" <grace@customer.test>',
  "Auto-Submitted": "no",
  "Content-Type": 'text/plain; charset="UTF-8"',
});

describe("gmail inbox", () => {
  it("has no inbox and asks for no read scope unless inbox access is on", () => {
    const sendOnly = createGmailAdapter(clientConfig);
    expect(sendOnly.inbox).toBeUndefined();
    expect(sendOnly.capabilities).toEqual(["send"]);
    expect(sendOnly.oauth?.scopes).not.toContain(gmailReadScope);

    const withInbox = createGmailAdapter({
      ...clientConfig,
      inboxAccess: true,
    });
    expect(withInbox.capabilities).toEqual(["send", "replies"]);
    expect(withInbox.oauth?.scopes).toContain(gmailReadScope);
    const url = new URL(
      withInbox.oauth?.authorizationUrl({
        state: "state",
        redirectUri: "https://app.test/callback",
      }) ?? "",
    );
    expect(url.searchParams.get("scope")?.split(" ")).toContain(gmailReadScope);
    expect(url.searchParams.get("include_granted_scopes")).toBe("true");
  });

  it("lists with an after query on the first run and returns a history cursor", async () => {
    const { listReceived, calls } = setup({
      historyId: "1000",
      messages: {
        m1: reply,
        old: metadata(
          "old",
          { "Message-ID": "<old@customer.test>" },
          { internalDate: String(Date.parse("2026-03-01T12:00:00Z")) },
        ),
        sent: metadata(
          "sent",
          { "Message-ID": "<sent@example.com>" },
          { labelIds: ["SENT"] },
        ),
      },
      list: () => ({
        body: { messages: [{ id: "m1" }, { id: "old" }, { id: "sent" }] },
      }),
    });

    const page = await listReceived(readCredentials, {
      since,
      state: null,
      limit: 100,
    });

    expect(page.more).toBe(false);
    expect(page.state).toEqual({ historyId: "1000" });
    expect(page.messages).toEqual([
      {
        ref: "m1",
        messageId: "<reply-1@customer.test>",
        inReplyTo: "<step-1@example.com>",
        references: ["<step-0@example.com>", "<step-1@example.com>"],
        from: { email: "grace@customer.test" },
        receivedAt: new Date("2026-03-02T10:00:00Z"),
        headers: {
          "auto-submitted": "no",
          "content-type": 'text/plain; charset="UTF-8"',
        },
      },
    ]);

    const list = calls.find((call) => call.url.pathname === `${base}/messages`);
    expect(list?.url.searchParams.get("q")).toBe(
      `after:${Math.floor((since.getTime() - 86_400_000) / 1000)}`,
    );
    expect(list?.url.searchParams.get("labelIds")).toBe("INBOX");
    expect(list?.url.searchParams.get("maxResults")).toBe("50");
    const get = calls.find((call) => call.url.pathname.endsWith("/m1"));
    expect(get?.url.searchParams.get("format")).toBe("metadata");
    expect(get?.url.searchParams.getAll("metadataHeaders")).toEqual(
      expect.arrayContaining([
        "message-id",
        "in-reply-to",
        "references",
        "from",
        "auto-submitted",
        "x-failed-recipients",
        "content-type",
      ]),
    );
    expect(calls[0]?.url.pathname).toBe(`${base}/profile`);
  });

  it("pages the first run and keeps the history id taken before listing", async () => {
    const { listReceived, calls } = setup({
      historyId: "1000",
      messages: { m1: reply, m2: { ...reply, id: "m2" } },
      list: (url) =>
        url.searchParams.get("pageToken") === "next"
          ? { body: { messages: [{ id: "m2" }] } }
          : { body: { messages: [{ id: "m1" }], nextPageToken: "next" } },
    });

    const first = await listReceived(readCredentials, {
      since,
      state: null,
      limit: 1,
    });
    expect(first.more).toBe(true);
    expect(first.state).toMatchObject({
      nextHistoryId: "1000",
      pageToken: "next",
    });

    const second = await listReceived(readCredentials, {
      since: new Date("2026-03-02T09:00:00Z"),
      state: first.state,
      limit: 1,
    });
    expect(second.more).toBe(false);
    expect(second.state).toEqual({ historyId: "1000" });
    expect(second.messages.map((message) => message.ref)).toEqual(["m2"]);
    expect(
      calls.filter((call) => call.url.pathname === `${base}/profile`),
    ).toHaveLength(1);
    const lists = calls.filter(
      (call) => call.url.pathname === `${base}/messages`,
    );
    expect(lists[1]?.url.searchParams.get("q")).toBe(
      lists[0]?.url.searchParams.get("q"),
    );
  });

  it("reads history from the stored id on later runs", async () => {
    const { listReceived, calls } = setup({
      historyId: "1000",
      messages: { m1: reply },
      history: () => ({
        body: {
          historyId: "1200",
          history: [
            { id: "1100", messagesAdded: [{ message: { id: "m1" } }] },
            { id: "1101", messagesAdded: [{ message: { id: "m1" } }] },
            { id: "1102", messagesAdded: [{ message: { id: "gone" } }] },
          ],
        },
      }),
    });

    const page = await listReceived(readCredentials, {
      since,
      state: { historyId: "1000" },
      limit: 100,
    });

    expect(page.messages.map((message) => message.ref)).toEqual(["m1"]);
    expect(page.state).toEqual({ historyId: "1200" });
    expect(page.more).toBe(false);
    const history = calls[0];
    expect(history?.url.pathname).toBe(`${base}/history`);
    expect(history?.url.searchParams.get("startHistoryId")).toBe("1000");
    expect(history?.url.searchParams.get("historyTypes")).toBe("messageAdded");
    expect(history?.url.searchParams.get("labelId")).toBe("INBOX");
    expect(
      calls.filter((call) => call.url.pathname === `${base}/messages`),
    ).toHaveLength(0);
  });

  it("keeps the start id while history has more pages", async () => {
    const { listReceived } = setup({
      historyId: "1000",
      messages: { m1: reply },
      history: () => ({
        body: {
          historyId: "1200",
          nextPageToken: "page-2",
          history: [{ id: "1100", messagesAdded: [{ message: { id: "m1" } }] }],
        },
      }),
    });
    const page = await listReceived(readCredentials, {
      since,
      state: { historyId: "1000" },
      limit: 100,
    });
    expect(page.more).toBe(true);
    expect(page.state).toEqual({ historyId: "1000", pageToken: "page-2" });
  });

  it("falls back to the after query when the history id has expired", async () => {
    const { listReceived, calls } = setup({
      historyId: "5000",
      messages: { m1: reply },
      history: () => ({ status: 404, body: { error: { code: 404 } } }),
      list: () => ({ body: { messages: [{ id: "m1" }] } }),
    });
    const page = await listReceived(readCredentials, {
      since,
      state: { historyId: "12" },
      limit: 100,
    });
    expect(page.messages.map((message) => message.ref)).toEqual(["m1"]);
    expect(page.state).toEqual({ historyId: "5000" });
    expect(calls.map((call) => call.url.pathname)).toEqual([
      `${base}/history`,
      `${base}/profile`,
      `${base}/messages`,
      `${base}/messages/m1`,
    ]);
  });

  it("bounds the number of requests in one call", async () => {
    const ids = Array.from({ length: 200 }, (_, index) => `m${index}`);
    const { listReceived, calls } = setup({
      historyId: "1000",
      messages: Object.fromEntries(ids.map((id) => [id, { ...reply, id }])),
      history: () => ({
        body: {
          historyId: "1200",
          history: ids.map((id) => ({
            messagesAdded: [{ message: { id } }],
          })),
        },
      }),
    });
    const page = await listReceived(readCredentials, {
      since,
      state: { historyId: "1000" },
      limit: 500,
    });
    expect(page.messages).toHaveLength(50);
    expect(calls.length).toBeLessThanOrEqual(51);
    expect(calls[0]?.url.searchParams.get("maxResults")).toBe("50");
  });

  it("reads the delivery status of a bounce report", async () => {
    const bounce = metadata("b1", {
      "Message-ID": "<bounce-1@mail.test>",
      From: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>",
      References: "<step-1@example.com>",
      "Content-Type":
        'multipart/report; boundary="b"; report-type=delivery-status',
    });
    const { listReceived } = setup({
      historyId: "1000",
      messages: {},
      list: () => ({ body: { messages: [{ id: "b1" }] } }),
      get: (_id, url) =>
        url.searchParams.get("format") === "full"
          ? {
              body: {
                ...bounce,
                payload: {
                  mimeType: "multipart/report",
                  headers: [],
                  parts: [
                    {
                      mimeType: "text/plain",
                      body: { data: encode("Address not found") },
                    },
                    {
                      mimeType: "message/delivery-status",
                      body: {
                        data: encode(
                          "Reporting-MTA: dns; googlemail.com\r\n\r\nFinal-Recipient: rfc822; nobody@customer.test\r\nAction: failed\r\nStatus: 5.1.1\r\n",
                        ),
                      },
                    },
                    {
                      mimeType: "message/rfc822",
                      parts: [
                        {
                          mimeType: "text/plain",
                          headers: [
                            {
                              name: "Message-ID",
                              value: "<step-1@example.com>",
                            },
                          ],
                          body: { data: encode("Hello") },
                        },
                      ],
                    },
                  ],
                },
              },
            }
          : { body: bounce },
    });
    const page = await listReceived(readCredentials, {
      since,
      state: null,
      limit: 100,
    });
    expect(page.messages[0]?.deliveryStatus).toEqual({
      action: "failed",
      status: "5.1.1",
      originalMessageId: "<step-1@example.com>",
      failedRecipient: "nobody@customer.test",
    });
  });

  it("fetches the text and html of one message and skips attachments", async () => {
    const big = "x".repeat(600 * 1024);
    const { fetchReceived, calls } = setup({
      historyId: "1000",
      messages: {
        m1: {
          id: "m1",
          internalDate: String(Date.parse("2026-03-02T10:00:00Z")),
          payload: {
            mimeType: "multipart/mixed",
            headers: [
              { name: "Subject", value: "Re: Quarterly update" },
              { name: "From", value: "Grace Hopper <grace@customer.test>" },
              { name: "To", value: "Ada <ada@example.com>, bob@example.com" },
              { name: "Date", value: "Mon, 02 Mar 2026 09:59:00 +0000" },
            ],
            parts: [
              {
                mimeType: "multipart/alternative",
                parts: [
                  {
                    mimeType: "text/plain",
                    headers: [
                      {
                        name: "Content-Type",
                        value: "text/plain; charset=iso-8859-1",
                      },
                    ],
                    body: {
                      data: Buffer.from("Caf\xe9 time", "latin1").toString(
                        "base64url",
                      ),
                    },
                  },
                  {
                    mimeType: "text/html",
                    body: { data: encode(`<p>${big}</p>`) },
                  },
                ],
              },
              {
                mimeType: "text/plain",
                filename: "notes.txt",
                body: { attachmentId: "att-1", size: 10 },
              },
              {
                mimeType: "application/pdf",
                filename: "contract.pdf",
                body: { attachmentId: "att-2", size: 1000 },
              },
            ],
          },
        },
      },
    });

    const content = await fetchReceived(readCredentials, "m1");

    expect(content).toMatchObject({
      subject: "Re: Quarterly update",
      text: "Café time",
      from: { email: "grace@customer.test", name: "Grace Hopper" },
      to: ["ada@example.com", "bob@example.com"],
      date: new Date("2026-03-02T09:59:00Z"),
    });
    expect(content?.html?.length).toBe(512 * 1024);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url.searchParams.get("format")).toBe("full");
    expect(
      calls.some((call) => call.url.pathname.includes("attachments")),
    ).toBe(false);
  });

  it("returns nothing for a message that is gone or a malformed ref", async () => {
    const { fetchReceived, calls } = setup({ historyId: "1", messages: {} });
    expect(await fetchReceived(readCredentials, "missing")).toBeNull();
    expect(await fetchReceived(readCredentials, "../profile")).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("maps quota errors to rate limited", async () => {
    for (const [status, reason] of [
      [429, "rateLimitExceeded"],
      [403, "userRateLimitExceeded"],
      [403, "dailyLimitExceeded"],
    ] as const) {
      const { listReceived } = setup({
        historyId: "1000",
        messages: {},
        history: () => ({
          status,
          body: {
            error: {
              code: status,
              message: "Quota exceeded",
              errors: [{ reason }],
            },
          },
        }),
      });
      await expect(
        listReceived(readCredentials, {
          since,
          state: { historyId: "1000" },
          limit: 10,
        }),
      ).rejects.toMatchObject({ code: "rate_limited" });
    }
  });

  it("reports a missing read permission and an expired token", async () => {
    const denied = setup({
      historyId: "1000",
      messages: {},
      history: () => ({
        status: 403,
        body: {
          error: {
            code: 403,
            message: "Insufficient Permission",
            errors: [{ reason: "insufficientPermissions" }],
          },
        },
      }),
    });
    await expect(
      denied.listReceived(readCredentials, {
        since,
        state: { historyId: "1000" },
        limit: 10,
      }),
    ).rejects.toMatchObject({
      code: "insufficient_permission",
      message: expect.stringContaining("read the inbox"),
    });

    const expired = setup({
      historyId: "1000",
      messages: {},
      history: () => ({ status: 401, body: { error: { code: 401 } } }),
    });
    await expect(
      expired.listReceived(readCredentials, {
        since,
        state: { historyId: "1000" },
        limit: 10,
      }),
    ).rejects.toMatchObject({ code: "auth_expired" });
  });

  it("never sends anything but GET requests", async () => {
    const { listReceived, fetchReceived, inbox, calls } = setup({
      historyId: "1000",
      messages: { m1: reply },
      history: () => ({
        body: {
          historyId: "1200",
          history: [{ messagesAdded: [{ message: { id: "m1" } }] }],
        },
      }),
      list: () => ({ body: { messages: [{ id: "m1" }] } }),
    });

    await listReceived(readCredentials, { since, state: null, limit: 10 });
    await listReceived(readCredentials, {
      since,
      state: { historyId: "1000" },
      limit: 10,
    });
    await fetchReceived(readCredentials, "m1");
    const found = await inbox.search(readCredentials, {
      messageId: "<reply-1@customer.test>",
      since,
      includeSpam: true,
    });
    expect(found?.providerMessageId).toBe("m1");
    const applied = await inbox.applyActions(
      readCredentials,
      { providerMessageId: "m1" },
      [{ type: "markRead" }, { type: "star" }, { type: "notSpam" }],
    );
    expect(applied.unsupported).toEqual(["markRead", "star", "notSpam"]);
    await expect(
      inbox.ensureFolder(readCredentials, "Warm-up"),
    ).rejects.toMatchObject({ code: "insufficient_permission" });

    expect(calls.length).toBeGreaterThan(5);
    for (const call of calls) {
      expect(call.method).toBe("GET");
      expect(call.body).toBeUndefined();
      expect(call.url.pathname).not.toMatch(/modify|trash|send|labels|batch/);
    }
  });
});
