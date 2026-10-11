"use server";

import { redirect } from "next/navigation";
import {
  confirmUnsubscribe,
  isToken,
  undoUnsubscribe,
} from "@/features/unsubscribe/lib/unsubscribe-api";

function field(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function page(token: string, query: string) {
  return isToken(token)
    ? `/unsubscribe/${token}?${query}`
    : "/unsubscribe/invalid";
}

export async function unsubscribeAction(form: FormData) {
  const token = field(form, "token");
  const scope = field(form, "scope") === "list" ? "list" : "all";
  const result = await confirmUnsubscribe(token, scope);
  redirect(
    page(token, result.ok ? `done=${scope}` : `failed=${result.reason}`),
  );
}

export async function resubscribeAction(form: FormData) {
  const token = field(form, "token");
  const result = await undoUnsubscribe(token);
  redirect(page(token, result.ok ? "done=again" : `failed=${result.reason}`));
}
