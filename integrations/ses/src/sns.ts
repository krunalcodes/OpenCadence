import { createVerify, type KeyObject, X509Certificate } from "node:crypto";
import {
  IntegrationError,
  type ProviderEvent,
} from "@workspace/integration-core";
import { isRecord, optionalString } from "./client";
import { maxCachedCertificates, type ResolvedSesConfig } from "./config";
import { toProviderEvents } from "./events";

export type SnsRequest = {
  rawBody: string;
  topicArn: string;
};

export type SnsMessage =
  | {
      type: "Notification";
      messageId: string;
      topicArn: string;
      timestamp: Date;
      events: ProviderEvent[];
    }
  | {
      type: "SubscriptionConfirmation";
      messageId: string;
      topicArn: string;
      timestamp: Date;
      subscribeUrl: string;
    }
  | {
      type: "UnsubscribeConfirmation";
      messageId: string;
      topicArn: string;
      timestamp: Date;
    };

export type SubscriptionConfirmation = {
  topicArn: string;
  subscriptionArn?: string;
};

export type SnsOutcome =
  | { kind: "events"; messageId: string; events: ProviderEvent[] }
  | {
      kind: "subscription_confirmed";
      messageId: string;
      topicArn: string;
      subscriptionArn?: string;
    }
  | { kind: "unsubscribed"; messageId: string; topicArn: string };

export type SnsSupport = {
  verify(request: SnsRequest): Promise<SnsMessage>;
  confirmSubscription(
    message: Extract<SnsMessage, { type: "SubscriptionConfirmation" }>,
  ): Promise<SubscriptionConfirmation>;
  receive(request: SnsRequest): Promise<SnsOutcome>;
};

type CachedCertificate = {
  publicKey: KeyObject;
  expiresAt: number;
};

const messageTypes = [
  "Notification",
  "SubscriptionConfirmation",
  "UnsubscribeConfirmation",
] as const;

type MessageType = (typeof messageTypes)[number];

const snsHostPattern = /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/;

const certificatePathPattern = /^\/[A-Za-z0-9._-]+\.pem$/;

const maxCertificateLength = 32768;

const digests: Record<string, string> = {
  "1": "RSA-SHA1",
  "2": "RSA-SHA256",
};

function rejected(message: string) {
  return new IntegrationError("invalid_credentials", message);
}

function malformed(message: string) {
  return new IntegrationError("validation", message);
}

function unavailable(message: string, cause?: unknown) {
  return new IntegrationError("temporary", message, { cause });
}

function parseUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isSnsUrl(url: URL | null): url is URL {
  return (
    url !== null &&
    url.protocol === "https:" &&
    url.port === "" &&
    url.username === "" &&
    url.password === "" &&
    snsHostPattern.test(url.hostname)
  );
}

export function isSigningCertificateUrl(value: string) {
  const url = parseUrl(value);
  return (
    isSnsUrl(url) &&
    url.search === "" &&
    url.hash === "" &&
    certificatePathPattern.test(url.pathname)
  );
}

export function isSubscribeUrl(value: string, topicArn: string) {
  const url = parseUrl(value);
  return (
    isSnsUrl(url) &&
    url.searchParams.get("Action") === "ConfirmSubscription" &&
    url.searchParams.get("TopicArn") === topicArn
  );
}

function isMessageType(value: string | undefined): value is MessageType {
  return messageTypes.some((type) => type === value);
}

