"use server";

import { redirect } from "next/navigation";
import { statusAnchor } from "@/features/preferences/lib/paths";
import {
  isListId,
  isToken,
  maxListIds,
  savePreferences,
} from "@/features/preferences/lib/preferences-api";

function page(token: string, query: string) {
  return isToken(token)
    ? `/preferences/${token}?${query}#${statusAnchor}`
    : "/preferences/invalid";
}

function tokenOf(form: FormData) {
  const value = form.get("token");
  return typeof value === "string" ? value : "";
}

export async function savePreferencesAction(form: FormData) {
  const token = tokenOf(form);
  const listIds = [...new Set(form.getAll("listIds").filter(isListId))].slice(
    0,
    maxListIds,
  );
  const result = await savePreferences(token, {
    listIds,
    unsubscribeAll: false,
  });
  redirect(page(token, result.ok ? "done=saved" : `failed=${result.reason}`));
}

export async function unsubscribeAllAction(form: FormData) {
  const token = tokenOf(form);
  const result = await savePreferences(token, {
    listIds: [],
    unsubscribeAll: true,
  });
  redirect(page(token, result.ok ? "done=all" : `failed=${result.reason}`));
}
