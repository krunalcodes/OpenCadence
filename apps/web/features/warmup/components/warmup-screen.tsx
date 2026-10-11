"use client";

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty";
import { cn } from "@workspace/ui/lib/utils";
import { Flame, Info } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell/page-header";
import { LoadFailed } from "@/components/product/load-failed";
import {
  linkButtonClass,
  secondaryButtonClass,
} from "@/components/product/styles";
import { SettingsSheet } from "@/features/warmup/components/settings-sheet";
import { TurnOnDialog } from "@/features/warmup/components/turn-on-dialog";
import { WarmupTable } from "@/features/warmup/components/warmup-table";
import { copy, describeError } from "@/features/warmup/lib/copy";
import {
  capableFirst,
  isFirstTurnOn,
  poolIsSmall,
  poolTooSmall,
  type WarmupMailbox,
  type WarmupResult,
} from "@/features/warmup/lib/warmup";
import { updateWarmup } from "@/features/warmup/queries/mutations";
import { appHref } from "@/lib/navigation";

const noMailboxes: WarmupMailbox[] = [];
const staleCodes = ["not_found", "not_capable"];

type WarmupScreenProps = {
  result: WarmupResult;
};

export function WarmupScreen({ result }: WarmupScreenProps) {
  const router = useRouter();
  const [seen, setSeen] = useState(result);
  const [overrides, setOverrides] = useState<Record<string, WarmupMailbox>>({});
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<WarmupMailbox | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [settings, setSettings] = useState<WarmupMailbox | null>(null);
  const [settingsKey, setSettingsKey] = useState(0);
  const [retrying, startRetry] = useTransition();

  if (seen !== result) {
    setSeen(result);
    setOverrides({});
  }

  const ready = result.state === "ready";
  const mailboxes = ready
    ? capableFirst(
        result.mailboxes.map((item) => overrides[item.sourceId] ?? item),
      )
    : noMailboxes;

  function show(mailbox: WarmupMailbox) {
    setOverrides((current) => ({ ...current, [mailbox.sourceId]: mailbox }));
  }

  function apply(mailbox: WarmupMailbox) {
    show(mailbox);
    router.refresh();
  }

  function setBusy(sourceId: string, busy: boolean) {
    setBusyIds((current) =>
      busy ? [...current, sourceId] : current.filter((id) => id !== sourceId),
    );
  }

  function refreshIfStale(code: string) {
    if (staleCodes.includes(code)) {
      router.refresh();
    }
  }

  async function handleToggle(mailbox: WarmupMailbox, enabled: boolean) {
    if (!mailbox.capable || busyIds.includes(mailbox.sourceId)) {
      return;
    }
    if (enabled && isFirstTurnOn(mailbox)) {
      setConfirm(mailbox);
      return;
    }
    show({
      ...mailbox,
      enabled,
      status: enabled ? mailbox.status : "off",
    });
    setBusy(mailbox.sourceId, true);
    const response = await updateWarmup(mailbox.sourceId, { enabled });
    setBusy(mailbox.sourceId, false);
    if (!response.ok) {
      show(mailbox);
      toast.error(
        enabled
          ? copy.toasts.turnOnFailed(mailbox.name)
          : copy.toasts.turnOffFailed(mailbox.name),
        { description: describeError(response.error) },
      );
      refreshIfStale(response.error.code);
      return;
    }
    apply(response.data);
  }

  async function handleConfirm(mailbox: WarmupMailbox) {
    setConfirming(true);
    const response = await updateWarmup(mailbox.sourceId, { enabled: true });
    setConfirming(false);
    if (!response.ok) {
      toast.error(copy.toasts.turnOnFailed(mailbox.name), {
        description: describeError(response.error),
      });
      if (staleCodes.includes(response.error.code)) {
        setConfirm(null);
        router.refresh();
      }
      return;
    }
    setConfirm(null);
    apply(response.data);
    toast.success(copy.toasts.turnedOn(mailbox.name));
  }

  async function setPaused(mailbox: WarmupMailbox, paused: boolean) {
    setBusy(mailbox.sourceId, true);
    const response = await updateWarmup(mailbox.sourceId, { paused });
    setBusy(mailbox.sourceId, false);
    if (!response.ok) {
      toast.error(
        paused
          ? copy.toasts.pauseFailed(mailbox.name)
          : copy.toasts.resumeFailed(mailbox.name),
        { description: describeError(response.error) },
      );
      refreshIfStale(response.error.code);
      return false;
    }
    apply(response.data);
    return true;
  }

  async function handleTogglePause(mailbox: WarmupMailbox) {
    if (busyIds.includes(mailbox.sourceId)) {
      return;
    }
    const paused = mailbox.status !== "paused";
    if (!(await setPaused(mailbox, paused))) {
      return;
    }
    toast(
      paused
        ? copy.toasts.paused(mailbox.name)
        : copy.toasts.resumed(mailbox.name),
      {
        action: {
          label: copy.toasts.undo,
          onClick: () => {
            void setPaused(mailbox, !paused);
          },
        },
      },
    );
  }

  function openSettings(mailbox: WarmupMailbox) {
    setSettingsKey((current) => current + 1);
    setSettings(mailbox);
  }

  function handleSaved(mailbox: WarmupMailbox) {
    setSettings(null);
    apply(mailbox);
    toast.success(copy.toasts.saved(mailbox.name));
  }

  const blank = ready && mailboxes.length === 0;

  return (
    <div className="@container flex min-w-0 flex-col gap-[18px] text-[13px] leading-normal">
      <PageHeader
        title={copy.title}
        description={<p className="max-w-[720px]">{copy.description}</p>}
      />

      {ready && !blank && poolTooSmall(result.pool) ? (
        <p
          role="note"
          className="flex gap-2 rounded-lg bg-info-surface px-3 py-2.5 text-foreground"
        >
          <Info
            aria-hidden="true"
            strokeWidth={1.6}
            className="mt-0.5 size-4 shrink-0 text-info"
          />
          <span className="min-w-0">
            <span className="font-medium text-info">
              {copy.pool.tooSmallTitle}
            </span>{" "}
            {copy.pool.tooSmallBody}
          </span>
        </p>
      ) : null}

      <section
        aria-label={copy.sectionLabel}
        className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-xs"
      >
        {ready && !blank ? (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border-subtle px-4 py-[13px]">
            <p className="font-medium text-foreground tabular-nums">
              {copy.pool.summary(result.pool.mailboxes, result.pool.domains)}
            </p>
            {!poolTooSmall(result.pool) && poolIsSmall(result.pool) ? (
              <p className="text-[12.5px] text-ink-tertiary">
                {copy.pool.small}
              </p>
            ) : null}
          </div>
        ) : null}

        {!ready ? (
          <LoadFailed
            title={copy.loadFailed.title}
            body={copy.loadFailed.body}
            retryLabel={copy.loadFailed.retry}
            pending={retrying}
            onRetry={() => startRetry(() => router.refresh())}
          />
        ) : blank ? (
          <Empty className="px-6 py-10">
            <EmptyHeader>
              <EmptyMedia
                variant="icon"
                className="size-9 border border-border bg-card text-primary shadow-xs"
              >
                <Flame strokeWidth={1.6} aria-hidden />
              </EmptyMedia>
              <EmptyTitle className="text-sm font-semibold text-foreground">
                {copy.emptyTitle}
              </EmptyTitle>
              <EmptyDescription className="text-[13px]">
                {copy.emptyBody}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Link
                href={appHref("integrations")}
                className={cn(
                  linkButtonClass,
                  "border-border",
                  secondaryButtonClass,
                )}
              >
                {copy.emptyAction}
              </Link>
            </EmptyContent>
          </Empty>
        ) : (
          <WarmupTable
            mailboxes={mailboxes}
            busyIds={busyIds}
            onToggle={handleToggle}
            onSettings={openSettings}
            onTogglePause={handleTogglePause}
          />
        )}
      </section>

      <SettingsSheet
        mailbox={settings}
        formKey={settingsKey}
        onClose={() => setSettings(null)}
        onSaved={handleSaved}
        onMissing={() => {
          setSettings(null);
          router.refresh();
        }}
      />
      <TurnOnDialog
        mailbox={confirm}
        pending={confirming}
        onClose={() => setConfirm(null)}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
