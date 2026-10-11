import {
  IntegrationError,
  type IntegrationErrorCode,
} from "@workspace/integration-core";
import { describe, expect, it } from "vitest";
import {
  captureError,
  createAdapter,
  credentials,
  exposed,
  imapError,
  smtpError,
} from "./helpers";

const message = {
  from: { email: "ada@example.com" },
  to: ["grace@example.org"],
  subject: "Hello",
  text: "Hello",
};

const query = {
  messageId: "<warm-1@sender.example>",
  since: new Date("2026-10-09T12:00:00.000Z"),
  includeSpam: true,
};

type SmtpRow = [
  label: string,
  code: string,
  status: number | undefined,
  response: string | undefined,
  expected: IntegrationErrorCode,
  extra?: Record<string, unknown>,
];

const smtpRows: SmtpRow[] = [
  [
    "535 bad password",
    "EAUTH",
    535,
    "535-5.7.8 Username and Password not accepted.\n535 5.7.8 Learn more",
    "invalid_credentials",
  ],
  [
    "534 mechanism too weak",
    "EAUTH",
    534,
    "534 5.7.9 Authentication mechanism is too weak",
    "invalid_credentials",
  ],
  [
    "530 authentication required",
    "EENVELOPE",
    530,
    "530 5.7.0 Authentication Required",
    "invalid_credentials",
  ],
  [
    "EAUTH without a response",
    "EAUTH",
    undefined,
    undefined,
    "invalid_credentials",
  ],
  [
    "missing credentials",
    "ENOAUTH",
    undefined,
    undefined,
    "invalid_credentials",
  ],
  [
    "app password required",
    "EAUTH",
    534,
    "534-5.7.9 Application-specific password required. Learn more at\n534 5.7.9 https://support.google.com/mail/?p=InvalidSecondFactor",
    "blocked_by_policy",
  ],
  [
    "web login required",
    "EAUTH",
    534,
    "534-5.7.14 Please log in via your web browser and then try again.\n534 5.7.14 Learn more",
    "blocked_by_policy",
  ],
  [
    "SMTP AUTH disabled for the tenant",
    "EAUTH",
    535,
    "535 5.7.139 Authentication unsuccessful, SmtpClientAuthentication is disabled for the Tenant.",
    "blocked_by_policy",
  ],
  [
    "SMTP disabled for the account",
    "EAUTH",
    535,
    "535 5.7.3 SMTP access is disabled for this account",
    "blocked_by_policy",
  ],
  [
    "daily user sending limit",
    "EMESSAGE",
    550,
    "550 5.4.5 Daily user sending limit exceeded. For more information on Gmail",
    "daily_limit_reached",
  ],
  [
    "daily sending quota",
    "EENVELOPE",
    550,
    "550 5.4.5 Daily sending quota exceeded.",
    "daily_limit_reached",
  ],
  [
    "421 service busy",
    "ECONNECTION",
    421,
    "421 4.7.0 Try again later, closing connection.",
    "rate_limited",
  ],
  [
    "450 mailbox busy",
    "EENVELOPE",
    450,
    "450 4.2.1 The user you are trying to contact is receiving mail too quickly",
    "rate_limited",
  ],
  [
    "451 local error",
    "EMESSAGE",
    451,
    "451 4.3.0 Temporary system problem",
    "rate_limited",
  ],
  [
    "452 too many recipients",
    "EENVELOPE",
    452,
    "452 4.5.3 Too many recipients",
    "rate_limited",
  ],
  [
    "454 4.7.0 too many logins",
    "EAUTH",
    454,
    "454 4.7.0 Too many login attempts, please try again later.",
    "rate_limited",
  ],
  [
    "550 with a too many hint",
    "EENVELOPE",
    550,
    "550 5.7.1 Too many messages sent, slow down",
    "rate_limited",
  ],
  [
    "550 unknown recipient",
    "EENVELOPE",
    550,
    "550 5.1.1 The email account that you tried to reach does not exist.",
    "validation",
  ],
  [
    "553 sender not allowed",
    "EENVELOPE",
    553,
    "553 5.7.1 Sender address rejected: not owned by user",
    "validation",
  ],
  ["554 rejected", "EMESSAGE", 554, "554 5.7.1 Message rejected", "validation"],
  [
    "501 bad address syntax",
    "EENVELOPE",
    501,
    "501 5.1.3 Bad recipient address syntax",
    "validation",
  ],
  [
    "invalid address before sending",
    "EENVELOPE",
    undefined,
    undefined,
    "validation",
  ],
  ["connection closed", "ECONNECTION", undefined, undefined, "temporary"],
  ["timeout", "ETIMEDOUT", undefined, undefined, "temporary"],
  [
    "socket error",
    "ESOCKET",
    undefined,
    undefined,
    "temporary",
    { originalCode: "ECONNRESET" },
  ],
  [
    "refused",
    "ESOCKET",
    undefined,
    undefined,
    "temporary",
    { originalCode: "ECONNREFUSED" },
  ],
  [
    "DNS failure",
    "EDNS",
    undefined,
    undefined,
    "temporary",
    { originalCode: "ENOTFOUND" },
  ],
  ["raw ENOTFOUND", "ENOTFOUND", undefined, undefined, "temporary"],
  ["raw ECONNREFUSED", "ECONNREFUSED", undefined, undefined, "temporary"],
  ["raw ECONNRESET", "ECONNRESET", undefined, undefined, "temporary"],
  ["TLS handshake", "ETLS", undefined, undefined, "temporary"],
  ["other 4xx", "EMESSAGE", 441, "441 4.4.1 No answer from host", "temporary"],
  ["unexpected status", "EPROTOCOL", 599, "599 Something odd", "unknown"],
  ["no detail at all", "EWHATEVER", undefined, undefined, "unknown"],
];

