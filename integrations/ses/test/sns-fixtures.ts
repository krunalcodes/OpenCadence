import { createSign, generateKeyPairSync, type KeyObject } from "node:crypto";

export type SigningIdentity = {
  privateKey: KeyObject;
  certificate: string;
};

export type SnsFields = Record<string, string>;

export const topicArn = "arn:aws:sns:eu-west-1:123456789012:opencadence-events";

export const certificateUrl =
  "https://sns.eu-west-1.amazonaws.com/SimpleNotificationService-0123456789abcdef0123456789abcdef.pem";

export const subscribeUrl = `https://sns.eu-west-1.amazonaws.com/?Action=ConfirmSubscription&TopicArn=${topicArn}&Token=2336412f37fb`;

function der(tag: number, content: Buffer) {
  const length = content.length;
  if (length < 128) {
    return Buffer.concat([Buffer.from([tag, length]), content]);
  }
  const bytes: number[] = [];
  for (let rest = length; rest > 0; rest = Math.floor(rest / 256)) {
    bytes.unshift(rest % 256);
  }
  return Buffer.concat([
    Buffer.from([tag, 128 + bytes.length, ...bytes]),
    content,
  ]);
}

function sequence(...items: Buffer[]) {
  return der(0x30, Buffer.concat(items));
}

function utcTime(date: Date) {
  const text = `${date.toISOString().replace(/[-:T]/g, "").slice(2, 14)}Z`;
  return der(0x17, Buffer.from(text, "ascii"));
}

function commonName(value: string) {
  return sequence(
    der(
      0x31,
      sequence(
        Buffer.from("0603550403", "hex"),
        der(0x0c, Buffer.from(value, "utf8")),
      ),
    ),
  );
}

export function createSigningIdentity(
  validFrom = new Date(Date.now() - 86400000),
  validTo = new Date(Date.now() + 86400000 * 30),
): SigningIdentity {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const algorithm = sequence(
    Buffer.from("06092a864886f70d01010b", "hex"),
    Buffer.from("0500", "hex"),
  );
  const name = commonName("sns.amazonaws.com");
  const body = sequence(
    der(0xa0, Buffer.from("020102", "hex")),
    Buffer.from("020101", "hex"),
    algorithm,
    name,
    sequence(utcTime(validFrom), utcTime(validTo)),
    name,
    publicKey.export({ type: "spki", format: "der" }),
  );
  const signature = createSign("RSA-SHA256").update(body).sign(privateKey);
  const certificate = sequence(
    body,
    algorithm,
    der(0x03, Buffer.concat([Buffer.from([0]), signature])),
  );
  const lines = certificate.toString("base64").match(/.{1,64}/g) ?? [];
  return {
    privateKey,
    certificate: `-----BEGIN CERTIFICATE-----\n${lines.join("\n")}\n-----END CERTIFICATE-----\n`,
  };
}

const notificationFields = [
  "Message",
  "MessageId",
  "Subject",
  "Timestamp",
  "TopicArn",
  "Type",
];

const confirmationFields = [
  "Message",
  "MessageId",
  "SubscribeURL",
  "Timestamp",
  "Token",
  "TopicArn",
  "Type",
];

export function signFields(
  identity: SigningIdentity,
  fields: SnsFields,
  version: "1" | "2",
) {
  const names =
    fields.Type === "Notification" ? notificationFields : confirmationFields;
  let text = "";
  for (const name of names) {
    if (fields[name] !== undefined) {
      text += `${name}\n${fields[name]}\n`;
    }
  }
  return createSign(version === "1" ? "RSA-SHA1" : "RSA-SHA256")
    .update(text, "utf8")
    .sign(identity.privateKey, "base64");
}

export function signedMessage(
  identity: SigningIdentity,
  fields: SnsFields,
  version: "1" | "2" = "2",
): SnsFields {
  const complete = {
    MessageId: "22b80b92-fdea-4c2c-8f9d-bdfb0c7bf324",
    TopicArn: topicArn,
    Timestamp: new Date().toISOString(),
    SignatureVersion: version,
    SigningCertURL: certificateUrl,
    ...fields,
  };
  return { ...complete, Signature: signFields(identity, complete, version) };
}

export function notification(
  identity: SigningIdentity,
  payload: unknown,
  overrides: SnsFields = {},
  version: "1" | "2" = "2",
) {
  return signedMessage(
    identity,
    {
      Type: "Notification",
      Message: typeof payload === "string" ? payload : JSON.stringify(payload),
      UnsubscribeURL:
        "https://sns.eu-west-1.amazonaws.com/?Action=Unsubscribe&SubscriptionArn=arn",
      ...overrides,
    },
    version,
  );
}

export function confirmation(
  identity: SigningIdentity,
  type: "SubscriptionConfirmation" | "UnsubscribeConfirmation",
  overrides: SnsFields = {},
  version: "1" | "2" = "2",
) {
  return signedMessage(
    identity,
    {
      Type: type,
      Token: "2336412f37fb",
      Message: `You have chosen to subscribe to the topic ${topicArn}.\nTo confirm the subscription, visit the SubscribeURL included in this message.`,
      SubscribeURL: subscribeUrl,
      ...overrides,
    },
    version,
  );
}
