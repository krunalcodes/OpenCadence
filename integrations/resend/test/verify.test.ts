import { IntegrationError } from "@workspace/integration-core";
import { describe, expect, it } from "vitest";
import { createResendAdapter } from "../src/index";
import {
  captureError,
  createAdapter,
  createFakeFetch,
  fullKey,
} from "./helpers";

describe("adapter", () => {
  it("describes itself", () => {
    const { adapter } = createAdapter();
    expect(adapter.type).toBe("resend");
    expect(adapter.name).toBe("Resend");
    expect(adapter.auth).toBe("api_key");
    expect(adapter.capabilities).toEqual(["send", "volume", "webhooks"]);
    expect(adapter.webhooks).toBeDefined();
    expect(adapter.oauth).toBeUndefined();
  });

  it("uses the configured base URL and user agent", async () => {
    const fake = createFakeFetch({ body: { data: [] } });
    const adapter = createResendAdapter({
      fetch: fake.fetch,
      baseUrl: "https://resend.test/",
      userAgent: "Custom/1.0",
    });
    await adapter.verify(fullKey);
    expect(fake.calls[0]?.url).toBe("https://resend.test/domains");
    expect(fake.calls[0]?.headers["User-Agent"]).toBe("Custom/1.0");
  });
});

describe("verify", () => {
  it("returns domains for a full access key", async () => {
    const { adapter, calls } = createAdapter({
      body: {
        data: [
          {
            id: "d_1",
            name: "example.com",
            status: "verified",
            region: "us-east-1",
            open_tracking: true,
            click_tracking: false,
            created_at: "2026-01-01",
          },
          {
            id: "d_2",
            name: "example.org",
            status: "pending",
            region: "eu-west-1",
          },
        ],
      },
    });

    const result = await adapter.verify(fullKey);

    expect(result).toEqual({
      account: {},
      settings: {
        permission: "full",
        domains: [
          {
            id: "d_1",
            name: "example.com",
            status: "verified",
            region: "us-east-1",
            openTracking: true,
            clickTracking: false,
          },
          {
            id: "d_2",
            name: "example.org",
            status: "pending",
            region: "eu-west-1",
            openTracking: undefined,
            clickTracking: undefined,
          },
        ],
      },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      url: "https://api.resend.com/domains",
      method: "GET",
      body: undefined,
    });
    expect(calls[0]?.headers).toEqual({
      Authorization: "Bearer re_full_access_key",
      "User-Agent": "OpenCadence",
    });
  });

  it("accepts a sending-only key", async () => {
    const { adapter } = createAdapter({
      status: 401,
      body: {
        statusCode: 401,
        name: "restricted_api_key",
        message: "This API key is restricted to only send emails",
      },
    });

    expect(await adapter.verify(fullKey)).toEqual({
      account: {},
      settings: { permission: "sending", domains: [] },
    });
  });

  it("rejects a key with the wrong prefix without calling Resend", async () => {
    const { adapter, calls } = createAdapter();
    const error = await captureError(() =>
      adapter.verify({ kind: "api_key", apiKey: "sk_wrong_secret" }),
    );

    expect(error).toBeInstanceOf(IntegrationError);
    expect(error).toMatchObject({ code: "invalid_credentials" });
    expect((error as Error).message).not.toContain("sk_wrong_secret");
    expect(calls).toHaveLength(0);
  });

  it("rejects credentials that are not an API key", async () => {
    const { adapter, calls } = createAdapter();
    const error = await captureError(() =>
      adapter.verify({ kind: "oauth2", refreshToken: "token", scopes: [] }),
    );

    expect(error).toMatchObject({ code: "invalid_credentials" });
    expect(calls).toHaveLength(0);
  });

  it.each([
    [401, "missing_api_key"],
    [403, "invalid_api_key"],
    [401, "something_new"],
    [403, "validation_error"],
    [403, undefined],
  ])("rejects a key Resend answers with %i %s", async (status, name) => {
    const { adapter } = createAdapter({
      status,
      body: { statusCode: status, name, message: "API key is invalid" },
    });
    const error = await captureError(() => adapter.verify(fullKey));

    expect(error).toMatchObject({
      code: "invalid_credentials",
      message: "Resend rejected the API key.",
      providerStatus: status,
      providerCode: name,
    });
  });

  it("keeps other failures as they are", async () => {
    const { adapter } = createAdapter({ status: 503, body: {} });
    const error = await captureError(() => adapter.verify(fullKey));
    expect(error).toMatchObject({ code: "temporary", providerStatus: 503 });
  });
});
