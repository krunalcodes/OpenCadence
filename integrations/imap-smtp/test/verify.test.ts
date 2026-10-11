import { IntegrationError } from "@workspace/integration-core";
import { describe, expect, it } from "vitest";
import { createImapSmtpAdapter } from "../src/index";
import {
  captureError,
  createAdapter,
  createFakeImap,
  createFakeSmtp,
  credentials,
  exposed,
  imapError,
  smtpError,
} from "./helpers";

describe("adapter", () => {
  it("describes itself", () => {
    const adapter = createImapSmtpAdapter();
    expect(adapter).toMatchObject({
      type: "imap-smtp",
      name: "IMAP/SMTP",
      auth: "password",
      capabilities: ["send", "replies", "warmup"],
    });
    expect(adapter.inbox).toBeDefined();
    expect(adapter.oauth).toBeUndefined();
    expect(adapter.webhooks).toBeUndefined();
  });

  it("rejects credentials that are not a password", async () => {
    const { adapter, inbox, imap, smtp } = createAdapter();
    const apiKey = { kind: "api_key", apiKey: "re_key" } as const;
    const attempts = [
      () => adapter.verify(apiKey),
      () =>
        adapter.send(apiKey, {
          from: { email: "ada@example.com" },
          to: ["grace@example.org"],
          subject: "Hello",
        }),
      () =>
        inbox.search(apiKey, {
          messageId: "<a@example.com>",
          since: new Date(),
          includeSpam: true,
        }),
      () => inbox.applyActions(apiKey, { providerMessageId: "1" }, []),
      () => inbox.ensureFolder(apiKey, "Warm-up"),
    ];
    for (const attempt of attempts) {
      const error = await captureError(attempt);
      expect(error).toBeInstanceOf(IntegrationError);
      expect(error).toMatchObject({ code: "invalid_credentials" });
    }
    expect(imap.calls).toEqual([]);
    expect(smtp.calls).toEqual([]);
  });

  it("rejects incomplete server settings", async () => {
    const { adapter } = createAdapter();
    const error = await captureError(() =>
      adapter.verify({
        ...credentials,
        imap: { host: "", port: 993, security: "tls" },
      }),
    );
    expect(error).toMatchObject({
      code: "invalid_credentials",
      message: "The SMTP and IMAP server settings are incomplete.",
    });
  });
});

