"use server";

import { redirect } from "next/navigation";
import {
  confirmSubscription,
  isConfirmToken,
  isPublicId,
  submitPublicForm,
} from "@/features/forms/lib/public-api";
import {
  fieldKeyPattern,
  isEmail,
  maxValueLength,
} from "@/features/forms/lib/public-form";
import {
  confirmPath,
  embedField,
  formField,
  hostedFormPath,
} from "@/features/forms/lib/public-paths";

const maxEntries = 40;

const failureCodes = {
  invalid: "validation",
  busy: "rate_limited",
  offline: "unavailable",
} as const;

function text(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function valuesOf(form: FormData) {
  const values: Record<string, string> = {};
  let count = 0;
  for (const [key, value] of form.entries()) {
    if (
      typeof value !== "string" ||
      key === formField ||
      key === embedField ||
      !fieldKeyPattern.test(key) ||
      key in values
    ) {
      continue;
    }
    count += 1;
    if (count > maxEntries) {
      break;
    }
    values[key] = value.slice(0, maxValueLength * 4);
  }
  return values;
}

export async function submitFormAction(form: FormData) {
  const publicId = text(form, formField);
  const embed = text(form, embedField) === "1";
  if (!isPublicId(publicId)) {
    redirect("/f/unavailable");
  }
  const values = valuesOf(form);
  if (!isEmail((values.email ?? "").trim())) {
    redirect(
      hostedFormPath(publicId, embed, {
        error: failureCodes.invalid,
        field: "email",
      }),
    );
  }
  const result = await submitPublicForm(publicId, values);
  if (result.ok) {
    if (result.redirectUrl && !embed) {
      redirect(result.redirectUrl);
    }
    redirect(hostedFormPath(publicId, embed, { submitted: result.status }));
  }
  if (result.reason === "missing") {
    redirect(hostedFormPath(publicId, embed, {}));
  }
  redirect(
    hostedFormPath(publicId, embed, {
      error: failureCodes[result.reason],
      ...(result.field ? { field: result.field } : {}),
    }),
  );
}

export async function confirmAction(form: FormData) {
  const token = text(form, "token");
  if (!isConfirmToken(token)) {
    redirect("/f/confirm/invalid");
  }
  const result = await confirmSubscription(token);
  if (!result.ok) {
    redirect(
      result.reason === "invalid"
        ? confirmPath(token, {})
        : confirmPath(token, { failed: result.reason }),
    );
  }
  const { status, redirectUrl } = result.confirmation;
  if (status === "expired") {
    redirect(confirmPath(token, {}));
  }
  if (redirectUrl) {
    redirect(redirectUrl);
  }
  redirect(confirmPath(token, { done: "confirmed" }));
}
