import "server-only";

import { headers } from "next/headers";

const apiUrl = (process.env.API_URL ?? "http://localhost:3001").replace(
  /\/+$/,
  "",
);

export type ApiResponse = { status: number; data: unknown };

export async function apiRequest(path: string): Promise<ApiResponse> {
  const cookie = (await headers()).get("cookie");
  if (!cookie) {
    return { status: 401, data: null };
  }
  try {
    const response = await fetch(`${apiUrl}/v1${path}`, {
      headers: { cookie },
      cache: "no-store",
    });
    const data: unknown = await response.json().catch(() => null);
    return { status: response.status, data };
  } catch {
    return { status: 0, data: null };
  }
}