describe("verify", () => {
  it("checks both servers and reports the mailbox settings", async () => {
    const { adapter, imap, smtp } = createAdapter({
      imap: {
        mailboxes: [
          { path: "INBOX" },
          { path: "Spam" },
          { path: "Bulk", specialUse: "\\Junk" },
        ],
      },
    });
    const result = await adapter.verify(credentials);

    expect(result).toEqual({
      account: { email: "ada@example.com" },
      settings: {
        smtpHost: "smtp.example.com",
        smtpPort: 465,
        imapHost: "imap.example.com",
        imapPort: 143,
        spamFolder: "Bulk",
        supportsGmailLabels: false,
      },
    });
    expect(smtp.calls).toEqual(["verify", "close"]);
    expect(imap.names()).toEqual(["on", "connect", "list", "logout"]);
  });

  it("enforces TLS, certificate checks and timeouts on both connections", async () => {
    const { adapter, imap, smtp } = createAdapter();
    await adapter.verify(credentials);

    expect(smtp.options[0]).toMatchObject({
      host: "smtp.example.com",
      port: 465,
      secure: true,
      requireTLS: false,
      auth: { user: credentials.username, pass: credentials.password },
      tls: { rejectUnauthorized: true },
      connectionTimeout: 20_000,
      greetingTimeout: 20_000,
      socketTimeout: 20_000,
      disableFileAccess: true,
      disableUrlAccess: true,
      logger: false,
    });
    expect(imap.options[0]).toMatchObject({
      host: "imap.example.com",
      port: 143,
      secure: false,
      doSTARTTLS: true,
      auth: { user: credentials.username, pass: credentials.password },
      tls: { rejectUnauthorized: true },
      connectionTimeout: 20_000,
      greetingTimeout: 20_000,
      socketTimeout: 20_000,
    });
    expect(typeof imap.options[0]?.logger).toBe("object");
  });

  it("maps the security setting for each server and honours timeoutMs", async () => {
    const imap = createFakeImap();
    const smtp = createFakeSmtp();
    const adapter = createImapSmtpAdapter({
      connect: imap.connect,
      transport: smtp.transport,
      timeoutMs: 5_000,
    });
    await adapter.verify({
      ...credentials,
      smtp: { host: "smtp.example.com", port: 587, security: "starttls" },
      imap: { host: "imap.example.com", port: 993, security: "tls" },
    });
    expect(smtp.options[0]).toMatchObject({
      secure: false,
      requireTLS: true,
      connectionTimeout: 5_000,
    });
    expect(imap.options[0]).toMatchObject({
      secure: true,
      socketTimeout: 5_000,
    });
    expect(imap.options[0]?.doSTARTTLS).toBeUndefined();
  });

  it("reports Gmail label support and a missing spam folder", async () => {
    const { adapter } = createAdapter({
      imap: { gmail: true, mailboxes: [{ path: "INBOX" }, { path: "Sent" }] },
    });
    const result = await adapter.verify({ ...credentials, username: "ada" });
    expect(result.account).toEqual({});
    expect(result.settings).toMatchObject({
      spamFolder: null,
      supportsGmailLabels: true,
    });
  });

  it("falls back to a common spam folder name", async () => {
    const { adapter } = createAdapter({
      imap: { mailboxes: [{ path: "INBOX" }, { path: "[Gmail]/Spam" }] },
    });
    const result = await adapter.verify(credentials);
    expect(result.settings.spamFolder).toBe("[Gmail]/Spam");
  });

  it("names the SMTP side when it rejects the sign-in", async () => {
    const { adapter, imap, smtp } = createAdapter({
      smtp: {
        verifyError: smtpError(
          "Invalid login: 535-5.7.8 Username and Password not accepted.",
          "EAUTH",
          535,
          "535-5.7.8 Username and Password not accepted.\n535 5.7.8 Learn more",
          { command: "AUTH PLAIN" },
        ),
      },
    });
    const error = await captureError(() => adapter.verify(credentials));

    expect(error).toBeInstanceOf(IntegrationError);
    expect(error).toMatchObject({
      code: "invalid_credentials",
      providerStatus: 535,
      providerCode: "5.7.8",
    });
    expect((error as Error).message).toContain(
      "The SMTP server rejected the sign-in.",
    );
    expect((error as Error).message).toContain("app password");
    expect(smtp.calls).toEqual(["verify", "close"]);
    expect(imap.calls).toEqual([]);
  });

  it("names the IMAP side when it rejects the sign-in", async () => {
    const { adapter, imap, smtp } = createAdapter({
      imap: {
        throws: {
          connect: imapError("Command failed", {
            authenticationFailed: true,
            serverResponseCode: "AUTHENTICATIONFAILED",
            responseStatus: "NO",
            responseText: "Invalid credentials (Failure)",
            response:
              "A2 NO [AUTHENTICATIONFAILED] Invalid credentials (Failure)",
          }),
        },
      },
    });
    const error = await captureError(() => adapter.verify(credentials));

    expect(error).toMatchObject({
      code: "invalid_credentials",
      providerCode: "AUTHENTICATIONFAILED",
      providerMessage: "Invalid credentials (Failure)",
    });
    expect((error as Error).message).toContain(
      "The IMAP server rejected the sign-in.",
    );
    expect((error as Error).message).toContain("app password");
    expect(smtp.calls).toEqual(["verify", "close"]);
    expect(imap.names()).toEqual(["on", "connect", "close"]);
    expect(imap.allClosed()).toBe(true);
    expect(exposed(error)).not.toContain(credentials.password);
  });

  it("closes the IMAP connection when listing fails", async () => {
    const { adapter, imap } = createAdapter({
      imap: {
        throws: {
          list: imapError("Connection not available", { code: "NoConnection" }),
        },
      },
    });
    const error = await captureError(() => adapter.verify(credentials));
    expect(error).toMatchObject({ code: "temporary" });
    expect(imap.names()).toEqual(["on", "connect", "list", "logout"]);
    expect(imap.allClosed()).toBe(true);
  });

  it("destroys the socket when logout fails", async () => {
    const { adapter, imap } = createAdapter({
      imap: { throws: { logout: new Error("socket hang up") } },
    });
    await adapter.verify(credentials);
    expect(imap.names()).toEqual(["on", "connect", "list", "logout", "close"]);
    expect(imap.allClosed()).toBe(true);
  });
});
