import type {
  IntegrationErrorCode,
  OutboundMessage,
} from "@workspace/integration-core";
import { describe, expect, it } from "vitest";
import { createOutlookAdapter } from "../src/index";
import {
  callAt,
  captureError,
  clientConfig,
  createFakeFetch,
  expectNoSecrets,
  type FakeReply,
  graphError,
  sendCredentials,
} from "./helpers";

function setup(replies: FakeReply[] = []) {
  const fake = createFakeFetch(replies);
  const adapter = createOutlookAdapter({ ...clientConfig, fetch: fake.fetch });
  return { adapter, calls: fake.calls };
}

const message: OutboundMessage = {
  from: { email: "ada@example.com", name: "Ada Lovelace" },
  to: ["grace@example.org"],
  cc: ["cc@example.org"],
  bcc: ["hidden@example.org"],
  replyTo: "replies@example.com",
  subject: "Quarterly update",
  html: "<p>Hello Grace, private-body-marker</p>",
  text: "Hello Grace, private-body-marker",
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

const accepted: FakeReply = { status: 202, text: "" };

function decode(body: string) {
  expect(body).toMatch(/^[A-Za-z0-9+/]+=*$/);
  const mime = Buffer.from(body, "base64").toString("utf8");
  const head = mime
    .slice(0, mime.indexOf("\r\n\r\n"))
    .replace(/\r\n[ \t]+/g, " ");
  const headers = new Map<string, string>();
  for (const line of head.split("\r\n")) {
    const separator = line.indexOf(":");
    headers.set(
      line.slice(0, separator).toLowerCase(),
      line.slice(separator + 1).trim(),
    );
  }
  return { mime, headers };
}

describe("send", () => {
  it("posts the message to sendMail as base64 MIME", async () => {
    const { adapter, calls } = setup([accepted]);
    const result = await adapter.send(sendCredentials, message);

    expect(calls).toHaveLength(1);
    const call = callAt(calls, 0);
    expect(call.url).toBe("https://graph.microsoft.com/v1.0/me/sendMail");
    expect(call.method).toBe("POST");
    expect(call.headers.get("authorization")).toBe("Bearer access-token-value");
    expect(call.headers.get("content-type")).toBe("text/plain");

    const { mime, headers } = decode(call.body);
    expect([...headers.keys()]).toEqual([
      "date",
      "from",
      "to",
      "cc",
      "bcc",
      "reply-to",
      "subject",
      "message-id",
      "in-reply-to",
      "references",
      "mime-version",
      "list-unsubscribe",
      "list-unsubscribe-post",
      "content-type",
    ]);
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
    expect(headers.get("mime-version")).toBe("1.0");
    expect(Date.parse(headers.get("date") ?? "")).toBeGreaterThan(
      Date.now() - 60_000,
    );
    const boundary = headers
      .get("content-type")
      ?.match(/^multipart\/alternative; boundary="(=_[0-9a-f]{32})"$/)?.[1];
    expect(boundary).toBeDefined();
    expect(mime.split(`--${boundary}`)).toHaveLength(4);
    expect(mime).toContain(
      "Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nHello Grace, private-body-marker\r\n",
    );
    expect(mime).toContain(
      "Content-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n<p>Hello Grace, private-body-marker</p>\r\n",
    );

    expect(result).toEqual({
      providerMessageId: "<step-2@example.com>",
      messageId: "<step-2@example.com>",
    });
  });

  it("adds angle brackets to a bare Message-ID", async () => {
    const { adapter, calls } = setup([accepted]);
    const result = await adapter.send(sendCredentials, {
      ...message,
      messageId: "bare@example.com",
    });
    expect(result.messageId).toBe("<bare@example.com>");
    expect(decode(callAt(calls, 0).body).headers.get("message-id")).toBe(
      "<bare@example.com>",
    );
  });

  it("generates a Message-ID on the sender's domain when none is given", async () => {
    const { adapter, calls } = setup([accepted]);
    const result = await adapter.send(sendCredentials, {
      ...message,
      messageId: undefined,
    });
    expect(result.messageId).toMatch(/^<[0-9a-f-]{36}@example\.com>$/);
    expect(result.providerMessageId).toBe(result.messageId);
    expect(decode(callAt(calls, 0).body).headers.get("message-id")).toBe(
      result.messageId,
    );
  });

  it("refuses to send without recipients, a token, or OAuth credentials", async () => {
    const { adapter, calls } = setup();
    const noRecipients = await captureError(() =>
      adapter.send(sendCredentials, { ...message, to: [] }),
    );
    expect(noRecipients.code).toBe("validation");
    const noToken = await captureError(() =>
      adapter.send({ ...sendCredentials, accessToken: undefined }, message),
    );
    expect(noToken.code).toBe("auth_expired");
    const wrongKind = await captureError(() =>
      adapter.send({ kind: "api_key", apiKey: "key" }, message),
    );
    expect(wrongKind.code).toBe("invalid_credentials");
    const badAddress = await captureError(() =>
      adapter.send(sendCredentials, { ...message, to: ["nope"] }),
    );
    expect(badAddress.code).toBe("validation");
    expect(calls).toHaveLength(0);
  });
});

describe("error mapping", () => {
  const cases: [
    string,
    FakeReply,
    IntegrationErrorCode,
    boolean,
    number | undefined,
  ][] = [
    [
      "an expired access token",
      graphError(401, "InvalidAuthenticationToken"),
      "auth_expired",
      true,
      undefined,
    ],
    [
      "a missing scope",
      graphError(
        403,
        "ErrorAccessDenied",
        "Access is denied. Check credentials and try again.",
      ),
      "insufficient_permission",
      false,
      undefined,
    ],
    [
      "a generic access denial",
      graphError(403, "accessDenied"),
      "insufficient_permission",
      false,
      undefined,
    ],
    [
      "a From address the mailbox cannot use",
      graphError(403, "ErrorSendAsDenied"),
      "insufficient_permission",
      false,
      undefined,
    ],
    [
      "an Exchange application policy",
      graphError(403, "ErrorAccessDenied", "Access to OData is disabled."),
      "blocked_by_policy",
      false,
      undefined,
    ],
    [
      "a conditional access challenge",
      graphError(403, "Forbidden", "Denied.", {
        "www-authenticate": 'Bearer error="insufficient_claims", claims="abc"',
      }),
      "blocked_by_policy",
      false,
      undefined,
    ],
    [
      "a mailbox that is not enabled",
      graphError(404, "MailboxNotEnabledForRESTAPI"),
      "blocked_by_policy",
      false,
      undefined,
    ],
    [
      "a disabled account",
      graphError(403, "ErrorAccountDisabled"),
      "blocked_by_policy",
      false,
      undefined,
    ],
    [
      "throttling with a delay",
      graphError(429, "TooManyRequests", "Please retry again later.", {
        "retry-after": "10",
      }),
      "rate_limited",
      true,
      10,
    ],
    [
      "throttling without a delay",
      graphError(429, "ApplicationThrottled"),
      "rate_limited",
      true,
      undefined,
    ],
    [
      "an unavailable service with a delay",
      graphError(503, "serviceNotAvailable", "Busy.", { "retry-after": "30" }),
      "rate_limited",
      true,
      30,
    ],
    [
      "a gateway timeout with a delay",
      graphError(504, "GatewayTimeout", "Slow.", { "retry-after": "5" }),
      "rate_limited",
      true,
      5,
    ],
    [
      "a bandwidth cap",
      graphError(509, "bandwidthLimitExceeded"),
      "rate_limited",
      true,
      undefined,
    ],
    [
      "a busy server",
      graphError(500, "ErrorServerBusy"),
      "rate_limited",
      true,
      undefined,
    ],
    [
      "the mailbox send limit",
      graphError(429, "ErrorSubmissionQuotaExceeded", "Limit.", {
        "retry-after": "60",
      }),
      "quota_reached",
      false,
      undefined,
    ],
    [
      "the message limit",
      graphError(403, "ErrorExceededMessageLimit"),
      "quota_reached",
      false,
      undefined,
    ],
    [
      "a full mailbox",
      graphError(400, "ErrorQuotaExceeded"),
      "quota_reached",
      false,
      undefined,
    ],
    [
      "insufficient storage",
      graphError(507, "insufficientStorage"),
      "quota_reached",
      false,
      undefined,
    ],
    [
      "invalid MIME",
      graphError(
        400,
        "ErrorMimeContentInvalidBase64String",
        "Invalid base64 string for MIME content.",
      ),
      "validation",
      false,
      undefined,
    ],
    [
      "invalid recipients",
      graphError(400, "ErrorInvalidRecipients"),
      "validation",
      false,
      undefined,
    ],
    [
      "an oversized message",
      graphError(413, "ErrorMessageSizeExceeded"),
      "validation",
      false,
      undefined,
    ],
    [
      "an unprocessable request",
      graphError(422, "unprocessable"),
      "validation",
      false,
      undefined,
    ],
    [
      "an unavailable service without a delay",
      graphError(503, "serviceNotAvailable"),
      "temporary",
      true,
      undefined,
    ],
    [
      "a server error",
      graphError(500, "generalException"),
      "temporary",
      true,
      undefined,
    ],
    [
      "a mailbox move",
      graphError(409, "ErrorMailboxMoveInProgress"),
      "temporary",
      true,
      undefined,
    ],
    [
      "a body that is not JSON",
      { status: 502, text: "<html>" },
      "temporary",
      true,
      undefined,
    ],
    [
      "a missing resource",
      graphError(404, "itemNotFound"),
      "unknown",
      false,
      undefined,
    ],
    [
      "an unexpected status",
      graphError(418, "teapot"),
      "unknown",
      false,
      undefined,
    ],
  ];

  it.each(cases)(
    "maps %s",
    async (_name, reply, code, retryable, retryAfter) => {
      const { adapter } = setup([reply]);
      const error = await captureError(() =>
        adapter.send(sendCredentials, message),
      );
      expect(error.code).toBe(code);
      expect(error.retryable).toBe(retryable);
      expect(error.retryAfterSeconds).toBe(retryAfter);
      if (!(reply instanceof Error)) {
        expect(error.providerStatus).toBe(reply.status);
      }
      expectNoSecrets(error, ["private-body-marker"]);
    },
  );

  it("reads the most specific nested error code", async () => {
    const { adapter } = setup([
      {
        status: 403,
        body: {
          error: {
            code: "Forbidden",
            message: "Denied.",
            innerError: { code: "ErrorSubmissionQuotaExceeded" },
          },
        },
      },
    ]);
    const error = await captureError(() =>
      adapter.send(sendCredentials, message),
    );
    expect(error.code).toBe("quota_reached");
    expect(error.providerCode).toBe("Forbidden");
  });

  it("reads a Retry-After date", async () => {
    const { adapter } = setup([
      graphError(429, "TooManyRequests", "Slow down.", {
        "retry-after": new Date(Date.now() + 20_000).toUTCString(),
      }),
    ]);
    const error = await captureError(() =>
      adapter.send(sendCredentials, message),
    );
    expect(error.retryAfterSeconds).toBeGreaterThan(15);
    expect(error.retryAfterSeconds).toBeLessThanOrEqual(21);
  });

  it("maps a network failure to a temporary error", async () => {
    const { adapter } = setup([new TypeError("fetch failed")]);
    const error = await captureError(() =>
      adapter.send(sendCredentials, message),
    );
    expect(error.code).toBe("temporary");
    expect(error.retryable).toBe(true);
    expectNoSecrets(error, ["private-body-marker"]);
  });

  it("clips long provider messages", async () => {
    const { adapter } = setup([
      graphError(400, "badRequest", "x".repeat(2000)),
    ]);
    const error = await captureError(() =>
      adapter.send(sendCredentials, message),
    );
    expect(error.providerMessage).toHaveLength(300);
  });
});
