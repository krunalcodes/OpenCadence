import type {
  IntegrationErrorCode,
  OutboundMessage,
} from "@workspace/integration-core";
import { describe, expect, it } from "vitest";
import { createGmailAdapter } from "../src/index";
import {
  apiError,
  callAt,
  clientConfig,
  createFakeFetch,
  credentials,
  type FakeReply,
} from "./helpers";

function setup(replies: FakeReply[] = []) {
  const fake = createFakeFetch(replies);
  const adapter = createGmailAdapter({ ...clientConfig, fetch: fake.fetch });
  return { adapter, calls: fake.calls };
}

const message: OutboundMessage = {
  from: { email: "ada@example.com", name: "Ada Lovelace" },
  to: ["grace@example.org"],
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
    providerThreadId: "thread-789",
    inReplyTo: "<step-1@example.com>",
    references: ["<step-0@example.com>", "<step-1@example.com>"],
  },
};

const sentReply = { body: { id: "msg-123", threadId: "thread-789" } };

function decodeRaw(body: string): {
  raw: string;
  headers: Map<string, string>;
} {
  const payload = JSON.parse(body) as { raw: string };
  expect(payload.raw).toMatch(/^[A-Za-z0-9_-]+$/);
  const raw = Buffer.from(payload.raw, "base64url").toString("utf8");
  const head = raw
    .slice(0, raw.indexOf("\r\n\r\n"))
    .replace(/\r\n[ \t]+/g, " ");
  const headers = new Map<string, string>();
  for (const line of head.split("\r\n")) {
    const separator = line.indexOf(":");
    headers.set(
      line.slice(0, separator).toLowerCase(),
      line.slice(separator + 1).trim(),
    );
  }
  return { raw, headers };
}

describe("send", () => {
  it("posts a base64url RFC 2822 message with the thread id", async () => {
    const { adapter, calls } = setup([sentReply]);
    const result = await adapter.send(credentials, message);

    const call = callAt(calls, 0);
    expect(call.url).toBe(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    );
    expect(call.method).toBe("POST");
    expect(call.headers.get("authorization")).toBe("Bearer access-token-value");
    expect(call.headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(call.body).threadId).toBe("thread-789");

    const { raw, headers } = decodeRaw(call.body);
    expect(headers.get("from")).toBe("Ada Lovelace <ada@example.com>");
    expect(headers.get("to")).toBe("grace@example.org");
    expect(headers.get("cc")).toBe("cc@example.org");
    expect(headers.get("bcc")).toBe("hidden@example.org");
    expect(headers.get("reply-to")).toBe("replies@example.com");
    expect(headers.get("subject")).toBe("Quarterly update");
    expect(headers.get("message-id")).toBe("<step-2@example.com>");
    expect(headers.get("in-reply-to")).toBe("<step-1@example.com>");
    expect(headers.get("references")).toBe(
      "<step-0@example.com> <step-1@example.com>",
    );
    expect(headers.get("list-unsubscribe")).toBe("<https://example.com/u/abc>");
    expect(headers.get("list-unsubscribe-post")).toBe(
      "List-Unsubscribe=One-Click",
    );
    expect(headers.get("content-type")).toContain("multipart/alternative");
    expect(raw).toContain("Hello Grace");
    expect(raw).toContain("<p>Hello Grace</p>");

    expect(result).toEqual({
      providerMessageId: "msg-123",
      providerThreadId: "thread-789",
      messageId: "<step-2@example.com>",
    });
  });

  it("generates a Message-ID on the sender domain and omits threadId", async () => {
    const { adapter, calls } = setup([
      { body: { id: "msg-1", threadId: "t-1" } },
    ]);
    const result = await adapter.send(credentials, {
      from: { email: "ada@example.com" },
      to: ["grace@example.org"],
      subject: "Hi",
      text: "Hello",
    });
    const call = callAt(calls, 0);
    expect(JSON.parse(call.body)).not.toHaveProperty("threadId");
    const { headers } = decodeRaw(call.body);
    expect(result.messageId).toMatch(/^<[0-9a-f-]{36}@example\.com>$/);
    expect(headers.get("message-id")).toBe(result.messageId);
    expect(headers.get("from")).toBe("ada@example.com");
    expect(headers.has("bcc")).toBe(false);
    expect(headers.has("in-reply-to")).toBe(false);
  });

  it("throws auth_expired without an access token and sends nothing", async () => {
    const { adapter, calls } = setup();
    await expect(
      adapter.send({ ...credentials, accessToken: undefined }, message),
    ).rejects.toMatchObject({ code: "auth_expired", retryable: true });
    expect(calls).toHaveLength(0);
  });

  it("rejects a message without recipients", async () => {
    const { adapter, calls } = setup();
    await expect(
      adapter.send(credentials, { ...message, to: [] }),
    ).rejects.toMatchObject({ code: "validation" });
    expect(calls).toHaveLength(0);
  });
});

