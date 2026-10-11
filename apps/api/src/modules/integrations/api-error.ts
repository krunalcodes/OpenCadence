import { HttpException, HttpStatus } from "@nestjs/common";
import type { IntegrationError } from "@workspace/integration-core";

export function apiError(
  status: HttpStatus,
  code: string,
  message: string,
  field?: string,
) {
  return new HttpException(
    { statusCode: status, code, message, ...(field ? { field } : {}) },
    status,
  );
}

const statusByCode: Record<IntegrationError["code"], HttpStatus> = {
  invalid_credentials: HttpStatus.BAD_REQUEST,
  auth_expired: HttpStatus.CONFLICT,
  auth_revoked: HttpStatus.CONFLICT,
  insufficient_permission: HttpStatus.BAD_REQUEST,
  rate_limited: HttpStatus.TOO_MANY_REQUESTS,
  quota_reached: HttpStatus.TOO_MANY_REQUESTS,
  daily_limit_reached: HttpStatus.TOO_MANY_REQUESTS,
  domain_not_verified: HttpStatus.BAD_REQUEST,
  blocked_by_policy: HttpStatus.FORBIDDEN,
  validation: HttpStatus.BAD_REQUEST,
  temporary: HttpStatus.BAD_GATEWAY,
  unknown: HttpStatus.BAD_GATEWAY,
};

export function integrationApiError(error: IntegrationError, field?: string) {
  return apiError(statusByCode[error.code], error.code, error.message, field);
}
