"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/active-workspace";
import { findSampleWorkspace } from "@/lib/sample-data";

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

export async function setActiveWorkspace(id: string) {
  const workspace = findSampleWorkspace(id);
  if (!workspace) {
    return { ok: false as const };
  }

  const store = await cookies();
  store.set(ACTIVE_WORKSPACE_COOKIE, workspace.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR_IN_SECONDS,
  });
  revalidatePath("/app", "layout");

  return { ok: true as const };
}
