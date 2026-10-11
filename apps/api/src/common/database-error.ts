export const uniqueViolation = "23505";
export const foreignKeyViolation = "23503";

export function databaseError(error: unknown) {
  let current = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (typeof current !== "object") {
      return null;
    }
    const { code, constraint, cause } = current as {
      code?: unknown;
      constraint?: unknown;
      cause?: unknown;
    };
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) {
      return {
        code,
        constraint: typeof constraint === "string" ? constraint : "",
      };
    }
    current = cause;
  }
  return null;
}
