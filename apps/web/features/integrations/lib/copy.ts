import type { BadgeTone } from "@/components/status-badge";
import { integrationName } from "@/features/integrations/lib/catalog";
import {
  isNearLimit,
  type SendingSource,
} from "@/features/integrations/lib/sources";

export const copy = {
  title: "Sources",
  description: (count: number) =>
    count === 0
      ? "Connect a mailbox or an email provider to start sending."
      : `${count} ${count === 1 ? "source" : "sources"} connected. Test a source or send a test email from its row.`,
  descriptionFailed:
    "The mailboxes and email providers this workspace sends through.",
  connect: "Connect source",
  connected: {
    title: "Connected sources",
    description: "The mailboxes and providers this workspace can send through",
    defaultHint: "Emails sent by API without a source use the default source",
    noDefaultHint:
      "No default source yet. Emails sent by API without a source need one",
    defaultBadge: "Default",
    makeDefault: "Make default",
    removeDefault: "Remove as default",
    searchLabel: "Search connected sources",
    searchPlaceholder: "Search sources",
    columns: {
      source: "Source",
      today: "Sent today",
      health: "Last 14 days",
      status: "Status",
      actions: "Actions",
    },
    noLimit: "No daily limit",
    keyTypes: {
      full: "full access key",
      sending: "sending access key",
    },
    secondLine: (provider: string, extra: string | null) =>
      extra ? `${provider} · ${extra}` : provider,
    test: "Test",
    testLong: "Test connection",
    testEmail: "Send test email",
    rename: "Rename",
    setLimit: "Set daily limit",
    pause: "Pause sending",
    resume: "Resume sending",
    disconnect: "Disconnect",
    reconnect: "Reconnect",
    actionsFor: (name: string) => `Actions for ${name}`,
    healthFor: (name: string) => `${name}: health over the last 14 days`,
    progressFor: (name: string, sent: string, limit: string) =>
      `${name}: ${sent} of ${limit} sent today`,
    noMatchTitle: "No sources match",
    noMatchBody: "Try a different name or clear the search.",
    clear: "Clear search",
    emptyTitle: "No sending sources yet",
    emptyBody:
      "Connect a Gmail mailbox or a Resend account. More source types are on the way.",
  },
  status: {
    healthy: "Healthy",
    nearLimit: "Near limit",
    paused: "Paused",
    needsAttention: "Needs attention",
    byCode: {
      auth_revoked: "Reconnect needed",
      invalid_credentials: "Key rejected",
    } as Record<string, string>,
    noDetail: "The provider did not give a reason. Run a connection test.",
    detailFor: (label: string, detail: string) => `${label}: ${detail}`,
  },
  loadFailed: {
    title: "Could not load your sending sources.",
    body: "The server did not answer. Check that the API is running, then try again.",
    retry: "Try again",
  },
  catalog: {
    title: "Add a sending source",
    description: "Connect as many as you need",
    features: "What it adds",
    connect: "Connect",
    comingSoon: "Coming soon",
    connectName: (name: string) => `Connect ${name}`,
  },
  sheet: {
    chooseTitle: "Connect a sending source",
    chooseDescription: "Pick what you want to send through.",
    back: "All sources",
    title: (name: string) => `Connect ${name}`,
    cancel: "Cancel",
    regionPlaceholder: "Search regions",
    regionEmpty: "No region matches. Clear the box to see all.",
    invalidEmail: "Enter a full email address, such as you@yourdomain.com.",
    gmailSetupTitle: "Gmail is not set up on this server.",
    gmailSetupBody:
      "The server operator needs to set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET (or the Google sign-in client) and register this redirect URL with Google:",
    gmailCallbackPath: "/api/v1/sending-sources/gmail/callback",
    connectFailed: (name: string) => `Could not connect ${name}`,
  },
  toasts: {
    connected: (name: string) => `${name} is connected`,
    connectedBody: "Send a test email from its row to check it end to end.",
    gmailConnected: "Gmail mailbox connected",
    testOk: (name: string) => `${name} is working`,
    testOkBody: "The connection test passed.",
    testFailed: (name: string) => `${name} needs attention`,
    testFailedBody: "The connection test did not pass.",
    testError: (name: string) => `Could not test ${name}`,
    paused: (name: string) => `Sending through ${name} is paused`,
    resumed: (name: string) => `Sending through ${name} resumed`,
    pauseFailed: (name: string) => `Could not pause ${name}`,
    resumeFailed: (name: string) => `Could not resume ${name}`,
    undo: "Undo",
    madeDefault: (name: string) => `${name} is now the default source`,
    madeDefaultBody: "Emails sent by API without a source go through it.",
    removedDefault: (name: string) => `${name} is no longer the default`,
    removedDefaultBody:
      "This workspace has no default source until you choose another one.",
    makeDefaultFailed: (name: string) => `Could not make ${name} the default`,
    removeDefaultFailed: (name: string) =>
      `Could not remove ${name} as the default`,
    renamed: (name: string) => `Source renamed to ${name}`,
    renameFailed: "Could not rename the source",
    limitSet: (name: string, limit: string) =>
      `${name} now stops at ${limit} emails a day`,
    limitRemoved: (name: string) => `${name} has no daily limit now`,
    limitFailed: "Could not change the daily limit",
    testEmailSent: (to: string) => `Test email sent to ${to}`,
    testEmailSentBody: "Check that inbox, including the spam folder.",
    testEmailFailed: "Could not send the test email",
    disconnected: (name: string) => `${name} was disconnected`,
    disconnectFailed: (name: string) => `Could not disconnect ${name}`,
    reconnectFailed: (name: string) => `Could not reconnect ${name}`,
  },
  connectErrors: {
    title: "Gmail was not connected",
    byCode: {
      access_denied:
        "Access was not approved on Google's page. Start again and choose Allow.",
      missing_scope:
        "Google did not grant permission to send email. Start again and keep every permission ticked.",
      state_expired:
        "The request took too long and expired. Start again from Connect source.",
      not_configured:
        "Gmail is not set up on this server. Ask the server operator to add the Google client ID and secret.",
      failed: "Google did not complete the connection. Try again in a moment.",
    } as Record<string, string>,
    fallback: "Something went wrong on the way back from Google. Try again.",
  },
  errors: {
    network:
      "The server did not answer. Check your connection and that the API is running.",
    signedOut:
      "You are signed out or have no active workspace. Reload the page and sign in again.",
    fallback: "Nothing was changed. Try again in a moment.",
    byCode: {
      name_taken:
        "Another source already has this name. Choose a different one.",
      invalid_credentials:
        "Resend rejected this API key. Check that you copied all of it and that it has not been deleted.",
      not_found:
        "This source no longer exists. It may have been disconnected by someone else.",
      gmail_not_configured:
        "Gmail is not set up on this server. Ask the server operator to add the Google client ID and secret.",
      domain_not_verified:
        "This address is on a domain that is not verified in the Resend account. Use an address on a verified domain.",
      daily_limit_reached:
        "This source has reached its daily limit. Raise the limit or try again tomorrow.",
      rate_limited:
        "Too many requests in a short time. Wait a minute, then try again.",
      quota_reached:
        "The provider's sending quota is used up for now. Try again later or check the plan on the provider's side.",
      not_sendable:
        "This source cannot be the default right now because it is not able to send. Resume it or fix its connection, then try again.",
      auth_revoked:
        "Google no longer accepts the saved access for this mailbox. Reconnect it to continue.",
    } as Record<string, string>,
  },
  renameDialog: {
    title: "Rename source",
    body: "The name is only used inside OpenCadence. Recipients never see it.",
    label: "Name",
    missing: "Enter a name for this source.",
    tooLong: "Use 80 characters or fewer.",
    save: "Save name",
    cancel: "Cancel",
  },
  limitDialog: {
    title: (name: string) => `Daily limit for ${name}`,
    body: "Sending through this source stops for the day once it reaches the limit.",
    label: "Emails per day",
    noLimit: "No limit",
    noLimitHint: "Send as many as the provider allows.",
    invalid: "Enter a whole number of 1 or more.",
    save: "Save limit",
    cancel: "Cancel",
  },
  testEmailDialog: {
    title: "Send a test email",
    body: (name: string) =>
      `Sends one short email through ${name} so you can check that it arrives.`,
    to: "Send to",
    toPlaceholder: "you@yourdomain.com",
    toMissing: "Enter the address that should receive the test.",
    from: "From address",
    fromPlaceholder: "hello@yourdomain.com",
    fromHint: "The domain must be verified in this Resend account.",
    fromMissing: "Enter the address to send from.",
    invalidEmail: "Enter a full email address, such as you@yourdomain.com.",
    send: "Send test email",
    cancel: "Cancel",
  },
  disconnectDialog: {
    title: (name: string) => `Disconnect ${name}?`,
    body: "OpenCadence stops sending through this source and removes its saved credentials. You can connect it again later.",
    confirm: "Disconnect",
    cancel: "Cancel",
  },
};

