import type {
  NumberSetting,
  PausedReason,
  WarmupMailbox,
} from "@/features/warmup/lib/warmup";

const countFormat = new Intl.NumberFormat("en-US");
const percentFormat = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 0,
});

const providerNames: Record<string, string> = {
  gmail: "Gmail",
  outlook: "Outlook",
  "imap-smtp": "IMAP/SMTP",
  resend: "Resend",
  "amazon-ses": "Amazon SES",
  sendgrid: "SendGrid",
  smtp: "SMTP relay",
};

function plural(count: number, one: string, many: string) {
  return `${countFormat.format(count)} ${count === 1 ? one : many}`;
}

export const copy = {
  title: "Warm-up",
  description:
    "Mailboxes with warm-up on exchange a small, growing number of ordinary emails with other mailboxes on this server, and open, reply to, and rescue them from spam, to build sending reputation gradually.",
  sectionLabel: "Mailboxes",
  pool: {
    summary: (mailboxes: number, domains: number) =>
      `${plural(mailboxes, "mailbox", "mailboxes")} on ${plural(domains, "domain", "domains")} in this server's pool`,
    tooSmallTitle: "Nothing is being sent yet.",
    tooSmallBody:
      "Warm-up needs at least two mailboxes on different domains with warm-up on before any email is exchanged.",
    small: "A small pool gives weaker results than a large one.",
  },
  columns: {
    mailbox: "Mailbox",
    warmup: "Warm-up",
    status: "Status",
    today: "Today",
    placement: "Inbox placement",
    days: "Last 14 days",
    actions: "Actions",
  },
  secondLine: (provider: string, email: string | null) =>
    email ? `${provider} · ${email}` : provider,
  notCapable: "This kind of source cannot read its inbox.",
  notCapableLink: "Connect the mailbox with IMAP/SMTP",
  notCapableEnd: "to warm it up.",
  notCapableTooltip:
    "Warm-up is not available for this kind of source because it cannot read its inbox.",
  switchLabel: (name: string) => `Warm-up for ${name}`,
  status: {
    off: "Off",
    warming: "Warming up",
    warmingDay: (day: number, total: number) =>
      `Warming up, day ${countFormat.format(day)} of ${countFormat.format(total)}`,
    ready: "Ready",
    paused: "Paused",
    unavailable: "Not available",
    detailFor: (label: string, detail: string) => `${label}: ${detail}`,
  },
  pausedReasons: {
    manual: "Paused by you",
    source_unavailable: "The mailbox is paused or disconnected",
    sign_in_failed: "Sign-in to the mailbox failed. Reconnect it.",
    bounces: "Paused after repeated failed sends",
  } as Record<PausedReason, string>,
  none: "No value",
  todayNumbers: (sent: number, target: number) =>
    `${countFormat.format(sent)} / ${countFormat.format(target)}`,
  todayFor: (name: string, sent: number, target: number) =>
    `${name}: ${countFormat.format(sent)} of ${countFormat.format(target)} warm-up emails sent today`,
  placementRate: (rate: number) => percentFormat.format(rate),
  placementCounts: (inbox: number, total: number) =>
    `${countFormat.format(inbox)} of ${countFormat.format(total)}`,
  placementLow: "Low",
  placementVeryLow: "Very low",
  noData: "No data yet",
  daysFor: (name: string, spam: number, clean: number, empty: number) =>
    `${name}, last 14 days: ${plural(spam, "day", "days")} with emails landing in spam, ${plural(clean, "day", "days")} with none in spam, ${plural(empty, "day", "days")} with no warm-up emails`,
  actionsFor: (name: string) => `Actions for ${name}`,
  settings: "Settings",
  pause: "Pause warm-up",
  resume: "Resume warm-up",
  emptyTitle: "No sending sources yet",
  emptyBody:
    "Warm-up runs on mailboxes you have connected. Connect a mailbox with IMAP/SMTP, then turn warm-up on for it here.",
  emptyAction: "Go to Sources",
  loadFailed: {
    title: "Could not load warm-up.",
    body: "The server did not answer. Check that the API is running, then try again.",
    retry: "Try again",
  },
  turnOn: {
    title: (name: string) => `Turn on warm-up for ${name}?`,
    what: "This mailbox will send and receive automated emails with other mailboxes on this server. They count toward its daily sending limit.",
    caution:
      "Mailbox providers may restrict accounts that use automated warm-up. You are responsible for following your provider's rules.",
    confirm: "Turn on warm-up",
    cancel: "Cancel",
  },
  sheet: {
    title: "Warm-up settings",
    fields: {
      startPerDay: "Start per day",
      incrementPerDay: "Increase per day",
      maxPerDay: "Maximum per day",
      replyRate: "Reply rate (percent)",
    } as Record<NumberSetting, string>,
    hints: {
      startPerDay: "Emails on the first day. 1 to 50.",
      incrementPerDay: "Added each day. 1 to 5.",
      maxPerDay: "Where the ramp stops. 1 to 50, not below the start.",
      replyRate: "Share of received warm-up emails that get a reply. 0 to 60.",
    } as Record<NumberSetting, string>,
    invalid: {
      startPerDay: "Enter a whole number from 1 to 50.",
      incrementPerDay: "Enter a whole number from 1 to 5.",
      maxPerDay: "Enter a whole number from 1 to 50.",
      replyRate: "Enter a whole number from 0 to 60.",
    } as Record<NumberSetting, string>,
    maxBelowStart: "The maximum cannot be lower than the start per day.",
    randomize: "Vary the daily number",
    randomizeHint:
      "Sends a slightly different number each day instead of the exact target.",
    weekdaysOnly: "Weekdays only",
    weekdaysOnlyHint: "Sends nothing on Saturday and Sunday.",
    preview: "Ramp",
    previewReaches: (max: number, day: number) =>
      `Reaches ${countFormat.format(max)} a day on day ${countFormat.format(day)}`,
    previewFlat: (max: number) =>
      `Starts at ${countFormat.format(max)} a day and stays there`,
    previewInvalid: "Enter valid numbers to see the ramp.",
    identifier: "Identifier",
    identifierHint:
      "Every warm-up email this mailbox sends ends with this phrase on its last line. Use it to create a filter in your mail client.",
    identifierMissing:
      "The identifier is created the first time warm-up is turned on for this mailbox.",
    copyIdentifier: "Copy identifier",
    copiedIdentifier: "Identifier copied",
    save: "Save settings",
    cancel: "Cancel",
  },
  clipboard: {
    failed: "Could not copy",
    failedBody:
      "Your browser blocked access to the clipboard. Select the text and copy it by hand.",
  },
  toasts: {
    turnedOn: (name: string) => `Warm-up is on for ${name}`,
    turnOnFailed: (name: string) => `Could not turn on warm-up for ${name}`,
    turnOffFailed: (name: string) => `Could not turn off warm-up for ${name}`,
    paused: (name: string) => `Warm-up for ${name} is paused`,
    resumed: (name: string) => `Warm-up for ${name} resumed`,
    pauseFailed: (name: string) => `Could not pause warm-up for ${name}`,
    resumeFailed: (name: string) => `Could not resume warm-up for ${name}`,
    undo: "Undo",
    saved: (name: string) => `Warm-up settings saved for ${name}`,
    saveFailed: "Could not save the warm-up settings",
  },
  errors: {
    network:
      "The server did not answer. Check your connection and that the API is running.",
    signedOut:
      "You are signed out or have no active workspace. Reload the page and sign in again.",
    fallback: "Nothing was changed. Try again in a moment.",
    byCode: {
      not_found:
        "This mailbox no longer exists. It may have been disconnected by someone else.",
      not_capable:
        "Warm-up is not available for this kind of source because it cannot read its inbox.",
    } as Record<string, string>,
  },
};