describe("SMTP error mapping", () => {
  it.each(smtpRows)(
    "maps %s to %s",
    async (_label, code, status, response, expected, extra) => {
      const { adapter, smtp } = createAdapter({
        smtp: {
          sendError: smtpError(
            response ? `Message failed: ${response}` : "Something failed",
            code,
            status,
            response,
            extra,
          ),
        },
      });
      const error = await captureError(() =>
        adapter.send(credentials, message),
      );

      expect(error).toBeInstanceOf(IntegrationError);
      expect(error).toMatchObject({
        code: expected,
        providerStatus: status,
      });
      expect((error as Error).message).toMatch(/^[A-Z].*\.$/);
      expect(exposed(error)).not.toContain(credentials.password);
      expect(smtp.calls).toEqual(["sendMail", "close"]);
    },
  );

  it("maps the same failures during verify", async () => {
    const { adapter } = createAdapter({
      smtp: {
        verifyError: smtpError(
          "Greeting never received",
          "ETIMEDOUT",
          undefined,
          undefined,
          {
            timeoutType: "GREETING_TIMEOUT",
          },
        ),
      },
    });
    expect(await captureError(() => adapter.verify(credentials))).toMatchObject(
      {
        code: "temporary",
        message: "The SMTP server could not be reached.",
        providerCode: "ETIMEDOUT",
      },
    );
  });

  it("keeps the enhanced status code and the server text", async () => {
    const { adapter } = createAdapter({
      smtp: {
        sendError: smtpError(
          "Can't send mail - all recipients were rejected: 550 5.1.1 No such user",
          "EENVELOPE",
          550,
          "550 5.1.1 No such user",
        ),
      },
    });
    expect(
      await captureError(() => adapter.send(credentials, message)),
    ).toMatchObject({
      code: "validation",
      message: "The SMTP server rejected the sender or a recipient address.",
      providerStatus: 550,
      providerCode: "5.1.1",
      providerMessage: "550 5.1.1 No such user",
      retryable: false,
    });
  });

  it.each([
    ["DEPTH_ZERO_SELF_SIGNED_CERT", "self-signed certificate"],
    ["CERT_HAS_EXPIRED", "certificate has expired"],
    [
      "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
      "unable to verify the first certificate",
    ],
    [
      "ERR_TLS_CERT_ALTNAME_INVALID",
      "Hostname/IP does not match certificate's altnames",
    ],
  ])(
    "maps the certificate failure %s to validation",
    async (originalCode, text) => {
      const { adapter } = createAdapter({
        smtp: {
          sendError: smtpError(text, "ESOCKET", undefined, undefined, {
            originalCode,
          }),
        },
      });
      expect(
        await captureError(() => adapter.send(credentials, message)),
      ).toMatchObject({
        code: "validation",
        message: "The SMTP server's certificate could not be verified.",
        retryable: false,
      });
    },
  );

  it("recognises a certificate failure wrapped in a TLS error", async () => {
    const { adapter } = createAdapter({
      smtp: {
        sendError: smtpError(
          "Error initiating TLS - self-signed certificate in certificate chain",
          "ETLS",
        ),
      },
    });
    expect(
      await captureError(() => adapter.send(credentials, message)),
    ).toMatchObject({
      code: "validation",
    });
  });

  it("redacts the password and the username from the server text", async () => {
    const encoded = Buffer.from(
      `\0${credentials.username}\0${credentials.password}`,
    ).toString("base64");
    const { adapter } = createAdapter({
      smtp: {
        sendError: smtpError(
          `Invalid login for ${credentials.username} with ${credentials.password}`,
          "EAUTH",
          535,
          `535 5.7.8 Rejected ${credentials.username} / ${credentials.password} / ${encoded}`,
        ),
      },
    });
    const error = await captureError(() => adapter.send(credentials, message));

    expect(error).toMatchObject({
      code: "invalid_credentials",
      providerMessage:
        "535 5.7.8 Rejected [redacted] / [redacted] / [redacted]",
    });
    expect(exposed(error)).not.toContain(credentials.password);
    expect(exposed(error)).not.toContain(credentials.username);
    expect(exposed(error)).not.toContain(encoded);
    expect((error as Error).cause).toBeUndefined();
  });
});

