import type {
  ReceivedCursor,
  ReceivedQuery,
} from "@workspace/integration-core";
import { describe, expect, it } from "vitest";
import { createOutlookAdapter } from "../src/index";
import {
  headerFetchConcurrency,
  maxPageSize,
  resyncAfterMessages,
} from "../src/received";
import {
  captureError,
  clientConfig,
  createFakeFetch,
  expectNoSecrets,
  type FakeReply,
  graphError,
  inboxCredentials,
  type RecordedCall,
  type Responder,
  sendCredentials,
} from "./helpers";

const graph = "https://graph.microsoft.com/v1.0";

const since = new Date("2026-10-01T12:30:00.000Z");

const initialUrl = `${graph}/me/mailFolders/inbox/messages/delta?changeType=created&$select=id,internetMessageId,from,sender,receivedDateTime&$filter=receivedDateTime+ge+2026-10-01T12:30:00Z`;

const nextLink = `${graph}/me/mailFolders('inbox')/messages/delta?$skiptoken=skip-1`;

const deltaLink = `${graph}/me/mailFolders('inbox')/messages/delta?$deltatoken=delta-1`;

const detailQuery =
  "?$select=internetMessageId,internetMessageHeaders,from,sender,receivedDateTime";

type Stored = {
  id: string;
  internetMessageId?: string;
  from?: string;
  receivedDateTime?: string;
  headers?: Record<string, string>;
  mime?: string;
  detail?: FakeReply;
  value?: FakeReply;
};

function entry(message: Stored) {
  return {
    "@odata.type": "#microsoft.graph.message",
    id: message.id,
    internetMessageId: message.internetMessageId,
    receivedDateTime: message.receivedDateTime,
    from: message.from
      ? { emailAddress: { name: "Someone", address: message.from } }
      : undefined,
  };
}

function mailbox(messages: Stored[], pages: Record<string, FakeReply>) {
  const byId = new Map(messages.map((message) => [message.id, message]));
  const responder: Responder = (call) => {
    const page = pages[call.url];
    if (page) {
      return page;
    }
    const match = /\/me\/messages\/([^/?]+)(\/\$value|\?.*)$/.exec(call.url);
    const message = match?.[1]
      ? byId.get(decodeURIComponent(match[1]))
      : undefined;
    if (!match || !message) {
      return graphError(404, "ErrorItemNotFound");
    }
    if (match[2] === "/$value") {
      return message.value ?? { text: message.mime ?? "" };
    }
    if (match[2] !== detailQuery) {
      return graphError(400, "BadRequest", "Unexpected query.");
    }
    return (
      message.detail ?? {
        body: {
          ...entry(message),
          internetMessageHeaders: Object.entries(message.headers ?? {}).map(
            ([name, value]) => ({ name, value }),
          ),
        },
      }
    );
  };
  return responder;
}

function page(messages: Stored[], link: Record<string, string>): FakeReply {
  return { body: { value: messages.map(entry), ...link } };
}

function setup(responder: Responder | FakeReply[]) {
  const fake = createFakeFetch(responder);
  const adapter = createOutlookAdapter({
    ...clientConfig,
    inboxAccess: true,
    fetch: fake.fetch,
  });
  const list = (input: Partial<ReceivedQuery> = {}) => {
    if (!adapter.inbox?.listReceived) {
      throw new Error("The adapter cannot list received mail");
    }
    return adapter.inbox.listReceived(inboxCredentials, {
      since,
      state: null,
      limit: 25,
      ...input,
    });
  };
  return { adapter, list, calls: fake.calls, stats: fake.stats };
}

function expectReadOnly(calls: RecordedCall[]) {
  expect(calls.length).toBeGreaterThan(0);
  for (const call of calls) {
    expect(call.method).toBe("GET");
    expect(call.body).toBe("");
    expect(call.url.toLowerCase()).not.toContain("isread");
    expect(new URL(call.url).origin).toBe("https://graph.microsoft.com");
    expect(call.headers.get("authorization")).toBe("Bearer access-token-value");
  }
}