describe("send error mapping", () => {
  const rows: {
    name: string;
    reply: FakeReply;
    code: IntegrationErrorCode;
    providerCode?: string;
    retryAfterSeconds?: number;
  }[] = [
    {
      name: "401",
      reply: apiError(401, "Invalid Credentials", "authError"),
      code: "auth_expired",
      providerCode: "authError",
    },
    {
      name: "429 mail sending limit",
      reply: apiError(
        429,
        "User-rate limit exceeded. Retry after 2026-10-12T00:00:00.000Z (Mail sending)",
        "rateLimitExceeded",
      ),
      code: "daily_limit_reached",
      providerCode: "rateLimitExceeded",
    },
    {
      name: "429 daily user sending limit",
      reply: apiError(429, "Daily user sending limit exceeded."),
      code: "daily_limit_reached",
    },
    {
      name: "429 other",
      reply: {
        ...apiError(429, "Too many concurrent requests for user."),
        headers: { "retry-after": "30" },
      },
      code: "rate_limited",
      retryAfterSeconds: 30,
    },
    {
      name: "403 userRateLimitExceeded",
      reply: {
        ...apiError(403, "User Rate Limit Exceeded", "userRateLimitExceeded"),
        headers: { "retry-after": "12" },
      },
      code: "rate_limited",
      providerCode: "userRateLimitExceeded",
      retryAfterSeconds: 12,
    },
    {
      name: "403 rateLimitExceeded",
      reply: apiError(403, "Rate Limit Exceeded", "rateLimitExceeded"),
      code: "rate_limited",
      providerCode: "rateLimitExceeded",
    },
    {
      name: "403 dailyLimitExceeded",
      reply: apiError(403, "Daily Limit Exceeded", "dailyLimitExceeded"),
      code: "quota_reached",
      providerCode: "dailyLimitExceeded",
    },
    {
      name: "403 domainPolicy",
      reply: apiError(
        403,
        "The domain administrators have disabled Gmail apps.",
        "domainPolicy",
      ),
      code: "blocked_by_policy",
      providerCode: "domainPolicy",
    },
    {
      name: "403 insufficientPermissions",
      reply: apiError(
        403,
        "Insufficient Permission",
        "insufficientPermissions",
      ),
      code: "insufficient_permission",
      providerCode: "insufficientPermissions",
    },
    {
      name: "403 ACCESS_TOKEN_SCOPE_INSUFFICIENT",
      reply: {
        status: 403,
        body: {
          error: {
            code: 403,
            message: "Request had insufficient authentication scopes.",
            status: "PERMISSION_DENIED",
            details: [{ reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT" }],
          },
        },
      },
      code: "insufficient_permission",
      providerCode: "ACCESS_TOKEN_SCOPE_INSUFFICIENT",
    },
    {
      name: "403 other",
      reply: apiError(403, "Forbidden", "forbidden"),
      code: "unknown",
      providerCode: "forbidden",
    },
    {
      name: "400",
      reply: apiError(400, "Invalid To header", "invalidArgument"),
      code: "validation",
      providerCode: "invalidArgument",
    },
    {
      name: "500",
      reply: apiError(500, "Backend Error", "backendError"),
      code: "temporary",
      providerCode: "backendError",
    },
    {
      name: "503 without a JSON body",
      reply: { status: 503, body: "Service Unavailable" },
      code: "temporary",
    },
    {
      name: "404",
      reply: apiError(404, "Not Found", "notFound"),
      code: "unknown",
      providerCode: "notFound",
    },
  ];

  it.each(rows)("maps $name to $code", async (row) => {
    const { adapter } = setup([row.reply]);
    const error = await adapter.send(credentials, message).catch((e) => e);
    const reply = row.reply as { status: number; body: unknown };
    expect(error).toMatchObject({
      name: "IntegrationError",
      code: row.code,
      providerStatus: reply.status,
    });
    expect(error.providerCode).toBe(row.providerCode);
    expect(error.retryAfterSeconds).toBe(row.retryAfterSeconds);
    expect(error.message).toMatch(/^[A-Z].*\.$/);
    expect(error.message).not.toContain("access-token-value");
    if (typeof reply.body === "object") {
      expect(typeof error.providerMessage).toBe("string");
    }
  });

  it("maps network failures to temporary", async () => {
    const { adapter } = setup([new TypeError("fetch failed")]);
    await expect(adapter.send(credentials, message)).rejects.toMatchObject({
      code: "temporary",
      retryable: true,
    });
  });
});
