import type { IntegrationError } from "@workspace/integration-core";
import { describe, expect, it } from "vitest";
import { createSesAdapter } from "../src/index";
import { captureError, createFakeFetch, type FetchReply } from "./helpers";
import {
  certificateUrl,
  confirmation,
  createSigningIdentity,
  notification,
  type SnsFields,
  signFields,
  subscribeUrl,
  topicArn,
} from "./sns-fixtures";

const identity = createSigningIdentity();

const bounce = {
  eventType: "Bounce",
  mail: {
    messageId: "0102018c-ses-id-000000",
    destination: ["grace@example.org"],
  },
  bounce: {
    bounceType: "Permanent",
    bounceSubType: "General",
    feedbackId: "feedback-1",
    timestamp: "2026-10-11T09:31:00.000Z",
    bouncedRecipients: [
      {
        emailAddress: "grace@example.org",
        status: "5.1.1",
        diagnosticCode: "smtp; 550 5.1.1 user unknown",
      },
    ],
  },
};

const confirmationXml =
  "<ConfirmSubscriptionResponse><ConfirmSubscriptionResult><SubscriptionArn>arn:aws:sns:eu-west-1:123456789012:opencadence-events:2bcfbf39</SubscriptionArn></ConfirmSubscriptionResult></ConfirmSubscriptionResponse>";

function setup(
  replies: Record<string, FetchReply> = {},
  config: Parameters<typeof createSesAdapter>[0] = {},
) {
  const fake = createFakeFetch({
    [certificateUrl]: { body: identity.certificate },
    [subscribeUrl]: { body: confirmationXml },
    ...replies,
  });
  const adapter = createSesAdapter({ fetch: fake.fetch, ...config });
  return { sns: adapter.sns, ...fake };
}

function request(fields: SnsFields, expectedTopic = topicArn) {
  return { rawBody: JSON.stringify(fields), topicArn: expectedTopic };
}

async function rejection(
  fields: SnsFields,
  replies: Record<string, FetchReply> = {},
) {
  const { sns, calls } = setup(replies);
  const error = (await captureError(() =>
    sns.receive(request(fields)),
  )) as IntegrationError;
  return { error, calls };
}