type ImapRow = [
  label: string,
  message: string,
  fields: Record<string, unknown>,
  expected: IntegrationErrorCode,
];

const imapRows: ImapRow[] = [
  [
    "AUTHENTICATIONFAILED",
    "Command failed",
    {
      authenticationFailed: true,
      serverResponseCode: "AUTHENTICATIONFAILED",
      responseStatus: "NO",
      responseText: "Authentication failed.",
    },
    "invalid_credentials",
  ],
  [
    "Invalid credentials text",
    "Command failed",
    { responseStatus: "NO", responseText: "Invalid credentials (Failure)" },
    "invalid_credentials",
  ],
  [
    "NO on LOGIN",
    "Command failed",
    {
      authenticationFailed: true,
      responseStatus: "NO",
      responseText: "LOGIN failed.",
    },
    "invalid_credentials",
  ],
  [
    "no matching authentication method",
    "No matching authentication method",
    { authenticationFailed: true },
    "invalid_credentials",
  ],
  [
    "app password required",
    "Command failed",
    {
      authenticationFailed: true,
      serverResponseCode: "ALERT",
      responseStatus: "NO",
      responseText:
        "Application-specific password required: https://support.google.com/accounts/answer/185833 (Failure)",
    },
    "blocked_by_policy",
  ],
  [
    "web login required",
    "Command failed",
    {
      authenticationFailed: true,
      serverResponseCode: "ALERT",
      responseStatus: "NO",
      responseText:
        "Please log in via your web browser: https://support.google.com/mail/accounts/answer/78754 (Failure)",
    },
    "blocked_by_policy",
  ],
  [
    "IMAP not enabled",
    "Command failed",
    {
      authenticationFailed: true,
      serverResponseCode: "ALERT",
      responseStatus: "NO",
      responseText:
        "Your account is not enabled for IMAP use. Please visit your Gmail settings page and enable your account for IMAP access. (Failure)",
    },
    "blocked_by_policy",
  ],
  [
    "IMAP disabled",
    "Command failed",
    {
      authenticationFailed: true,
      responseStatus: "NO",
      responseText: "IMAP access is disabled for your domain.",
    },
    "blocked_by_policy",
  ],
  [
    "LOGINDISABLED",
    "Login is disabled",
    { authenticationFailed: true },
    "blocked_by_policy",
  ],
  [
    "too many connections",
    "Command failed",
    {
      authenticationFailed: true,
      serverResponseCode: "ALERT",
      responseStatus: "NO",
      responseText: "Too many simultaneous connections. (Failure)",
    },
    "rate_limited",
  ],
  [
    "THROTTLED",
    "Command failed",
    {
      serverResponseCode: "THROTTLED",
      responseStatus: "NO",
      responseText: "Account is temporarily unavailable.",
    },
    "rate_limited",
  ],
  [
    "ETHROTTLE",
    "Command failed",
    {
      code: "ETHROTTLE",
      responseStatus: "BAD",
      responseText:
        "Request is throttled. Suggested Backoff Time: 4200 milliseconds",
      throttleReset: 4200,
    },
    "rate_limited",
  ],
  [
    "ENOTFOUND",
    "getaddrinfo ENOTFOUND imap.example.com",
    { code: "ENOTFOUND" },
    "temporary",
  ],
  [
    "ECONNREFUSED",
    "connect ECONNREFUSED 127.0.0.1:993",
    { code: "ECONNREFUSED" },
    "temporary",
  ],
  ["ECONNRESET", "read ECONNRESET", { code: "ECONNRESET" }, "temporary"],
  ["ETIMEDOUT", "connect ETIMEDOUT", { code: "ETIMEDOUT" }, "temporary"],
  [
    "connect timeout",
    "Failed to connect in required time",
    { code: "CONNECT_TIMEOUT" },
    "temporary",
  ],
  [
    "greeting timeout",
    "Failed to receive greeting in required time",
    { code: "GREETING_TIMEOUT" },
    "temporary",
  ],
  [
    "socket closed",
    "Connection not available",
    { code: "NoConnection" },
    "temporary",
  ],
  [
    "closed unexpectedly",
    "Unexpected close",
    { code: "EConnectionClosed" },
    "temporary",
  ],
  [
    "TLS upgrade failure",
    "Failed to upgrade connection",
    { tlsFailed: true },
    "temporary",
  ],
  [
    "UNAVAILABLE",
    "Command failed",
    {
      serverResponseCode: "UNAVAILABLE",
      responseStatus: "NO",
      responseText: "Backend down",
    },
    "temporary",
  ],
  [
    "self-signed certificate",
    "self-signed certificate",
    { code: "DEPTH_ZERO_SELF_SIGNED_CERT", tlsFailed: true },
    "validation",
  ],
  [
    "hostname mismatch",
    "Hostname/IP does not match certificate's altnames: Host: imap.example.com. is not in the cert's altnames",
    { code: "ERR_TLS_CERT_ALTNAME_INVALID" },
    "validation",
  ],
  [
    "anything else",
    "Command failed",
    { responseStatus: "BAD", responseText: "Unknown command" },
    "unknown",
  ],
  ["a plain error", "boom", {}, "unknown"],
];

