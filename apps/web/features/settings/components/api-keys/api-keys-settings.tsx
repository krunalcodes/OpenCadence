"use client";

import { Button } from "@workspace/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { cn } from "@workspace/ui/lib/utils";
import { Ellipsis, KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { buttonFocusRing } from "@/components/app-shell/page-header";
import { CreateApiKeyDialog } from "@/features/settings/components/api-keys/create-api-key-dialog";
import { RenameApiKeyDialog } from "@/features/settings/components/api-keys/rename-api-key-dialog";
import { UsageHint } from "@/features/settings/components/api-keys/usage-hint";
import {
  SettingsSection,
  SettingsStack,
} from "@/features/settings/components/settings-section";
import {
  ConfirmDialog,
  cellClass,
  DateText,
  headClass,
  isPast,
  LoadFailed,
  Notice,
  Pill,
  primaryButtonClass,
  roleLabels,
  rowClass,
} from "@/features/settings/components/workspace-parts";
import { attempt, authClient, describeAuthError } from "@/lib/auth-client";
import type {
  Workspace,
  WorkspaceApiKey,
  WorkspaceApiKeys,
  WorkspaceRole,
} from "@/lib/session";

const sectionDescription =
  "Keys let scripts and other systems call the API as this workspace. They belong to the workspace, not to the person who created them.";

const countFormat = new Intl.NumberFormat("en-US");

const rateWindows: [number, string][] = [
  [24 * 60 * 60 * 1000, "day"],
  [60 * 60 * 1000, "hour"],
  [60 * 1000, "minute"],
  [1000, "second"],
];

function rateLimitLabel(limit: NonNullable<WorkspaceApiKey["rateLimit"]>) {
  const requests = `${countFormat.format(limit.max)} ${
    limit.max === 1 ? "request" : "requests"
  }`;
  for (const [size, unit] of rateWindows) {
    if (limit.windowMs >= size) {
      const count = Math.round(limit.windowMs / size);
      return count === 1
        ? `${requests} per ${unit}`
        : `${requests} every ${countFormat.format(count)} ${unit}s`;
    }
  }
  return requests;
}

function keyLabel(key: WorkspaceApiKey) {
  return key.name || "Unnamed key";
}

type ApiKeysSettingsProps = {
  workspace: Workspace;
  role: WorkspaceRole;
  result: WorkspaceApiKeys | null;
};

export function ApiKeysSettings({
  workspace,
  role,
  result,
}: ApiKeysSettingsProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [renaming, setRenaming] = useState<WorkspaceApiKey | null>(null);
  const [revoking, setRevoking] = useState<WorkspaceApiKey | null>(null);
  const [pending, startAction] = useTransition();

  if (result === null) {
    return (
      <SettingsStack>
        <SettingsSection title="API keys" description={sectionDescription}>
          <Notice title="Owners and admins manage API keys.">
            Your role in {workspace.name} is {roleLabels[role]}, so the keys are
            not shown. Ask an owner or admin if you need a key for an
            integration.
          </Notice>
        </SettingsSection>
      </SettingsStack>
    );
  }

  if (result.state !== "ready") {
    return (
      <SettingsStack>
        <SettingsSection title="API keys" description={sectionDescription}>
          {result.state === "forbidden" ? (
            <Notice title="Your role cannot manage API keys.">
              This server does not allow the {roleLabels[role]} role to view or
              create keys for {workspace.name}. Ask an owner of the workspace.
            </Notice>
          ) : result.state === "unavailable" ? (
            <Notice tone="warning" title="API keys are not available.">
              The API did not recognise the request. If it was just updated,
              restart it and reload this page.
            </Notice>
          ) : (
            <LoadFailed
              title="Could not load the API keys."
              pending={pending}
              onRetry={() => startAction(() => router.refresh())}
            />
          )}
        </SettingsSection>
      </SettingsStack>
    );
  }

  const keys = result.keys;

  function confirmRevoke() {
    const key = revoking;
    if (!key) {
      return;
    }
    startAction(async () => {
      const { error } = await attempt(() =>
        authClient.apiKey.delete({ keyId: key.id }),
      );
      if (error) {
        toast.error(`Could not revoke ${keyLabel(key)}`, {
          description: describeAuthError(
            error,
            error.status === 403
              ? "Your role does not allow revoking keys."
              : "The key is still active. Try again in a moment.",
          ),
        });
        return;
      }
      toast.success(`${keyLabel(key)} was revoked`);
      startAction(() => {
        router.refresh();
        setRevoking(null);
      });
    });
  }

  const createButton = (
    <Button
      type="button"
      onClick={() => setCreateOpen(true)}
      className={primaryButtonClass}
    >
      <Plus aria-hidden strokeWidth={1.8} />
      Create API key
    </Button>
  );

  return (
    <SettingsStack>
      <SettingsSection
        flush
        title="API keys"
        description={sectionDescription}
        action={createButton}
      >
        {keys.length === 0 ? (
          <Empty className="px-6 py-10">
            <EmptyHeader>
              <EmptyMedia
                variant="icon"
                className="size-9 border border-border bg-card text-primary shadow-xs"
              >
                <KeyRound strokeWidth={1.6} aria-hidden />
              </EmptyMedia>
              <EmptyTitle className="font-semibold text-foreground text-sm">
                No API keys yet
              </EmptyTitle>
              <EmptyDescription className="text-[13px]">
                Create a key to call the API as {workspace.name}. Use one key
                per integration so you can revoke it without affecting the
                others.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table className="min-w-[760px] text-[13px]">
            <TableHeader className="[&_tr]:border-border-subtle">
              <TableRow className="hover:bg-transparent">
                <TableHead className={headClass}>Name</TableHead>
                <TableHead className={headClass}>Key</TableHead>
                <TableHead className={headClass}>Created</TableHead>
                <TableHead className={headClass}>Last used</TableHead>
                <TableHead className={headClass}>Expires</TableHead>
                <TableHead className={headClass}>Status</TableHead>
                <TableHead className={headClass}>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((key) => {
                const expired = isPast(key.expiresAt);
                return (
                  <TableRow key={key.id} className={rowClass}>
                    <TableCell className={cn(cellClass, "max-w-56")}>
                      <div
                        className={cn(
                          "truncate font-medium text-foreground",
                          !key.name && "font-normal text-ink-tertiary",
                        )}
                      >
                        {keyLabel(key)}
                      </div>
                      {key.rateLimit ? (
                        <div className="truncate text-ink-tertiary text-xs tabular-nums">
                          Limited to {rateLimitLabel(key.rateLimit)}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell
                      className={cn(
                        cellClass,
                        "font-mono text-[12.5px] text-muted-foreground",
                      )}
                    >
                      {key.start ? (
                        <>
                          {key.start}
                          <span aria-hidden>••••</span>
                          <span className="sr-only">, rest hidden</span>
                        </>
                      ) : (
                        <span className="font-sans text-ink-tertiary">
                          Hidden
                        </span>
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(cellClass, "text-muted-foreground")}
                    >
                      <DateText value={key.createdAt} fallback="Unknown" />
                    </TableCell>
                    <TableCell
                      className={cn(cellClass, "text-muted-foreground")}
                    >
                      <DateText value={key.lastRequest} fallback="Never" />
                    </TableCell>
                    <TableCell
                      className={cn(cellClass, "text-muted-foreground")}
                    >
                      <DateText value={key.expiresAt} fallback="Never" />
                    </TableCell>
                    <TableCell className={cellClass}>
                      {!key.enabled ? (
                        <Pill tone="neutral">Disabled</Pill>
                      ) : expired ? (
                        <Pill tone="danger">Expired</Pill>
                      ) : (
                        <Pill tone="success">Active</Pill>
                      )}
                    </TableCell>
                    <TableCell className={cn(cellClass, "text-right")}>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          aria-label={`Actions for ${keyLabel(key)}`}
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className={cn(
                                "-mr-1.5 text-muted-foreground hover:bg-accent",
                                buttonFocusRing,
                              )}
                            />
                          }
                        >
                          <Ellipsis aria-hidden strokeWidth={1.6} />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="w-44 p-1 text-[13px]"
                        >
                          <DropdownMenuItem
                            className="rounded-lg px-2 py-1.5 text-[13px]"
                            onClick={() => setRenaming(key)}
                          >
                            <Pencil aria-hidden strokeWidth={1.6} />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            className="rounded-lg px-2 py-1.5 text-[13px]"
                            onClick={() => setRevoking(key)}
                          >
                            <Trash2 aria-hidden strokeWidth={1.6} />
                            Revoke
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </SettingsSection>

      <UsageHint />

      <CreateApiKeyDialog
        workspace={workspace}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
      <RenameApiKeyDialog apiKey={renaming} onClose={() => setRenaming(null)} />
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRevoking(null);
          }
        }}
        title={`Revoke ${revoking ? keyLabel(revoking) : "this key"}?`}
        description={
          <>
            Anything using the key
            {revoking?.start ? (
              <>
                {" "}
                that starts with{" "}
                <span className="font-mono text-foreground">
                  {revoking.start}
                </span>
              </>
            ) : null}{" "}
            stops working immediately. The key is deleted and cannot be
            restored.
          </>
        }
        confirmLabel="Revoke key"
        pending={pending && revoking !== null}
        onConfirm={confirmRevoke}
      />
    </SettingsStack>
  );
}