describe("sns.verify", () => {
  it.each(["1", "2"] as const)(
    "accepts a notification signed with signature version %s",
    async (version) => {
      const { sns, calls } = setup();

      const message = await sns.verify(
        request(notification(identity, bounce, {}, version)),
      );

      expect(message.type).toBe("Notification");
      expect(message.topicArn).toBe(topicArn);
      expect(message.type === "Notification" && message.events).toHaveLength(1);
      expect(calls).toEqual([
        { url: certificateUrl, method: "GET", redirect: "error" },
      ]);
    },
  );

  it("signs the subject when a notification has one", async () => {
    const { sns } = setup();
    const withSubject = notification(identity, bounce, {
      Subject: "Amazon SES Email Event Notification",
    });

    const message = await sns.verify(request(withSubject));

    expect(message.type).toBe("Notification");
    const error = (await captureError(() =>
      sns.verify(request({ ...withSubject, Subject: "Changed" })),
    )) as IntegrationError;
    expect(error.code).toBe("invalid_credentials");
  });

  it.each(["1", "2"] as const)(
    "returns the subscribe link of a confirmation signed with version %s without fetching it",
    async (version) => {
      const { sns, calls } = setup();

      const message = await sns.verify(
        request(
          confirmation(identity, "SubscriptionConfirmation", {}, version),
        ),
      );

      expect(message).toMatchObject({
        type: "SubscriptionConfirmation",
        topicArn,
        subscribeUrl,
      });
      expect(calls.map((call) => call.url)).toEqual([certificateUrl]);
    },
  );

  it.each(["1", "2"] as const)(
    "accepts an unsubscribe confirmation signed with version %s",
    async (version) => {
      const { sns } = setup();

      const message = await sns.verify(
        request(confirmation(identity, "UnsubscribeConfirmation", {}, version)),
      );

      expect(message.type).toBe("UnsubscribeConfirmation");
      expect(message).not.toHaveProperty("subscribeUrl");
    },
  );

  it("fetches a signing certificate once and caches it", async () => {
    const { sns, calls } = setup();

    await sns.verify(request(notification(identity, bounce)));
    await sns.verify(request(notification(identity, bounce)));
    await Promise.all([
      sns.verify(request(notification(identity, bounce))),
      sns.verify(request(notification(identity, bounce))),
    ]);

    expect(calls).toHaveLength(1);
  });

  it("shares one certificate request between concurrent messages", async () => {
    const { sns, calls } = setup();

    await Promise.all([
      sns.verify(request(notification(identity, bounce))),
      sns.verify(request(notification(identity, bounce))),
    ]);

    expect(calls).toHaveLength(1);
  });

  it("fetches the certificate again after the cache time", async () => {
    let now = Date.now();
    const { sns, calls } = setup(
      {},
      { now: () => new Date(now), certificateCacheSeconds: 60 },
    );

    await sns.verify(request(notification(identity, bounce)));
    now += 61000;
    await sns.verify(
      request(
        notification(identity, bounce, {
          Timestamp: new Date(now).toISOString(),
        }),
      ),
    );

    expect(calls).toHaveLength(2);
  });

  it("rejects a tampered message", async () => {
    const signed = notification(identity, bounce);
    const tampered = {
      ...signed,
      Message:
        signed.Message?.replace("grace@example.org", "eve@example.org") ?? "",
    };

    const { error } = await rejection(tampered);

    expect(error.code).toBe("invalid_credentials");
    expect(error.message).toBe("The SNS message signature is not valid.");
  });

  it("rejects a signature made with another key", async () => {
    const other = createSigningIdentity();

    const { error } = await rejection(notification(other, bounce));

    expect(error.code).toBe("invalid_credentials");
  });

  it("rejects a version 2 signature presented as version 1", async () => {
    const signed = notification(identity, bounce, {}, "2");

    const { error } = await rejection({ ...signed, SignatureVersion: "1" });

    expect(error.code).toBe("invalid_credentials");
  });

  it.each([
    "https://evil.example.com/SimpleNotificationService-abc.pem",
    "https://sns.eu-west-1.amazonaws.com.evil.example/cert.pem",
    "https://evil.example.com/sns.eu-west-1.amazonaws.com/cert.pem",
    "https://sns.eu-west-1.amazonaws.com@evil.example.com/cert.pem",
    "https://s3.eu-west-1.amazonaws.com/bucket/cert.pem",
    "https://xsns.eu-west-1.amazonaws.com/cert.pem",
    "http://sns.eu-west-1.amazonaws.com/cert.pem",
    "https://sns.eu-west-1.amazonaws.com:8443/cert.pem",
    "https://sns.eu-west-1.amazonaws.com/cert.pem?redirect=evil",
    "https://sns.eu-west-1.amazonaws.com/path/cert.pem",
    "https://sns.eu-west-1.amazonaws.com/cert.txt",
    "not a url",
  ])("rejects the certificate address %s without fetching it", async (url) => {
    const fields = notification(identity, bounce, { SigningCertURL: url });

    const { error, calls } = await rejection(fields, {
      [url]: { body: identity.certificate },
    });

    expect(error.code).toBe("invalid_credentials");
    expect(error.message).toBe(
      "The SNS signing certificate is not hosted by Amazon SNS.",
    );
    expect(calls).toHaveLength(0);
  });

  it("accepts certificate hosts of other AWS partitions", async () => {
    const url =
      "https://sns.cn-north-1.amazonaws.com.cn/SimpleNotificationService-abc.pem";
    const { sns } = setup({ [url]: { body: identity.certificate } });

    const message = await sns.verify(
      request(notification(identity, bounce, { SigningCertURL: url })),
    );

    expect(message.type).toBe("Notification");
  });

  it("rejects a message from another topic without fetching the certificate", async () => {
    const { sns, calls } = setup();
    const fields = notification(identity, bounce);

    const error = (await captureError(() =>
      sns.verify(
        request(fields, "arn:aws:sns:eu-west-1:123456789012:another-topic"),
      ),
    )) as IntegrationError;

    expect(error.code).toBe("invalid_credentials");
    expect(error.message).toBe("The SNS message is from an unexpected topic.");
    expect(calls).toHaveLength(0);
  });

  it("rejects every message when no topic is stored", async () => {
    const { sns } = setup();

    const error = (await captureError(() =>
      sns.verify(request(notification(identity, bounce), "")),
    )) as IntegrationError;

    expect(error.code).toBe("invalid_credentials");
  });

  it.each([
    new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
    "not a date",
  ])("rejects the stale or invalid timestamp %s", async (Timestamp) => {
    const { error } = await rejection(
      notification(identity, bounce, { Timestamp }),
    );

    expect(error.code).toBe("invalid_credentials");
    expect(error.message).toBe(
      "The SNS message timestamp is too far from the current time.",
    );
  });

  it("uses the configured timestamp tolerance", async () => {
    const { sns } = setup({}, { snsToleranceSeconds: 60 });
    const Timestamp = new Date(Date.now() - 120000).toISOString();

    const error = (await captureError(() =>
      sns.verify(request(notification(identity, bounce, { Timestamp }))),
    )) as IntegrationError;

    expect(error.code).toBe("invalid_credentials");
  });

  it("rejects an unknown signature version", async () => {
    const signed = notification(identity, bounce);

    const { error } = await rejection({ ...signed, SignatureVersion: "3" });

    expect(error.code).toBe("invalid_credentials");
  });

  it("rejects an expired signing certificate", async () => {
    const expired = createSigningIdentity(
      new Date(Date.now() - 86400000 * 30),
      new Date(Date.now() - 86400000),
    );

    const { error } = await rejection(notification(expired, bounce), {
      [certificateUrl]: { body: expired.certificate },
    });

    expect(error.code).toBe("invalid_credentials");
    expect(error.message).toBe(
      "The SNS signing certificate is expired or not yet valid.",
    );
  });

  it("rejects a certificate response that is not a certificate", async () => {
    const { error } = await rejection(notification(identity, bounce), {
      [certificateUrl]: { body: "<html>not a certificate</html>" },
    });

    expect(error.code).toBe("invalid_credentials");
  });

  it.each<[string, FetchReply]>([
    ["a server error", { status: 503, body: "" }],
    ["a network failure", new Error("socket hang up")],
  ])("treats %s fetching the certificate as temporary", async (_, reply) => {
    const { error } = await rejection(notification(identity, bounce), {
      [certificateUrl]: reply,
    });

    expect(error.code).toBe("temporary");
    expect(error.retryable).toBe(true);
  });

  it.each([
    ["not json", "{"],
    ["a JSON array", "[]"],
    [
      "raw message delivery",
      JSON.stringify({ eventType: "Bounce", mail: {}, bounce: {} }),
    ],
    ["a missing signature", JSON.stringify({ Type: "Notification" })],
  ])("rejects a body that is %s", async (_, rawBody) => {
    const { sns, calls } = setup();

    const error = (await captureError(() =>
      sns.verify({ rawBody, topicArn }),
    )) as IntegrationError;

    expect(error.code).toBe("validation");
    expect(calls).toHaveLength(0);
  });

  it("rejects a confirmation that lacks a signed field", async () => {
    const signed = confirmation(identity, "SubscriptionConfirmation");
    const { Token: _token, ...withoutToken } = signed;

    const { error } = await rejection(withoutToken);

    expect(error.code).toBe("validation");
  });
});

