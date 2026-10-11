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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs";
import { cn } from "@workspace/ui/lib/utils";
import {
  Archive,
  ArrowLeft,
  Copy,
  Ellipsis,
  Pause,
  Pencil,
  Play,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { buttonFocusRing, focusRing } from "@/components/app-shell/page-header";
import {
  menuItemClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import { StatusBadge } from "@/components/status-badge";
import type { StepReveal } from "@/features/sequences/components/builder/sequence-builder";
import {
  CheckPopover,
  type CheckState,
} from "@/features/sequences/components/check-popover";
import { ContactsTab } from "@/features/sequences/components/contacts-tab";
import { DeleteSequenceDialog } from "@/features/sequences/components/delete-sequence-dialog";
import { NameDialog } from "@/features/sequences/components/name-dialog";
import { SettingsTab } from "@/features/sequences/components/settings-tab";
import { StepsTab } from "@/features/sequences/components/steps-tab";
import { copy, describeError, statusTone } from "@/features/sequences/lib/copy";
import {
  type Sequence,
  type SequenceTab,
  sequencePath,
  sequenceTabs,
  toTab,
} from "@/features/sequences/lib/sequences";
import {
  changeSequenceStatus,
  checkSequence,
  duplicateSequence,
  fetchSequence,
} from "@/features/sequences/queries/client";
import type { AudienceList, AudienceSegment } from "@/lib/audience";
import { appHref } from "@/lib/navigation";
import type { SourceChoice } from "@/lib/sources";

const text = copy.detail;
const refreshEvery = 30_000;
const checkDelay = 500;

type Action = "activate" | "pause" | "archive" | "duplicate";

export type SequenceScreenProps = {
  sequence: Sequence;
  tab: SequenceTab;
  sources: SourceChoice[];
  lists: AudienceList[];
  segments: AudienceSegment[];
};

const tabClass =
  "h-[26px] flex-none rounded-[6px] border-0 px-3 text-[12.5px] font-medium text-muted-foreground hover:text-foreground focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary focus-visible:outline-solid data-active:bg-card data-active:text-foreground data-active:shadow-xs";

export function SequenceScreen({
  sequence: initial,
  tab: initialTab,
  sources,
  lists,
  segments,
}: SequenceScreenProps) {
  const router = useRouter();
  const [sequence, setSequence] = useState(initial);
  const [tab, setTab] = useState(initialTab);
  const [visited, setVisited] = useState<SequenceTab[]>([initialTab]);
  const [check, setCheck] = useState<CheckState>({ state: "loading" });
  const [checkOpen, setCheckOpen] = useState(false);
  const [checkNonce, setCheckNonce] = useState(0);
  const [reveal, setReveal] = useState<StepReveal | null>(null);
  const [pending, setPending] = useState<Action | null>(null);
  const [nameOpen, setNameOpen] = useState(false);
  const [nameKey, setNameKey] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const revealCount = useRef(0);

  const id = sequence.id;
  const status = sequence.status;
  const archived = status === "archived";

  const handleSequenceChange = useCallback((next: Sequence) => {
    setSequence(next);
    setCheckNonce((value) => value + 1);
  }, []);

  const refreshSequence = useCallback(async () => {
    const result = await fetchSequence(id);
    if (result.ok) {
      setSequence(result.data);
    }
  }, [id]);

  const checkKey = `${checkNonce}:${archived ? "off" : "on"}`;

  useEffect(() => {
    if (checkKey.endsWith(":off")) {
      return;
    }
    let current = true;
    const timer = window.setTimeout(async () => {
      const result = await checkSequence(id);
      if (current) {
        setCheck(
          result.ok
            ? { state: "ready", check: result.data }
            : { state: "failed" },
        );
      }
    }, checkDelay);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [id, checkKey]);

  useEffect(() => {
    if (status !== "active") {
      return;
    }
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshSequence();
        setRefreshNonce((value) => value + 1);
      }
    }, refreshEvery);
    return () => window.clearInterval(timer);
  }, [status, refreshSequence]);

  function selectTab(next: SequenceTab) {
    setTab(next);
    setVisited((current) =>
      current.includes(next) ? current : [...current, next],
    );
    const url = new URL(window.location.href);
    if (next === "steps") {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", next);
    }
    window.history.replaceState(null, "", url);
  }

  function showStep(stepId: string) {
    setCheckOpen(false);
    selectTab("steps");
    revealCount.current += 1;
    setReveal({ stepId, nonce: revealCount.current });
  }

  async function activate() {
    if (pending) {
      return;
    }
    setPending("activate");
    const checked = await checkSequence(id);
    if (!checked.ok) {
      setPending(null);
      toast.error(copy.toasts.checkFailed, {
        description: describeError(checked.error),
      });
      return;
    }
    setCheck({ state: "ready", check: checked.data });
    const problems = checked.data.problems;
    if (problems.some((problem) => problem.severity === "error")) {
      setPending(null);
      setCheckOpen(true);
      toast.error(copy.toasts.notReady, {
        description: copy.toasts.notReadyBody,
      });
      return;
    }
    const result = await changeSequenceStatus(id, "activate");
    setPending(null);
    if (!result.ok) {
      if (result.error.code === "not_ready") {
        setCheckNonce((value) => value + 1);
        setCheckOpen(true);
        toast.error(copy.toasts.notReady, {
          description: copy.toasts.notReadyBody,
        });
        return;
      }
      toast.error(copy.toasts.activateFailed, {
        description: describeError(result.error),
      });
      return;
    }
    setSequence(result.data);
    toast.success(copy.toasts.activated(result.data.name), {
      description:
        problems.length > 0
          ? copy.toasts.activatedWithWarnings(problems.length)
          : undefined,
    });
  }

  async function pause() {
    if (pending) {
      return;
    }
    setPending("pause");
    const result = await changeSequenceStatus(id, "pause");
    setPending(null);
    if (!result.ok) {
      toast.error(copy.toasts.pauseFailed, {
        description: describeError(result.error),
      });
      return;
    }
    setSequence(result.data);
    toast.success(copy.toasts.paused(result.data.name));
  }

  async function archive() {
    if (pending) {
      return;
    }
    setPending("archive");
    const result = await changeSequenceStatus(id, "archive");
    setPending(null);
    if (!result.ok) {
      toast.error(copy.toasts.archiveFailed(sequence.name), {
        description: describeError(result.error),
      });
      return;
    }
    setSequence(result.data);
    toast.success(copy.toasts.archived(result.data.name));
  }

  async function duplicate() {
    if (pending) {
      return;
    }
    setPending("duplicate");
    const result = await duplicateSequence(id);
    setPending(null);
    if (!result.ok) {
      toast.error(copy.toasts.duplicateFailed(sequence.name), {
        description: describeError(result.error),
      });
      return;
    }
    toast.success(copy.toasts.duplicated(result.data.name));
    router.push(appHref(sequencePath(result.data.id)));
  }

  const problemStepIds = useMemo(() => {
    const ids = new Set<string>();
    if (check.state === "ready") {
      for (const problem of check.check.problems) {
        if (problem.stepId && problem.severity === "error") {
          ids.add(problem.stepId);
        }
      }
    }
    return ids;
  }, [check]);

  const busy = pending === "activate" || pending === "pause";

  return (
    <div className="flex min-w-0 flex-col gap-3.5 text-[13px] leading-normal">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <Link
          href={appHref("sequences")}
          aria-label={text.backLabel}
          className={cn(
            "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-1.5 font-medium text-muted-foreground hover:text-foreground",
            focusRing,
          )}
        >
          <ArrowLeft aria-hidden strokeWidth={1.6} className="size-4" />
          {text.back}
        </Link>
        <span aria-hidden className="text-ink-tertiary">
          /
        </span>
        <h1
          title={sequence.name}
          className="min-w-0 max-w-[480px] truncate px-1 text-[15px] font-semibold tracking-[-0.01em] text-foreground"
        >
          {sequence.name}
        </h1>
        <StatusBadge tone={statusTone(status, sequence.stats.active > 0)}>
          {copy.statuses[status]}
        </StatusBadge>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {archived ? null : (
            <CheckPopover
              check={check}
              steps={sequence.steps}
              open={checkOpen}
              onOpenChange={setCheckOpen}
              onRetry={() => {
                setCheck({ state: "loading" });
                setCheckNonce((value) => value + 1);
              }}
              onShowStep={showStep}
              onOpenSettings={() => {
                setCheckOpen(false);
                selectTab("settings");
              }}
            />
          )}
          {status === "active" ? (
            <Button
              type="button"
              variant="outline"
              disabled={pending !== null}
              aria-busy={busy || undefined}
              onClick={() => void pause()}
              className={secondaryButtonClass}
            >
              {busy ? <Spinner /> : <Pause aria-hidden strokeWidth={1.6} />}
              {text.pause}
            </Button>
          ) : (
            <Button
              type="button"
              disabled={pending !== null}
              aria-busy={busy || undefined}
              onClick={() => void activate()}
              className={primaryButtonClass}
            >
              {busy ? <Spinner /> : <Play aria-hidden strokeWidth={1.8} />}
              {status === "paused" ? text.resume : text.activate}
            </Button>
          )}
          {pending === "archive" || pending === "duplicate" ? (
            <span className="inline-grid size-8 place-items-center">
              <Spinner className="size-3.5 text-ink-tertiary" />
            </span>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={text.more}
                render={
                  <Button
                    variant="outline"
                    size="icon"
                    className={cn(
                      "size-8 bg-card text-muted-foreground shadow-xs hover:bg-muted",
                      buttonFocusRing,
                    )}
                  />
                }
              >
                <Ellipsis aria-hidden strokeWidth={1.6} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 p-1 text-[13px]">
                {archived ? null : (
                  <DropdownMenuItem
                    className={menuItemClass}
                    onClick={() => {
                      setNameKey((value) => value + 1);
                      setNameOpen(true);
                    }}
                  >
                    <Pencil aria-hidden strokeWidth={1.6} />
                    {copy.menu.rename}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className={menuItemClass}
                  onClick={() => void duplicate()}
                >
                  <Copy aria-hidden strokeWidth={1.6} />
                  {copy.menu.duplicate}
                </DropdownMenuItem>
                {archived ? null : (
                  <DropdownMenuItem
                    className={menuItemClass}
                    onClick={() => void archive()}
                  >
                    <Archive aria-hidden strokeWidth={1.6} />
                    {copy.menu.archive}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  className={menuItemClass}
                  onClick={() => setDeleting(true)}
                >
                  <Trash2 aria-hidden strokeWidth={1.6} />
                  {copy.menu.remove}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(next) => selectTab(toTab(String(next)))}
        className="gap-3.5"
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <TabsList
            aria-label={text.tabsLabel}
            className="h-8 gap-0 rounded-lg border border-border bg-muted p-0.5 group-data-horizontal/tabs:h-8"
          >
            {sequenceTabs.map((item) => (
              <TabsTrigger key={item} value={item} className={tabClass}>
                {text.tabs[item]}
                {item === "contacts" && sequence.stats.enrolled > 0 ? (
                  <span className="text-ink-tertiary tabular-nums">
                    {copy.number(sequence.stats.enrolled)}
                  </span>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
          <p className="ml-auto text-[12.5px] text-ink-tertiary tabular-nums">
            {archived
              ? text.archivedNote
              : text.summary(sequence.stepCount, sequence.stats.active)}
          </p>
        </div>

        <TabsContent value="steps" keepMounted className="text-[13px]">
          {visited.includes("steps") ? (
            <StepsTab
              sequence={sequence}
              problemStepIds={problemStepIds}
              reveal={reveal}
              onSequenceChange={handleSequenceChange}
            />
          ) : null}
        </TabsContent>
        <TabsContent value="contacts" keepMounted className="text-[13px]">
          {visited.includes("contacts") ? (
            <ContactsTab
              sequence={sequence}
              lists={lists}
              segments={segments}
              refreshNonce={tab === "contacts" ? refreshNonce : 0}
              onChanged={() => void refreshSequence()}
            />
          ) : null}
        </TabsContent>
        <TabsContent value="settings" keepMounted className="text-[13px]">
          {visited.includes("settings") ? (
            <SettingsTab
              sequence={sequence}
              sources={sources}
              onSaved={handleSequenceChange}
            />
          ) : null}
        </TabsContent>
      </Tabs>

      <NameDialog
        open={nameOpen}
        formKey={nameKey}
        sequence={sequence}
        onOpenChange={setNameOpen}
        onSaved={(next) => {
          setNameOpen(false);
          setSequence(next);
          toast.success(copy.toasts.renamed(next.name));
        }}
      />
      <DeleteSequenceDialog
        sequence={deleting ? sequence : null}
        onClose={() => setDeleting(false)}
        onDeleted={() => router.replace(appHref("sequences"))}
      />
    </div>
  );
}
