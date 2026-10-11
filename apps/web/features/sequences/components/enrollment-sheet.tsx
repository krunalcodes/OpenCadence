"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { useEffect, useState } from "react";
import { secondaryButtonClass } from "@/components/product/styles";
import { StatusBadge } from "@/components/status-badge";
import {
  copy,
  enrollmentLabels,
  enrollmentTones,
  messageLabel,
  messageTone,
} from "@/features/sequences/lib/copy";
import {
  contactName,
  type Enrollment,
  type EnrollmentDetail,
} from "@/features/sequences/lib/enrollments";
import type { Step } from "@/features/sequences/lib/sequences";
import { fetchEnrollment } from "@/features/sequences/queries/client";
import type { EventClock } from "@/lib/event-clock";

const text = copy.enrollment;
const skeletonRows = ["first", "second", "third"];

type EnrollmentSheetProps = {
  sequenceId: string;
  steps: Step[];
  enrollment: Enrollment | null;
  clock: EventClock;
  onClose: () => void;
};

export function EnrollmentSheet({
  sequenceId,
  steps,
  enrollment,
  clock,
  onClose,
}: EnrollmentSheetProps) {
  const [last, setLast] = useState(enrollment);

  if (enrollment !== null && enrollment !== last) {
    setLast(enrollment);
  }

  const shown = enrollment ?? last;

  return (
    <Sheet
      open={enrollment !== null}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <SheetContent className="w-full gap-0 text-[13px] data-[side=right]:w-full data-[side=right]:sm:max-w-[480px]">
        {shown ? (
          <SheetBody
            key={shown.id}
            sequenceId={sequenceId}
            steps={steps}
            enrollment={shown}
            clock={clock}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

type Loaded =
  | { state: "loading" }
  | { state: "failed" }
  | { state: "ready"; detail: EnrollmentDetail };

function Moment({ clock, value }: { clock: EventClock; value: string | null }) {
  const moment = value ? clock(value) : null;
  return moment ? (
    <time dateTime={moment.iso} suppressHydrationWarning>
      {moment.day}, {moment.time}
    </time>
  ) : null;
}

function SheetBody({
  sequenceId,
  steps,
  enrollment,
  clock,
}: {
  sequenceId: string;
  steps: Step[];
  enrollment: Enrollment;
  clock: EventClock;
}) {
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);

  const requestKey = `${attempt}:${enrollment.id}`;

  useEffect(() => {
    let current = true;
    const id = requestKey.slice(requestKey.indexOf(":") + 1);
    fetchEnrollment(sequenceId, id).then((result) => {
      if (current) {
        setLoaded(
          result.ok
            ? { state: "ready", detail: result.data }
            : { state: "failed" },
        );
      }
    });
    return () => {
      current = false;
    };
  }, [sequenceId, requestKey]);

  const detail = loaded.state === "ready" ? loaded.detail : enrollment;
  const name = contactName(detail.contact);
  const open = detail.status === "active" || detail.status === "paused";
  const nextStep = open && detail.nextStepPosition < steps.length;

  const facts: { label: string; value: React.ReactNode }[] = [
    {
      label: text.facts.mailbox,
      value: detail.source?.name || copy.contacts.noMailbox,
    },
    {
      label: text.facts.enrolled,
      value: <Moment clock={clock} value={detail.enrolledAt} />,
    },
  ];
  if (nextStep) {
    facts.push({
      label: text.facts.next,
      value: (
        <>
          {text.step(detail.nextStepPosition + 1)}
          {detail.nextRunAt ? (
            <>
              {", "}
              <Moment clock={clock} value={detail.nextRunAt} />
            </>
          ) : null}
        </>
      ),
    });
  }
  if (detail.finishedAt) {
    facts.push({
      label: text.facts.finished,
      value: <Moment clock={clock} value={detail.finishedAt} />,
    });
  }
  if (detail.finishReason) {
    facts.push({ label: text.facts.reason, value: detail.finishReason });
  }

  return (
    <>
      <SheetHeader className="gap-1 border-b border-border-subtle px-5 py-4 pr-12">
        <SheetTitle className="truncate text-[15px] font-semibold tracking-[-0.01em]">
          {name ?? detail.contact.email}
        </SheetTitle>
        <SheetDescription className="flex min-w-0 items-center gap-2 text-[13px] leading-normal">
          {name ? (
            <span className="truncate">{detail.contact.email}</span>
          ) : null}
          <StatusBadge tone={enrollmentTones[detail.status]}>
            {enrollmentLabels[detail.status]}
          </StatusBadge>
        </SheetDescription>
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
        <dl className="flex flex-col gap-1.5">
          {facts.map((fact) => (
            <div key={fact.label} className="flex min-w-0 gap-3">
              <dt className="w-24 shrink-0 text-ink-tertiary">{fact.label}</dt>
              <dd className="min-w-0 break-words text-foreground tabular-nums">
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>

        <section
          aria-labelledby="enrollment-messages"
          className="flex flex-col gap-2.5"
        >
          <h3
            id="enrollment-messages"
            className="text-sm font-semibold tracking-[-0.005em]"
          >
            {text.messages}
          </h3>
          {loaded.state === "loading" ? (
            <div aria-busy="true" className="flex flex-col gap-2.5">
              <span className="sr-only">{text.loading}</span>
              {skeletonRows.map((row) => (
                <div
                  key={row}
                  className="flex flex-col gap-2 rounded-lg border border-border-subtle p-3"
                >
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-3.5 w-12" />
                    <Skeleton className="ml-auto h-[22px] w-16 rounded-[6px]" />
                  </div>
                  <Skeleton className="h-4 w-64 max-w-full" />
                  <Skeleton className="h-3.5 w-40" />
                </div>
              ))}
            </div>
          ) : loaded.state === "failed" ? (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-subtle px-3 py-2.5"
            >
              <p className="text-muted-foreground">{text.loadFailed}</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setLoaded({ state: "loading" });
                  setAttempt((value) => value + 1);
                }}
                className={secondaryButtonClass}
              >
                {text.retry}
              </Button>
            </div>
          ) : loaded.detail.messages.length === 0 ? (
            <p className="rounded-lg bg-muted px-3 py-2.5 text-muted-foreground">
              {text.noMessages}
            </p>
          ) : (
            <ol className="flex flex-col gap-2.5">
              {loaded.detail.messages.map((message) => {
                const stepIndex = message.stepId
                  ? steps.findIndex((step) => step.id === message.stepId)
                  : -1;
                const marks = [
                  { label: text.sent, value: message.sentAt },
                  { label: text.opened, value: message.openedAt },
                  { label: text.clicked, value: message.clickedAt },
                  { label: text.replied, value: message.repliedAt },
                ].filter((mark) => mark.value !== null);
                return (
                  <li
                    key={message.id}
                    className="flex flex-col gap-1.5 rounded-lg border border-border-subtle p-3"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-ink-tertiary">
                        {stepIndex === -1
                          ? text.deletedStep
                          : text.step(stepIndex + 1)}
                      </span>
                      <StatusBadge
                        tone={messageTone(message.status)}
                        className="ml-auto"
                      >
                        {messageLabel(message.status)}
                      </StatusBadge>
                    </div>
                    <p className="truncate font-medium text-foreground">
                      {message.subject || text.noSubject}
                    </p>
                    {marks.length === 0 ? (
                      <p className="text-[12.5px] text-ink-tertiary">
                        {text.notSent}
                      </p>
                    ) : (
                      <dl className="flex flex-col gap-0.5 text-[12.5px]">
                        {marks.map((mark) => (
                          <div key={mark.label} className="flex gap-3">
                            <dt className="w-16 shrink-0 text-ink-tertiary">
                              {mark.label}
                            </dt>
                            <dd className="text-muted-foreground tabular-nums">
                              <Moment clock={clock} value={mark.value} />
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}
