import type {
  ProviderEvent,
  ProviderEventType,
} from "@workspace/integration-core";
import { isRecord, optionalString } from "./client";

export type EventFallback = {
  id: string;
  occurredAt: Date;
};

const suppressedSubTypes = [
  "Suppressed",
  "OnAccountSuppressionList",
  "OnTenantSuppressionList",
  "EmailValidationSuppressed",
];

function record(value: unknown) {
  return isRecord(value) ? value : {};
}

function records(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function strings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function toDate(value: unknown, fallback: Date) {
  if (typeof value !== "string") {
    return fallback;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function joined(...parts: Array<string | undefined>) {
  const present = parts.filter((part): part is string => Boolean(part));
  return present.length > 0 ? present.join(": ") : undefined;
}

function eventId(...parts: Array<string | undefined>) {
  return parts
    .filter((part): part is string => Boolean(part))
    .map((part) => part.toLowerCase())
    .join(":");
}

function bounceType(
  type: string | undefined,
  subType: string | undefined,
): ProviderEventType {
  if (subType && suppressedSubTypes.includes(subType)) {
    return "suppressed";
  }
  if (subType === "UnsubscribedRecipient") {
    return "failed";
  }
  return type ? "bounced" : "other";
}

export function toProviderEvents(
  payload: unknown,
  fallback: EventFallback,
): ProviderEvent[] {
  if (!isRecord(payload)) {
    return [];
  }
  const rawType =
    optionalString(payload.eventType) ??
    optionalString(payload.notificationType) ??
    "";
  const mail = record(payload.mail);
  const providerMessageId = optionalString(mail.messageId);
  const destination = strings(mail.destination);
  const base = { rawType, providerMessageId };
  const key = providerMessageId ?? fallback.id;

  if (rawType === "Bounce") {
    const bounce = record(payload.bounce);
    const type = optionalString(bounce.bounceType);
    const subType = optionalString(bounce.bounceSubType);
    const feedbackId = optionalString(bounce.feedbackId) ?? key;
    const occurredAt = toDate(bounce.timestamp, fallback.occurredAt);
    return records(bounce.bouncedRecipients).flatMap((recipient) => {
      const email = optionalString(recipient.emailAddress);
      if (!email) {
        return [];
      }
      const diagnostic = optionalString(recipient.diagnosticCode);
      return [
        {
          ...base,
          id: eventId(feedbackId, "bounce", email),
          type: bounceType(type, subType),
          occurredAt,
          recipients: [email],
          bounce: {
            permanent: type === "Permanent",
            type,
            subType,
            message: diagnostic ?? optionalString(recipient.status),
          },
          reason: joined(optionalString(recipient.status), diagnostic),
        },
      ];
    });
  }

  if (rawType === "Complaint") {
    const complaint = record(payload.complaint);
    const feedbackType = optionalString(complaint.complaintFeedbackType);
    const subType = optionalString(complaint.complaintSubType);
    const feedbackId = optionalString(complaint.feedbackId) ?? key;
    const occurredAt = toDate(complaint.timestamp, fallback.occurredAt);
    const type: ProviderEventType = subType
      ? "suppressed"
      : feedbackType === "not-spam"
        ? "other"
        : "complained";
    return records(complaint.complainedRecipients).flatMap((recipient) => {
      const email = optionalString(recipient.emailAddress);
      if (!email) {
        return [];
      }
      return [
        {
          ...base,
          id: eventId(feedbackId, "complaint", email),
          type,
          occurredAt,
          recipients: [email],
          reason: joined(subType, feedbackType),
        },
      ];
    });
  }

  if (rawType === "Delivery") {
    const delivery = record(payload.delivery);
    const occurredAt = toDate(delivery.timestamp, fallback.occurredAt);
    return strings(delivery.recipients).map((email) => ({
      ...base,
      id: eventId(key, "delivery", email),
      type: "delivered",
      occurredAt,
      recipients: [email],
      reason: optionalString(delivery.smtpResponse),
    }));
  }

  if (rawType === "DeliveryDelay") {
    const delay = record(payload.deliveryDelay);
    const delayType = optionalString(delay.delayType);
    const timestamp = optionalString(delay.timestamp);
    const occurredAt = toDate(timestamp, fallback.occurredAt);
    return records(delay.delayedRecipients).flatMap((recipient) => {
      const email = optionalString(recipient.emailAddress);
      if (!email) {
        return [];
      }
      return [
        {
          ...base,
          id: eventId(key, "delay", timestamp ?? fallback.id, email),
          type: "delayed",
          occurredAt,
          recipients: [email],
          reason: joined(
            delayType,
            optionalString(recipient.diagnosticCode) ??
              optionalString(recipient.status),
          ),
        },
      ];
    });
  }

  const single = (
    type: ProviderEventType,
    name: string,
    detail: Record<string, unknown>,
    reason?: string,
  ): ProviderEvent[] => {
    const timestamp = optionalString(detail.timestamp);
    return [
      {
        ...base,
        id: eventId(key, name, timestamp),
        type,
        occurredAt: toDate(timestamp ?? mail.timestamp, fallback.occurredAt),
        recipients: destination,
        reason,
      },
    ];
  };

  if (rawType === "Reject") {
    const reject = record(payload.reject);
    return single("failed", "reject", reject, optionalString(reject.reason));
  }
  if (rawType === "Rendering Failure") {
    const failure = record(payload.failure);
    return single(
      "failed",
      "rendering-failure",
      failure,
      joined(
        optionalString(failure.templateName),
        optionalString(failure.errorMessage),
      ),
    );
  }
  if (rawType === "Send") {
    return single("sent", "send", record(payload.send));
  }
  if (rawType === "Open") {
    return single("opened", "open", record(payload.open));
  }
  if (rawType === "Click") {
    const click = record(payload.click);
    return single("clicked", "click", click, optionalString(click.link));
  }
  if (!rawType) {
    return [];
  }
  return single(
    "other",
    rawType.toLowerCase().replace(/\s+/g, "-"),
    record(payload.subscription),
  );
}
