import type { BadgeTone } from "@/components/status-badge";
import type {
  DeliveryStatus,
  RelativeTime,
  StatusFilter,
  ThreadOrigin,
} from "@/features/inbox/lib/inbox";

const countFormat = new Intl.NumberFormat("en-US");

export const statusFilterLabels: Record<StatusFilter, string> = {
  open: "Open",
  closed: "Closed",
  all: "All",
};

export const deliveryLabels: Record<DeliveryStatus, string> = {
  queued: "Sending",
  sent: "Sent",
  delivered: "Delivered",
  delayed: "Delayed",
  bounced: "Bounced",
  complained: "Complaint",
  failed: "Failed",
  skipped: "Not sent",
};

export const deliveryTones: Record<DeliveryStatus, BadgeTone> = {
  queued: "neutral",
  sent: "success",
  delivered: "success",
  delayed: "warning",
  bounced: "danger",
  complained: "danger",
  failed: "danger",
  skipped: "neutral",
};

export const deliveryHints: Partial<Record<DeliveryStatus, string>> = {
  delayed:
    "The mailbox has not sent this yet. It may have reached its daily limit or the provider asked to wait. OpenCadence keeps trying.",
  bounced:
    "The address rejected this reply. It is now on the suppression list.",
  failed:
    "The mailbox could not send this reply. Check it on the Sources page.",
  skipped:
    "This reply was not sent because the address is on the suppression list.",
};

export const originLabels: Record<ThreadOrigin["type"], string> = {
  campaign: "Campaign",
  sequence: "Sequence",
};