const reply: Stored = {
  id: "AAkALgAA-reply=",
  internetMessageId: "<reply-1@customer.example>",
  from: "Grace@Customer.example",
  receivedDateTime: "2026-10-02T09:00:00Z",
  headers: {
    "Message-ID": "<reply-1@customer.example>",
    "In-Reply-To": "<step-1@example.com>",
    References: "<step-0@example.com>\r\n <step-1@example.com>",
    "Content-Type": 'multipart/alternative; boundary="b1"',
    "X-Ignored": "nope",
  },
};

const autoReply: Stored = {
  id: "AAkALgAA-auto",
  internetMessageId: "<auto-1@customer.example>",
  from: "away@customer.example",
  receivedDateTime: "2026-10-02T08:00:00Z",
  headers: {
    "Auto-Submitted": "auto-replied",
    "X-Autoreply": "yes",
    Precedence: "bulk",
    "In-Reply-To": "<step-1@example.com>",
    "Content-Type": "text/plain; charset=utf-8",
  },
};

const bounceMime = [
  "From: postmaster@contoso.com",
  "Subject: Undeliverable: Quarterly update",
  'Content-Type: multipart/report; report-type=delivery-status; boundary="rep"',
  "",
  "--rep",
  "Content-Type: text/plain",
  "",
  "Delivery has failed to these recipients.",
  "",
  "--rep",
  "Content-Type: message/delivery-status",
  "",
  "Reporting-MTA: dns;mx.contoso.com",
  "",
  "Final-Recipient: rfc822;Missing@Customer.example",
  "Action: failed",
  "Status: 5.1.1",
  "Diagnostic-Code: smtp;550 5.1.1 User unknown",
  "",
  "--rep",
  "Content-Type: message/rfc822",
  "",
  "Message-ID: <step-1@example.com>",
  "Subject: Quarterly update",
  "",
  "Hello",
  "--rep--",
  "",
].join("\r\n");

const bounce: Stored = {
  id: "AAkALgAA-bounce",
  internetMessageId: "<ndr-1@contoso.com>",
  from: "postmaster@contoso.com",
  receivedDateTime: "2026-10-02T10:00:00Z",
  headers: {
    "Content-Type":
      'multipart/report; report-type=delivery-status; boundary="rep"',
    "X-Failed-Recipients": "missing@customer.example",
  },
  mime: bounceMime,
};

describe("listReceived, first run", () => {
  it("starts a delta round on the inbox filtered by the since date", async () => {
    const { list, calls } = setup(
      mailbox([reply, autoReply], {
        [initialUrl]: page([reply, autoReply], {
          "@odata.deltaLink": deltaLink,
        }),
      }),
    );
    const result = await list();

    const first = calls[0];
    expect(first?.url).toBe(initialUrl);
    expect(first?.headers.get("prefer")).toBe(
      'IdType="ImmutableId", odata.maxpagesize=25',
    );
    expect(calls.map((call) => call.url).sort()).toEqual(
      [
        initialUrl,
        `${graph}/me/messages/AAkALgAA-auto${detailQuery}`,
        `${graph}/me/messages/AAkALgAA-reply%3D${detailQuery}`,
      ].sort(),
    );
    expect(calls[1]?.headers.get("prefer")).toBe('IdType="ImmutableId"');
    expectReadOnly(calls);

    expect(result.more).toBe(false);
    expect(result.state).toEqual({ link: deltaLink, seen: 2 });
    expect(result.messages).toEqual([
      {
        ref: "AAkALgAA-auto",
        messageId: "<auto-1@customer.example>",
        inReplyTo: "<step-1@example.com>",
        references: [],
        from: { email: "away@customer.example" },
        receivedAt: new Date("2026-10-02T08:00:00Z"),
        headers: {
          "auto-submitted": "auto-replied",
          "x-autoreply": "yes",
          precedence: "bulk",
          "content-type": "text/plain; charset=utf-8",
        },
      },
      {
        ref: "AAkALgAA-reply=",
        messageId: "<reply-1@customer.example>",
        inReplyTo: "<step-1@example.com>",
        references: ["<step-0@example.com>", "<step-1@example.com>"],
        from: { email: "Grace@Customer.example" },
        receivedAt: new Date("2026-10-02T09:00:00Z"),
        headers: { "content-type": 'multipart/alternative; boundary="b1"' },
      },
    ]);
  });

  it("returns an empty page and a cursor for an empty inbox", async () => {
    const { list, calls } = setup(
      mailbox([], {
        [initialUrl]: page([], { "@odata.deltaLink": deltaLink }),
      }),
    );
    const result = await list();
    expect(result).toEqual({
      messages: [],
      state: { link: deltaLink, seen: 0 },
      more: false,
    });
    expect(calls).toHaveLength(1);
  });

  it("drops messages older than the since date, removed entries and repeats", async () => {
    const old: Stored = {
      ...autoReply,
      id: "old",
      receivedDateTime: "2026-09-30T00:00:00Z",
    };
    const { list, calls } = setup(
      mailbox([reply, old], {
        [initialUrl]: {
          body: {
            value: [
              entry(reply),
              entry(old),
              entry(reply),
              { id: "gone", "@removed": { reason: "deleted" } },
              { subject: "no id" },
              "junk",
            ],
            "@odata.deltaLink": deltaLink,
          },
        },
      }),
    );
    const result = await list();
    expect(result.messages.map((message) => message.ref)).toEqual([
      "AAkALgAA-reply=",
    ]);
    expect(calls).toHaveLength(3);
    expect(result.state).toEqual({ link: deltaLink, seen: 2 });
  });
});

