import type { ConfigService } from "@nestjs/config";
import { gmailReadScope } from "@workspace/integration-gmail";
import type { Env } from "../../config/env";
import { AdapterRegistry } from "./adapter-registry";

function registry(env: Partial<Env>) {
  const config = {
    get: (key: keyof Env) => env[key],
  } as unknown as ConfigService<Env, true>;
  return new AdapterRegistry(config);
}

const gmail = { GMAIL_CLIENT_ID: "id", GMAIL_CLIENT_SECRET: "secret" };
const outlook = {
  OUTLOOK_CLIENT_ID: "id",
  OUTLOOK_CLIENT_SECRET: "secret",
  OUTLOOK_TENANT: "common",
};

describe("AdapterRegistry", () => {
  it("always offers the key based sources and no mailbox without a client", () => {
    const adapters = registry({});
    expect(adapters.has("resend")).toBe(true);
    expect(adapters.has("imap-smtp")).toBe(true);
    expect(adapters.find("ses")?.auth).toBe("access_key");
    expect(adapters.find("ses")?.inbox).toBeUndefined();
    expect(adapters.has("gmail")).toBe(false);
    expect(adapters.has("outlook")).toBe(false);
    expect(adapters.oauth("gmail", "send")).toBeNull();
    expect(adapters.oauth("outlook", "inbox")).toBeNull();
  });

  it("connects Gmail for sending only while the read scope is off", () => {
    const adapters = registry({ ...gmail, GMAIL_READ_SCOPE_ENABLED: false });
    expect(adapters.find("gmail")?.inbox).toBeUndefined();
    expect(adapters.oauth("gmail", "send")?.scopes).not.toContain(
      gmailReadScope,
    );
    expect(adapters.oauth("gmail", "inbox")).toBeNull();
  });

  it("asks for the Gmail read scope only for the inbox grant", () => {
    const adapters = registry({ ...gmail, GMAIL_READ_SCOPE_ENABLED: true });
    expect(adapters.find("gmail")?.inbox?.listReceived).toBeDefined();
    expect(adapters.find("gmail")?.capabilities).not.toContain("warmup");
    expect(adapters.oauth("gmail", "send")?.scopes).not.toContain(
      gmailReadScope,
    );
    expect(adapters.oauth("gmail", "inbox")?.scopes).toContain(gmailReadScope);
  });

  it("registers Outlook with and without Mail.Read", () => {
    const on = registry({ ...outlook, OUTLOOK_READ_SCOPE_ENABLED: true });
    expect(on.oauth("outlook", "send")?.scopes).not.toContain("Mail.Read");
    expect(on.oauth("outlook", "inbox")?.scopes).toContain("Mail.Read");
    expect(on.find("outlook")?.capabilities).not.toContain("warmup");

    const off = registry({ ...outlook, OUTLOOK_READ_SCOPE_ENABLED: false });
    expect(off.has("outlook")).toBe(true);
    expect(off.find("outlook")?.inbox).toBeUndefined();
    expect(off.oauth("outlook", "inbox")).toBeNull();
  });
});
