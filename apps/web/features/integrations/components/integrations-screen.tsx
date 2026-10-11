"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group";
import { Plug, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell/page-header";
import { LoadFailed } from "@/components/product/load-failed";
import { SectionCard } from "@/components/product/section-card";
import {
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/product/styles";
import { ConnectSheet } from "@/features/integrations/components/connect-sheet";
import { ReplyDetectionDialog } from "@/features/integrations/components/reply-detection-dialog";
import { SesSetupSheet } from "@/features/integrations/components/ses-setup-sheet";
import { SourceCatalog } from "@/features/integrations/components/source-catalog";
import {
  DailyLimitDialog,
  DisconnectDialog,
  RenameSourceDialog,
  TestEmailDialog,
} from "@/features/integrations/components/source-dialogs";
import {
  type RowAction,
  SourcesTable,
} from "@/features/integrations/components/sources-table";
import {
  type IntegrationId,
  mailboxProviderOf,
} from "@/features/integrations/lib/catalog";
import {
  companyOf,
  copy,
  describeConnectError,
  describeError,
  describeProviderError,
  describeSourceError,
  providerNameOf,
  sourceSecondLine,
} from "@/features/integrations/lib/copy";
import type {
  SendingSource,
  SourcesResult,
} from "@/features/integrations/lib/sources";
import {
  authorizeMailbox,
  stopReplyDetection,
  testSource,
  updateSource,
} from "@/features/integrations/queries/mutations";
import { appHref } from "@/lib/navigation";

export type ConnectNotice = {
  connected: string | null;
  replyDetection: string | null;
  connectError: string | null;
  provider: string | null;
};

type IntegrationsScreenProps = {
  result: SourcesResult;
  notice: ConnectNotice;
};

type DialogKind =
  | "rename"
  | "limit"
  | "testEmail"
  | "disconnect"
  | "replies"
  | "setup";

const noSources: SendingSource[] = [];

export function IntegrationsScreen({
  result,
  notice,
}: IntegrationsScreenProps) {
  const router = useRouter();
  const [seen, setSeen] = useState(result);
  const [overrides, setOverrides] = useState<Record<string, SendingSource>>({});
  const [defaultId, setDefaultId] = useState<string | null>();
  const [query, setQuery] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [picked, setPicked] = useState<IntegrationId | null>(null);
  const [busy, setBusy] = useState<{ id: string; action: RowAction } | null>(
    null,
  );
  const [dialog, setDialog] = useState<{
    kind: DialogKind;
    source: SendingSource;
  } | null>(null);
  const [retrying, startRetry] = useTransition();
  const noticeShown = useRef(false);

  if (seen !== result) {
    setSeen(result);
    setOverrides({});
    setDefaultId(undefined);
  }

  useEffect(() => {
    const provider =
      mailboxProviderOf(
        notice.provider ?? notice.connected ?? notice.replyDetection ?? "",
      ) ?? "gmail";
    if (
      noticeShown.current ||
      (!notice.connected && !notice.connectError && !notice.replyDetection)
    ) {
      return;
    }
    noticeShown.current = true;
    const name = providerNameOf(provider);
    if (notice.connectError) {
      const aboutReplies = [
        "read_scope_not_granted",
        "reply_detection_disabled",
        "account_mismatch",
        "source_missing",
      ].includes(notice.connectError);
      toast.error(
        aboutReplies
          ? copy.connectErrors.replyDetectionTitle(name)
          : copy.connectErrors.title(name),
        { description: describeConnectError(notice.connectError, provider) },
      );
    } else if (notice.replyDetection) {
      toast.success(copy.toasts.replyDetectionOn(name), {
        description: copy.toasts.replyDetectionOnBody,
      });
    } else {
      toast.success(copy.toasts.mailboxConnected(name), {
        description: copy.toasts.connectedBody,
      });
    }
    router.replace(appHref("integrations"));
  }, [notice, router]);

  const ready = result.state === "ready";
  const sources = ready
    ? result.sources.map((item) => {
        const source = overrides[item.id] ?? item;
        return defaultId === undefined
          ? source
          : { ...source, isDefault: source.id === defaultId };
      })
    : noSources;
  const hasDefault = sources.some((source) => source.isDefault);

  const needle = query.trim().toLowerCase();
  const visible = sources.filter(
    (source) =>
      needle === "" ||
      `${source.name} ${source.email ?? ""} ${sourceSecondLine(source)}`
        .toLowerCase()
        .includes(needle),
  );

  function applySource(source?: SendingSource) {
    if (source) {
      setOverrides((current) => ({ ...current, [source.id]: source }));
    }
    router.refresh();
  }

  function openSheet(id: IntegrationId | null) {
    setPicked(id);
    setSheetOpen(true);
  }

  function openDialog(kind: DialogKind) {
    return (source: SendingSource) => setDialog({ kind, source });
  }

  function dialogSource(kind: DialogKind) {
    if (dialog?.kind !== kind) {
      return null;
    }
    return (
      sources.find((source) => source.id === dialog.source.id) ?? dialog.source
    );
  }

  function closeDialog() {
    setDialog(null);
  }

  async function handleTest(source: SendingSource) {
    if (busy) {
      return;
    }
    setBusy({ id: source.id, action: "test" });
    const response = await testSource(source.id);
    setBusy(null);
    if (!response.ok) {
      toast.error(copy.toasts.testError(source.name), {
        description: describeSourceError(source, response.error),
      });
      if (response.error.code === "not_found") {
        router.refresh();
      }
      return;
    }
    const outcome = response.data;
    applySource(outcome.source ?? undefined);
    if (outcome.ok) {
      toast.success(copy.toasts.testOk(source.name), {
        description: copy.toasts.testOkBody,
      });
      return;
    }
    toast.error(copy.toasts.testFailed(source.name), {
      description: outcome.error
        ? describeSourceError(source, outcome.error, copy.toasts.testFailedBody)
        : copy.toasts.testFailedBody,
    });
  }

  async function setPaused(source: SendingSource, paused: boolean) {
    setBusy({ id: source.id, action: "pause" });
    const response = await updateSource(source.id, { paused });
    setBusy(null);
    if (!response.ok) {
      toast.error(
        paused
          ? copy.toasts.pauseFailed(source.name)
          : copy.toasts.resumeFailed(source.name),
        { description: describeError(response.error) },
      );
      if (response.error.code === "not_found") {
        router.refresh();
      }
      return false;
    }
    applySource(response.data);
    return true;
  }

  async function handleTogglePause(source: SendingSource) {
    if (busy) {
      return;
    }
    const paused = source.status !== "paused";
    if (!(await setPaused(source, paused))) {
      return;
    }
    toast(
      paused
        ? copy.toasts.paused(source.name)
        : copy.toasts.resumed(source.name),
      {
        action: {
          label: copy.toasts.undo,
          onClick: () => {
            void setPaused(source, !paused);
          },
        },
      },
    );
  }

  async function handleToggleDefault(source: SendingSource) {
    if (busy) {
      return;
    }
    const isDefault = !source.isDefault;
    setBusy({ id: source.id, action: "default" });
    const response = await updateSource(source.id, { isDefault });
    setBusy(null);
    if (!response.ok) {
      toast.error(
        isDefault
          ? copy.toasts.makeDefaultFailed(source.name)
          : copy.toasts.removeDefaultFailed(source.name),
        { description: describeError(response.error) },
      );
      if (
        response.error.code === "not_found" ||
        response.error.code === "not_sendable"
      ) {
        router.refresh();
      }
      return;
    }
    setDefaultId(isDefault ? source.id : null);
    applySource(response.data);
    toast.success(
      isDefault
        ? copy.toasts.madeDefault(source.name)
        : copy.toasts.removedDefault(source.name),
      {
        description: isDefault
          ? copy.toasts.madeDefaultBody
          : copy.toasts.removedDefaultBody,
      },
    );
  }

  async function handleReconnect(source: SendingSource) {
    if (busy) {
      return;
    }
    const provider = mailboxProviderOf(source.integrationType);
    if (!provider) {
      return;
    }
    setBusy({ id: source.id, action: "reconnect" });
    const response = await authorizeMailbox(
      provider,
      source.dailySendLimit === null
        ? {}
        : { dailySendLimit: source.dailySendLimit },
    );
    if (response.ok) {
      window.location.href = response.data.url;
      return;
    }
    setBusy(null);
    toast.error(copy.toasts.reconnectFailed(source.name), {
      description: describeError(response.error),
    });
  }

  async function handleStopDetectingReplies(source: SendingSource) {
    const provider = mailboxProviderOf(source.integrationType);
    if (busy || !provider) {
      return;
    }
    setBusy({ id: source.id, action: "replies" });
    const response = await stopReplyDetection(source.id);
    setBusy(null);
    if (!response.ok) {
      toast.error(copy.toasts.replyDetectionStopFailed(source.name), {
        description: describeProviderError(response.error),
      });
      if (response.error.code === "not_found") {
        router.refresh();
      }
      return;
    }
    applySource(response.data);
    toast.success(copy.toasts.replyDetectionOff(source.name), {
      description: copy.toasts.replyDetectionOffBody(companyOf(provider)),
    });
  }

  function handleConnected(source: SendingSource) {
    setSheetOpen(false);
    setQuery("");
    toast.success(copy.toasts.connected(source.name), {
      description: copy.toasts.connectedBody,
    });
    if (source.details.account) {
      setOverrides((current) => ({ ...current, [source.id]: source }));
      setDialog({ kind: "setup", source });
    }
    router.refresh();
  }

  return (
    <div className="@container flex min-w-0 flex-col gap-[18px] text-[13px] leading-normal">
      <PageHeader
        title={copy.title}
        description={
          ready ? copy.description(sources.length) : copy.descriptionFailed
        }
        actions={
          ready ? (
            <Button
              type="button"
              onClick={() => openSheet(null)}
              className={primaryButtonClass}
            >
              <Plus aria-hidden strokeWidth={1.8} />
              {copy.connect}
            </Button>
          ) : null
        }
      />

      <SectionCard
        id="integrations-connected"
        title={copy.connected.title}
        description={
          sources.length === 0
            ? copy.connected.description
            : hasDefault
              ? copy.connected.defaultHint
              : copy.connected.noDefaultHint
        }
        action={
          sources.length > 0 ? (
            <InputGroup className="h-8 w-56 bg-card shadow-xs">
              <InputGroupAddon>
                <Search aria-hidden strokeWidth={1.6} />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label={copy.connected.searchLabel}
                placeholder={copy.connected.searchPlaceholder}
                className="text-[13px]"
              />
            </InputGroup>
          ) : null
        }
      >
        {!ready ? (
          <LoadFailed
            title={copy.loadFailed.title}
            body={copy.loadFailed.body}
            retryLabel={copy.loadFailed.retry}
            pending={retrying}
            onRetry={() => startRetry(() => router.refresh())}
          />
        ) : sources.length === 0 ? (
          <Empty className="px-6 py-10">
            <EmptyHeader>
              <EmptyMedia
                variant="icon"
                className="size-9 border border-border bg-card text-primary shadow-xs"
              >
                <Plug strokeWidth={1.6} aria-hidden />
              </EmptyMedia>
              <EmptyTitle className="text-sm font-semibold text-foreground">
                {copy.connected.emptyTitle}
              </EmptyTitle>
              <EmptyDescription className="text-[13px]">
                {copy.connected.emptyBody}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : visible.length === 0 ? (
          <Empty className="px-6 py-10">
            <EmptyHeader>
              <EmptyTitle className="text-sm font-semibold text-foreground">
                {copy.connected.noMatchTitle}
              </EmptyTitle>
              <EmptyDescription className="text-[13px]">
                {copy.connected.noMatchBody}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setQuery("");
                }}
                className={secondaryButtonClass}
              >
                {copy.connected.clear}
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <SourcesTable
            sources={visible}
            busy={busy}
            onTest={handleTest}
            onTestEmail={openDialog("testEmail")}
            onRename={openDialog("rename")}
            onSetLimit={openDialog("limit")}
            onTogglePause={handleTogglePause}
            onToggleDefault={handleToggleDefault}
            onDisconnect={openDialog("disconnect")}
            onReconnect={handleReconnect}
            onDetectReplies={openDialog("replies")}
            onStopDetectingReplies={handleStopDetectingReplies}
            onSetup={openDialog("setup")}
          />
        )}
      </SectionCard>

      {ready ? (
        <SectionCard
          id="integrations-catalog"
          title={copy.catalog.title}
          description={copy.catalog.description}
        >
          <SourceCatalog onConnect={openSheet} />
        </SectionCard>
      ) : null}

      <ConnectSheet
        open={sheetOpen}
        integrationId={picked}
        setup={ready ? result : null}
        onPick={setPicked}
        onOpenChange={setSheetOpen}
        onConnected={handleConnected}
      />

      <ReplyDetectionDialog
        source={dialogSource("replies")}
        onClose={closeDialog}
        onChanged={() => router.refresh()}
      />
      <SesSetupSheet
        source={dialogSource("setup")}
        refreshing={busy?.action === "test"}
        onRefresh={handleTest}
        onClose={closeDialog}
        onChanged={applySource}
      />
      <RenameSourceDialog
        source={dialogSource("rename")}
        onClose={closeDialog}
        onChanged={applySource}
      />
      <DailyLimitDialog
        source={dialogSource("limit")}
        onClose={closeDialog}
        onChanged={applySource}
      />
      <TestEmailDialog
        source={dialogSource("testEmail")}
        onClose={closeDialog}
        onChanged={applySource}
      />
      <DisconnectDialog
        source={dialogSource("disconnect")}
        onClose={closeDialog}
        onChanged={applySource}
      />
    </div>
  );
}