describe("listReceived, paging and incremental runs", () => {
  it("follows nextLink with more, then stores the deltaLink", async () => {
    const { list, calls } = setup(
      mailbox([reply, autoReply], {
        [initialUrl]: page([autoReply], { "@odata.nextLink": nextLink }),
        [nextLink]: page([reply], { "@odata.deltaLink": deltaLink }),
      }),
    );
    const first = await list({ limit: 1 });
    expect(first.more).toBe(true);
    expect(first.state).toEqual({ link: nextLink, seen: 1 });
    expect(first.messages.map((message) => message.ref)).toEqual([
      "AAkALgAA-auto",
    ]);
    expect(calls[0]?.headers.get("prefer")).toBe(
      'IdType="ImmutableId", odata.maxpagesize=1',
    );

    const second = await list({ limit: 1, state: first.state });
    expect(second.more).toBe(false);
    expect(second.state).toEqual({ link: deltaLink, seen: 2 });
    expect(second.messages.map((message) => message.ref)).toEqual([
      "AAkALgAA-reply=",
    ]);
    expect(calls[2]?.url).toBe(nextLink);
    expectReadOnly(calls);
  });

  it("asks the saved deltaLink for changes without repeating the filter", async () => {
    const later: Stored = {
      ...reply,
      id: "later",
      receivedDateTime: "2026-09-01T00:00:00Z",
    };
    const newDelta = `${deltaLink}-2`;
    const { list, calls } = setup(
      mailbox([later], {
        [deltaLink]: page([later], { "@odata.deltaLink": newDelta }),
      }),
    );
    const result = await list({ state: { link: deltaLink, seen: 7 } });
    expect(calls[0]?.url).toBe(deltaLink);
    expect(calls.some((call) => call.url === initialUrl)).toBe(false);
    expect(result.messages.map((message) => message.ref)).toEqual(["later"]);
    expect(result.state).toEqual({ link: newDelta, seen: 8 });
    expect(result.more).toBe(false);
    expectReadOnly(calls);
  });

  it("clamps the page size", async () => {
    const { list, calls } = setup(
      mailbox([], {
        [initialUrl]: page([], { "@odata.deltaLink": deltaLink }),
      }),
    );
    await list({ limit: 5000 });
    await list({ limit: 0 });
    await list({ limit: Number.NaN });
    expect(calls.map((call) => call.headers.get("prefer"))).toEqual([
      `IdType="ImmutableId", odata.maxpagesize=${maxPageSize}`,
      'IdType="ImmutableId", odata.maxpagesize=1',
      'IdType="ImmutableId", odata.maxpagesize=1',
    ]);
  });

  it("bounds concurrent header requests and the total request count", async () => {
    const many = Array.from({ length: 20 }, (_, index) => ({
      ...reply,
      id: `message-${index}`,
    }));
    const { list, calls, stats } = setup(
      mailbox(many, {
        [initialUrl]: page(many, { "@odata.deltaLink": deltaLink }),
      }),
    );
    const result = await list();
    expect(result.messages).toHaveLength(20);
    expect(calls).toHaveLength(21);
    expect(stats.peak).toBeLessThanOrEqual(headerFetchConcurrency);
    expectReadOnly(calls);
  });

  it("starts a fresh round once the filtered delta nears its message cap", async () => {
    const { list } = setup(
      mailbox([reply], {
        [deltaLink]: page([reply], { "@odata.deltaLink": `${deltaLink}-2` }),
      }),
    );
    const result = await list({
      state: { link: deltaLink, seen: resyncAfterMessages - 1 },
    });
    expect(result.messages).toHaveLength(1);
    expect(result.state).toEqual({ seen: 0 });
    expect(result.more).toBe(false);
  });
});

