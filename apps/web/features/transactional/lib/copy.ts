import type { BadgeTone } from "@/components/status-badge";
import type {
  EmailError,
  EmailKind,
  EmailStatus,
} from "@/features/transactional/lib/emails";

export const statusTones: Record<EmailStatus, BadgeTone> = {
  queued: "neutral",
  sent: "success",
  delivered: "success",
  delayed: "warning",
  bounced: "danger",
  complained: "danger",
  failed: "danger",
  skipped: "neutral",
};

export const statusLabels: Record<EmailStatus, string> = {
  queued: "Queued",
  sent: "Sent",
  delivered: "Delivered",
  delayed: "Delayed",
  bounced: "Bounced",
  complained: "Complaint",
  failed: "Failed",
  skipped: "Skipped",
};

export const kindLabels: Record<EmailKind, string> = {
  transactional: "Transactional",
  campaign: "Campaign",
  sequence: "Sequence",
  test: "Test email",
};

export type LinkedText = {
  before: string;
  link: string;
  path: string;
  after: string;
};

export const copy = {
  title: "Transactional",
  description:
    "Emails your own app sends through the API, such as receipts, sign-in links and alerts.",
  apiDocs: "API docs",
  statusLabel: "Filter by status",
  statusPlaceholder: "All statuses",
  statusEmpty: "No status matches. Clear the box to see all.",
  sourceLabel: "Filter by source",
  sourcePlaceholder: "All sources",
  sourceEmpty: "No source matches. Clear the box to see all.",
  activeFilters: "Active filters",
  removeFilter: (label: string) => `Remove filter: ${label}`,
  clearAll: "Clear all",
  count: (shown: number, more: boolean) =>
    more
      ? `Latest ${shown} emails`
      : `${shown} ${shown === 1 ? "email" : "emails"}`,
  columns: {
    time: "Time",
    to: "To",
    subject: "Subject",
    source: "Source",
    status: "Status",
  },
  days: { today: "Today", yesterday: "Yesterday" },
  more: (count: number) => `+${count}`,
  moreRecipients: (count: number) =>
    `and ${count} more ${count === 1 ? "recipient" : "recipients"}`,
  noRecipient: "No recipient",
  noSubject: "(no subject)",
  removedSource: "Removed source",
  open: (to: string, subject: string) => `${to}, ${subject}. Open details`,
  noMatchTitle: "No emails match",
  noMatchBody: "Try a different status or source, or clear the filters.",
  loadMore: "Load more",
  loadMoreFailed: "Could not load more emails",
  loadFailed: {
    title: "Could not load your emails.",
    body: "The server did not answer. Check that the API is running, then try again.",
    retry: "Try again",
  },
  empty: {
    title: "No emails yet",
    body: "This page lists every email your app sends through the OpenCadence API, with its delivery status. Nothing is sent from this page.",
    steps: [
      {
        before: "Connect a sending source and make it the default in ",
        link: "Integrations",
        path: "integrations",
        after: ". Emails sent without a source go through the default.",
      },
      {
        before: "Create an API key in ",
        link: "Settings, API keys",
        path: "settings/api-keys",
        after: ".",
      },
    ] as LinkedText[],
    lastStep: "Send a request from your app:",
    exampleLabel: "Example request",
    after:
      "Replace YOUR_API_KEY with your key and use a from address your sending source is allowed to send from. The email shows up here as soon as the API accepts it.",
    copy: "Copy",
    copied: "Copied",
  },
  sheet: {
    to: (first: string, more: number) =>
      more > 0
        ? `To ${first} and ${more} more ${more === 1 ? "recipient" : "recipients"}`
        : `To ${first}`,
    status: "Status",
    when: "Created",
    sentAt: "Sent",
    lastEvent: "Last update",
    whenAt: (day: string, time: string) => `${day}, ${time}`,
    from: "From",
    toLabel: "To",
    cc: "Cc",
    bcc: "Bcc",
    source: "Source",
    kind: "Type",
    attempts: "Attempts",
    tags: "Tags",
    tag: (key: string, value: string) => (value ? `${key}: ${value}` : key),
    sender: (name: string, email: string) => `${name} <${email}>`,
    errorTitle: "Why it was not sent",
    suppressedTitle: (count: number) =>
      `${count} ${count === 1 ? "recipient" : "recipients"} skipped`,
    suppressedBody: {
      before: "These addresses were skipped because they are on the ",
      link: "suppression list",
      path: "suppressions",
      after: ".",
    } as LinkedText,
    idLabel: "Email ID",
    copyId: "Copy email ID",
    copiedId: "Email ID copied",
    contentTitle: "Content",
    contentTabs: { html: "HTML", text: "Text", headers: "Headers" },
    contentLabel: "Part of the email to show",
    htmlFrameTitle: "HTML version of the email",
    noHtml: "This email has no HTML version.",
    noText: "This email has no plain text version.",
    noHeaders: "No headers were stored for this email.",
    header: (name: string, value: string) => `${name}: ${value}`,
    contentGone:
      "The content of this email is no longer stored. The details above are kept.",
    contentFailed: {
      title: "Could not load the content.",
      retry: "Try again",
    },
  },
  clipboard: {
    failed: "Could not copy",
    failedBody:
      "Your browser blocked access to the clipboard. Select the text and copy it by hand.",
  },
  errors: {
    network:
      "The server did not answer. Check your connection and that the API is running.",
    signedOut:
      "You are signed out or have no active workspace. Reload the page and sign in again.",
    notFound: "This email no longer exists.",
    fallback: "Try again in a moment.",
  },
  sendErrors: {
    suppressed:
      "Every recipient is on the suppression list, so nothing was sent.",
    daily_limit_reached:
      "The sending source had reached its daily limit when this email came up.",
    rate_limited:
      "The provider was receiving too many requests and did not accept this email.",
    quota_reached: "The provider's sending quota was used up.",
    domain_not_verified:
      "The from address is on a domain that is not verified with the provider.",
    invalid_credentials:
      "The provider rejected the saved credentials for this source. Check the source in Integrations.",
    auth_revoked:
      "The mailbox no longer accepts the saved access. Reconnect the source in Integrations.",
    validation: "The provider rejected this email as invalid.",
    temporary: "A temporary problem at the provider stopped this email.",
  } as Record<string, string>,
  sendErrorFallback: "The provider did not give a reason.",
};

type Failure = { status: number; code: string; message: string | null };

export function describeError(error: Failure) {
  if (error.status === 0) {
    return copy.errors.network;
  }
  if (error.status === 401) {
    return copy.errors.signedOut;
  }
  if (error.status === 404) {
    return copy.errors.notFound;
  }
  return error.message ?? copy.errors.fallback;
}

export type SendErrorView = {
  code: string | null;
  summary: string;
  detail: string | null;
};

export function sendErrorView(error: EmailError): SendErrorView {
  const known = copy.sendErrors[error.code];
  const message = error.message.trim();
  if (known) {
    return {
      code: error.code,
      summary: known,
      detail: message !== "" && message !== known ? message : null,
    };
  }
  return {
    code: error.code || null,
    summary: message || copy.sendErrorFallback,
    detail: null,
  };
}

export function curlExample(origin: string) {
  return `curl -X POST "${origin}/api/v1/emails" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "from": "you@yourdomain.com",
    "to": "customer@example.com",
    "subject": "Your receipt",
    "text": "Thanks for your order."
  }'`;
}
