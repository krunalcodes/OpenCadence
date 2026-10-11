import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

const apiUrl = (process.env.API_URL ?? "http://localhost:3001").replace(
  /\/+$/,
  "",
);

async function hasValidSession(request: NextRequest) {
  try {
    const response = await fetch(`${apiUrl}/api/auth/get-session`, {
      headers: { cookie: request.headers.get("cookie") ?? "" },
      cache: "no-store",
    });
    if (!response.ok) {
      return false;
    }
    const data: unknown = await response.json();
    return typeof data === "object" && data !== null && "session" in data;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasCookie = Boolean(getSessionCookie(request));
  const isProduct = pathname === "/app" || pathname.startsWith("/app/");

  if (isProduct) {
    return hasCookie
      ? NextResponse.next()
      : NextResponse.redirect(new URL("/sign-in", request.url));
  }

  if (hasCookie && (await hasValidSession(request))) {
    return NextResponse.redirect(new URL("/app/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/app/:path*",
    "/sign-in",
    "/sign-up",
    "/forgot-password",
    "/reset-password",
  ],
};