describe("listReceived, stale cursors", () => {
  const stale: [string, FakeReply][] = [
    ["410 Gone", graphError(410, "resyncRequired")],
    ["a missing sync state", graphError(400, "SyncStateNotFound")],
    ["an invalid sync state", graphError(400, "ErrorInvalidSyncStateData")],
    ["a rejected token", graphError(400, "BadRequest")],
    [
      "a nested sync error",
      {
        status: 409,
        body: {
          error: {
            code: "Conflict",
            innerError: { code: "syncStateNotFound" },
          },
        },
      },
    ],
  ];

  it.each(stale)(
    "falls back to a fresh round after %s",
    async (_name, failure) => {
      const newDelta = `${deltaLink}-fresh`;
      const { list, calls } = setup(
        mailbox([reply], {
          [deltaLink]: failure,
          [initialUrl]: page([reply], { "@odata.deltaLink": newDelta }),
        }),
      );
      const result = await list({ state: { link: deltaLink, seen: 900 } });
      expect(calls.map((call) => call.url).slice(0, 2)).toEqual([
        deltaLink,
        initialUrl,
      ]);
      expect(result.messages.map((message) => message.ref)).toEqual([
        "AAkALgAA-reply=",
      ]);
      expect(result.state).toEqual({ link: newDelta, seen: 1 });
      expect(result.more).toBe(false);
      expectReadOnly(calls);
    },
  );

  it("does not treat throttling or auth failures as a stale cursor", async () => {
    const throttled = setup(
      mailbox([], {
        [deltaLink]: graphError(429, "TooManyRequests", "Slow.", {
          "retry-after": "12",
        }),
      }),
    );
    const error = await captureError(() =>
      throttled.list({ state: { link: deltaLink, seen: 1 } }),
    );
    expect(error.code).toBe("rate_limited");
    expect(error.retryAfterSeconds).toBe(12);
    expect(throttled.calls).toHaveLength(1);

    const expired = setup(
      mailbox([], {
        [deltaLink]: graphError(401, "InvalidAuthenticationToken"),
      }),
    );
    const authError = await captureError(() =>
      expired.list({ state: { link: deltaLink, seen: 1 } }),
    );
    expect(authError.code).toBe("auth_expired");
    expect(expired.calls).toHaveLength(1);
  });

  it("ignores a saved cursor that is malformed or points elsewhere", async () => {
    const states: ReceivedCursor[] = [
      { link: "https://evil.example/v1.0/me/messages/delta?$deltatoken=x" },
      { link: "http://graph.microsoft.com/v1.0/me/x" },
      { link: "not a url" },
      { link: 42 },
      { uidValidity: "1", lastUid: 10 },
      {},
    ];
    for (const state of states) {
      const { list, calls } = setup(
        mailbox([], {
          [initialUrl]: page([], { "@odata.deltaLink": deltaLink }),
        }),
      );
      const result = await list({ state });
      expect(calls.map((call) => call.url)).toEqual([initialUrl]);
      expect(result.state).toEqual({ link: deltaLink, seen: 0 });
    }
  });

  it("does not store a link that leaves Microsoft Graph", async () => {
    const { list } = setup(
      mailbox([], {
        [initialUrl]: page([], {
          "@odata.deltaLink": "https://evil.example/delta?$deltatoken=x",
        }),
      }),
    );
    expect((await list()).state).toEqual({ seen: 0 });
  });

  it("fails cleanly when the first request of a round fails", async () => {
    const { list } = setup(
      mailbox([], { [initialUrl]: graphError(503, "serviceNotAvailable") }),
    );
    const error = await captureError(() => list());
    expect(error.code).toBe("temporary");
    expectNoSecrets(error);
  });
});

