import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { requestPathHeader, safeRedirect, withRedirect } from "@/lib/redirect";

const apiUrl = (process.env.API_URL ?? "http://localhost:3001").replace(
  /\/+$/,
  "",
);

const signedInHome = "/app/dashboard";

const twoFactorCookieNames = [
  "better-auth.two_factor",
  "__Secure-better-auth.two_factor",
];

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

function hasPendingTwoFactor(request: NextRequest) {
  return twoFactorCookieNames.some((name) =>
    Boolean(request.cookies.get(name)?.value),
  );
}

function redirectTo(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, request.url));
}

export async function proxy(request: NextRequest) {
  const { pathname, search, searchParams } = request.nextUrl;
  const hasCookie = Boolean(getSessionCookie(request));
  const isProduct = pathname === "/app" || pathname.startsWith("/app/");

  if (isProduct) {
    const wanted = safeRedirect(`${pathname}${search}`);
    if (!hasCookie) {
      const keep =
        pathname === "/app" || pathname === signedInHome ? null : wanted;
      return redirectTo(request, withRedirect("/sign-in", keep));
    }
    if (pathname === "/app/settings") {
      return redirectTo(request, "/app/settings/account");
    }
    const headers = new Headers(request.headers);
    headers.set(requestPathHeader, wanted ?? signedInHome);
    return NextResponse.next({ request: { headers } });
  }

  const target = safeRedirect(searchParams.get("redirect"));

  if (pathname === "/reset-password" && searchParams.has("token")) {
    return NextResponse.next();
  }

  if (hasCookie && (await hasValidSession(request))) {
    return redirectTo(request, target ?? signedInHome);
  }

  if (pathname === "/two-factor" && !hasPendingTwoFactor(request)) {
    return redirectTo(request, withRedirect("/sign-in", target));
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
    "/two-factor",
  ],
};
