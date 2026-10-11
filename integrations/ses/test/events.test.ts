import { describe, expect, it } from "vitest";
import { toProviderEvents } from "../src/index";

const fallback = {
  id: "sns-message-1",
  occurredAt: new Date("2026-10-11T10:00:00.000Z"),
};

const mail = {
  timestamp: "2026-10-11T09:30:00.000Z",
  messageId: "0102018C-ses-id-000000",
  source: "ada@example.com",
  destination: ["grace@example.org", "alan@example.org"],
};

const bounce = {
  bounceType: "Permanent",
  bounceSubType: "General",
  feedbackId: "Feedback-1",
  timestamp: "2026-10-11T09:31:00.000Z",
  reportingMTA: "dsn; mta.example.org",
  bouncedRecipients: [
    {
      emailAddress: "Grace@example.org",
      action: "failed",
      status: "5.1.1",
      diagnosticCode: "smtp; 550 5.1.1 user unknown",
    },
    { emailAddress: "alan@example.org", action: "failed", status: "5.0.0" },
  ],
};

const complaint = {
  feedbackId: "feedback-2",
  timestamp: "2026-10-11T09:32:00.000Z",
  complaintFeedbackType: "abuse",
  complainedRecipients: [
    { emailAddress: "grace@example.org" },
    { emailAddress: "alan@example.org" },
  ],
};

const delivery = {
  timestamp: "2026-10-11T09:30:04.000Z",
  processingTimeMillis: 4000,
  recipients: ["grace@example.org", "alan@example.org"],
  smtpResponse: "250 2.6.0 Message received",
};

function event(type: string, detail: Record<string, unknown>) {
  return { eventType: type, mail, ...detail };
}

function legacy(type: string, detail: Record<string, unknown>) {
  return { notificationType: type, mail, ...detail };
}

