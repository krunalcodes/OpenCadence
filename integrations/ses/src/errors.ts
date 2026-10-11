import {
  IntegrationError,
  type IntegrationErrorCode,
} from "@workspace/integration-core";
import { defaultRetryAfterSeconds } from "./config";

export type SesErrorContext = {
  permission: string;
  region: string;
  secret?: string;
  from?: string;
  resourceLimits?: boolean;
};

type Failure = {
  name: string;
  message: string;
  status?: number;
  retryAfter?: string;
};

type Mapped = {
  code: IntegrationErrorCode;
  message: string;
  retryAfterSeconds?: number;
};

const credentialNames = [
  "UnrecognizedClientException",
  "InvalidClientTokenId",
  "InvalidSignatureException",
  "SignatureDoesNotMatch",
  "IncompleteSignature",
  "IncompleteSignatureException",
  "ExpiredTokenException",
  "ExpiredToken",
  "InvalidAccessKeyId",
  "MissingAuthenticationToken",
  "MissingAuthenticationTokenException",
  "AuthFailure",
];

const permissionNames = [
  "AccessDeniedException",
  "AccessDenied",
  "NotAuthorized",
  "NotAuthorizedException",
];

const throttleNames = [
  "TooManyRequestsException",
  "ThrottlingException",
  "Throttling",
  "ThrottledException",
  "RequestLimitExceeded",
];

const temporaryNames = [
  "InternalFailure",
  "InternalServiceErrorException",
  "InternalServerError",
  "ServiceUnavailable",
  "ServiceUnavailableException",
  "RequestTimeout",
  "RequestTimeoutException",
  "RequestAbortedException",
  "ConcurrentModificationException",
];

const validationNames = [
  "BadRequestException",
  "ValidationError",
  "ValidationException",
  "MalformedHttpRequestException",
  "RequestEntityTooLargeException",
  "InvalidNextTokenException",
  "AlreadyExistsException",
  "ConflictException",
];

const maxProviderMessageLength = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function retryAfterHeader(error: Record<string, unknown>) {
  const response = isRecord(error.$response) ? error.$response : undefined;
  const headers = isRecord(response?.headers) ? response.headers : {};
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === "retry-after" && typeof value === "string") {
      return value;
    }
  }
  return undefined;
}

function toFailure(error: unknown): Failure | null {
  if (!isRecord(error)) {
    return null;
  }
  const metadata = isRecord(error.$metadata) ? error.$metadata : {};
  const status =
    typeof metadata.httpStatusCode === "number"
      ? metadata.httpStatusCode
      : undefined;
  const isServiceError = error.$fault === "client" || error.$fault === "server";
  if (status === undefined && !isServiceError) {
    return null;
  }
  return {
    name: text(error.name) ?? text(error.Code) ?? "",
    message: text(error.message) ?? "",
    status,
    retryAfter: retryAfterHeader(error),
  };
}

function networkCode(error: unknown): string | undefined {
  if (!isRecord(error)) {
    return undefined;
  }
  return text(error.code) ?? networkCode(error.cause);
}

function retryAfterSeconds(value: string | undefined) {
  const seconds = Number(value);
  if (value && Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds);
  }
  return defaultRetryAfterSeconds;
}

function deniedPermission(failure: Failure, context: SesErrorContext) {
  const match = /not authorized to perform:?\s+([\w-]+:[\w*]+)/i.exec(
    failure.message,
  );
  return match?.[1] ?? context.permission;
}

function failedIdentities(message: string) {
  const match = /failed the check in region [\w-]+:\s*(.+)$/is.exec(message);
  if (!match?.[1]) {
    return [];
  }
  return match[1]
    .split(",")
    .map((identity) => identity.trim().replace(/\.+$/, "").toLowerCase())
    .filter((identity) => identity.length > 0);
}

function namesSender(identities: string[], from: string | undefined) {
  if (!from) {
    return identities.length === 0;
  }
  const address = from.toLowerCase();
  const domain = address.split("@")[1] ?? "";
  return identities.some(
    (identity) =>
      identity === address ||
      identity === domain ||
      identity.endsWith(`<${address}>`) ||
      (identity.length > 0 && domain.endsWith(`.${identity}`)),
  );
}

function rejectedMessage(failure: Failure, context: SesErrorContext): Mapped {
  if (/not verified/i.test(failure.message)) {
    const identities = failedIdentities(failure.message);
    if (identities.length === 0 || namesSender(identities, context.from)) {
      return {
        code: "domain_not_verified",
        message: `The from address or its domain is not a verified identity in Amazon SES in ${context.region}. In the sandbox every recipient must be verified too.`,
      };
    }
    return {
      code: "blocked_by_policy",
      message: `This Amazon SES account is in the sandbox in ${context.region} and only delivers to verified addresses. Verify the recipient or request production access.`,
    };
  }
  if (/paused|suspended/i.test(failure.message)) {
    return {
      code: "blocked_by_policy",
      message: "Sending is paused for this Amazon SES account.",
    };
  }
  return {
    code: "validation",
    message: "Amazon SES rejected the message.",
  };
}

