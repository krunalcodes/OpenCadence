import { createHmac } from "node:crypto";
import {
  IntegrationError,
  type ProviderEventType,
} from "@workspace/integration-core";
import { describe, expect, it } from "vitest";
import { captureError, createAdapter, fullKey } from "./helpers";

const secretKey = Buffer.from("opencadence-test-signing-secret");
const signingSecret = `whsec_${secretKey.toString("base64")}`;

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function sign(id: string, timestamp: number, rawBody: string, key = secretKey) {
  return createHmac("sha256", key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");
}

function signedRequest(payload: unknown, timestamp = nowSeconds()) {
  const rawBody = JSON.stringify(payload);
  return {
    rawBody,
    signingSecret,
    headers: {
      "svix-id": "msg_1",
      "svix-timestamp": String(timestamp),
      "svix-signature": `v1,${sign("msg_1", timestamp, rawBody)}`,
    } as Record<string, string | undefined>,
  };
}

function parse(request: ReturnType<typeof signedRequest>) {
  const { adapter } = createAdapter();
  if (!adapter.webhooks) {
    throw new Error("The adapter has no webhook support.");
  }
  return adapter.webhooks.parse(request);
}

const delivered = {
  type: "email.delivered",
  created_at: "2026-10-11T09:30:00.000Z",
  data: { email_id: "email_1", to: ["grace@example.com"] },
};

describe("webhooks.register", () => {
  it("creates a webhook for the delivery events", async () => {
    const { adapter, calls } = createAdapter({
      status: 201,
      body: { object: "webhook", id: "wh_1", signing_secret: signingSecret },
    });

    const result = await adapter.webhooks?.register(
      fullKey,
      "https://app.example.com/hooks/resend",
    );

    expect(result).toEqual({ externalId: "wh_1", signingSecret });
    expect(calls[0]).toMatchObject({
      url: "https://api.resend.com/webhooks",
      method: "POST",
      body: {
        endpoint: "https://app.example.com/hooks/resend",
        events: [
          "email.sent",
          "email.delivered",
          "email.delivery_delayed",
          "email.bounced",
          "email.complained",
          "email.failed",
          "email.suppressed",
        ],
      },
    });
    expect(calls[0]?.headers["Content-Type"]).toBe("application/json");
  });

  it("reports a sending-only key as lacking permission", async () => {
    const { adapter } = createAdapter({
      status: 401,
      body: { name: "restricted_api_key", message: "Restricted key" },
    });
    const error = await captureError(() =>
      adapter.webhooks?.register(fullKey, "https://app.example.com/hooks"),
    );
    expect(error).toMatchObject({
      code: "insufficient_permission",
      providerStatus: 401,
      providerCode: "restricted_api_key",
    });
  });

  it("fails when the response has no signing secret", async () => {
    const { adapter } = createAdapter({ body: { id: "wh_1" } });
    const error = await captureError(() =>
      adapter.webhooks?.register(fullKey, "https://app.example.com/hooks"),
    );
    expect(error).toMatchObject({ code: "unknown" });
  });
});

describe("webhooks.unregister", () => {
  it("deletes the webhook", async () => {
    const { adapter, calls } = createAdapter({
      body: { object: "webhook", id: "wh_1", deleted: true },
    });
    await adapter.webhooks?.unregister(fullKey, "wh_1");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      url: "https://api.resend.com/webhooks/wh_1",
      method: "DELETE",
      body: undefined,
    });
    expect(calls[0]?.headers).not.toHaveProperty("Content-Type");
  });

  it("treats a missing webhook as removed", async () => {
    const { adapter } = createAdapter({
      status: 404,
      body: { name: "not_found", message: "Webhook not found" },
    });
    await expect(
      adapter.webhooks?.unregister(fullKey, "wh_gone"),
    ).resolves.toBeUndefined();
  });

  it("passes other failures on", async () => {
    const { adapter } = createAdapter({ status: 500, body: {} });
    const error = await captureError(() =>
      adapter.webhooks?.unregister(fullKey, "wh_1"),
    );
    expect(error).toMatchObject({ code: "temporary" });
  });
});

