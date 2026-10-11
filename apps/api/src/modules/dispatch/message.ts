import type { MessageListRow } from "./dispatch.repository";

export type MessageStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "delayed"
  | "bounced"
  | "complained"
  | "failed"
  | "skipped";

export const messageStatuses: MessageStatus[] = [
  "queued",
  "sent",
  "delivered",
  "delayed",
  "bounced",
  "complained",
  "failed",
  "skipped",
];

export type MessageDto = {
  id: string;
  createdAt: string;
  kind: string;
  status: MessageStatus;
  sourceId: string;
  sourceName: string;
  integrationType: string;
  from: { email: string; name: string | null };
  to: string[];
  cc: string[];
  bcc: string[];
  suppressed: string[];
  subject: string;
  rfcMessageId: string | null;
  tags: Record<string, string>;
  error: { code: string; message: string } | null;
  attempts: number;
  sentAt: string | null;
  lastEventAt: string | null;
  contactId: string | null;
  campaignId: string | null;
  sequenceId: string | null;
  sequenceStepId: string | null;
  enrollmentId: string | null;
  unsubscribeListId: string | null;
  openedAt: string | null;
  openCount: number;
  clickedAt: string | null;
  clickCount: number;
  repliedAt: string | null;
  unsubscribedAt: string | null;
};

export function toMessageDto(row: MessageListRow): MessageDto {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    kind: row.kind,
    status: row.status as MessageStatus,
    sourceId: row.sourceId,
    sourceName: row.sourceName,
    integrationType: row.integrationType,
    from: { email: row.fromEmail, name: row.fromName },
    to: row.toEmails,
    cc: row.ccEmails ?? [],
    bcc: row.bccEmails ?? [],
    suppressed: row.suppressedEmails ?? [],
    subject: row.subject,
    rfcMessageId: row.rfcMessageId ?? null,
    tags: row.tags ?? {},
    error: row.errorCode
      ? { code: row.errorCode, message: row.errorMessage ?? "" }
      : null,
    attempts: row.attempts,
    sentAt: row.sentAt?.toISOString() ?? null,
    lastEventAt: row.lastEventAt?.toISOString() ?? null,
    contactId: row.contactId,
    campaignId: row.campaignId,
    sequenceId: row.sequenceId,
    sequenceStepId: row.sequenceStepId,
    enrollmentId: row.enrollmentId,
    unsubscribeListId: row.unsubscribeListId,
    openedAt: row.firstOpenedAt?.toISOString() ?? null,
    openCount: row.openCount,
    clickedAt: row.firstClickedAt?.toISOString() ?? null,
    clickCount: row.clickCount,
    repliedAt: row.repliedAt?.toISOString() ?? null,
    unsubscribedAt: row.unsubscribedAt?.toISOString() ?? null,
  };
}