export const maxSourceNameLength = 80;

type Failure = { status: number; code: string; message: string | null };

export function describeError(error: Failure, fallback = copy.errors.fallback) {
  if (error.status === 0) {
    return copy.errors.network;
  }
  if (error.status === 401) {
    return copy.errors.signedOut;
  }
  return copy.errors.byCode[error.code] ?? error.message ?? fallback;
}

export function describeConnectError(code: string) {
  return copy.connectErrors.byCode[code] ?? copy.connectErrors.fallback;
}

export function sourceSecondLine(source: SendingSource) {
  const provider = integrationName(source.integrationType);
  if (source.integrationType === "resend") {
    const permission = source.details.permission;
    return copy.connected.secondLine(
      provider,
      permission ? copy.connected.keyTypes[permission] : null,
    );
  }
  return copy.connected.secondLine(
    provider,
    source.email && source.email !== source.name ? source.email : null,
  );
}

export type SourceStatusView = {
  tone: BadgeTone;
  label: string;
  detail: string | null;
};

export function sourceStatusView(source: SendingSource): SourceStatusView {
  if (source.status === "paused") {
    return { tone: "neutral", label: copy.status.paused, detail: null };
  }
  if (source.status === "needs_attention") {
    const code = source.lastError?.code ?? "";
    return {
      tone: "danger",
      label: copy.status.byCode[code] ?? copy.status.needsAttention,
      detail: source.lastError?.message || copy.status.noDetail,
    };
  }
  return isNearLimit(source)
    ? { tone: "warning", label: copy.status.nearLimit, detail: null }
    : { tone: "success", label: copy.status.healthy, detail: null };
}