describe("webhooks.parse", () => {
  it("parses a correctly signed payload", () => {
    expect(parse(signedRequest(delivered))).toEqual({
      id: "msg_1",
      type: "delivered",
      rawType: "email.delivered",
      occurredAt: new Date("2026-10-11T09:30:00.000Z"),
      providerMessageId: "email_1",
      recipients: ["grace@example.com"],
      bounce: undefined,
      reason: undefined,
    });
  });

  it("looks headers up without regard to case", () => {
    const request = signedRequest(delivered);
    const headers = {
      "Svix-Id": request.headers["svix-id"],
      "SVIX-TIMESTAMP": request.headers["svix-timestamp"],
      "Svix-Signature": request.headers["svix-signature"],
    };
    expect(parse({ ...request, headers }).type).toBe("delivered");
  });

  it("accepts any matching v1 entry among several", () => {
    const request = signedRequest(delivered);
    const other = sign(
      "msg_1",
      Number(request.headers["svix-timestamp"]),
      request.rawBody,
      Buffer.from("a rotated secret"),
    );
    request.headers["svix-signature"] =
      `v1,${other} v2,ignored ${request.headers["svix-signature"]}`;
    expect(parse(request).id).toBe("msg_1");
  });

  it.each([
    [
      "a wrong signature",
      (request: ReturnType<typeof signedRequest>) => {
        request.headers["svix-signature"] = `v1,${sign(
          "msg_1",
          nowSeconds(),
          request.rawBody,
          Buffer.from("another secret"),
        )}`;
      },
    ],
    [
      "a changed body",
      (request: ReturnType<typeof signedRequest>) => {
        request.rawBody = request.rawBody.replace("grace", "mallory");
      },
    ],
    [
      "a signature that is not v1",
      (request: ReturnType<typeof signedRequest>) => {
        request.headers["svix-signature"] = String(
          request.headers["svix-signature"],
        ).replace("v1,", "v2,");
      },
    ],
    [
      "a missing signature header",
      (request: ReturnType<typeof signedRequest>) => {
        request.headers["svix-signature"] = undefined;
      },
    ],
    [
      "a missing id header",
      (request: ReturnType<typeof signedRequest>) => {
        request.headers["svix-id"] = undefined;
      },
    ],
    [
      "an empty signing secret",
      (request: ReturnType<typeof signedRequest>) => {
        request.signingSecret = "whsec_";
      },
    ],
  ])("rejects %s", async (_, tamper) => {
    const request = signedRequest(delivered);
    tamper(request);
    const error = await captureError(() => parse(request));

    expect(error).toBeInstanceOf(IntegrationError);
    expect(error).toMatchObject({
      code: "invalid_credentials",
      message: "The webhook signature is not valid.",
    });
    expect(JSON.stringify(error)).not.toContain(signingSecret);
  });

  it.each([
    ["old", -301],
    ["from the future", 301],
  ])("rejects a timestamp that is %s", async (_, offset) => {
    const error = await captureError(() =>
      parse(signedRequest(delivered, nowSeconds() + offset)),
    );
    expect(error).toMatchObject({ code: "invalid_credentials" });
    expect((error as Error).message).toMatch(/timestamp/);
  });

  it("accepts a timestamp inside the tolerance", () => {
    expect(parse(signedRequest(delivered, nowSeconds() - 240)).id).toBe(
      "msg_1",
    );
  });

  it("rejects a signed body that is not JSON", async () => {
    const timestamp = nowSeconds();
    const error = await captureError(() =>
      parse({
        rawBody: "not json",
        signingSecret,
        headers: {
          "svix-id": "msg_1",
          "svix-timestamp": String(timestamp),
          "svix-signature": `v1,${sign("msg_1", timestamp, "not json")}`,
        },
      }),
    );
    expect(error).toMatchObject({ code: "validation" });
  });

  const mappings: [string, ProviderEventType][] = [
    ["email.sent", "sent"],
    ["email.delivered", "delivered"],
    ["email.delivery_delayed", "delayed"],
    ["email.bounced", "bounced"],
    ["email.complained", "complained"],
    ["email.failed", "failed"],
    ["email.suppressed", "suppressed"],
    ["email.opened", "opened"],
    ["email.clicked", "clicked"],
    ["email.scheduled", "other"],
    ["contact.created", "other"],
  ];

  it.each(mappings)("maps %s to %s", (rawType, type) => {
    const event = parse(signedRequest({ ...delivered, type: rawType }));
    expect(event.type).toBe(type);
    expect(event.rawType).toBe(rawType);
  });

  it("includes bounce details", () => {
    const event = parse(
      signedRequest({
        type: "email.bounced",
        created_at: "2026-10-11T09:31:00.000Z",
        data: {
          email_id: "email_2",
          to: ["gone@example.com"],
          bounce: {
            type: "Permanent",
            subType: "Suppressed",
            message: "The recipient address does not exist.",
          },
        },
      }),
    );
    expect(event).toMatchObject({
      type: "bounced",
      providerMessageId: "email_2",
      recipients: ["gone@example.com"],
      bounce: {
        permanent: true,
        type: "Permanent",
        subType: "Suppressed",
        message: "The recipient address does not exist.",
      },
    });
  });

  it("marks a transient bounce as not permanent", () => {
    const event = parse(
      signedRequest({
        ...delivered,
        type: "email.bounced",
        data: {
          email_id: "email_3",
          to: "full@example.com",
          bounce: { type: "Transient", subType: "MailboxFull" },
        },
      }),
    );
    expect(event.recipients).toEqual(["full@example.com"]);
    expect(event.bounce).toEqual({
      permanent: false,
      type: "Transient",
      subType: "MailboxFull",
      message: undefined,
    });
  });

  it("reads the reason from a failed event", () => {
    const event = parse(
      signedRequest({
        ...delivered,
        type: "email.failed",
        data: {
          email_id: "email_4",
          failed: { reason: "reached_daily_quota" },
        },
      }),
    );
    expect(event.type).toBe("failed");
    expect(event.reason).toBe("reached_daily_quota");
    expect(event.recipients).toEqual([]);
  });

  it("reads the reason from a suppressed event", () => {
    const event = parse(
      signedRequest({
        ...delivered,
        type: "email.suppressed",
        data: {
          email_id: "email_5",
          to: ["blocked@example.com"],
          suppressed: {
            type: "OnAccountSuppressionList",
            message: "The address is on the suppression list.",
          },
        },
      }),
    );
    expect(event.type).toBe("suppressed");
    expect(event.reason).toBe("The address is on the suppression list.");
  });

  it("falls back to the delivery timestamp without created_at", () => {
    const timestamp = nowSeconds();
    const event = parse(
      signedRequest({ type: "email.sent", data: {} }, timestamp),
    );
    expect(event.occurredAt).toEqual(new Date(timestamp * 1000));
    expect(event.providerMessageId).toBeUndefined();
  });
});