type Failure = { status: number; code: string; message: string | null };

export function describeError(error: Failure) {
  if (error.status === 0) {
    return copy.errors.network;
  }
  if (error.status === 401) {
    return copy.errors.signedOut;
  }
  return (
    copy.errors.byCode[error.code] ?? error.message ?? copy.errors.fallback
  );
}

export function mailboxSecondLine(mailbox: WarmupMailbox) {
  return copy.secondLine(
    providerNames[mailbox.integrationType] ?? mailbox.integrationType,
    mailbox.email && mailbox.email !== mailbox.name ? mailbox.email : null,
  );
}

export type StatusView = {
  tone: "neutral" | "success" | null;
  label: string;
  detail: string | null;
};

export function statusView(mailbox: WarmupMailbox): StatusView {
  if (mailbox.status === "unavailable") {
    return { tone: null, label: copy.status.unavailable, detail: null };
  }
  if (mailbox.status === "off") {
    return { tone: "neutral", label: copy.status.off, detail: null };
  }
  const problem = mailbox.lastError?.message || null;
  if (mailbox.status === "paused") {
    const reason = mailbox.pausedReason
      ? copy.pausedReasons[mailbox.pausedReason]
      : null;
    return {
      tone: "neutral",
      label: copy.status.paused,
      detail: mailbox.pausedReason === "manual" ? reason : (reason ?? problem),
    };
  }
  if (mailbox.status === "ready") {
    return { tone: "success", label: copy.status.ready, detail: problem };
  }
  return {
    tone: "neutral",
    label:
      mailbox.day === null
        ? copy.status.warming
        : copy.status.warmingDay(mailbox.day, mailbox.readyAfterDays),
    detail: problem,
  };
}
