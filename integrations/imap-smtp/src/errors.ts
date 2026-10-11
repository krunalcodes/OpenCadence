import {
  IntegrationError,
  type IntegrationErrorCode,
  isIntegrationError,
} from "@workspace/integration-core";

export type Side = "smtp" | "imap";

export type Secrets = { username: string; password: string };

type Failure = {
  code?: string;
  originalCode?: string;
  status?: number;
  enhancedStatus?: string;
  responseCode?: string;
  providerText?: string;
  text: string;
  authenticationFailed: boolean;
  mailboxMissing: boolean;
  tlsFailed: boolean;
  throttleMs?: number;
};

const labels: Record<Side, string> = { smtp: "SMTP", imap: "IMAP" };

const certificateCodes = [
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "CERT_REVOKED",
  "CERT_UNTRUSTED",
  "CERT_REJECTED",
  "CERT_SIGNATURE_FAILURE",
  "CERT_CHAIN_TOO_LONG",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_DECRYPT_CERT_SIGNATURE",
  "INVALID_CA",
  "INVALID_PURPOSE",
  "HOSTNAME_MISMATCH",
  "ERR_TLS_CERT_ALTNAME_INVALID",
];

const certificatePattern =
  /self[- ]signed certificate|certificate has expired|certificate is not yet valid|unable to verify the first certificate|unable to get (local )?issuer certificate|does not match certificate's altnames|certificate verify failed/;

const policyPatterns = [
  /application-specific password required/,
  /please log in via your web browser/,
  /web ?login required/,
  /not enabled for (imap|smtp|pop)/,
  /\b(imap|smtp|pop3?)\b[^.\n]{0,60}\b(is|are|has been|been) (disabled|turned off|not enabled|not allowed)/,
  /smtpclientauthentication is disabled/,
  /basic authentication is disabled/,
  /login is disabled/,
  /account (is|has been) (disabled|locked|suspended)/,
];

const dailyLimitPattern = /daily[^\n]{0,40}(limit|quota)/;

const ratePattern =
  /too many|rate limit|throttl|try again later, closing connection/;

const imapAuthPattern =
  /invalid credentials|authentication failed|login failed|invalid login|incorrect (username|password)/;

const smtpAuthStatuses = [530, 534, 535];

const smtpRateStatuses = [421, 450, 451, 452];

const smtpRejectionStatuses = [
  501, 510, 511, 512, 513, 550, 551, 552, 553, 554,
];

