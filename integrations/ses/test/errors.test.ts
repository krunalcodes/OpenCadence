import type {
  IntegrationError,
  IntegrationErrorCode,
} from "@workspace/integration-core";
import { describe, expect, it } from "vitest";
import {
  accessKey,
  awsError,
  captureError,
  createAdapter,
  networkError,
} from "./helpers";

const message = {
  from: { email: "ada@example.com", name: "Ada" },
  to: ["grace@example.org"],
  subject: "Quarterly figures",
  html: "<p>Confidential figures</p>",
};

async function sendError(reply: Error) {
  const { adapter } = createAdapter({ SendEmailCommand: reply });
  return (await captureError(() =>
    adapter.send(accessKey, message),
  )) as IntegrationError;
}

describe("send errors", () => {
  it.each<[string, string, number, IntegrationErrorCode, boolean]>([
    [
      "MessageRejected",
      "Email address is not verified. The following identities failed the check in region EU-WEST-1: ada@example.com",
      400,
      "domain_not_verified",
      false,
    ],
    [
      "MessageRejected",
      "Email address is not verified. The following identities failed the check in region EU-WEST-1: example.com, grace@example.org",
      400,
      "domain_not_verified",
      false,
    ],
    [
      "MessageRejected",
      "Email address is not verified. The following identities failed the check in region EU-WEST-1: grace@example.org",
      400,
      "blocked_by_policy",
      false,
    ],
    ["MessageRejected", "Account is paused", 400, "blocked_by_policy", false],
    ["MessageRejected", "Bad content", 400, "validation", false],
    [
      "MailFromDomainNotVerifiedException",
      "Mail FROM domain is not verified",
      400,
      "domain_not_verified",
      false,
    ],
    [
      "AccountSuspendedException",
      "Sending suspended",
      400,
      "blocked_by_policy",
      false,
    ],
    [
      "SendingPausedException",
      "Sending paused for this account",
      400,
      "blocked_by_policy",
      false,
    ],
    [
      "LimitExceededException",
      "Daily message quota exceeded",
      400,
      "quota_reached",
      false,
    ],
    [
      "ThrottlingException",
      "Daily message quota exceeded.",
      400,
      "quota_reached",
      false,
    ],
    [
      "LimitExceededException",
      "Maximum sending rate exceeded",
      400,
      "rate_limited",
      true,
    ],
    [
      "ThrottlingException",
      "Maximum sending rate exceeded.",
      400,
      "rate_limited",
      true,
    ],
    ["Throttling", "Rate exceeded", 400, "rate_limited", true],
    [
      "TooManyRequestsException",
      "Too many requests",
      429,
      "rate_limited",
      true,
    ],
    ["BadRequestException", "Invalid header", 400, "validation", false],
    ["ValidationException", "1 validation error", 400, "validation", false],
    [
      "NotFoundException",
      "Configuration set does not exist",
      404,
      "validation",
      false,
    ],
    [
      "UnrecognizedClientException",
      "The security token included in the request is invalid.",
      403,
      "invalid_credentials",
      false,
    ],
    [
      "InvalidSignatureException",
      "The request signature we calculated does not match the signature you provided.",
      403,
      "invalid_credentials",
      false,
    ],
    [
      "InvalidSignatureException",
      "Signature expired: 20261011T093000Z is now earlier than 20261011T100000Z",
      403,
      "temporary",
      true,
    ],
    ["OptInRequired", "Not subscribed", 403, "insufficient_permission", false],
    ["InternalFailure", "Internal error", 500, "temporary", true],
    ["ServiceUnavailable", "Unavailable", 503, "temporary", true],
    ["SomethingNew", "Unexpected", 502, "temporary", true],
    ["SomethingNew", "Unexpected", 418, "validation", false],
    ["SomethingNew", "Forbidden", 403, "invalid_credentials", false],
  ])("maps %s (%s)", async (name, text, status, code, retryable) => {
    const error = await sendError(awsError(name, text, status));

    expect(error.name).toBe("IntegrationError");
    expect(error.code).toBe(code);
    expect(error.retryable).toBe(retryable);
    expect(error.providerCode).toBe(name);
    expect(error.providerStatus).toBe(status);
    expect(error.providerMessage).toBe(text);
  });

  it("explains the sandbox when only a recipient failed the check", async () => {
    const error = await sendError(
      awsError(
        "MessageRejected",
        "Email address is not verified. The following identities failed the check in region EU-WEST-1: grace@example.org",
        400,
      ),
    );

    expect(error.message).toContain("sandbox");
    expect(error.message).toContain("eu-west-1");
  });

  it("names the permission AWS reported", async () => {
    const error = await sendError(
      awsError(
        "AccessDeniedException",
        "User: arn:aws:iam::123456789012:user/mailer is not authorized to perform: ses:SendEmail on resource: arn:aws:ses:eu-west-1:123456789012:identity/example.com",
        403,
      ),
    );

    expect(error.code).toBe("insufficient_permission");
    expect(error.message).toBe(
      "The access key is not allowed to call ses:SendEmail. Add ses:SendEmail to its IAM policy.",
    );
  });

  it("falls back to the permission of the call it made", async () => {
    const error = await sendError(awsError("AccessDeniedException", "", 403));

    expect(error.message).toContain("ses:SendEmail");
  });

  it("uses a default delay for throttling and honours Retry-After", async () => {
    const plain = await sendError(
      awsError("TooManyRequestsException", "Too many requests", 429),
    );
    const hinted = await sendError(
      awsError("TooManyRequestsException", "Too many requests", 429, {
        "Retry-After": "12",
      }),
    );
    const quota = await sendError(
      awsError("ThrottlingException", "Daily message quota exceeded", 400),
    );

    expect(plain.retryAfterSeconds).toBe(5);
    expect(hinted.retryAfterSeconds).toBe(12);
    expect(quota.retryAfterSeconds).toBeUndefined();
  });

  it.each(["ECONNRESET", "ETIMEDOUT", "EPIPE"])(
    "treats the network failure %s as temporary",
    async (code) => {
      const error = await sendError(networkError(code));

      expect(error.code).toBe("temporary");
      expect(error.retryable).toBe(true);
      expect(error.providerStatus).toBeUndefined();
    },
  );

  it("treats a timeout without a response as temporary", async () => {
    const timeout = Object.assign(new Error("socket timed out"), {
      name: "TimeoutError",
    });

    const error = await sendError(timeout);

    expect(error.code).toBe("temporary");
  });

  it("never exposes the secret key or the message content", async () => {
    const error = await sendError(
      awsError(
        "BadRequestException",
        `Bad credential scope for ${accessKey.secretAccessKey}`,
        400,
      ),
    );

    const serialized = JSON.stringify({
      ...error,
      message: error.message,
      cause: String(error.cause),
    });
    expect(serialized).not.toContain(accessKey.secretAccessKey);
    expect(serialized).not.toContain("Confidential figures");
    expect(serialized).not.toContain("Quarterly figures");
    expect(error.providerMessage).toBe("Bad credential scope for [redacted]");
    expect(error.cause).toBeUndefined();
  });

  it("truncates a long provider message", async () => {
    const error = await sendError(
      awsError("BadRequestException", "x".repeat(2000), 400),
    );

    expect(error.providerMessage).toHaveLength(500);
  });
});
