import "server-only";

import { headers } from "next/headers";
import {
  type DoneStatus,
  doneStatuses,
  type PublicFailure,
  type PublicForm,
  publicIdPattern,
  toPublicForm,
} from "@/features/forms/lib/public-form";
import { isRow, textOrNull } from "@/lib/api";

const apiUrl = (process.env.API_URL ?? "http://localhost:3001").replace(
  /\/+$/,
  "",
);

const tokenPattern = /^[A-Za-z0-9_-]{20,400}$/;

export type LoadFailure = "missing" | "busy" | "offline";

export type PublicFormResult =
  | { ok: true; form: PublicForm }
  | { ok: false; reason: LoadFailure };

export type SubmitResult =
  | { ok: true; status: DoneStatus; redirectUrl: string | null }
  | { ok: false; reason: PublicFailure | "missing"; field: string | null };

export type ConfirmState = "pending" | "confirmed" | "already" | "expired";

const confirmStates: ConfirmState[] = [
  "pending",
  "confirmed",
  "already",
  "expired",
];

export type Confirmation = {
  status: ConfirmState;
  brandName: string;
  redirectUrl: string | null;
  email: string | null;
};

export type ConfirmFailure = "invalid" | "busy" | "offline";

export type ConfirmResult =
  | { ok: true; confirmation: Confirmation }
  | { ok: false; reason: ConfirmFailure };

export function isPublicId(value: string) {
  return publicIdPattern.test(value);
}

export function isConfirmToken(value: string) {
  return tokenPattern.test(value);
}

export function webUrlOrNull(value: unknown) {
  const text = textOrNull(value);
  if (!text || !URL.canParse(text)) {
    return null;
  }
  const url = new URL(text);
  return url.protocol === "http:" || url.protocol === "https:"
    ? url.href
    : null;
}

async function call(
  path: string,
  init: { method: "GET" | "POST"; body?: object },
) {
  const incoming = await headers();
  const forwarded = incoming.get("x-forwarded-for");
  const userAgent = incoming.get("user-agent");
  try {
    const response = await fetch(`${apiUrl}/v1/public/forms/${path}`, {
      method: init.method,
      headers: {
        ...(forwarded ? { "x-forwarded-for": forwarded } : {}),
        ...(userAgent ? { "user-agent": userAgent } : {}),
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
    const data: unknown = await response.json().catch(() => null);
    return { status: response.status, data };
  } catch {
    return { status: 0, data: null };
  }
}

export async function readPublicForm(
  publicId: string,
): Promise<PublicFormResult> {
  if (!isPublicId(publicId)) {
    return { ok: false, reason: "missing" };
  }
  const response = await call(publicId, { method: "GET" });
  if (response.status === 404 || response.status === 400) {
    return { ok: false, reason: "missing" };
  }
  if (response.status !== 200) {
    return { ok: false, reason: response.status === 429 ? "busy" : "offline" };
  }
  const form = toPublicForm(response.data);
  return form ? { ok: true, form } : { ok: false, reason: "offline" };
}

export async function submitPublicForm(
  publicId: string,
  values: Record<string, string>,
): Promise<SubmitResult> {
  if (!isPublicId(publicId)) {
    return { ok: false, reason: "missing", field: null };
  }
  const response = await call(`${publicId}/submit`, {
    method: "POST",
    body: values,
  });
  const data = isRow(response.data) ? response.data : {};
  if (response.status === 200) {
    const status = doneStatuses.find((item) => item === data.status);
    return status
      ? { ok: true, status, redirectUrl: webUrlOrNull(data.redirectUrl) }
      : { ok: false, reason: "offline", field: null };
  }
  if (response.status === 404) {
    return { ok: false, reason: "missing", field: null };
  }
  if (response.status === 400) {
    return { ok: false, reason: "invalid", field: textOrNull(data.field) };
  }
  return {
    ok: false,
    reason: response.status === 429 ? "busy" : "offline",
    field: null,
  };
}

function toConfirmation(value: unknown): Confirmation | null {
  if (!isRow(value)) {
    return null;
  }
  const status = confirmStates.find((item) => item === value.status);
  if (!status) {
    return null;
  }
  return {
    status,
    brandName: typeof value.brandName === "string" ? value.brandName : "",
    redirectUrl: webUrlOrNull(value.redirectUrl),
    email: textOrNull(value.email),
  };
}

async function confirmation(
  token: string,
  method: "GET" | "POST",
): Promise<ConfirmResult> {
  if (!isConfirmToken(token)) {
    return { ok: false, reason: "invalid" };
  }
  const response = await call(`confirm/${token}`, { method });
  if (response.status === 404 || response.status === 400) {
    return { ok: false, reason: "invalid" };
  }
  if (response.status !== 200) {
    return { ok: false, reason: response.status === 429 ? "busy" : "offline" };
  }
  const result = toConfirmation(response.data);
  return result
    ? { ok: true, confirmation: result }
    : { ok: false, reason: "offline" };
}

export function readConfirmation(token: string) {
  return confirmation(token, "GET");
}

export function confirmSubscription(token: string) {
  return confirmation(token, "POST");
}
