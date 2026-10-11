"use client";

import { Button } from "@workspace/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { cn } from "@workspace/ui/lib/utils";
import {
  CircleCheck,
  CircleDashed,
  CircleX,
  Ellipsis,
  Info,
  Plus,
  RefreshCw,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { buttonFocusRing, focusRing } from "@/components/app-shell/page-header";
import { SectionCard } from "@/components/product/section-card";
import { SourceMark } from "@/components/product/source-mark";
import {
  linkButtonClass,
  menuItemClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import { TokenInput } from "@/components/token-input";
import { DeleteDomainDialog } from "@/features/domains/components/delete-domain-dialog";
import {
  BackToDomains,
  CopyField,
  DomainStatusBadge,
  RecordStatusBadge,
} from "@/features/domains/components/domain-parts";
import { copy, describeError } from "@/features/domains/lib/copy";
import {
  type ChecklistItem,
  checklistOf,
  type Domain,
  isSelector,
  maxSelectors,
  normalizeSelector,
  type RecordStatus,
} from "@/features/domains/lib/domains";
import {
  checkDomain,
  updateSelectors,
} from "@/features/domains/queries/mutations";
import { useHydrated } from "@/hooks/use-hydrated";
import { createEventClock } from "@/lib/event-clock";
import { appHref } from "@/lib/navigation";

const text = copy.detail;

const statusIcons: Record<
  RecordStatus | "unknown",
  { icon: typeof CircleCheck; className: string }
> = {
  pass: { icon: CircleCheck, className: "text-success" },
  warning: { icon: TriangleAlert, className: "text-warning" },
  fail: { icon: CircleX, className: "text-danger" },
  missing: { icon: CircleX, className: "text-danger" },
  unknown: { icon: CircleDashed, className: "text-ink-tertiary" },
};

function sameSelectors(a: string[], b: string[]) {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

type DomainScreenProps = {
  initial: Domain;
};

export function DomainScreen({ initial }: DomainScreenProps) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [domain, setDomain] = useState(initial);
  const [checking, setChecking] = useState(false);
  const [removing, setRemoving] = useState<Domain | null>(null);

  const clock = createEventClock(
    hydrated ? "local" : "stable",
    new Date(),
    copy.days,
  );
  const moment = domain.lastCheckedAt ? clock(domain.lastCheckedAt) : null;
  const items = checklistOf(domain);
  const dmarcIndex = items.findIndex((item) => item.kind === "dmarc");

  async function runCheck() {
    if (checking) {
      return;
    }
    setChecking(true);
    const result = await checkDomain(domain.id);
    setChecking(false);
    if (!result.ok) {
      toast.error(copy.toasts.checkFailed, {
        description: describeError(result.error),
      });
      return;
    }
    setDomain(result.data);
    if (result.data.inconclusive.length > 0) {
      toast.warning(copy.toasts.checkedStale, {
        description: copy.toasts.checkedStaleBody,
      });
    } else {
      toast.success(copy.toasts.checked(result.data.domain));
    }
  }

  return (
    <div className="@container flex min-w-0 flex-col gap-3.5 text-[13px] leading-normal">
      <BackToDomains />

      <div className="mb-1 flex flex-wrap items-end gap-x-3 gap-y-4">
        <div className="min-w-0 flex-1 basis-72">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <h1 className="min-w-0 font-semibold text-2xl text-foreground leading-[1.2] tracking-[-0.025em] break-all">
              {domain.domain}
            </h1>
            <DomainStatusBadge status={domain.status} />
          </div>
          <p className="mt-1 max-w-[760px] text-[13.5px] text-muted-foreground">
            {text.summary(domain.status)}
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-[12.5px] text-ink-tertiary tabular-nums">
            {moment ? (
              <time dateTime={moment.iso} suppressHydrationWarning>
                {text.lastChecked(copy.at(moment.day, moment.time))}
              </time>
            ) : (
              copy.neverChecked
            )}
          </span>
          <Button
            type="button"
            disabled={checking}
            aria-busy={checking || undefined}
            onClick={runCheck}
            className={primaryButtonClass}
          >
            {checking ? (
              <Spinner />
            ) : (
              <RefreshCw aria-hidden strokeWidth={1.8} />
            )}
            {text.check}
          </Button>
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
              <DropdownMenuItem
                variant="destructive"
                className={menuItemClass}
                onClick={() => setRemoving(domain)}
              >
                <Trash2 aria-hidden strokeWidth={1.6} />
                {text.remove}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {domain.inconclusive.length > 0 ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-xl border border-info/25 bg-info-surface px-3.5 py-2.5 text-info"
        >
          <Info
            aria-hidden
            strokeWidth={1.6}
            className="mt-0.5 size-4 shrink-0"
          />
          <span className="min-w-0">{text.staleBanner}</span>
        </p>
      ) : null}

      <div className="grid min-w-0 items-start gap-[18px] @5xl:grid-cols-[minmax(0,1fr)_340px]">
        <SectionCard
          id="domain-records"
          title={text.checklistTitle}
          description={text.checklistDescription}
        >
          <ol className="divide-y divide-border-subtle">
            {items.map((item, index) => (
              <RecordFragment
                key={item.key}
                item={item}
                showNoSelectors={
                  index === dmarcIndex && domain.dkimSelectors.length === 0
                }
              />
            ))}
          </ol>
        </SectionCard>

        <div className="flex min-w-0 flex-col gap-[18px]">
          <SelectorsCard
            key={domain.dkimSelectors.join(",")}
            domain={domain}
            onSaved={setDomain}
          />
          <SourcesCard domain={domain} />
        </div>
      </div>

      <DeleteDomainDialog
        domain={removing}
        onClose={() => setRemoving(null)}
        onDeleted={() => {
          router.push(appHref("domains"));
          router.refresh();
        }}
      />
    </div>
  );
}

function RecordFragment({
  item,
  showNoSelectors,
}: {
  item: ChecklistItem;
  showNoSelectors: boolean;
}) {
  return (
    <>
      {showNoSelectors ? (
        <li className="flex gap-3 px-4 py-4">
          <TriangleAlert
            aria-hidden
            strokeWidth={1.6}
            className="mt-0.5 size-[18px] shrink-0 text-warning"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h3 className="text-sm font-semibold tracking-[-0.005em] text-foreground">
                {text.noSelectorsTitle}
              </h3>
              <RecordStatusBadge status="warning" />
            </div>
            <p className="mt-0.5 text-[12.5px] text-ink-tertiary">
              {copy.recordPurpose("dkim")}
            </p>
            <p className="mt-2 max-w-[760px] text-foreground">
              {text.noSelectorsBody}
            </p>
          </div>
        </li>
      ) : null}
      <RecordItem item={item} />
    </>
  );
}

function RecordItem({ item }: { item: ChecklistItem }) {
  const { check, kind } = item;
  const mark = statusIcons[check?.status ?? "unknown"];
  const Icon = mark.icon;
  const title =
    kind === "dkim" && item.selector
      ? text.selectorTitle(item.selector)
      : copy.recordName(kind);
  const policy =
    check && "policy" in check && typeof check.policy === "string"
      ? check.policy
      : null;
  const needsFix = check !== null && check.status !== "pass";
  const fixTitle =
    check?.status === "missing"
      ? check.expected
        ? text.add
        : text.where
      : text.change;
  const showFix =
    needsFix && (check.expected !== null || check.status === "missing");

  return (
    <li className="flex gap-3 px-4 py-4">
      <Icon
        aria-hidden
        strokeWidth={1.6}
        className={cn("mt-0.5 size-[18px] shrink-0", mark.className)}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h3 className="text-sm font-semibold tracking-[-0.005em] text-foreground">
              {title}
            </h3>
            <RecordStatusBadge status={check?.status ?? null} />
            {policy ? (
              <span className="text-[12.5px] text-muted-foreground">
                {text.policy(policy)}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[12.5px] text-ink-tertiary">
            {copy.recordPurpose(kind)}
          </p>
        </div>

        <p className="max-w-[760px] text-foreground">
          {check ? check.message : text.notCheckedBody}
        </p>

        {item.stale ? (
          <p className="flex items-start gap-1.5 text-[12.5px] text-info">
            <Info
              aria-hidden
              strokeWidth={1.6}
              className="mt-px size-3.5 shrink-0"
            />
            <span className="min-w-0">{text.stale}</span>
          </p>
        ) : null}

        {check ? (
          <div className="min-w-0">
            <div className="mb-1 text-xs font-medium text-muted-foreground">
              {text.found}
            </div>
            {check.found.length > 0 ? (
              <ul className="flex flex-col gap-1.5">
                {check.found.map((record, index) => (
                  <li
                    key={`${index}:${record}`}
                    className="rounded-lg border border-border-subtle bg-muted/40 px-2.5 py-1.5 font-mono text-[12.5px] leading-[1.5] break-all text-foreground"
                  >
                    {record}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12.5px] text-ink-tertiary">
                {text.foundNothing}
              </p>
            )}
          </div>
        ) : null}

        {showFix ? (
          <div className="min-w-0 rounded-lg border border-border bg-background px-3 py-3">
            <h4 className="text-[13px] font-semibold text-foreground">
              {fixTitle}
            </h4>
            <div className="mt-2.5 grid min-w-0 gap-3 @3xl:grid-cols-[minmax(0,1fr)_140px]">
              <CopyField label={text.host} value={check.host} />
              <CopyField
                label={text.type}
                value={copy.recordType(kind)}
                plain={kind === "dkim"}
              />
              {check.expected ? (
                <CopyField
                  label={text.value}
                  value={check.expected}
                  className="@3xl:col-span-2"
                />
              ) : null}
            </div>
            <p className="mt-2 text-[12.5px] text-ink-tertiary">
              {text.hostHint}
              {check.expected ? "" : ` ${text.valueFromProvider}`}
            </p>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function SelectorsCard({
  domain,
  onSaved,
}: {
  domain: Domain;
  onSaved: (domain: Domain) => void;
}) {
  const labels = copy.selectors;
  const [selectors, setSelectors] = useState(domain.dkimSelectors);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = !sameSelectors(selectors, domain.dkimSelectors);
  const offered = domain.suggestedSelectors.filter(
    (selector) => !selectors.includes(selector),
  );

  async function save() {
    if (pending) {
      return;
    }
    if (selectors.some((selector) => !isSelector(selector))) {
      setError(labels.invalid);
      return;
    }
    setError(null);
    setPending(true);
    const result = await updateSelectors(domain.id, selectors);
    setPending(false);
    if (!result.ok) {
      const message = describeError(result.error);
      if (result.error.field === "dkimSelectors") {
        setError(message);
        return;
      }
      toast.error(copy.toasts.saveFailed, { description: message });
      return;
    }
    toast.success(labels.saved);
    onSaved(result.data);
  }

  return (
    <SectionCard id="domain-selectors-title" title={labels.title}>
      <div className="flex flex-col gap-3 px-4 py-4">
        <p className="text-[12.5px] text-muted-foreground">
          {labels.description}
        </p>
        <div>
          <label
            htmlFor="domain-detail-selectors"
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            {labels.label}
          </label>
          <TokenInput
            id="domain-detail-selectors"
            tokens={selectors}
            max={maxSelectors}
            listLabel={labels.list}
            removeLabel={labels.remove}
            normalize={normalizeSelector}
            invalidReason={(token) =>
              isSelector(token) ? null : labels.invalid
            }
            placeholder={labels.placeholder}
            disabled={pending}
            invalid={error !== null}
            describedBy={error ? "domain-detail-selectors-error" : undefined}
            onOverflow={() => setError(labels.overflow)}
            onChange={(next) => {
              setSelectors(next);
              setError(null);
            }}
          />
          {error ? (
            <p
              id="domain-detail-selectors-error"
              role="alert"
              className="mt-1.5 text-[13px] text-danger"
            >
              {error}
            </p>
          ) : null}
        </div>

        {offered.length > 0 ? (
          <div className="rounded-lg border border-border-subtle bg-muted/40 px-3 py-2.5">
            <p className="font-medium text-foreground">{labels.foundTitle}</p>
            <p className="text-[12.5px] text-muted-foreground">
              {labels.foundBody}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {offered.map((selector) => (
                <button
                  key={selector}
                  type="button"
                  disabled={pending || selectors.length >= maxSelectors}
                  aria-label={labels.addFound(selector)}
                  onClick={() => {
                    setSelectors((current) => [...current, selector]);
                    setError(null);
                  }}
                  className={cn(
                    "inline-flex h-[22px] items-center gap-1 rounded-[6px] border border-border bg-card pr-2 pl-1.5 font-mono text-xs text-foreground hover:bg-muted disabled:opacity-50",
                    focusRing,
                  )}
                >
                  <Plus
                    aria-hidden
                    strokeWidth={1.8}
                    className="size-3 text-muted-foreground"
                  />
                  {selector}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div>
          <Button
            type="button"
            variant="outline"
            disabled={pending || !changed}
            aria-busy={pending || undefined}
            onClick={save}
            className={secondaryButtonClass}
          >
            {pending ? <Spinner /> : null}
            {labels.save}
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}

function SourcesCard({ domain }: { domain: Domain }) {
  const labels = copy.sources;
  return (
    <SectionCard
      id="domain-sources-title"
      title={labels.title}
      action={
        <Link
          href={appHref("integrations")}
          className={cn(
            linkButtonClass,
            "h-7 border-border bg-card px-2.5 text-[12.5px] shadow-xs hover:bg-muted",
            focusRing,
          )}
        >
          {labels.manage}
        </Link>
      }
    >
      {domain.sources.length === 0 ? (
        <p className="px-4 py-4 text-muted-foreground">{labels.none}</p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {domain.sources.map((source) => (
            <li
              key={source.id}
              className="flex items-center gap-2.5 px-4 py-2.5"
            >
              <SourceMark
                integration={{ id: source.integrationType, mark: null }}
              />
              <span className="min-w-0 truncate font-medium text-foreground">
                {source.name}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
