import {
  IntegrationError,
  type IntegrationErrorCode,
} from "@workspace/integration-core";

type ResendErrorCode = Extract<
  IntegrationErrorCode,
  | "invalid_credentials"
  | "insufficient_permission"
  | "rate_limited"
  | "quota_reached"
  | "domain_not_verified"
  | "validation"
  | "temporary"
  | "unknown"
>;

export type ResendErrorResponse = {
  status: number;
  name?: string;
  message?: string;
  retryAfter?: string | null;
};

const messages: Record<ResendErrorCode, string> = {
  invalid_credentials: "Resend rejected the API key.",
  insufficient_permission:
    "This Resend API key can only send email. Use a key with full access.",
  rate_limited: "Resend is rate limiting requests. Try again shortly.",
  quota_reached: "The sending quota for this Resend account has been reached.",
  domain_not_verified:
    "The sending domain is not verified in this Resend account.",
  validation: "Resend did not accept the request.",
  temporary: "Resend is temporarily unavailable. Try again shortly.",
  unknown: "Resend returned an unexpected error.",
};

const quotaNames = ["daily_quota_exceeded", "monthly_quota_exceeded"];

const lockedNames = ["concurrent_idempotent_requests", "resource_locked"];

function mentionsUnverifiedDomain(message: string | undefined) {
  if (!message) {
    return false;
  }
  const text = message.toLowerCase();
  return (
    (text.includes("domain") && text.includes("not verified")) ||
    text.includes("testing emails")
  );
}

function codeFor({ status, name, message }: ResendErrorResponse) {
  if (status === 401) {
    return name === "restricted_api_key"
      ? "insufficient_permission"
      : "invalid_credentials";
  }
  if (status === 403) {
    if (name === "validation_error") {
      return mentionsUnverifiedDomain(message)
        ? "domain_not_verified"
        : "validation";
    }
    return "invalid_credentials";
  }
  if (status === 429) {
    return name && quotaNames.includes(name) ? "quota_reached" : "rate_limited";
  }
  if (status === 409) {
    if (name === "invalid_idempotent_request") {
      return "validation";
    }
    return name && lockedNames.includes(name) ? "temporary" : "unknown";
  }
  if ([400, 404, 405, 422].includes(status)) {
    return "validation";
  }
  if (status >= 500) {
    return "temporary";
  }
  return "unknown";
}

function retryAfterSeconds(value: string | null | undefined) {
  if (!value) {
    return undefined;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, Math.ceil(seconds));
  }
  const date = Date.parse(value);
  if (Number.isNaN(date)) {
    return undefined;
  }
  return Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

export function toResendError(response: ResendErrorResponse) {
  const code: ResendErrorCode = codeFor(response);
  return new IntegrationError(code, messages[code], {
    providerStatus: response.status,
    providerCode: response.name,
    providerMessage: response.message,
    retryAfterSeconds: retryAfterSeconds(response.retryAfter),
  });
}

export function unreachableError(cause: unknown) {
  return new IntegrationError("temporary", "Resend could not be reached.", {
    cause,
  });
}

export function unexpectedResponseError(status: number) {
  return new IntegrationError(
    "unknown",
    "Resend returned an unexpected response.",
    { providerStatus: status },
  );
}
