import { cn } from "@workspace/ui/lib/utils";
import { CircleAlert, CircleCheck, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { StatusFocus } from "@/features/preferences/components/status-focus";
import { SubmitButton } from "@/features/preferences/components/submit-button";
import {
  savePreferencesAction,
  unsubscribeAllAction,
} from "@/features/preferences/lib/actions";
import { copy } from "@/features/preferences/lib/copy";
import { statusAnchor } from "@/features/preferences/lib/paths";
import type {
  PreferencesFailure,
  PreferencesResult,
} from "@/features/preferences/lib/preferences-api";

export type PreferencesOutcome = "saved" | "all" | null;

const linkClass =
  "inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-border bg-card px-4 py-2.5 text-[15px] leading-snug font-medium text-foreground shadow-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const tones = {
  success: "bg-success-surface text-success",
  warning: "bg-warning-surface text-warning",
};

function Shell({
  brandName,
  children,
}: {
  brandName: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-[27rem] flex-col px-5 pt-6 pb-12 sm:pt-10">
      {brandName ? (
        <header className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-card text-sm font-semibold text-foreground shadow-xs"
          >
            {Array.from(brandName)[0]?.toUpperCase()}
          </span>
          <span className="min-w-0 truncate text-[15px] font-semibold tracking-[-0.005em] text-foreground">
            {brandName}
          </span>
        </header>
      ) : null}
      <main className="flex flex-1 flex-col justify-center py-12">
        {children}
      </main>
    </div>
  );
}

function Mark({
  tone,
  icon: Icon,
}: {
  tone: keyof typeof tones;
  icon: LucideIcon;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "mb-5 grid size-10 place-items-center rounded-[10px]",
        tones[tone],
      )}
    >
      <Icon strokeWidth={1.6} className="size-5" />
    </span>
  );
}

function Title({ children }: { children: ReactNode }) {
  return (
    <h1 className="text-balance break-words text-2xl leading-[1.2] font-semibold tracking-[-0.025em] text-foreground">
      {children}
    </h1>
  );
}

function Text({
  id,
  children,
  className,
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      id={id}
      className={cn(
        "mt-3 break-words text-[15px] leading-[1.55] text-muted-foreground",
        className,
      )}
    >
      {children}
    </p>
  );
}

function Status({
  tone,
  title,
  children,
}: {
  tone: keyof typeof tones;
  title: string;
  children: ReactNode;
}) {
  const Icon = tone === "success" ? CircleCheck : CircleAlert;
  return (
    <div
      id={statusAnchor}
      role={tone === "success" ? "status" : "alert"}
      tabIndex={-1}
      className={cn(
        "mb-6 flex gap-2.5 rounded-lg px-3.5 py-3 text-[14px] leading-normal outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        tones[tone],
      )}
    >
      <Icon
        aria-hidden="true"
        strokeWidth={1.6}
        className="mt-0.5 size-4 shrink-0"
      />
      <span className="min-w-0 break-words">
        <span className="font-medium">{title}. </span>
        {children}
      </span>
    </div>
  );
}

export function PreferencesView({
  token,
  result,
  outcome,
  failed,
}: {
  token: string;
  result: PreferencesResult;
  outcome: PreferencesOutcome;
  failed: PreferencesFailure | null;
}) {
  if (!result.ok && result.reason === "invalid") {
    return (
      <Shell brandName="">
        <Mark tone="warning" icon={CircleAlert} />
        <Title>{copy.invalid.title}</Title>
        <Text>{copy.invalid.body}</Text>
      </Shell>
    );
  }

  if (!result.ok) {
    return (
      <Shell brandName="">
        <Mark tone="warning" icon={CircleAlert} />
        <Title>{copy.failed.loadTitle}</Title>
        <Text>
          {result.reason === "busy" ? copy.failed.busy : copy.failed.offline}
        </Text>
        <div className="mt-7">
          <Link href={`/preferences/${token}`} className={linkClass}>
            {copy.failed.retryAction}
          </Link>
        </div>
      </Shell>
    );
  }

  const { email, brandName, lists, unsubscribedFromAll, contactFound } =
    result.preferences;
  const sender = brandName || copy.fallbackSender;
  const problem = failed && failed !== "invalid" ? failed : null;
  const stopped = unsubscribedFromAll;
  const saved = outcome === "saved" && !problem && !stopped;

  return (
    <Shell brandName={brandName}>
      {problem ? (
        <Status tone="warning" title={copy.failed.title}>
          {problem === "busy" ? copy.failed.busy : copy.failed.offline}
        </Status>
      ) : stopped ? (
        <Status tone="success" title={copy.all.title}>
          {copy.all.body(email, sender)} {copy.all.note}
        </Status>
      ) : saved ? (
        <Status tone="success" title={copy.saved.title}>
          {copy.saved.body}
        </Status>
      ) : null}

      <Title>{copy.title}</Title>
      <Text>
        {contactFound ? copy.intro(sender, email) : copy.noContact.body(email)}
      </Text>

      {lists.length > 0 ? (
        <form action={savePreferencesAction} className="mt-7">
          <input type="hidden" name="token" value={token} />
          <fieldset className="min-w-0">
            <legend className="sr-only">{copy.listsLegend}</legend>
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-xs">
              {lists.map((list) => {
                const id = `preference-${list.id}`;
                return (
                  <li key={list.id}>
                    <label
                      htmlFor={id}
                      className="flex min-h-12 items-start gap-3 px-4 py-3.5 hover:bg-muted/50"
                    >
                      <input
                        id={id}
                        type="checkbox"
                        name="listIds"
                        value={list.id}
                        defaultChecked={list.subscribed}
                        aria-describedby={
                          list.description ? `${id}-description` : undefined
                        }
                        className="mt-0.5 size-5 shrink-0 rounded accent-primary outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      />
                      <span className="min-w-0">
                        <span className="block break-words text-[15px] leading-snug font-medium text-foreground">
                          {list.name}
                        </span>
                        {list.description ? (
                          <span
                            id={`${id}-description`}
                            className="mt-0.5 block break-words text-[14px] leading-normal text-muted-foreground"
                          >
                            {list.description}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
          {stopped ? (
            <Text className="mt-4 text-[14px]">{copy.all.again}</Text>
          ) : null}
          <div className="mt-5">
            <SubmitButton variant="primary">{copy.save}</SubmitButton>
          </div>
        </form>
      ) : contactFound ? (
        <Text>{copy.noLists.body(sender)}</Text>
      ) : null}

      {stopped ? null : (
        <div className="mt-9 border-t border-border pt-6">
          <p className="mb-3 text-[14px] leading-normal text-muted-foreground">
            {copy.everything.heading}
          </p>
          <form action={unsubscribeAllAction}>
            <input type="hidden" name="token" value={token} />
            <SubmitButton
              variant="secondary"
              describedBy="preferences-all-note"
            >
              {copy.everything.action}
            </SubmitButton>
          </form>
          <Text id="preferences-all-note" className="mt-4 text-[13px]">
            {copy.everything.note}
          </Text>
        </div>
      )}

      {problem || outcome ? <StatusFocus targetId={statusAnchor} /> : null}
    </Shell>
  );
}
