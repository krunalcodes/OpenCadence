import {
  IntegrationError,
  type IntegrationErrorCode,
} from "@workspace/integration-core";
import {
  asString,
  isObject,
  type JsonObject,
  readJson,
  retryAfterSeconds,
} from "./http";

type ParsedApiError = {
  message?: string;
  status?: string;
  reasons: string[];
};

function collectReasons(items: unknown): string[] {
  if (!Array.isArray(items)) {
    return [];
  }
  return items
    .map((item) => (isObject(item) ? asString(item.reason) : undefined))
    .filter((reason): reason is string => reason !== undefined);
}

function parseApiError(body: JsonObject): ParsedApiError {
  const error = body.error;
  if (isObject(error)) {
    return {
      message: asString(error.message),
      status: asString(error.status),
      reasons: [
        ...collectReasons(error.errors),
        ...collectReasons(error.details),
      ],
    };
  }
  return {
    message: asString(body.error_description),
    status: asString(error),
    reasons: [],
  };
}

function mentionsSendingLimit(message: string | undefined): boolean {
  if (!message) {
    return false;
  }
  const text = message.toLowerCase();
  return text.includes("mail sending") || text.includes("daily user sending");
}

function classify(
  status: number,
  parsed: ParsedApiError,
): [IntegrationErrorCode, string] {
  const has = (...reasons: string[]) =>
    reasons.some((reason) => parsed.reasons.includes(reason));

  if (status === 401) {
    return ["auth_expired", "The Google access token has expired."];
  }
  if (status === 429) {
    if (mentionsSendingLimit(parsed.message)) {
      return [
        "daily_limit_reached",
        "This Gmail account has reached its daily sending limit.",
      ];
    }
    return [
      "rate_limited",
      "Gmail is receiving requests too quickly. Sending will resume shortly.",
    ];
  }
  if (status === 403) {
    if (has("userRateLimitExceeded", "rateLimitExceeded")) {
      return [
        "rate_limited",
        "Gmail is receiving requests too quickly. Sending will resume shortly.",
      ];
    }
    if (has("dailyLimitExceeded")) {
      return [
        "quota_reached",
        "The daily Gmail API quota for this Google project has been used up.",
      ];
    }
    if (has("domainPolicy")) {
      return [
        "blocked_by_policy",
        "The Google Workspace administrator has blocked access to Gmail for this app.",
      ];
    }
    if (has("insufficientPermissions", "ACCESS_TOKEN_SCOPE_INSUFFICIENT")) {
      return [
        "insufficient_permission",
        "Permission to send email was not granted. Reconnect the account and allow sending.",
      ];
    }
    return ["unknown", "Gmail refused the request."];
  }
  if (status === 400) {
    return ["validation", "Gmail rejected the message as invalid."];
  }
  if (status >= 500) {
    return [
      "temporary",
      "Gmail is temporarily unavailable. Try again in a moment.",
    ];
  }
  return ["unknown", "Gmail returned an unexpected error."];
}

export async function gmailApiError(
  response: Response,
): Promise<IntegrationError> {
  const parsed = parseApiError(await readJson(response));
  const [code, message] = classify(response.status, parsed);
  return new IntegrationError(code, message, {
    retryAfterSeconds:
      code === "rate_limited" ? retryAfterSeconds(response) : undefined,
    providerStatus: response.status,
    providerCode: parsed.reasons[0] ?? parsed.status,
    providerMessage: parsed.message,
  });
}

export type TokenAction = "exchange" | "refresh" | "revoke";

function classifyToken(
  status: number,
  providerCode: string | undefined,
  action: TokenAction,
): [IntegrationErrorCode, string] {
  if (status >= 500) {
    return [
      "temporary",
      "Google sign-in is temporarily unavailable. Try again in a moment.",
    ];
  }
  if (status === 429) {
    return [
      "rate_limited",
      "Google sign-in is receiving requests too quickly. Try again shortly.",
    ];
  }
  if (providerCode === "admin_policy_enforced") {
    return [
      "auth_revoked",
      "The Google Workspace administrator does not allow this app. Ask them to allow it, then reconnect the account.",
    ];
  }
  if (providerCode === "invalid_grant") {
    if (action === "exchange") {
      return [
        "validation",
        "The Google authorization code is invalid or has expired. Start the connection again.",
      ];
    }
    return [
      "auth_revoked",
      "Access to this Google account was revoked or has expired. Reconnect the account.",
    ];
  }
  if (
    status === 401 ||
    providerCode === "invalid_client" ||
    providerCode === "unauthorized_client"
  ) {
    return [
      "invalid_credentials",
      "Google rejected the OAuth client. Check the Google client ID and secret.",
    ];
  }
  if (status === 400) {
    return ["validation", "Google rejected the sign-in request as invalid."];
  }
  return ["unknown", "Google sign-in returned an unexpected error."];
}

export async function tokenEndpointError(
  response: Response,
  action: TokenAction,
): Promise<IntegrationError> {
  const body = await readJson(response);
  const providerCode = asString(body.error);
  const [code, message] = classifyToken(response.status, providerCode, action);
  return new IntegrationError(code, message, {
    retryAfterSeconds:
      code === "rate_limited" ? retryAfterSeconds(response) : undefined,
    providerStatus: response.status,
    providerCode,
    providerMessage: asString(body.error_description),
  });
}
