"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet";
import { cn } from "@workspace/ui/lib/utils";
import { RefreshCw } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { SourceMark } from "@/components/product/source-mark";
import {
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import { type BadgeTone, StatusBadge } from "@/components/status-badge";
import { CopyBlock } from "@/features/integrations/components/copy-block";
import { integrationMark } from "@/features/integrations/lib/catalog";
import {
  copy,
  describeProviderError,
  sesPolicies,
} from "@/features/integrations/lib/copy";
import type {
  SendingSource,
  WebhookState,
} from "@/features/integrations/lib/sources";
import { saveEventTopic } from "@/features/integrations/queries/mutations";

const topicPattern =
  /^arn:aws[a-z-]*:sns:[a-z0-9-]+:\d{12}:[A-Za-z0-9_-]{1,256}$/;

const eventTones: Record<WebhookState, BadgeTone> = {
  registered: "success",
  pending: "warning",
  not_registered: "neutral",
};

const sectionTitleClass = "text-[13px] font-semibold text-foreground";
const rowClass = "flex items-baseline justify-between gap-4 py-1.5";
const rowLabelClass = "text-muted-foreground";

type SesSetupSheetProps = {
  source: SendingSource | null;
  refreshing: boolean;
  onRefresh: (source: SendingSource) => void;
  onClose: () => void;
  onChanged: (source?: SendingSource) => void;
};

export function SesSetupSheet({
  source,
  refreshing,
  onRefresh,
  onClose,
  onChanged,
}: SesSetupSheetProps) {
  const [last, setLast] = useState(source);
  if (source !== null && source !== last) {
    setLast(source);
  }
  const shown = source ?? last;
  const account = shown?.details.account;

  return (
    <Sheet
      open={source !== null}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <SheetContent className="w-full gap-0 text-[13px] data-[side=right]:w-full data-[side=right]:sm:max-w-[520px]">
        {shown && account ? (
          <>
            <SheetHeader className="border-b border-border-subtle px-5 py-4 pr-12">
              <div className="flex items-center gap-2.5">
                <SourceMark
                  integration={integrationMark(shown.integrationType)}
                  className="size-8"
                />
                <div className="min-w-0">
                  <SheetTitle className="truncate text-[15px] font-semibold tracking-[-0.01em]">
                    {copy.sesSetup.title(shown.name)}
                  </SheetTitle>
                  <SheetDescription className="truncate text-xs text-ink-tertiary">
                    {copy.sesSetup.description(account.region)}
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>
            <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-4 leading-normal">
              <AccountSection
                source={shown}
                refreshing={refreshing}
                onRefresh={() => onRefresh(shown)}
              />
              <IdentitiesSection source={shown} />
              <EventsSection
                key={`${shown.id}:${shown.details.events?.topicArn ?? ""}`}
                source={shown}
                onChanged={onChanged}
              />
              <section className="flex flex-col gap-3">
                <h3 className={sectionTitleClass}>{copy.sesSetup.iamPolicy}</h3>
                <CopyBlock
                  label={copy.sesSetup.iamPolicy}
                  value={sesPolicies.sending}
                  multiline
                />
                <CopyBlock
                  label={copy.sesSetup.iamSetupPolicy}
                  value={sesPolicies.eventSetup}
                  multiline
                />
              </section>
            </div>
            <div className="flex justify-end border-t border-border-subtle px-5 py-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className={secondaryButtonClass}
              >
                {copy.sesSetup.close}
              </Button>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

type AccountSectionProps = {
  source: SendingSource;
  refreshing: boolean;
  onRefresh: () => void;
};

function AccountSection({
  source,
  refreshing,
  onRefresh,
}: AccountSectionProps) {
  const account = source.details.account;
  if (!account) {
    return null;
  }
  const text = copy.sesSetup;
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className={sectionTitleClass}>{text.account}</h3>
          <StatusBadge tone={account.sandbox ? "warning" : "success"}>
            {account.sandbox ? text.sandbox : text.production}
          </StatusBadge>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={refreshing}
          aria-busy={refreshing || undefined}
          onClick={onRefresh}
          className={cn(secondaryButtonClass, "px-[9px] text-[12.5px]")}
        >
          {refreshing ? (
            <Spinner className="size-3.5" />
          ) : (
            <RefreshCw aria-hidden strokeWidth={1.6} className="size-3.5" />
          )}
          {text.refresh}
        </Button>
      </div>
      {account.sandbox ? (
        <p className="rounded-lg bg-warning-surface px-3 py-2.5 text-foreground">
          {text.sandboxBody}
        </p>
      ) : null}
      {account.sendingEnabled ? null : (
        <p className="rounded-lg bg-danger-surface px-3 py-2.5 text-foreground">
          {text.sendingPaused}
        </p>
      )}
      <dl className="divide-y divide-border-subtle">
        <div className={rowClass}>
          <dt className={rowLabelClass}>{text.quota}</dt>
          <dd className="text-right text-foreground tabular-nums">
            {text.quotaValue(
              account.quota.sentLast24Hours,
              account.quota.max24HourSend,
            )}
          </dd>
        </div>
        <div className={rowClass}>
          <dt className={rowLabelClass}>{text.rate}</dt>
          <dd className="text-right text-foreground tabular-nums">
            {text.rateValue(account.quota.maxSendRate)}
          </dd>
        </div>
        <div className={rowClass}>
          <dt className={rowLabelClass}>{text.configurationSet}</dt>
          <dd
            className={cn(
              "text-right text-foreground",
              account.configurationSet && "font-mono text-[12.5px]",
            )}
          >
            {account.configurationSet ?? text.noConfigurationSet}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function IdentitiesSection({ source }: { source: SendingSource }) {
  const text = copy.sesSetup;
  const identities = source.details.identities ?? [];
  const verified = identities.filter((identity) => identity.verified);
  const waiting = identities.length - verified.length;
  return (
    <section className="flex flex-col gap-2">
      <h3 className={sectionTitleClass}>{text.identities}</h3>
      {verified.length === 0 ? (
        <p className="text-muted-foreground">{text.noIdentities}</p>
      ) : (
        <>
          <p className="text-muted-foreground">{text.identitiesBody}</p>
          <ul className="flex flex-wrap gap-1.5">
            {verified.map((identity) => (
              <li
                key={`${identity.type}:${identity.name}`}
                className="inline-flex h-[22px] max-w-full items-center rounded-[6px] bg-border-subtle px-2 font-mono text-xs text-foreground"
              >
                <span className="truncate">{identity.name}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {waiting > 0 ? (
        <p className="text-xs text-ink-tertiary">
          {text.pendingIdentities(waiting)}
        </p>
      ) : null}
      {source.details.identitiesTruncated ? (
        <p className="text-xs text-ink-tertiary">{text.identitiesTruncated}</p>
      ) : null}
    </section>
  );
}

type EventsSectionProps = {
  source: SendingSource;
  onChanged: (source?: SendingSource) => void;
};

function EventsSection({ source, onChanged }: EventsSectionProps) {
  const text = copy.sesSetup;
  const events = source.details.events;
  const state = source.details.webhook ?? "not_registered";
  const [topicArn, setTopicArn] = useState(events?.topicArn ?? "");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    const value = topicArn.trim();
    if (!topicPattern.test(value)) {
      setError(text.topicMissing);
      document.getElementById("ses-topic-arn")?.focus();
      return;
    }
    setPending(true);
    const result = await saveEventTopic(source.id, value);
    setPending(false);
    if (!result.ok) {
      const message = describeProviderError(result.error);
      if (result.error.field === "topicArn") {
        setError(message);
        document.getElementById("ses-topic-arn")?.focus();
        return;
      }
      toast.error(copy.toasts.topicFailed, { description: message });
      return;
    }
    onChanged(result.data.source);
    if (result.data.error) {
      toast.warning(copy.toasts.topicSaved, {
        description: result.data.error.message || copy.toasts.topicSavedManual,
      });
      return;
    }
    toast.success(copy.toasts.topicSaved, {
      description:
        result.data.destination === "configured"
          ? copy.toasts.topicSavedConfigured
          : copy.toasts.topicSavedManual,
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h3 className={sectionTitleClass}>{text.events}</h3>
        <StatusBadge tone={eventTones[state]}>
          {text.eventStates[state]}
        </StatusBadge>
      </div>
      <p className="text-muted-foreground">{text.eventsBody}</p>
      {events?.webhookUrl ? (
        <CopyBlock label={text.webhookUrl} value={events.webhookUrl} />
      ) : (
        <p className="rounded-lg bg-warning-surface px-3 py-2.5 text-foreground">
          {text.noWebhookUrl}
        </p>
      )}
      <form noValidate onSubmit={handleSubmit}>
        <Field data-invalid={error ? true : undefined}>
          <FieldLabel htmlFor="ses-topic-arn" className="text-[13px]">
            {text.topicArn}
          </FieldLabel>
          <div className="flex gap-2">
            <Input
              id="ses-topic-arn"
              name="topicArn"
              autoComplete="off"
              spellCheck={false}
              disabled={pending}
              placeholder={text.topicPlaceholder}
              value={topicArn}
              onChange={(event) => {
                setTopicArn(event.target.value);
                setError(undefined);
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "ses-topic-error" : "ses-topic-hint"}
              className={cn(
                inputClass,
                "min-w-0 flex-1 font-mono text-[12.5px]",
              )}
            />
            <Button
              type="submit"
              disabled={pending}
              aria-busy={pending || undefined}
              className={primaryButtonClass}
            >
              {pending ? <Spinner /> : null}
              {text.saveTopic}
            </Button>
          </div>
          {error ? (
            <FieldError
              id="ses-topic-error"
              className="text-[13px] text-danger"
            >
              {error}
            </FieldError>
          ) : (
            <FieldDescription id="ses-topic-hint" className="text-[13px]">
              {text.topicHint}
            </FieldDescription>
          )}
        </Field>
      </form>
      {events?.destination ? (
        <p className="text-xs text-ink-tertiary">
          {events.destination === "configured"
            ? text.destinationConfigured
            : text.destinationManual}
        </p>
      ) : null}
      <div>
        <h4 className="mb-1.5 text-xs font-medium text-muted-foreground">
          {text.steps}
        </h4>
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-muted-foreground marker:text-ink-tertiary marker:tabular-nums">
          {text
            .stepList(source.details.account?.configurationSet ?? null)
            .map((step) => (
              <li key={step}>{step}</li>
            ))}
        </ol>
      </div>
      <CopyBlock
        label={text.topicPolicy}
        value={sesPolicies.topic(events?.topicArn ?? null)}
        multiline
      />
    </section>
  );
}
