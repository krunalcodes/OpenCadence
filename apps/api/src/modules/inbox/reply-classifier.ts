import type {
  ReceivedHeaderName,
  ReceivedMessage,
} from "@workspace/integration-core";

export type ReceivedKind = "reply" | "auto_reply" | "bounce" | "ignored";

export type Classified = { kind: ReceivedKind; references: string[] };

const daemonPattern = /^(mailer-daemon|postmaster)@/i;

const permanentStatusPattern = /^5\.\d{1,3}\.\d{1,3}$/;

function header(message: ReceivedMessage, name: ReceivedHeaderName) {
  return message.headers[name]?.trim().toLowerCase();
}

function isReportFormat(message: ReceivedMessage) {
  const contentType = header(message, "content-type") ?? "";
  return (
    contentType.includes("multipart/report") &&
    contentType.includes("delivery-status")
  );
}

function isDeliveryReport(message: ReceivedMessage) {
  return (
    message.deliveryStatus !== undefined ||
    daemonPattern.test(message.from?.email.trim() ?? "") ||
    isReportFormat(message)
  );
}

function isPermanentFailure(message: ReceivedMessage) {
  const report = message.deliveryStatus;
  if (report) {
    return (
      report.action?.trim().toLowerCase() === "failed" &&
      permanentStatusPattern.test(report.status?.trim() ?? "")
    );
  }
  return (
    !isReportFormat(message) &&
    header(message, "x-failed-recipients") !== undefined
  );
}

function isAutoReply(message: ReceivedMessage) {
  const autoSubmitted = header(message, "auto-submitted");
  if (
    autoSubmitted !== undefined &&
    autoSubmitted.split(";")[0]?.trim() !== "no"
  ) {
    return true;
  }
  if (
    header(message, "x-autoreply") !== undefined ||
    header(message, "x-autorespond") !== undefined
  ) {
    return true;
  }
  return header(message, "precedence") === "auto_reply";
}

export function referencedIds(message: ReceivedMessage) {
  const ordered = [
    message.deliveryStatus?.originalMessageId,
    message.inReplyTo,
    ...[...message.references].reverse(),
  ];
  const ids: string[] = [];
  for (const value of ordered) {
    const id = value?.trim();
    if (id && !ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids;
}

export function classifyReceived(
  message: ReceivedMessage,
  mailboxEmail: string | null,
): Classified {
  const references = referencedIds(message);
  if (
    references.length === 0 ||
    (mailboxEmail &&
      message.from?.email.trim().toLowerCase() === mailboxEmail.toLowerCase())
  ) {
    return { kind: "ignored", references };
  }
  if (isDeliveryReport(message)) {
    return {
      kind: isPermanentFailure(message) ? "bounce" : "ignored",
      references,
    };
  }
  return { kind: isAutoReply(message) ? "auto_reply" : "reply", references };
}