describe("IMAP error mapping", () => {
  it.each(imapRows)("maps %s to %s", async (_label, text, fields, expected) => {
    const { inbox, imap } = createAdapter({
      imap: { throws: { connect: imapError(text, fields) } },
    });
    const error = await captureError(() => inbox.search(credentials, query));

    expect(error).toBeInstanceOf(IntegrationError);
    expect(error).toMatchObject({ code: expected });
    expect((error as Error).message).toMatch(/^[A-Z].*\.$/);
    expect(exposed(error)).not.toContain(credentials.password);
    expect(imap.names()).toEqual(["on", "connect", "close"]);
    expect(imap.allClosed()).toBe(true);
  });

  it("maps the same failures when a later command throws", async () => {
    const { inbox, imap } = createAdapter({
      imap: {
        throws: {
          mailboxOpen: imapError("Connection not available", {
            code: "NoConnection",
          }),
        },
      },
    });
    const error = await captureError(() => inbox.search(credentials, query));
    expect(error).toMatchObject({
      code: "temporary",
      message: "The IMAP server could not be reached.",
      providerCode: "NoConnection",
    });
    expect(imap.names().at(-1)).toBe("logout");
  });

  it("turns the suggested back-off into retryAfterSeconds", async () => {
    const { inbox } = createAdapter({
      imap: {
        throws: {
          connect: imapError("Command failed", {
            code: "ETHROTTLE",
            responseText:
              "Request is throttled. Suggested Backoff Time: 4200 milliseconds",
            throttleReset: 4200,
          }),
        },
      },
    });
    expect(
      await captureError(() => inbox.search(credentials, query)),
    ).toMatchObject({
      code: "rate_limited",
      retryAfterSeconds: 5,
      retryable: true,
    });
  });

  it("says clearly that the certificate could not be verified", async () => {
    const { adapter } = createAdapter({
      imap: {
        throws: {
          connect: imapError("certificate has expired", {
            code: "CERT_HAS_EXPIRED",
          }),
        },
      },
    });
    expect(await captureError(() => adapter.verify(credentials))).toMatchObject(
      {
        code: "validation",
        message: "The IMAP server's certificate could not be verified.",
      },
    );
  });

  it("redacts the password and the username from the server text", async () => {
    const { inbox } = createAdapter({
      imap: {
        throws: {
          connect: imapError(`Login failed for ${credentials.password}`, {
            authenticationFailed: true,
            responseStatus: "NO",
            responseText: `LOGIN ${credentials.username} ${credentials.password} rejected`,
            response: `A1 NO LOGIN ${credentials.username} ${credentials.password} rejected`,
          }),
        },
      },
    });
    const error = await captureError(() => inbox.search(credentials, query));

    expect(error).toMatchObject({
      code: "invalid_credentials",
      providerMessage: "LOGIN [redacted] [redacted] rejected",
    });
    expect(exposed(error)).not.toContain(credentials.password);
    expect(exposed(error)).not.toContain(credentials.username);
    expect((error as Error).cause).toBeUndefined();
  });
});
