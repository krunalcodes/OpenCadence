import { authClient } from "@workspace/auth/client";

export { authClient };

export type AuthError = {
  status: number;
  code?: string;
  message?: string;
};

type AuthResult<T> = { data: T | null; error: AuthError | null };

export async function attempt<T>(
  call: () => Promise<AuthResult<T>>,
): Promise<AuthResult<T>> {
  try {
    return await call();
  } catch {
    return { data: null, error: { status: 0 } };
  }
}

export function describeAuthError(error: AuthError, fallback: string) {
  if (error.status === 0 || error.status >= 502) {
    return "Could not reach the server. Check your connection and try again.";
  }
  if (error.status === 429) {
    return "Too many attempts. Wait a minute and try again.";
  }
  return fallback;
}