describe("listReceived, message details", () => {
  it("keeps a message whose details can no longer be read", async () => {
    const moved: Stored = {
      ...reply,
      detail: graphError(404, "ErrorItemNotFound"),
    };
    const { list } = setup(
      mailbox([moved], {
        [initialUrl]: page([moved], { "@odata.deltaLink": deltaLink }),
      }),
    );
    const result = await list();
    expect(result.messages).toEqual([
      {
        ref: "AAkALgAA-reply=",
        messageId: "<reply-1@customer.example>",
        references: [],
        from: { email: "Grace@Customer.example" },
        receivedAt: new Date("2026-10-02T09:00:00Z"),
        headers: {},
      },
    ]);
  });

  it("fails the page when details are throttled so nothing is skipped", async () => {
    const limited: Stored = {
      ...reply,
      detail: graphError(429, "TooManyRequests", "Slow.", {
        "retry-after": "3",
      }),
    };
    const { list } = setup(
      mailbox([limited], {
        [initialUrl]: page([limited], { "@odata.deltaLink": deltaLink }),
      }),
    );
    const error = await captureError(() => list());
    expect(error.code).toBe("rate_limited");
    expect(error.retryAfterSeconds).toBe(3);
  });

  it("caps header values and the number of references", async () => {
    const references = Array.from(
      { length: 150 },
      (_, index) => `<ref-${index}@example.com>`,
    );
    const noisy: Stored = {
      id: "noisy",
      headers: {
        References: references.join(" "),
        "X-Failed-Recipients": "a".repeat(2000),
        "In-Reply-To": "not an id",
      },
    };
    const { list } = setup(
      mailbox([noisy], {
        [deltaLink]: page([noisy], { "@odata.deltaLink": deltaLink }),
      }),
    );
    const before = Date.now();
    const [message] = (await list({ state: { link: deltaLink, seen: 0 } }))
      .messages;
    expect(message?.references).toEqual(references.slice(-100));
    expect(message?.headers["x-failed-recipients"]).toHaveLength(512);
    expect(message?.inReplyTo).toBeUndefined();
    expect(message?.messageId).toBeUndefined();
    expect(message?.from).toBeUndefined();
    expect(message?.receivedAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("reads the delivery status of a non-delivery report from its MIME content", async () => {
    const { list, calls } = setup(
      mailbox([bounce], {
        [initialUrl]: page([bounce], { "@odata.deltaLink": deltaLink }),
      }),
    );
    const [message] = (await list()).messages;
    expect(calls.map((call) => call.url)).toEqual([
      initialUrl,
      `${graph}/me/messages/AAkALgAA-bounce${detailQuery}`,
      `${graph}/me/messages/AAkALgAA-bounce/$value`,
    ]);
    expect(message).toEqual({
      ref: "AAkALgAA-bounce",
      messageId: "<ndr-1@contoso.com>",
      references: [],
      from: { email: "postmaster@contoso.com" },
      receivedAt: new Date("2026-10-02T10:00:00Z"),
      headers: {
        "content-type":
          'multipart/report; report-type=delivery-status; boundary="rep"',
        "x-failed-recipients": "missing@customer.example",
      },
      deliveryStatus: {
        action: "failed",
        status: "5.1.1",
        originalMessageId: "<step-1@example.com>",
        failedRecipient: "missing@customer.example",
      },
    });
    expectReadOnly(calls);
  });

  it("reads an encoded report and one marked only by the Exchange header", async () => {
    const encoded = bounceMime
      .replace(
        "Content-Type: message/delivery-status\r\n",
        "Content-Type: message/delivery-status\r\nContent-Transfer-Encoding: base64\r\n",
      )
      .replace(
        /Reporting-MTA[\s\S]*?User unknown\r\n/,
        `${Buffer.from(
          "Reporting-MTA: dns;mx\r\n\r\nFinal-Recipient: rfc822;x@y.example\r\nAction: failed\r\nStatus: 5.2.2\r\n",
        ).toString("base64")}\r\n`,
      )
      .replace(
        "Content-Type: message/rfc822",
        "Content-Type: text/rfc822-headers",
      );
    const marked: Stored = {
      ...bounce,
      headers: { "X-MS-Exchange-Message-Is-Ndr": "" },
      mime: encoded,
    };
    const { list } = setup(
      mailbox([marked], {
        [initialUrl]: page([marked], { "@odata.deltaLink": deltaLink }),
      }),
    );
    expect((await list()).messages[0]?.deliveryStatus).toEqual({
      action: "failed",
      status: "5.2.2",
      originalMessageId: "<step-1@example.com>",
      failedRecipient: "x@y.example",
    });
  });

  it("returns the report without a status when its content is unusable", async () => {
    const cases: Stored[] = [
      { ...bounce, mime: "Subject: Undeliverable\r\n\r\nNo report here." },
      { ...bounce, value: graphError(500, "ErrorMimeContentConversionFailed") },
      { ...bounce, value: graphError(404, "ErrorItemNotFound") },
    ];
    for (const item of cases) {
      const { list } = setup(
        mailbox([item], {
          [initialUrl]: page([item], { "@odata.deltaLink": deltaLink }),
        }),
      );
      const [message] = (await list()).messages;
      expect(message?.ref).toBe("AAkALgAA-bounce");
      expect(message?.deliveryStatus).toBeUndefined();
    }
  });

  it("fails the page when reading a report is throttled", async () => {
    const limited: Stored = {
      ...bounce,
      value: graphError(429, "TooManyRequests"),
    };
    const { list } = setup(
      mailbox([limited], {
        [initialUrl]: page([limited], { "@odata.deltaLink": deltaLink }),
      }),
    );
    expect((await captureError(() => list())).code).toBe("rate_limited");
  });

  it("stops reading a very large report early", async () => {
    const huge: Stored = {
      ...bounce,
      mime: `${bounceMime}${"x".repeat(600_000)}`,
    };
    const { list } = setup(
      mailbox([huge], {
        [initialUrl]: page([huge], { "@odata.deltaLink": deltaLink }),
      }),
    );
    expect((await list()).messages[0]?.deliveryStatus?.status).toBe("5.1.1");
  });
});

describe("listReceived, access", () => {
  it("needs the inbox permission and makes no request without it", async () => {
    const { adapter, calls } = setup([]);
    const error = await captureError(async () =>
      adapter.inbox?.listReceived?.(sendCredentials, {
        since,
        state: null,
        limit: 10,
      }),
    );
    expect(error.code).toBe("insufficient_permission");
    const noToken = await captureError(async () =>
      adapter.inbox?.listReceived?.(
        { ...inboxCredentials, accessToken: undefined },
        { since, state: null, limit: 10 },
      ),
    );
    expect(noToken.code).toBe("auth_expired");
    expect(calls).toHaveLength(0);
  });

  it("accepts the scope in its full Microsoft Graph form", async () => {
    const fake = createFakeFetch(
      mailbox([], {
        [initialUrl]: page([], { "@odata.deltaLink": deltaLink }),
      }),
    );
    const adapter = createOutlookAdapter({
      ...clientConfig,
      inboxAccess: true,
      fetch: fake.fetch,
    });
    const result = await adapter.inbox?.listReceived?.(
      {
        ...sendCredentials,
        scopes: ["https://graph.microsoft.com/Mail.Read"],
      },
      { since, state: null, limit: 10 },
    );
    expect(result?.more).toBe(false);
  });
});