describe.each([
  ["event publishing", event],
  ["identity notification", legacy],
])("toProviderEvents with the %s format", (_, build) => {
  it("emits one bounced event per recipient of a permanent bounce", () => {
    expect(toProviderEvents(build("Bounce", { bounce }), fallback)).toEqual([
      {
        id: "feedback-1:bounce:grace@example.org",
        type: "bounced",
        rawType: "Bounce",
        occurredAt: new Date("2026-10-11T09:31:00.000Z"),
        providerMessageId: "0102018C-ses-id-000000",
        recipients: ["Grace@example.org"],
        bounce: {
          permanent: true,
          type: "Permanent",
          subType: "General",
          message: "smtp; 550 5.1.1 user unknown",
        },
        reason: "5.1.1: smtp; 550 5.1.1 user unknown",
      },
      {
        id: "feedback-1:bounce:alan@example.org",
        type: "bounced",
        rawType: "Bounce",
        occurredAt: new Date("2026-10-11T09:31:00.000Z"),
        providerMessageId: "0102018C-ses-id-000000",
        recipients: ["alan@example.org"],
        bounce: {
          permanent: true,
          type: "Permanent",
          subType: "General",
          message: "5.0.0",
        },
        reason: "5.0.0",
      },
    ]);
  });

  it.each([
    ["Transient", "MailboxFull"],
    ["Transient", "General"],
    ["Undetermined", "Undetermined"],
  ])(
    "maps a %s %s bounce to a bounce that is not permanent",
    (type, subType) => {
      const events = toProviderEvents(
        build("Bounce", {
          bounce: { ...bounce, bounceType: type, bounceSubType: subType },
        }),
        fallback,
      );

      expect(events).toHaveLength(2);
      for (const entry of events) {
        expect(entry.type).toBe("bounced");
        expect(entry.bounce).toMatchObject({ permanent: false, type, subType });
      }
    },
  );

  it.each([
    "Suppressed",
    "OnAccountSuppressionList",
    "OnTenantSuppressionList",
    "EmailValidationSuppressed",
  ])("maps the %s bounce subtype to suppressed", (subType) => {
    const events = toProviderEvents(
      build("Bounce", { bounce: { ...bounce, bounceSubType: subType } }),
      fallback,
    );

    expect(events.map((entry) => entry.type)).toEqual([
      "suppressed",
      "suppressed",
    ]);
    expect(events[0]?.bounce).toMatchObject({ permanent: true, subType });
  });

  it("maps a bounce for a recipient who unsubscribed in SES to failed", () => {
    const events = toProviderEvents(
      build("Bounce", {
        bounce: { ...bounce, bounceSubType: "UnsubscribedRecipient" },
      }),
      fallback,
    );

    expect(events.map((entry) => entry.type)).toEqual(["failed", "failed"]);
  });

  it("emits one complained event per recipient", () => {
    expect(
      toProviderEvents(build("Complaint", { complaint }), fallback),
    ).toEqual([
      {
        id: "feedback-2:complaint:grace@example.org",
        type: "complained",
        rawType: "Complaint",
        occurredAt: new Date("2026-10-11T09:32:00.000Z"),
        providerMessageId: "0102018C-ses-id-000000",
        recipients: ["grace@example.org"],
        reason: "abuse",
      },
      {
        id: "feedback-2:complaint:alan@example.org",
        type: "complained",
        rawType: "Complaint",
        occurredAt: new Date("2026-10-11T09:32:00.000Z"),
        providerMessageId: "0102018C-ses-id-000000",
        recipients: ["alan@example.org"],
        reason: "abuse",
      },
    ]);
  });

  it("does not treat a not-spam report as a complaint", () => {
    const events = toProviderEvents(
      build("Complaint", {
        complaint: { ...complaint, complaintFeedbackType: "not-spam" },
      }),
      fallback,
    );

    expect(events.map((entry) => entry.type)).toEqual(["other", "other"]);
  });

  it("maps a complaint for a suppressed address to suppressed", () => {
    const events = toProviderEvents(
      build("Complaint", {
        complaint: {
          ...complaint,
          complaintFeedbackType: undefined,
          complaintSubType: "OnAccountSuppressionList",
        },
      }),
      fallback,
    );

    expect(events.map((entry) => entry.type)).toEqual([
      "suppressed",
      "suppressed",
    ]);
    expect(events[0]?.reason).toBe("OnAccountSuppressionList");
  });

  it("emits one delivered event per recipient", () => {
    expect(toProviderEvents(build("Delivery", { delivery }), fallback)).toEqual(
      [
        {
          id: "0102018c-ses-id-000000:delivery:grace@example.org",
          type: "delivered",
          rawType: "Delivery",
          occurredAt: new Date("2026-10-11T09:30:04.000Z"),
          providerMessageId: "0102018C-ses-id-000000",
          recipients: ["grace@example.org"],
          reason: "250 2.6.0 Message received",
        },
        {
          id: "0102018c-ses-id-000000:delivery:alan@example.org",
          type: "delivered",
          rawType: "Delivery",
          occurredAt: new Date("2026-10-11T09:30:04.000Z"),
          providerMessageId: "0102018C-ses-id-000000",
          recipients: ["alan@example.org"],
          reason: "250 2.6.0 Message received",
        },
      ],
    );
  });

  it("emits one delayed event per recipient of a delivery delay", () => {
    const events = toProviderEvents(
      build("DeliveryDelay", {
        deliveryDelay: {
          timestamp: "2026-10-11T09:40:00.000Z",
          delayType: "TransientCommunicationFailure",
          expirationTime: "2026-10-11T21:40:00.000Z",
          delayedRecipients: [
            {
              emailAddress: "grace@example.org",
              status: "4.4.1",
              diagnosticCode: "smtp; 421 4.4.1 Unable to connect",
            },
            { emailAddress: "alan@example.org", status: "4.4.1" },
          ],
        },
      }),
      fallback,
    );

    expect(events).toEqual([
      {
        id: "0102018c-ses-id-000000:delay:2026-10-11t09:40:00.000z:grace@example.org",
        type: "delayed",
        rawType: "DeliveryDelay",
        occurredAt: new Date("2026-10-11T09:40:00.000Z"),
        providerMessageId: "0102018C-ses-id-000000",
        recipients: ["grace@example.org"],
        reason:
          "TransientCommunicationFailure: smtp; 421 4.4.1 Unable to connect",
      },
      {
        id: "0102018c-ses-id-000000:delay:2026-10-11t09:40:00.000z:alan@example.org",
        type: "delayed",
        rawType: "DeliveryDelay",
        occurredAt: new Date("2026-10-11T09:40:00.000Z"),
        providerMessageId: "0102018C-ses-id-000000",
        recipients: ["alan@example.org"],
        reason: "TransientCommunicationFailure: 4.4.1",
      },
    ]);
  });

  it("maps a reject to one failed event for the message", () => {
    expect(
      toProviderEvents(
        build("Reject", { reject: { reason: "Bad content" } }),
        fallback,
      ),
    ).toEqual([
      {
        id: "0102018c-ses-id-000000:reject",
        type: "failed",
        rawType: "Reject",
        occurredAt: new Date("2026-10-11T09:30:00.000Z"),
        providerMessageId: "0102018C-ses-id-000000",
        recipients: ["grace@example.org", "alan@example.org"],
        reason: "Bad content",
      },
    ]);
  });

  it("maps a rendering failure to one failed event for the message", () => {
    const events = toProviderEvents(
      build("Rendering Failure", {
        failure: {
          templateName: "MyTemplate",
          errorMessage:
            "Attribute 'name' is not present in the rendering data.",
        },
      }),
      fallback,
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: "0102018c-ses-id-000000:rendering-failure",
      type: "failed",
      rawType: "Rendering Failure",
      reason:
        "MyTemplate: Attribute 'name' is not present in the rendering data.",
    });
  });

  it.each([
    ["Send", { send: {} }, "sent", "0102018c-ses-id-000000:send"],
    [
      "Open",
      {
        open: { timestamp: "2026-10-11T11:00:00.000Z", ipAddress: "192.0.2.1" },
      },
      "opened",
      "0102018c-ses-id-000000:open:2026-10-11t11:00:00.000z",
    ],
    [
      "Click",
      {
        click: {
          timestamp: "2026-10-11T11:05:00.000Z",
          link: "https://example.com/pricing",
        },
      },
      "clicked",
      "0102018c-ses-id-000000:click:2026-10-11t11:05:00.000z",
    ],
    [
      "Subscription",
      { subscription: { timestamp: "2026-10-11T11:10:00.000Z" } },
      "other",
      "0102018c-ses-id-000000:subscription:2026-10-11t11:10:00.000z",
    ],
  ])("maps %s to one event", (rawType, detail, type, id) => {
    const events = toProviderEvents(build(rawType, detail), fallback);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id,
      type,
      rawType,
      providerMessageId: "0102018C-ses-id-000000",
      recipients: ["grace@example.org", "alan@example.org"],
    });
  });

  it("keeps the raw type of an event it does not know", () => {
    const events = toProviderEvents(build("Brand New", {}), fallback);

    expect(events[0]).toMatchObject({
      id: "0102018c-ses-id-000000:brand-new",
      type: "other",
      rawType: "Brand New",
    });
  });
});