describe("sns.receive", () => {
  it("returns the events of a notification", async () => {
    const { sns } = setup();

    const outcome = await sns.receive(request(notification(identity, bounce)));

    expect(outcome).toEqual({
      kind: "events",
      messageId: "22b80b92-fdea-4c2c-8f9d-bdfb0c7bf324",
      events: [
        {
          id: "feedback-1:bounce:grace@example.org",
          type: "bounced",
          rawType: "Bounce",
          occurredAt: new Date("2026-10-11T09:31:00.000Z"),
          providerMessageId: "0102018c-ses-id-000000",
          recipients: ["grace@example.org"],
          bounce: {
            permanent: true,
            type: "Permanent",
            subType: "General",
            message: "smtp; 550 5.1.1 user unknown",
          },
          reason: "5.1.1: smtp; 550 5.1.1 user unknown",
        },
      ],
    });
  });

  it("returns no events for the test notification SES sends as plain text", async () => {
    const { sns } = setup();

    const outcome = await sns.receive(
      request(
        notification(
          identity,
          "Successfully validated SNS topic for Amazon SES event publishing.",
        ),
      ),
    );

    expect(outcome).toMatchObject({ kind: "events", events: [] });
  });

  it("confirms a subscription by fetching the subscribe link", async () => {
    const { sns, calls } = setup();

    const outcome = await sns.receive(
      request(confirmation(identity, "SubscriptionConfirmation")),
    );

    expect(outcome).toEqual({
      kind: "subscription_confirmed",
      messageId: "22b80b92-fdea-4c2c-8f9d-bdfb0c7bf324",
      topicArn,
      subscriptionArn:
        "arn:aws:sns:eu-west-1:123456789012:opencadence-events:2bcfbf39",
    });
    expect(calls).toEqual([
      { url: certificateUrl, method: "GET", redirect: "error" },
      { url: subscribeUrl, method: "GET", redirect: "error" },
    ]);
  });

  it("does not fetch the subscribe link when the signature is wrong", async () => {
    const signed = confirmation(identity, "SubscriptionConfirmation");

    const { error, calls } = await rejection({
      ...signed,
      Signature: signFields(createSigningIdentity(), signed, "2"),
    });

    expect(error.code).toBe("invalid_credentials");
    expect(calls.map((call) => call.url)).toEqual([certificateUrl]);
  });

  it("does not fetch the subscribe link of another topic", async () => {
    const { sns, calls } = setup();
    const fields = confirmation(identity, "SubscriptionConfirmation");

    const error = (await captureError(() =>
      sns.receive(
        request(fields, "arn:aws:sns:eu-west-1:123456789012:another-topic"),
      ),
    )) as IntegrationError;

    expect(error.code).toBe("invalid_credentials");
    expect(calls).toHaveLength(0);
  });

  it.each([
    `https://evil.example.com/?Action=ConfirmSubscription&TopicArn=${topicArn}&Token=t`,
    `http://sns.eu-west-1.amazonaws.com/?Action=ConfirmSubscription&TopicArn=${topicArn}&Token=t`,
    `https://sns.eu-west-1.amazonaws.com/?Action=Unsubscribe&TopicArn=${topicArn}&Token=t`,
    "https://sns.eu-west-1.amazonaws.com/?Action=ConfirmSubscription&TopicArn=arn:aws:sns:eu-west-1:999999999999:other&Token=t",
  ])("refuses a correctly signed subscribe link %s", async (url) => {
    const { error, calls } = await rejection(
      confirmation(identity, "SubscriptionConfirmation", { SubscribeURL: url }),
      { [url]: { body: confirmationXml } },
    );

    expect(error.code).toBe("invalid_credentials");
    expect(calls.map((call) => call.url)).toEqual([certificateUrl]);
  });

  it("reports an unsubscribe without visiting the subscribe link", async () => {
    const { sns, calls } = setup();

    const outcome = await sns.receive(
      request(confirmation(identity, "UnsubscribeConfirmation")),
    );

    expect(outcome).toEqual({
      kind: "unsubscribed",
      messageId: "22b80b92-fdea-4c2c-8f9d-bdfb0c7bf324",
      topicArn,
    });
    expect(calls.map((call) => call.url)).toEqual([certificateUrl]);
  });

  it.each<[string, FetchReply, string]>([
    ["a server error", { status: 500, body: "" }, "temporary"],
    ["a network failure", new Error("socket hang up"), "temporary"],
    ["a refusal", { status: 400, body: "" }, "validation"],
  ])("maps %s while confirming", async (_, reply, code) => {
    const { error } = await rejection(
      confirmation(identity, "SubscriptionConfirmation"),
      { [subscribeUrl]: reply },
    );

    expect(error.code).toBe(code);
  });
});