function stringToSign(type: MessageType, fields: Record<string, string>) {
  const names =
    type === "Notification"
      ? ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"]
      : [
          "Message",
          "MessageId",
          "SubscribeURL",
          "Timestamp",
          "Token",
          "TopicArn",
          "Type",
        ];
  let result = "";
  for (const name of names) {
    const value = fields[name];
    if (value === undefined) {
      if (name === "Subject") {
        continue;
      }
      throw malformed("The SNS message is missing a signed field.");
    }
    result += `${name}\n${value}\n`;
  }
  return result;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function stringFields(body: Record<string, unknown>) {
  const fields: Record<string, string> = {};
  for (const [name, value] of Object.entries(body)) {
    if (typeof value === "string") {
      fields[name] = value;
    }
  }
  return fields;
}

export function createSnsSupport(config: ResolvedSesConfig): SnsSupport {
  const certificates = new Map<string, CachedCertificate>();
  const pending = new Map<string, Promise<CachedCertificate>>();

  async function fetchCertificate(url: string): Promise<CachedCertificate> {
    let response: Response;
    let pem: string;
    try {
      response = await config.fetch(url, { method: "GET", redirect: "error" });
      pem = await response.text();
    } catch (cause) {
      throw unavailable(
        "The SNS signing certificate could not be fetched.",
        cause,
      );
    }
    if (!response.ok) {
      throw unavailable("The SNS signing certificate could not be fetched.");
    }
    if (pem.length > maxCertificateLength) {
      throw rejected("The SNS signing certificate is not valid.");
    }
    let certificate: X509Certificate;
    try {
      certificate = new X509Certificate(pem);
    } catch {
      throw rejected("The SNS signing certificate is not valid.");
    }
    const now = config.now().getTime();
    const notBefore = new Date(certificate.validFrom).getTime();
    const notAfter = new Date(certificate.validTo).getTime();
    if (!(notBefore <= now && now <= notAfter)) {
      throw rejected(
        "The SNS signing certificate is expired or not yet valid.",
      );
    }
    return {
      publicKey: certificate.publicKey,
      expiresAt: Math.min(
        notAfter,
        now + config.certificateCacheSeconds * 1000,
      ),
    };
  }

  async function certificateFor(url: string) {
    const cached = certificates.get(url);
    if (cached && cached.expiresAt > config.now().getTime()) {
      return cached;
    }
    certificates.delete(url);
    const inFlight = pending.get(url);
    if (inFlight) {
      return inFlight;
    }
    const request = fetchCertificate(url)
      .then((certificate) => {
        if (certificates.size >= maxCachedCertificates) {
          const oldest = certificates.keys().next().value;
          if (oldest !== undefined) {
            certificates.delete(oldest);
          }
        }
        certificates.set(url, certificate);
        return certificate;
      })
      .finally(() => {
        pending.delete(url);
      });
    pending.set(url, request);
    return request;
  }

  async function verify(request: SnsRequest): Promise<SnsMessage> {
    const body = parseJson(request.rawBody);
    if (!isRecord(body)) {
      throw malformed("The SNS message is not valid JSON.");
    }
    const fields = stringFields(body);
    const type = fields.Type;
    if (!isMessageType(type)) {
      throw malformed(
        "The request is not an SNS message. Turn off raw message delivery on the subscription.",
      );
    }
    const { MessageId, TopicArn, Timestamp, Signature, SigningCertURL } =
      fields;
    if (
      !MessageId ||
      !TopicArn ||
      !Timestamp ||
      !Signature ||
      !SigningCertURL
    ) {
      throw malformed("The SNS message is missing a required field.");
    }
    if (!request.topicArn || TopicArn !== request.topicArn) {
      throw rejected("The SNS message is from an unexpected topic.");
    }
    const timestamp = new Date(Timestamp);
    const age = Math.abs(config.now().getTime() - timestamp.getTime());
    if (Number.isNaN(age) || age > config.snsToleranceSeconds * 1000) {
      throw rejected(
        "The SNS message timestamp is too far from the current time.",
      );
    }
    const digest = digests[fields.SignatureVersion ?? ""];
    if (!digest) {
      throw rejected("The SNS signature version is not supported.");
    }
    if (!isSigningCertificateUrl(SigningCertURL)) {
      throw rejected(
        "The SNS signing certificate is not hosted by Amazon SNS.",
      );
    }
    const signed = stringToSign(type, fields);
    const certificate = await certificateFor(SigningCertURL);
    let valid = false;
    try {
      valid = createVerify(digest)
        .update(signed, "utf8")
        .verify(certificate.publicKey, Signature, "base64");
    } catch {
      valid = false;
    }
    if (!valid) {
      throw rejected("The SNS message signature is not valid.");
    }

    const common = { messageId: MessageId, topicArn: TopicArn, timestamp };
    if (type === "SubscriptionConfirmation") {
      const subscribeUrl = fields.SubscribeURL ?? "";
      if (!isSubscribeUrl(subscribeUrl, TopicArn)) {
        throw rejected(
          "The SNS subscription confirmation link is not an Amazon SNS address for this topic.",
        );
      }
      return { type, ...common, subscribeUrl };
    }
    if (type === "UnsubscribeConfirmation") {
      return { type, ...common };
    }
    return {
      type,
      ...common,
      events: toProviderEvents(parseJson(fields.Message ?? ""), {
        id: MessageId,
        occurredAt: timestamp,
      }),
    };
  }

  async function confirmSubscription(
    message: Extract<SnsMessage, { type: "SubscriptionConfirmation" }>,
  ): Promise<SubscriptionConfirmation> {
    if (!isSubscribeUrl(message.subscribeUrl, message.topicArn)) {
      throw rejected(
        "The SNS subscription confirmation link is not an Amazon SNS address for this topic.",
      );
    }
    let response: Response;
    let text: string;
    try {
      response = await config.fetch(message.subscribeUrl, {
        method: "GET",
        redirect: "error",
      });
      text = await response.text();
    } catch (cause) {
      throw unavailable("Amazon SNS could not be reached.", cause);
    }
    if (response.status >= 500) {
      throw unavailable("Amazon SNS is temporarily unavailable.");
    }
    if (!response.ok) {
      throw new IntegrationError(
        "validation",
        "Amazon SNS did not accept the subscription confirmation.",
        { providerStatus: response.status },
      );
    }
    const match = /<SubscriptionArn>([^<]+)<\/SubscriptionArn>/.exec(text);
    return {
      topicArn: message.topicArn,
      subscriptionArn: optionalString(match?.[1]),
    };
  }

  async function receive(request: SnsRequest): Promise<SnsOutcome> {
    const message = await verify(request);
    if (message.type === "Notification") {
      return {
        kind: "events",
        messageId: message.messageId,
        events: message.events,
      };
    }
    if (message.type === "UnsubscribeConfirmation") {
      return {
        kind: "unsubscribed",
        messageId: message.messageId,
        topicArn: message.topicArn,
      };
    }
    const confirmation = await confirmSubscription(message);
    return {
      kind: "subscription_confirmed",
      messageId: message.messageId,
      topicArn: confirmation.topicArn,
      subscriptionArn: confirmation.subscriptionArn,
    };
  }

  return { verify, confirmSubscription, receive };
}
