"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/spinner";
import {
  SettingsSection,
  SettingsStack,
} from "@/features/settings/components/settings-section";
import {
  ConfirmDialog,
  dangerOutlineButtonClass,
  errorClass,
  hintClass,
  inputClass,
  labelClass,
  Notice,
  primaryButtonClass,
  roleLabels,
} from "@/features/settings/components/workspace-parts";
import { attempt, authClient, describeAuthError } from "@/lib/auth-client";
import type { Workspace, WorkspaceRole } from "@/lib/session";

const maxNameLength = 64;
const maxSlugLength = 48;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const slugTakenCodes = new Set([
  "ORGANIZATION_ALREADY_EXISTS",
  "ORGANIZATION_SLUG_ALREADY_TAKEN",
]);

function validateName(value: string) {
  const name = value.trim();
  if (name === "") {
    return "Enter a workspace name, such as your company or team name.";
  }
  if (name.length > maxNameLength) {
    return `Shorten the name to ${maxNameLength} characters or fewer.`;
  }
  return undefined;
}

function validateSlug(value: string) {
  if (value === "") {
    return "Enter a slug, such as acme or acme-marketing.";
  }
  if (value.length > maxSlugLength) {
    return `Shorten the slug to ${maxSlugLength} characters or fewer.`;
  }
  if (!slugPattern.test(value)) {
    return "Use lowercase letters, digits and single hyphens, with no hyphen at the start or end.";
  }
  return undefined;
}

type Errors = { name?: string; slug?: string };

type WorkspaceSettingsProps = {
  workspace: Workspace;
  role: WorkspaceRole;
  otherWorkspaces: Workspace[];
};

export function WorkspaceSettings({
  workspace,
  role,
  otherWorkspaces,
}: WorkspaceSettingsProps) {
  const canEdit = role === "owner" || role === "admin";

  return (
    <SettingsStack>
      {canEdit ? (
        <GeneralForm key={`general-${workspace.id}`} workspace={workspace} />
      ) : (
        <GeneralReadOnly workspace={workspace} role={role} />
      )}
      {canEdit ? (
        <DeleteWorkspace
          key={`delete-${workspace.id}`}
          workspace={workspace}
          role={role}
          otherWorkspaces={otherWorkspaces}
        />
      ) : null}
    </SettingsStack>
  );
}

const generalDescription =
  "The name appears in the workspace switcher and in invitation emails. The slug is a short unique identifier for this workspace.";

function GeneralForm({ workspace }: { workspace: Workspace }) {
  const router = useRouter();
  const [name, setName] = useState(workspace.name);
  const [slug, setSlug] = useState(workspace.slug);
  const [errors, setErrors] = useState<Errors>({});
  const [pending, startSave] = useTransition();

  const nextName = name.trim();
  const nextSlug = slug.trim();
  const changed = nextName !== workspace.name || nextSlug !== workspace.slug;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    const next: Errors = {
      name: validateName(name),
      slug: validateSlug(nextSlug),
    };
    setErrors(next);
    if (next.name) {
      document.getElementById("workspace-name")?.focus();
      return;
    }
    if (next.slug) {
      document.getElementById("workspace-slug")?.focus();
      return;
    }
    if (!changed) {
      return;
    }

    startSave(async () => {
      const { error } = await attempt(() =>
        authClient.organization.update({
          organizationId: workspace.id,
          data: {
            ...(nextName !== workspace.name ? { name: nextName } : {}),
            ...(nextSlug !== workspace.slug ? { slug: nextSlug } : {}),
          },
        }),
      );
      if (error) {
        if (slugTakenCodes.has(error.code ?? "")) {
          setErrors({
            slug: `Another workspace already uses "${nextSlug}". Choose a different slug.`,
          });
          document.getElementById("workspace-slug")?.focus();
          return;
        }
        toast.error("Could not save the workspace", {
          description: describeAuthError(
            error,
            error.status === 403
              ? "Your role no longer allows editing this workspace."
              : "Try again in a moment.",
          ),
        });
        return;
      }
      toast.success("Workspace saved");
      startSave(() => router.refresh());
    });
  }

  return (
    <form noValidate onSubmit={handleSubmit}>
      <SettingsSection
        title="General"
        description={generalDescription}
        footer={
          <>
            <span>Changes apply for every member of this workspace.</span>
            <Button
              type="submit"
              disabled={pending || !changed}
              aria-busy={pending || undefined}
              className={primaryButtonClass}
            >
              {pending ? <Spinner /> : null}
              Save changes
            </Button>
          </>
        }
      >
        <FieldGroup className="max-w-[420px] gap-4">
          <Field data-invalid={errors.name ? true : undefined}>
            <FieldLabel htmlFor="workspace-name" className={labelClass}>
              Workspace name
            </FieldLabel>
            <Input
              id="workspace-name"
              name="name"
              type="text"
              autoComplete="organization"
              required
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (errors.name) {
                  setErrors((current) => ({
                    ...current,
                    name: validateName(event.target.value),
                  }));
                }
              }}
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={
                errors.name ? "workspace-name-error" : undefined
              }
              className={inputClass}
            />
            {errors.name ? (
              <FieldError id="workspace-name-error" className={errorClass}>
                {errors.name}
              </FieldError>
            ) : null}
          </Field>

          <Field data-invalid={errors.slug ? true : undefined}>
            <FieldLabel htmlFor="workspace-slug" className={labelClass}>
              Slug
            </FieldLabel>
            <Input
              id="workspace-slug"
              name="slug"
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={slug}
              onChange={(event) => {
                const value = event.target.value.toLowerCase();
                setSlug(value);
                if (errors.slug) {
                  setErrors((current) => ({
                    ...current,
                    slug: validateSlug(value.trim()),
                  }));
                }
              }}
              aria-invalid={errors.slug ? true : undefined}
              aria-describedby={
                errors.slug ? "workspace-slug-error" : "workspace-slug-hint"
              }
              className={`${inputClass} font-mono`}
            />
            {errors.slug ? (
              <FieldError id="workspace-slug-error" className={errorClass}>
                {errors.slug}
              </FieldError>
            ) : (
              <FieldDescription id="workspace-slug-hint" className={hintClass}>
                Lowercase letters, digits and hyphens. It must be unique on this
                server.
              </FieldDescription>
            )}
          </Field>
        </FieldGroup>
      </SettingsSection>
    </form>
  );
}

