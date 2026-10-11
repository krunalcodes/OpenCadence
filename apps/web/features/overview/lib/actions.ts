"use server";

import { cookies } from "next/headers";
import {
  fallbackTimezone,
  timezoneCookie,
  toTimezone,
} from "@/features/overview/lib/overview";

const cookieMaxAge = 60 * 60 * 24 * 365;

export async function saveTimezone(timezone: string) {
  (await cookies()).set(
    timezoneCookie,
    toTimezone(timezone) ?? fallbackTimezone,
    {
      path: "/",
      maxAge: cookieMaxAge,
      sameSite: "lax",
    },
  );
}