describe("toProviderEvents", () => {
  it("gives the same IDs when the same event is delivered again", () => {
    const first = toProviderEvents(
      { eventType: "Bounce", mail, bounce },
      fallback,
    );
    const second = toProviderEvents(
      { eventType: "Bounce", mail, bounce },
      { id: "sns-message-2", occurredAt: new Date("2026-10-11T12:00:00.000Z") },
    );

    expect(second.map((entry) => entry.id)).toEqual(
      first.map((entry) => entry.id),
    );
  });

  it("falls back to the SNS message for missing IDs and timestamps", () => {
    const events = toProviderEvents(
      {
        notificationType: "Delivery",
        mail: { timestamp: "2018-10-08T14:05:45 +0000" },
        delivery: { recipients: ["grace@example.org"] },
      },
      fallback,
    );

    expect(events).toEqual([
      {
        id: "sns-message-1:delivery:grace@example.org",
        type: "delivered",
        rawType: "Delivery",
        occurredAt: fallback.occurredAt,
        providerMessageId: undefined,
        recipients: ["grace@example.org"],
        reason: undefined,
      },
    ]);
  });

  it("skips recipients without an address and tolerates missing lists", () => {
    expect(
      toProviderEvents(
        {
          eventType: "Bounce",
          mail,
          bounce: { bounceType: "Permanent", bouncedRecipients: [{}, "x"] },
        },
        fallback,
      ),
    ).toEqual([]);
    expect(
      toProviderEvents({ eventType: "Complaint", mail }, fallback),
    ).toEqual([]);
    expect(toProviderEvents({ eventType: "Delivery", mail }, fallback)).toEqual(
      [],
    );
  });

  it.each([undefined, null, "text", 42, [], {}])(
    "returns no events for the payload %j",
    (payload) => {
      expect(toProviderEvents(payload, fallback)).toEqual([]);
    },
  );
});
