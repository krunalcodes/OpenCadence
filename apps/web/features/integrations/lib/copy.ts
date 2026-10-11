import type { BadgeTone } from "@/components/status-badge";
import {
  integrationName,
  type MailboxProvider,
  mailboxProviderOf,
} from "@/features/integrations/lib/catalog";
import {
  isNearLimit,
  type SendingSource,
} from "@/features/integrations/lib/sources";

const countFormat = new Intl.NumberFormat("en-US");

const companies: Record<MailboxProvider, string> = {
  gmail: "Google",
  outlook: "Microsoft",
};

const providerNames: Record<MailboxProvider, string> = {
  gmail: "Gmail",
  outlook: "Outlook",
};

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
    secondLine: (provider: string, extras: (string | null)[]) =>
      [provider, ...extras].filter(Boolean).join(" · "),
    sendOnly: "Send only",
    replyDetectionOn: "Reply detection on",
    sandbox: "Sandbox",
    production: "Production",
    detectReplies: "Detect replies",
    stopDetectingReplies: "Turn off reply detection",
    setup: "Setup and events",
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
      "Connect a Gmail or Outlook mailbox, any mailbox over IMAP/SMTP, or a Resend or Amazon SES account. More source types are on the way.",
  },
  status: {
    healthy: "Healthy",
    nearLimit: "Near limit",
    paused: "Paused",
    needsAttention: "Needs attention",
    byCode: {
      auth_revoked: "Reconnect needed",
      invalid_credentials: "Key rejected",
      insufficient_permission: "Permission missing",
    } as Record<string, string>,
    mailboxByCode: {
      invalid_credentials: "Sign-in failed",
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
    setup: {
      gmail: {
        title: "Gmail is not set up on this server.",
        body: "The server operator needs to set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET (or the Google sign-in client) and register this redirect URL with Google:",
        callbackPath: "/api/v1/sending-sources/gmail/callback",
      },
      outlook: {
        title: "Outlook is not set up on this server.",
        body: "The server operator needs to register an app in Microsoft Entra with the delegated permissions User.Read and Mail.Send (and Mail.Read for reply detection), set OUTLOOK_CLIENT_ID and OUTLOOK_CLIENT_SECRET, and register this redirect URL on it as a Web platform:",
        callbackPath: "/api/v1/sending-sources/outlook/callback",
      },
    },
    connectFailed: (name: string) => `Could not connect ${name}`,
  },
  toasts: {
    connected: (name: string) => `${name} is connected`,
    connectedBody: "Send a test email from its row to check it end to end.",
    mailboxConnected: (provider: string) => `${provider} mailbox connected`,
    replyDetectionOn: (provider: string) =>
      `Reply detection is on for the ${provider} mailbox`,
    replyDetectionOnBody:
      "Sequences stop for contacts who reply, and their replies show in the inbox.",
    replyDetectionOff: (name: string) => `Reply detection is off for ${name}`,
    replyDetectionOffBody: (company: string) =>
      `OpenCadence no longer reads this mailbox. To remove the permission itself, open the connected apps in your ${company} account.`,
    replyDetectionStartFailed: (name: string) =>
      `Could not start reply detection for ${name}`,
    replyDetectionStopFailed: (name: string) =>
      `Could not turn off reply detection for ${name}`,
    topicSaved: "SNS topic saved",
    topicSavedConfigured:
      "The event destination is set in Amazon SES. Subscribe the webhook URL in SNS to finish.",
    topicSavedManual:
      "Add the event destination in Amazon SES yourself, then subscribe the webhook URL in SNS.",
    topicFailed: "Could not save the SNS topic",
    copyFailed: "Could not copy",
    copyFailedBody: "Select the text and copy it by hand.",
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
    title: (provider: string) => `${provider} was not connected`,
    replyDetectionTitle: (provider: string) =>
      `Reply detection was not turned on for ${provider}`,
    byCode: {
      access_denied: (company: string) =>
        `Access was not approved on ${company}'s page. Start again and approve it.`,
      missing_scope: (company: string) =>
        `${company} did not grant permission to send email. Start again and keep every permission ticked.`,
      state_expired: () =>
        "The request took too long and expired. Start it again from this page.",
      not_configured: (_company: string, provider: string) =>
        `${provider} is not set up on this server. Ask the server operator to add the ${provider} client ID and secret.`,
      read_scope_not_granted: (company: string) =>
        `${company} did not grant permission to read the mailbox, so reply detection stays off. Start again and keep the read permission ticked.`,
      reply_detection_disabled: (_company: string, provider: string) =>
        `Reply detection for ${provider} is not enabled on this server. Connect the mailbox with IMAP/SMTP and an app password to detect replies.`,
      account_mismatch: (company: string) =>
        `You approved access with a different ${company} account. Start again and choose the account of this mailbox.`,
      source_missing: () =>
        "This mailbox was disconnected before the request finished. Connect it again first.",
      failed: (company: string) =>
        `${company} did not complete the request. Try again in a moment.`,
    } as Record<string, (company: string, provider: string) => string>,
    fallback: (company: string) =>
      `Something went wrong on the way back from ${company}. Try again.`,
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
      outlook_not_configured:
        "Outlook is not set up on this server. Ask the server operator to add the Microsoft client ID and secret.",
      reply_detection_disabled:
        "Reply detection for this provider is not enabled on this server. Connect the mailbox with IMAP/SMTP and an app password to detect replies.",
      session_required:
        "Sign in to approve access to a mailbox. An API key cannot do it.",
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
  mailboxErrors: {
    name_taken:
      "A source with this name already exists. This mailbox may already be connected.",
    invalid_credentials:
      "The mail server refused this password. If your email host offers app passwords, create one and use it here.",
    blocked_by_policy:
      "The email provider has IMAP or SMTP turned off for this account. Turn it on in the provider's settings, or ask the account administrator.",
    temporary:
      "The mail server could not be reached. Check the host and port, then try again.",
  } as Record<string, string>,
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
    fromHint: "The domain must be verified in this account.",
    fromHintIdentities: (identities: string) =>
      `Use an address on a verified identity: ${identities}.`,
    fromMissing: "Enter the address to send from.",
    invalidEmail: "Enter a full email address, such as you@yourdomain.com.",
    send: "Send test email",
    cancel: "Cancel",
  },
  replyDialog: {
    title: (name: string) => `Detect replies for ${name}`,
    why: (company: string) =>
      `OpenCadence asks ${company} for permission to read this mailbox. It uses that for two things: to stop a sequence when someone replies, and to show those replies in the inbox.`,
    what: "It checks the headers of new mail in the inbox to find answers to email it sent, and reads the content of those answers only. It never changes, moves, deletes, or marks anything as read.",
    how: (company: string) =>
      `You approve this on ${company}'s own page and come back here. You can turn it off on this page at any time.`,
    confirm: (company: string) => `Continue to ${company}`,
    cancel: "Cancel",
    close: "Close",
    disabledTitle: (provider: string) =>
      `Reply detection for ${provider} is not enabled on this server`,
    disabledBody:
      "This server does not ask for read access to mailboxes of this provider. To detect replies for this mailbox, connect it with IMAP/SMTP and an app password instead: that connection reads the inbox directly.",
    disabledOperator: {
      gmail:
        "For the server operator: set GMAIL_READ_SCOPE_ENABLED=true once your Google OAuth client is allowed to request the gmail.readonly scope.",
      outlook:
        "For the server operator: set OUTLOOK_READ_SCOPE_ENABLED=true and add the Mail.Read permission to the app registration.",
    },
  },
  sesSetup: {
    title: (name: string) => `Setup for ${name}`,
    description: (region: string) => `Amazon SES in ${region}`,
    close: "Close",
    account: "Account",
    sandbox: "Sandbox",
    sandboxBody:
      "This account is in the Amazon SES sandbox. It only delivers to verified addresses and has a low quota. Request production access in the AWS console before sending to contacts.",
    production: "Production access",
    sendingPaused: "Sending is paused for this account in Amazon SES.",
    quota: "Sending quota",
    quotaValue: (sent: number | null, max: number | null) =>
      max === null
        ? "Not reported"
        : max < 0
          ? "Unlimited"
          : `${countFormat.format(sent ?? 0)} of ${countFormat.format(max)} in the last 24 hours`,
    rate: "Maximum send rate",
    rateValue: (rate: number | null) =>
      rate === null ? "Not reported" : `${countFormat.format(rate)} per second`,
    configurationSet: "Configuration set",
    noConfigurationSet: "None",
    identities: "Verified identities",
    identitiesBody:
      "This source has no fixed address. Campaigns and sequences ask for a from address: use one of these addresses, or any address on one of these domains.",
    noIdentities:
      "No verified identity yet. Verify a domain or an address in Amazon SES in this region, then run a connection test to refresh this list.",
    identitiesTruncated: "The account has more identities than are shown here.",
    pendingIdentities: (count: number) =>
      `${count} more ${count === 1 ? "identity is" : "identities are"} waiting for verification.`,
    refresh: "Refresh from Amazon SES",
    events: "Bounce and complaint events",
    eventsBody:
      "Amazon SES reports bounces and complaints through an SNS topic. OpenCadence suppresses those addresses so they are never emailed again.",
    eventStates: {
      registered: "Receiving events",
      pending: "Waiting for the SNS subscription",
      not_registered: "Not set up",
    },
    noWebhookUrl:
      "This server has no public address for webhooks yet. The server operator needs to set WEBHOOK_BASE_URL before events can be received.",
    webhookUrl: "Webhook URL",
    topicArn: "SNS topic ARN",
    topicPlaceholder: "arn:aws:sns:us-east-1:123456789012:opencadence-events",
    topicHint:
      "Events are only accepted from this topic. Save it before you create the subscription.",
    topicMissing: "Paste the ARN of the SNS topic.",
    saveTopic: "Save topic",
    destinationConfigured:
      "The event destination is set on the configuration set in Amazon SES.",
    destinationManual:
      "The event destination is not set by OpenCadence. Add it yourself as described in step 4.",
    steps: "Steps",
    stepList: (configurationSet: string | null) => [
      "In Amazon SNS, create a Standard topic in the same region as this source.",
      "Add the statement below to the access policy of the topic so Amazon SES may publish to it.",
      "Paste the topic ARN above and save it.",
      configurationSet
        ? `In Amazon SES, open the configuration set ${configurationSet} and add an event destination of type Amazon SNS for bounces, complaints, deliveries, delivery delays, rejects, and rendering failures that points at the topic. OpenCadence does this for you when the access key has the event setup permissions below.`
        : "This source has no configuration set, so events cannot be published per send. Connect the account again with a configuration set, or turn on bounce and complaint notifications to the topic on each verified identity in Amazon SES.",
      "In the topic, create a subscription with the protocol HTTPS and the webhook URL as the endpoint. Leave raw message delivery off. OpenCadence confirms the subscription by itself.",
    ],
    topicPolicy: "SNS topic policy statement",
    iamPolicy: "Minimal IAM policy for sending",
    iamSetupPolicy: "Extra permissions for automatic event setup",
    copy: (label: string) => `Copy ${label}`,
    copied: (label: string) => `${label} copied`,
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

export function describeMailboxError(
  error: Failure,
  fallback = copy.errors.fallback,
) {
  if (error.status === 0) {
    return copy.errors.network;
  }
  if (error.status === 401) {
    return copy.errors.signedOut;
  }
  if (error.code === "name_taken") {
    return copy.mailboxErrors.name_taken;
  }
  return (
    error.message ??
    copy.mailboxErrors[error.code] ??
    copy.errors.byCode[error.code] ??
    fallback
  );
}

export function describeProviderError(
  error: Failure,
  fallback = copy.errors.fallback,
) {
  if (error.status === 0) {
    return copy.errors.network;
  }
  if (error.status === 401) {
    return copy.errors.signedOut;
  }
  if (error.code === "name_taken") {
    return copy.errors.byCode.name_taken ?? fallback;
  }
  return error.message ?? copy.errors.byCode[error.code] ?? fallback;
}

export function companyOf(provider: MailboxProvider) {
  return companies[provider];
}

export function providerNameOf(provider: MailboxProvider) {
  return providerNames[provider];
}

export function describeSourceError(
  source: SendingSource,
  error: Failure,
  fallback = copy.errors.fallback,
) {
  if (source.integrationType === "gmail") {
    return describeError(error, fallback);
  }
  return source.integrationType === "imap-smtp"
    ? describeMailboxError(error, fallback)
    : describeProviderError(error, fallback);
}

export function describeConnectError(code: string, provider: MailboxProvider) {
  const company = companies[provider];
  const describe = copy.connectErrors.byCode[code];
  return describe
    ? describe(company, providerNames[provider])
    : copy.connectErrors.fallback(company);
}

export function sourceSecondLine(source: SendingSource) {
  const provider = integrationName(source.integrationType);
  const email =
    source.email && source.email !== source.name ? source.email : null;
  if (source.integrationType === "resend") {
    const permission = source.details.permission;
    return copy.connected.secondLine(provider, [
      permission ? copy.connected.keyTypes[permission] : null,
    ]);
  }
  const account = source.details.account;
  if (account) {
    return copy.connected.secondLine(provider, [
      account.region,
      account.sandbox ? copy.connected.sandbox : copy.connected.production,
    ]);
  }
  if (mailboxProviderOf(source.integrationType)) {
    return copy.connected.secondLine(provider, [
      email,
      source.replyDetection === "on"
        ? copy.connected.replyDetectionOn
        : copy.connected.sendOnly,
    ]);
  }
  return copy.connected.secondLine(provider, [email]);
}

export const sesPolicies = {
  sending: JSON.stringify(
    {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: [
            "ses:SendEmail",
            "ses:SendRawEmail",
            "ses:GetAccount",
            "ses:ListEmailIdentities",
          ],
          Resource: "*",
        },
      ],
    },
    null,
    2,
  ),
  eventSetup: JSON.stringify(
    {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: [
            "ses:CreateConfigurationSet",
            "ses:GetConfigurationSetEventDestinations",
            "ses:CreateConfigurationSetEventDestination",
            "ses:UpdateConfigurationSetEventDestination",
          ],
          Resource: "*",
        },
      ],
    },
    null,
    2,
  ),
  topic: (topicArn: string | null) =>
    JSON.stringify(
      {
        Effect: "Allow",
        Principal: { Service: "ses.amazonaws.com" },
        Action: "SNS:Publish",
        Resource: topicArn ?? "arn:aws:sns:REGION:ACCOUNT_ID:TOPIC_NAME",
      },
      null,
      2,
    ),
};

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
      label:
        (source.integrationType === "imap-smtp"
          ? copy.status.mailboxByCode[code]
          : undefined) ??
        copy.status.byCode[code] ??
        copy.status.needsAttention,
      detail: source.lastError?.message || copy.status.noDetail,
    };
  }
  return isNearLimit(source)
    ? { tone: "warning", label: copy.status.nearLimit, detail: null }
    : { tone: "success", label: copy.status.healthy, detail: null };
}
