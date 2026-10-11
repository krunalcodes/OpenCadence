import type { Metadata } from "next";
import { cache } from "react";
import { HostedForm } from "@/features/forms/components/hosted-form";
import { copy } from "@/features/forms/lib/copy";
import { readPublicForm } from "@/features/forms/lib/public-api";
import {
  type DoneStatus,
  doneStatuses,
  type FormProblem,
  fieldKeyPattern,
  type PublicFailure,
} from "@/features/forms/lib/public-form";

type HostedFormPageProps = {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const loadForm = cache(readPublicForm);

const failures: Record<string, PublicFailure> = {
  validation: "invalid",
  rate_limited: "busy",
  unavailable: "offline",
};

function one(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

function toProblem(error: string, field: string): FormProblem | null {
  const reason = Object.hasOwn(failures, error) ? failures[error] : null;
  if (!reason) {
    return null;
  }
  return {
    reason,
    field: reason === "invalid" && fieldKeyPattern.test(field) ? field : null,
  };
}

export async function generateMetadata({
  params,
}: HostedFormPageProps): Promise<Metadata> {
  const { publicId } = await params;
  const result = await loadForm(publicId);
  if (!result.ok) {
    return {
      title: copy.public.metaTitle,
      robots: { index: false, follow: false },
    };
  }
  const { brand, settings } = result.form;
  const title = settings.title || copy.public.metaTitle;
  return {
    title: brand.name ? `${title} · ${brand.name}` : title,
    description: settings.description || undefined,
    referrer: "strict-origin-when-cross-origin",
  };
}

export default async function HostedFormPage({
  params,
  searchParams,
}: HostedFormPageProps) {
  const [{ publicId }, query] = await Promise.all([params, searchParams]);
  const result = await loadForm(publicId);
  const submitted = one(query.submitted);
  return (
    <HostedForm
      publicId={publicId}
      result={result}
      embed={one(query.embed) === "1"}
      done={
        doneStatuses.find(
          (status): status is DoneStatus => status === submitted,
        ) ?? null
      }
      problem={toProblem(one(query.error), one(query.field))}
    />
  );
}
