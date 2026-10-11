export const integrationErrorCodes = [
  "invalid_credentials",
  "auth_expired",
  "auth_revoked",
  "insufficient_permission",
  "rate_limited",
  "quota_reached",
  "daily_limit_reached",
  "domain_not_verified",
  "blocked_by_policy",
  "validation",
  "temporary",
  "unknown",
] as const;

export type IntegrationErrorCode = (typeof integrationErrorCodes)[number];

export type IntegrationErrorDetails = {
  retryAfterSeconds?: number;
  providerStatus?: number;
  providerCode?: string;
  providerMessage?: string;
  cause?: unknown;
};

const retryableCodes: IntegrationErrorCode[] = [
  "auth_expired",
  "rate_limited",
  "temporary",
];

export class IntegrationError extends Error {
  readonly code: IntegrationErrorCode;
  readonly retryAfterSeconds?: number;
  readonly providerStatus?: number;
  readonly providerCode?: string;
  readonly providerMessage?: string;

  constructor(
    code: IntegrationErrorCode,
    message: string,
    details: IntegrationErrorDetails = {},
  ) {
    super(message, { cause: details.cause });
    this.name = "IntegrationError";
    this.code = code;
    this.retryAfterSeconds = details.retryAfterSeconds;
    this.providerStatus = details.providerStatus;
    this.providerCode = details.providerCode;
    this.providerMessage = details.providerMessage;
  }

  get retryable() {
    return retryableCodes.includes(this.code);
  }
}

export function isIntegrationError(error: unknown): error is IntegrationError {
  return error instanceof IntegrationError;
}

export function toIntegrationError(error: unknown): IntegrationError {
  if (isIntegrationError(error)) {
    return error;
  }
  return new IntegrationError(
    "temporary",
    "The provider could not be reached.",
    { cause: error },
  );
}
