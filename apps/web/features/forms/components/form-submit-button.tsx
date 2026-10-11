"use client";

import { useFormStatus } from "react-dom";
import { Spinner } from "@/components/spinner";
import { copy } from "@/features/forms/lib/copy";

type FormSubmitButtonProps = { label: string; describedBy?: string };

export function FormSubmitButton({
  label,
  describedBy,
}: FormSubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      aria-disabled={pending || undefined}
      aria-describedby={describedBy}
      onClick={(event) => {
        if (pending) {
          event.preventDefault();
        }
      }}
      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[var(--form-primary)] px-5 py-3 text-base leading-snug font-semibold text-[var(--form-on-primary)] outline-none transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--form-ink)] aria-disabled:opacity-80 motion-reduce:transition-none"
    >
      {pending ? <Spinner /> : null}
      <span className="break-words">{label}</span>
      {pending ? <span className="sr-only">{copy.public.pending}</span> : null}
    </button>
  );
}
