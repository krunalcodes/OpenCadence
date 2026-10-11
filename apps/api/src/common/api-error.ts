import { HttpException, type HttpStatus } from "@nestjs/common";

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