function throttled(failure: Failure): Mapped {
  if (/daily message quota/i.test(failure.message)) {
    return {
      code: "quota_reached",
      message:
        "The 24 hour sending quota of this Amazon SES account has been reached.",
    };
  }
  return {
    code: "rate_limited",
    message: /maximum sending rate/i.test(failure.message)
      ? "The maximum send rate of this Amazon SES account was exceeded. Try again shortly."
      : "Amazon SES is rate limiting requests. Try again shortly.",
    retryAfterSeconds: retryAfterSeconds(failure.retryAfter),
  };
}

function mapFailure(failure: Failure, context: SesErrorContext): Mapped {
  const { name, status } = failure;
  if (
    name === "InvalidSignatureException" &&
    /signature (expired|not yet current)/i.test(failure.message)
  ) {
    return {
      code: "temporary",
      message:
        "Amazon SES rejected the request time. Check the clock of the server.",
    };
  }
  if (credentialNames.includes(name)) {
    return {
      code: "invalid_credentials",
      message: `Amazon SES rejected the access key in ${context.region}. Check the access key ID, the secret access key, and that the region is enabled for the account.`,
    };
  }
  if (permissionNames.includes(name)) {
    const permission = deniedPermission(failure, context);
    return {
      code: "insufficient_permission",
      message: `The access key is not allowed to call ${permission}. Add ${permission} to its IAM policy.`,
    };
  }
  if (name === "OptInRequired") {
    return {
      code: "insufficient_permission",
      message: `Amazon SES is not enabled for this account in ${context.region}.`,
    };
  }
  if (name === "MessageRejected") {
    return rejectedMessage(failure, context);
  }
  if (name === "MailFromDomainNotVerifiedException") {
    return {
      code: "domain_not_verified",
      message:
        "The custom MAIL FROM domain of the sending identity is not verified in Amazon SES.",
    };
  }
  if (name === "AccountSuspendedException") {
    return {
      code: "blocked_by_policy",
      message: "Sending is suspended for this Amazon SES account.",
    };
  }
  if (name === "SendingPausedException") {
    return {
      code: "blocked_by_policy",
      message:
        "Sending is paused for this Amazon SES account or configuration set.",
    };
  }
  if (name === "LimitExceededException" && context.resourceLimits) {
    return {
      code: "validation",
      message:
        "The Amazon SES account has reached its limit for this kind of resource.",
    };
  }
  if (name === "LimitExceededException" || throttleNames.includes(name)) {
    return throttled(failure);
  }
  if (name === "NotFoundException") {
    return {
      code: "validation",
      message:
        "Amazon SES could not find the configuration set or another resource named in the request.",
    };
  }
  if (
    temporaryNames.includes(name) ||
    (status !== undefined && status >= 500)
  ) {
    return {
      code: "temporary",
      message: "Amazon SES is temporarily unavailable. Try again shortly.",
    };
  }
  if (validationNames.includes(name)) {
    return {
      code: "validation",
      message: "Amazon SES did not accept the request.",
    };
  }
  if (status === 429) {
    return throttled(failure);
  }
  if (status === 401 || status === 403) {
    return {
      code: "invalid_credentials",
      message: `Amazon SES rejected the access key in ${context.region}.`,
    };
  }
  if (status !== undefined && status >= 400) {
    return {
      code: "validation",
      message: "Amazon SES did not accept the request.",
    };
  }
  return {
    code: "unknown",
    message: "Amazon SES returned an unexpected error.",
  };
}

function redact(message: string, secret: string | undefined) {
  const cleaned = secret ? message.replaceAll(secret, "[redacted]") : message;
  return cleaned.slice(0, maxProviderMessageLength);
}

export function toSesError(error: unknown, context: SesErrorContext) {
  if (error instanceof IntegrationError) {
    return error;
  }
  const failure = toFailure(error);
  if (!failure) {
    if (networkCode(error) === "ENOTFOUND") {
      return new IntegrationError(
        "validation",
        `Amazon SES has no endpoint for the region ${context.region}.`,
        { cause: error },
      );
    }
    return new IntegrationError(
      "temporary",
      `Amazon SES could not be reached in ${context.region}. Check the region and try again.`,
      { cause: error },
    );
  }
  const mapped = mapFailure(failure, context);
  return new IntegrationError(mapped.code, mapped.message, {
    providerStatus: failure.status,
    providerCode: failure.name || undefined,
    providerMessage: failure.message
      ? redact(failure.message, context.secret)
      : undefined,
    retryAfterSeconds: mapped.retryAfterSeconds,
  });
}

export function unexpectedResponseError() {
  return new IntegrationError(
    "unknown",
    "Amazon SES returned an unexpected response.",
  );
}
