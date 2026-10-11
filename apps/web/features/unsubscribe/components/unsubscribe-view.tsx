import { cn } from "@workspace/ui/lib/utils";
import { CircleAlert, CircleCheck, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { SubmitButton } from "@/features/unsubscribe/components/submit-button";
import {
  resubscribeAction,
  unsubscribeAction,
} from "@/features/unsubscribe/lib/actions";
import { copy } from "@/features/unsubscribe/lib/copy";
import type {
  DetailsResult,
  UnsubscribeFailure,
  UnsubscribeScope,
} from "@/features/unsubscribe/lib/unsubscribe-api";

export type UnsubscribeOutcome = "list" | "all" | "again" | null;

const linkClass =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-card px-4 py-2.5 font-medium text-[15px] text-foreground leading-snug shadow-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

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
            className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-card font-semibold text-foreground text-sm shadow-xs"
          >
            {Array.from(brandName)[0]?.toUpperCase()}
          </span>
          <span className="min-w-0 truncate font-semibold text-[15px] text-foreground tracking-[-0.005em]">
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
    <h1 className="text-balance break-words font-semibold text-2xl text-foreground leading-[1.2] tracking-[-0.025em]">
      {children}
    </h1>
  );
}

function Text({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "mt-3 break-words text-[15px] text-muted-foreground leading-[1.55]",
        className,
      )}
    >
      {children}
    </p>
  );
}

function ActionForm({
  token,
  scope,
  variant,
  children,
}: {
  token: string;
  scope?: UnsubscribeScope;
  variant: "primary" | "secondary";
  children: ReactNode;
}) {
  return (
    <form action={scope ? unsubscribeAction : resubscribeAction}>
      <input type="hidden" name="token" value={token} />
      {scope ? <input type="hidden" name="scope" value={scope} /> : null}
      <SubmitButton variant={variant}>{children}</SubmitButton>
    </form>
  );
}

function Notice({ reason }: { reason: UnsubscribeFailure }) {
  return (
    <div
      role="alert"
      className="mb-6 flex gap-2.5 rounded-lg bg-warning-surface px-3.5 py-3 text-[14px] text-warning leading-normal"
    >
      <CircleAlert
        aria-hidden="true"
        strokeWidth={1.6}
        className="mt-0.5 size-4 shrink-0"
      />
      <span>
        <span className="font-medium">{copy.failed.title}. </span>
        {reason === "busy" ? copy.failed.busy : copy.failed.offline}
      </span>
    </div>
  );
}

function UnsubscribeView({
  token,
  result,
  outcome,
  failed,
}: {
  token: string;
  result: DetailsResult;
  outcome: UnsubscribeOutcome;
  failed: UnsubscribeFailure | null;
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
        <Title>{copy.failed.title}</Title>
        <Text>
          {result.reason === "busy" ? copy.failed.busy : copy.failed.offline}
        </Text>
        <div className="mt-7">
          <Link
            href={`/unsubscribe/${token}`}
            className={cn(linkClass, "w-full")}
          >
            {copy.failed.retryAction}
          </Link>
        </div>
      </Shell>
    );
  }

  const { email, brandName, listName, alreadyUnsubscribed } = result.details;
  const sender = brandName || copy.fallbackSender;
  const notice =
    failed && failed !== "invalid" ? <Notice reason={failed} /> : null;

  if (alreadyUnsubscribed) {
    const body =
      outcome === "list" && listName
        ? copy.done.list(email, listName)
        : outcome === "all"
          ? copy.done.all(email, sender)
          : copy.done.already(email, sender);
    return (
      <Shell brandName={brandName}>
        {notice}
        <Mark tone="success" icon={CircleCheck} />
        <Title>{copy.done.title}</Title>
        <Text>{body}</Text>
        <div className="mt-9 border-border border-t pt-6">
          <p className="mb-3 text-[14px] text-muted-foreground leading-normal">
            {copy.done.mistake}
          </p>
          <ActionForm token={token} variant="secondary">
            {copy.done.undoAction}
          </ActionForm>
        </div>
      </Shell>
    );
  }

  if (outcome === "again" && !failed) {
    return (
      <Shell brandName={brandName}>
        <Mark tone="success" icon={CircleCheck} />
        <Title>{copy.again.title}</Title>
        <Text>{copy.again.body(email, sender)}</Text>
        <div className="mt-9 border-border border-t pt-6">
          <p className="mb-3 text-[14px] text-muted-foreground leading-normal">
            {copy.again.changeMind}
          </p>
          <Link
            href={`/unsubscribe/${token}`}
            className={cn(linkClass, "w-full")}
          >
            {copy.ask.onlyAction}
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell brandName={brandName}>
      {notice}
      <Title>
        {listName
          ? copy.ask.titleForList(listName)
          : copy.ask.titleForAll(sender)}
      </Title>
      <Text>{copy.ask.address(email)}</Text>
      <div className="mt-7 flex flex-col gap-2.5">
        {listName ? (
          <>
            <ActionForm token={token} scope="list" variant="primary">
              {copy.ask.listAction}
            </ActionForm>
            <ActionForm token={token} scope="all" variant="secondary">
              {copy.ask.allAction(sender)}
            </ActionForm>
          </>
        ) : (
          <ActionForm token={token} scope="all" variant="primary">
            {copy.ask.onlyAction}
          </ActionForm>
        )}
      </div>
      <Text className="mt-5 text-[13px]">{copy.ask.allNote}</Text>
    </Shell>
  );
}

function UnsubscribeSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="mx-auto flex min-h-svh w-full max-w-[27rem] flex-col px-5 pt-6 pb-12 sm:pt-10"
    >
      <div className="flex items-center gap-2.5">
        <div className="size-8 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
        <div className="h-4 w-28 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      </div>
      <div className="flex flex-1 flex-col justify-center py-12">
        <div className="h-7 w-4/5 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <div className="mt-4 h-4 w-3/5 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <div className="mt-8 h-11 w-full animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
        <div className="mt-2.5 h-11 w-full animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
      </div>
    </div>
  );
}

export { UnsubscribeSkeleton, UnsubscribeView };
