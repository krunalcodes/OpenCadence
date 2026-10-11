import { IntegrationError } from "@workspace/integration-core";
import { describe, expect, it } from "vitest";
import { captureError, createAdapter, fullKey } from "./helpers";

const message = {
  from: { email: "ada@example.com" },
  to: ["grace@example.com"],
  subject: "Hello",
  text: "Hello",
};

const rows: [number, string | undefined, string, string][] = [
  [401, "missing_api_key", "Missing API key", "invalid_credentials"],
  [403, "invalid_api_key", "API key is invalid", "invalid_credentials"],
  [401, "unheard_of", "Nope", "invalid_credentials"],
  [403, "unheard_of", "Nope", "invalid_credentials"],
  [403, "validation_error", "Something else", "validation"],
  [401, "restricted_api_key", "Restricted key", "insufficient_permission"],
  [429, "rate_limit_exceeded", "Too many requests", "rate_limited"],
  [429, "unheard_of", "Slow down", "rate_limited"],
  [429, undefined, "Slow down", "rate_limited"],
  [429, "daily_quota_exceeded", "Daily quota reached", "quota_reached"],
  [429, "monthly_quota_exceeded", "Monthly quota reached", "quota_reached"],
  [
    403,
    "validation_error",
    "The example.com domain is not verified. Please, add and verify your domain.",
    "domain_not_verified",
  ],
  [
    403,
    "validation_error",
    "You can only send testing emails to your own email address (you@example.com).",
    "domain_not_verified",
  ],
  [400, "validation_error", "Invalid from field", "validation"],
  [400, "invalid_idempotency_key", "Bad key", "validation"],
  [422, "validation_error", "Missing to field", "validation"],
  [422, "missing_required_field", "Missing subject", "validation"],
  [422, "invalid_from_address", "Bad from", "validation"],
  [409, "invalid_idempotent_request", "Payload differs", "validation"],
  [404, "not_found", "Not found", "validation"],
  [405, "method_not_allowed", "Method not allowed", "validation"],
  [409, "concurrent_idempotent_requests", "In progress", "temporary"],
  [409, "resource_locked", "Locked", "temporary"],
  [500, "application_error", "Internal error", "temporary"],
  [503, undefined, "Unavailable", "temporary"],
  [409, "unheard_of", "Conflict", "unknown"],
  [418, "teapot", "Teapot", "unknown"],
];

describe("error mapping", () => {
  it.each(rows)("maps %i %s (%s) to %s", async (status, name, text, code) => {
    const { adapter } = createAdapter({
      status,
      body: { statusCode: status, name, message: text },
    });
    const error = await captureError(() => adapter.send(fullKey, message));

    expect(error).toBeInstanceOf(IntegrationError);
    expect(error).toMatchObject({
      code,
      providerStatus: status,
      providerCode: name,
      providerMessage: text,
      retryAfterSeconds: undefined,
    });
    const shown = (error as Error).message;
    expect(shown).toMatch(/^[A-Z].*\.$/);
    expect(shown).not.toContain(fullKey.apiKey);
  });

  it("uses plain messages a user can read", async () => {
    const rejected = createAdapter({
      status: 403,
      body: { name: "invalid_api_key", message: "API key is invalid" },
    });
    expect(
      await captureError(() => rejected.adapter.send(fullKey, message)),
    ).toMatchObject({ message: "Resend rejected the API key." });

    const unverified = createAdapter({
      status: 403,
      body: {
        name: "validation_error",
        message: "The example.com domain is not verified.",
      },
    });
    expect(
      await captureError(() => unverified.adapter.send(fullKey, message)),
    ).toMatchObject({
      message: "The sending domain is not verified in this Resend account.",
    });
  });

  it("reads the retry-after header", async () => {
    const { adapter } = createAdapter({
      status: 429,
      body: { name: "rate_limit_exceeded", message: "Too many requests" },
      headers: { "Retry-After": "7" },
    });
    const error = await captureError(() => adapter.send(fullKey, message));
    expect(error).toMatchObject({
      code: "rate_limited",
      retryAfterSeconds: 7,
      retryable: true,
    });
  });

  it("falls back to the HTTP status when the body is not JSON", async () => {
    const { adapter } = createAdapter({ status: 502 });
    const error = await captureError(() => adapter.send(fullKey, message));
    expect(error).toMatchObject({
      code: "temporary",
      providerStatus: 502,
      providerCode: undefined,
      providerMessage: undefined,
    });
  });

  it("maps a network failure to temporary", async () => {
    const cause = new TypeError("fetch failed");
    const { adapter } = createAdapter(cause);
    const error = await captureError(() => adapter.send(fullKey, message));
    expect(error).toMatchObject({
      code: "temporary",
      message: "Resend could not be reached.",
      cause,
    });
  });

  it("redacts the API key from a provider message", async () => {
    const { adapter } = createAdapter({
      status: 400,
      body: {
        name: "validation_error",
        message: `Bad header Bearer ${fullKey.apiKey}`,
      },
    });
    const error = await captureError(() => adapter.send(fullKey, message));
    expect(JSON.stringify(error)).not.toContain(fullKey.apiKey);
    expect(error).toMatchObject({
      providerMessage: "Bad header Bearer [redacted]",
    });
  });
});
