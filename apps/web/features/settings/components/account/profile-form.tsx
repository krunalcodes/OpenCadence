"use client";

import { Button } from "@workspace/ui/components/button";
import { Field, FieldError, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { cn } from "@workspace/ui/lib/utils";
import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/spinner";
import { errorClass, inputClass } from "@/features/auth/components/form-parts";
import {
  fieldWidth,
  primaryButton,
} from "@/features/settings/components/settings-parts";
import { SettingsSection } from "@/features/settings/components/settings-section";
import { attempt, authClient, describeAuthError } from "@/lib/auth-client";
import { initialsOf } from "@/lib/initials";

const maxNameLength = 80;

function validateName(value: string) {
  const name = value.trim();
  if (name === "") {
    return "Enter your name.";
  }
  if (name.length > maxNameLength) {
    return `Shorten your name to ${maxNameLength} characters or fewer.`;
  }
  return undefined;
}

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string>();
  const [pending, startSave] = useTransition();
  const unchanged = value.trim() === name.trim();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || unchanged) {
      return;
    }
    const invalid = validateName(value);
    setError(invalid);
    if (invalid) {
      document.getElementById("profile-name")?.focus();
      return;
    }
    startSave(async () => {
      const result = await attempt(() =>
        authClient.updateUser({ name: value.trim() }),
      );
      if (result.error) {
        toast.error("Could not save your name", {
          description: describeAuthError(
            result.error,
            "Try again in a moment.",
          ),
        });
        return;
      }
      toast.success("Name saved");
      startSave(() => router.refresh());
    });
  }

  return (
    <SettingsSection
      title="Profile"
      description="Your name is shown to the other members of your workspaces."
      footer={
        <>
          <span>Your picture is made from your initials.</span>
          <Button
            type="submit"
            form="profile-form"
            disabled={pending || unchanged}
            aria-busy={pending || undefined}
            className={primaryButton}
          >
            {pending ? <Spinner /> : null}
            Save name
          </Button>
        </>
      }
    >
      <form
        id="profile-form"
        noValidate
        onSubmit={handleSubmit}
        className="flex flex-wrap items-start gap-x-5 gap-y-4"
      >
        <span
          aria-hidden
          className="grid size-14 shrink-0 place-items-center rounded-full bg-live font-semibold text-[17px] text-live-foreground"
        >
          {initialsOf(value, email)}
        </span>
        <Field
          data-invalid={error ? true : undefined}
          className={cn("min-w-0 flex-1 basis-64", fieldWidth)}
        >
          <FieldLabel htmlFor="profile-name" className="text-[13px]">
            Full name
          </FieldLabel>
          <Input
            id="profile-name"
            name="name"
            type="text"
            autoComplete="name"
            required
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              if (error) {
                setError(validateName(event.target.value));
              }
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "profile-name-error" : undefined}
            className={inputClass}
          />
          {error ? (
            <FieldError id="profile-name-error" className={errorClass}>
              {error}
            </FieldError>
          ) : null}
        </Field>
      </form>
    </SettingsSection>
  );
}