function GeneralReadOnly({
  workspace,
  role,
}: {
  workspace: Workspace;
  role: WorkspaceRole;
}) {
  return (
    <SettingsSection title="General" description={generalDescription}>
      <dl className="grid max-w-[420px] gap-4 text-[13px]">
        <div>
          <dt className="font-medium text-muted-foreground">Workspace name</dt>
          <dd className="mt-1 break-words text-foreground">{workspace.name}</dd>
        </div>
        <div>
          <dt className="font-medium text-muted-foreground">Slug</dt>
          <dd className="mt-1 break-all font-mono text-foreground">
            {workspace.slug || "Not set"}
          </dd>
        </div>
      </dl>
      <Notice title="You can view these settings." className="mt-5">
        Your role here is {roleLabels[role]}. Ask an owner or admin of this
        workspace to change its name or slug.
      </Notice>
    </SettingsSection>
  );
}

function DeleteWorkspace({
  workspace,
  role,
  otherWorkspaces,
}: {
  workspace: Workspace;
  role: WorkspaceRole;
  otherWorkspaces: Workspace[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, startDelete] = useTransition();

  const isOwner = role === "owner";
  const nextWorkspace = otherWorkspaces[0];
  const allowed = isOwner && nextWorkspace !== undefined;
  const matches = typed.trim() === workspace.name.trim();

  function confirmDelete() {
    if (!nextWorkspace) {
      return;
    }
    startDelete(async () => {
      const { error } = await attempt(() =>
        authClient.organization.delete({ organizationId: workspace.id }),
      );
      if (error) {
        toast.error(`Could not delete ${workspace.name}`, {
          description: describeAuthError(
            error,
            error.status === 403
              ? "Only an owner can delete this workspace."
              : "Nothing was deleted. Try again in a moment.",
          ),
        });
        return;
      }
      const switched = await attempt(() =>
        authClient.organization.setActive({
          organizationId: nextWorkspace.id,
        }),
      );
      toast.success(`${workspace.name} was deleted`, {
        description: switched.error
          ? "Choose a workspace from the workspace switcher."
          : `You are now in ${nextWorkspace.name}.`,
      });
      startDelete(() => {
        router.push("/app/dashboard");
        router.refresh();
      });
    });
  }

  let explanation: string;
  if (!isOwner) {
    explanation = "Only an owner of this workspace can delete it.";
  } else if (!nextWorkspace) {
    explanation =
      "This is your only workspace, so it cannot be deleted. Create another workspace from the workspace switcher first.";
  } else {
    explanation = `After deleting, you will be moved to ${nextWorkspace.name}.`;
  }

  return (
    <SettingsSection
      tone="danger"
      title="Delete workspace"
      description="Permanently removes this workspace for everyone in it."
      footer={
        <>
          <span id="delete-workspace-note" className="min-w-0 flex-1 basis-64">
            {explanation}
          </span>
          <Button
            type="button"
            variant="outline"
            disabled={!allowed}
            aria-describedby="delete-workspace-note"
            onClick={() => {
              setTyped("");
              setOpen(true);
            }}
            className={dangerOutlineButtonClass}
          >
            Delete workspace
          </Button>
        </>
      }
    >
      <p className="max-w-[60ch] text-[13px] text-muted-foreground">
        Deleting{" "}
        <span className="font-medium text-foreground">{workspace.name}</span>{" "}
        removes the workspace, its members, its pending invitations and
        everything stored in it. Members lose access immediately. This cannot be
        undone.
      </p>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete ${workspace.name}?`}
        description="The workspace and everything in it will be removed for every member. This cannot be undone."
        confirmLabel="Delete workspace"
        pending={pending}
        confirmDisabled={!matches}
        onConfirm={confirmDelete}
      >
        <Field>
          <FieldLabel htmlFor="delete-workspace-name" className={labelClass}>
            <span>
              Type{" "}
              <span className="select-all font-semibold">{workspace.name}</span>{" "}
              to confirm
            </span>
          </FieldLabel>
          <Input
            id="delete-workspace-name"
            name="confirm-name"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            className={inputClass}
          />
        </Field>
      </ConfirmDialog>
    </SettingsSection>
  );
}