export const copy = {
  title: "Inbox",
  description: "Replies to your campaigns and sequences, in one place.",
  unreadSummary: (count: number) =>
    count === 1
      ? "1 unread conversation"
      : `${countFormat.format(count)} unread conversations`,
  listLabel: "Conversations",
  threadLabel: "Conversation",
  statusLabel: "Show conversations by status",
  unreadOnly: "Unread only",
  sourceLabel: "Filter by mailbox",
  sourcePlaceholder: "All mailboxes",
  sourceEmpty: "No mailbox matches. Clear the box to see all.",
  searchLabel: "Search by contact or subject",
  searchPlaceholder: "Search contact or subject",
  clearAll: "Clear filters",
  loadMore: "Load more",
  loadMoreFailed: "Could not load more conversations",
  days: { today: "Today", yesterday: "Yesterday" },
  relative: (time: RelativeTime, date: string) => {
    if (time.unit === "now") {
      return "now";
    }
    if (time.unit === "minutes") {
      return `${time.value}m`;
    }
    if (time.unit === "hours") {
      return `${time.value}h`;
    }
    if (time.unit === "days") {
      return `${time.value}d`;
    }
    return date;
  },
  row: {
    noSubject: "No subject",
    unread: "Unread",
    theirs: "They replied",
    yours: "You replied",
    closed: "Closed",
    open: (contact: string, subject: string) =>
      `Open conversation with ${contact}: ${subject}`,
    originLink: (type: string, name: string) => `${type}: ${name}`,
  },
  empty: {
    title: "No open conversations",
    body: "Replies to your campaigns and sequences appear here. Replies are detected in any mailbox connected over IMAP/SMTP.",
    sources: "Open Sources",
  },
  noMatch: {
    title: "No conversations match",
    body: "Try a different status, mailbox or search, or clear the filters.",
  },
  listFailed: {
    title: "Could not load the inbox.",
    body: "The server did not answer. Check that the API is running, then try again.",
    retry: "Try again",
  },
  placeholder: {
    title: "Select a conversation",
    body: "Choose a conversation from the list to read it and reply.",
  },
  missing: {
    title: "This conversation no longer exists",
    body: "It may have been removed, or it belongs to another workspace.",
    back: "Back to the inbox",
  },
  threadFailed: {
    title: "Could not load this conversation.",
    body: "The server did not answer. Check that the API is running, then try again.",
    retry: "Try again",
  },
  thread: {
    back: "Back to conversations",
    noSubject: "No subject",
    arrivedIn: "Arrived in",
    disconnected: "A mailbox that was disconnected",
    viewContact: (contact: string) => `View ${contact} in contacts`,
    close: "Close",
    reopen: "Reopen",
    markUnread: "Mark unread",
    closedBadge: "Closed",
    showOriginal: "Show the email they replied to",
    hideOriginal: "Hide the email they replied to",
    originalLabel: "The email they replied to",
    to: (addresses: string) => `to ${addresses}`,
    showQuoted: "Show quoted text",
    hideQuoted: "Hide quoted text",
    showFull: "Show full message",
    showLess: "Show less",
    noBody: "This message has no text.",
    frameTitle: (sender: string) => `Message from ${sender}`,
    imageLabel: "image",
  },
  reply: {
    label: "Reply",
    placeholder: "Write a reply",
    from: "From",
    fromHint: "Replies go from the mailbox the conversation arrived in.",
    send: "Send reply",
    sending: "Sending",
    sendKeys: "⌘/Ctrl Enter",
    tooLong: (max: number) =>
      `Keep the reply to ${countFormat.format(max)} characters or fewer.`,
    sourcePaused: (name: string) =>
      `Sending through ${name} is paused. Resume it on the Sources page before replying.`,
    sourceNeedsAttention: (name: string) =>
      `${name} needs attention before it can send. Fix it on the Sources page before replying.`,
    sourceGone:
      "The mailbox this conversation came through was disconnected. Connect it again to reply.",
    sources: "Open Sources",
  },
  toasts: {
    closed: "Conversation closed",
    markedUnread: "Marked as unread",
    undo: "Undo",
    closeFailed: "Could not close the conversation",
    reopenFailed: "Could not reopen the conversation",
    unreadFailed: "Could not mark the conversation as unread",
  },
  shortcuts: {
    button: "Keyboard shortcuts",
    title: "Keyboard shortcuts",
    note: "Shortcuts pause while you type.",
    next: "Next conversation",
    previous: "Previous conversation",
    arrows: "Move through the list when it has focus",
    close: "Close the conversation",
    unread: "Mark as unread",
    reply: "Write a reply",
    send: "Send the reply",
    sendKeys: "⌘/Ctrl Enter",
  },
  errors: {
    network:
      "The server did not answer. Check your connection and that the API is running. Your reply is still in the box.",
    signedOut:
      "You are signed out or have no active workspace. Reload the page and sign in again. Your reply is kept as a draft in this tab.",
    forbidden: "You do not have permission to do this in this workspace.",
    missing:
      "This conversation no longer exists, so the reply was not sent. Go back to the inbox.",
    suppressed: (email: string) =>
      `${email} is on the suppression list because of a bounce, a complaint or a manual block, so a reply cannot be sent to this address.`,
    sourceUnavailable:
      "The mailbox this conversation came through is paused, needs attention or was disconnected, so the reply was not sent. Fix it on the Sources page, then send again.",
    limited:
      "Too many requests in a short time. Wait a moment, then send again.",
    validation: "Write the reply before sending it.",
    fallback: "The reply was not sent. Try again in a moment.",
    actionFallback: "Nothing was changed. Try again in a moment.",
    actionNetwork:
      "The server did not answer. Check your connection and that the API is running.",
    actionSignedOut:
      "You are signed out or have no active workspace. Reload the page and sign in again.",
  },
};

type Failure = {
  status: number;
  code: string;
  message: string | null;
};

export type ReplyProblem = { message: string; sources: boolean };

export function describeReplyError(
  error: Failure,
  contactEmail: string,
): ReplyProblem {
  if (error.status === 0) {
    return { message: copy.errors.network, sources: false };
  }
  if (error.status === 401) {
    return { message: copy.errors.signedOut, sources: false };
  }
  if (error.status === 403) {
    return { message: copy.errors.forbidden, sources: false };
  }
  if (error.code === "recipient_suppressed") {
    return { message: copy.errors.suppressed(contactEmail), sources: false };
  }
  if (error.code === "source_unavailable") {
    return {
      message: error.message ?? copy.errors.sourceUnavailable,
      sources: true,
    };
  }
  if (error.status === 404) {
    return { message: copy.errors.missing, sources: false };
  }
  if (error.status === 429) {
    return { message: copy.errors.limited, sources: false };
  }
  if (error.code === "validation") {
    return {
      message: error.message ?? copy.errors.validation,
      sources: false,
    };
  }
  return { message: copy.errors.fallback, sources: false };
}

export function describeActionError(error: Failure) {
  if (error.status === 0) {
    return copy.errors.actionNetwork;
  }
  if (error.status === 401) {
    return copy.errors.actionSignedOut;
  }
  if (error.status === 403) {
    return copy.errors.forbidden;
  }
  if (error.status === 404) {
    return copy.missing.body;
  }
  return error.message ?? copy.errors.actionFallback;
}