const unreachableCodes = [
  "ECONNECTION",
  "ETIMEDOUT",
  "ESOCKET",
  "ETLS",
  "EDNS",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "ECONNABORTED",
  "EPIPE",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ETIMEOUT",
  "CONNECT_TIMEOUT",
  "GREETING_TIMEOUT",
  "UPGRADE_TIMEOUT",
  "NoConnection",
  "EConnectionClosed",
  "ClosedAfterConnectText",
  "ClosedAfterConnectTLS",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringField(source: Record<string, unknown>, key: string) {
  const value = source[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

function numberField(source: Record<string, unknown>, key: string) {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function readFailure(error: unknown): Failure {
  const source = isRecord(error) ? error : {};
  const message =
    error instanceof Error
      ? error.message
      : (stringField(source, "message") ?? "");
  const providerText =
    stringField(source, "responseText") ?? stringField(source, "response");
  const text = `${providerText ?? ""}\n${message}`.toLowerCase();
  return {
    code: stringField(source, "code"),
    originalCode: stringField(source, "originalCode"),
    status: numberField(source, "responseCode"),
    enhancedStatus: providerText?.match(/\b([245]\.\d{1,3}\.\d{1,3})\b/)?.[1],
    responseCode: stringField(source, "serverResponseCode")?.toUpperCase(),
    providerText: providerText ?? (message || undefined),
    text,
    authenticationFailed: source.authenticationFailed === true,
    mailboxMissing: source.mailboxMissing === true,
    tlsFailed: source.tlsFailed === true,
    throttleMs: numberField(source, "throttleReset"),
  };
}

function hasCode(failure: Failure, codes: string[]) {
  return (
    (failure.code !== undefined && codes.includes(failure.code)) ||
    (failure.originalCode !== undefined && codes.includes(failure.originalCode))
  );
}

function isCertificateFailure(failure: Failure) {
  return (
    hasCode(failure, certificateCodes) || certificatePattern.test(failure.text)
  );
}

function isRateLimited(side: Side, failure: Failure) {
  if (ratePattern.test(failure.text)) {
    return true;
  }
  if (side === "imap") {
    return failure.code === "ETHROTTLE" || failure.responseCode === "THROTTLED";
  }
  return (
    (failure.status !== undefined &&
      smtpRateStatuses.includes(failure.status)) ||
    failure.enhancedStatus?.startsWith("4.7.") === true
  );
}

function isAuthFailure(side: Side, failure: Failure) {
  if (side === "imap") {
    return (
      failure.authenticationFailed ||
      failure.responseCode === "AUTHENTICATIONFAILED" ||
      failure.responseCode === "AUTHORIZATIONFAILED" ||
      imapAuthPattern.test(failure.text)
    );
  }
  return (
    failure.code === "EAUTH" ||
    failure.code === "ENOAUTH" ||
    (failure.status !== undefined && smtpAuthStatuses.includes(failure.status))
  );
}

function isRejection(side: Side, failure: Failure) {
  if (side === "imap") {
    return (
      failure.mailboxMissing ||
      failure.responseCode === "TRYCREATE" ||
      failure.responseCode === "NONEXISTENT"
    );
  }
  if (failure.status !== undefined) {
    return smtpRejectionStatuses.includes(failure.status);
  }
  return failure.code === "EENVELOPE" || failure.code === "EMESSAGE";
}

function isUnreachable(side: Side, failure: Failure) {
  if (hasCode(failure, unreachableCodes) || failure.tlsFailed) {
    return true;
  }
  if (side === "imap") {
    return (
      failure.responseCode === "UNAVAILABLE" || failure.responseCode === "INUSE"
    );
  }
  return (
    failure.status !== undefined &&
    failure.status >= 400 &&
    failure.status < 500
  );
}

function classify(
  side: Side,
  failure: Failure,
): [IntegrationErrorCode, string] {
  const label = labels[side];
  if (isCertificateFailure(failure)) {
    return [
      "validation",
      `The ${label} server's certificate could not be verified.`,
    ];
  }
  if (policyPatterns.some((pattern) => pattern.test(failure.text))) {
    return [
      "blocked_by_policy",
      `The mail provider blocked this sign-in to the ${label} server. Turn on ${label} access for the account or use an app password.`,
    ];
  }
  if (side === "smtp" && dailyLimitPattern.test(failure.text)) {
    return [
      "daily_limit_reached",
      "This mailbox has reached its daily sending limit.",
    ];
  }
  if (isRateLimited(side, failure)) {
    return [
      "rate_limited",
      `The ${label} server is limiting requests. Try again shortly.`,
    ];
  }
  if (isAuthFailure(side, failure)) {
    return [
      "invalid_credentials",
      `The ${label} server rejected the sign-in. Many providers need an app password instead of the account password.`,
    ];
  }
  if (isRejection(side, failure)) {
    return side === "smtp"
      ? [
          "validation",
          "The SMTP server rejected the sender or a recipient address.",
        ]
      : ["validation", "The folder does not exist in the mailbox."];
  }
  if (isUnreachable(side, failure)) {
    return ["temporary", `The ${label} server could not be reached.`];
  }
  return ["unknown", `The ${label} server returned an unexpected error.`];
}

function escapePattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function redact(text: string, secrets: Secrets): string {
  const values = [
    secrets.password,
    secrets.username,
    Buffer.from(secrets.password).toString("base64"),
    Buffer.from(`\0${secrets.username}\0${secrets.password}`).toString(
      "base64",
    ),
  ].filter((value) => value !== "");
  return values.reduce(
    (result, value) =>
      result.replace(new RegExp(escapePattern(value), "g"), "[redacted]"),
    text,
  );
}

function retryAfterSeconds(failure: Failure) {
  if (failure.throttleMs === undefined || failure.throttleMs <= 0) {
    return undefined;
  }
  return Math.ceil(failure.throttleMs / 1000);
}

export function toMailError(
  side: Side,
  error: unknown,
  secrets: Secrets,
): IntegrationError {
  if (isIntegrationError(error)) {
    return error;
  }
  const failure = readFailure(error);
  const [code, message] = classify(side, failure);
  return new IntegrationError(code, message, {
    retryAfterSeconds:
      code === "rate_limited" ? retryAfterSeconds(failure) : undefined,
    providerStatus: failure.status,
    providerCode:
      side === "smtp"
        ? (failure.enhancedStatus ?? failure.code)
        : (failure.responseCode ?? failure.code),
    providerMessage: failure.providerText
      ? redact(failure.providerText.trim(), secrets)
      : undefined,
  });
}

export function messageGoneError() {
  return new IntegrationError(
    "validation",
    "The message is no longer in the mailbox.",
  );
}
