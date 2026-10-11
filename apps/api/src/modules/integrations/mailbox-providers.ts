import { gmailReadScope } from "@workspace/integration-gmail";
import { outlookMailReadScope } from "@workspace/integration-outlook";

export const mailboxProviders = {
  gmail: {
    label: "Gmail",
    company: "Google",
    readScope: gmailReadScope,
    setup: "Add a Google OAuth client to the server configuration first.",
  },
  outlook: {
    label: "Outlook",
    company: "Microsoft",
    readScope: outlookMailReadScope,
    setup:
      "Add a Microsoft Entra app registration (OUTLOOK_CLIENT_ID and OUTLOOK_CLIENT_SECRET) to the server configuration first.",
  },
} as const;

export type MailboxProvider = keyof typeof mailboxProviders;

export const mailboxProviderNames = Object.keys(
  mailboxProviders,
) as MailboxProvider[];

export function isMailboxProvider(value: string): value is MailboxProvider {
  return Object.hasOwn(mailboxProviders, value);
}

function normalizeScope(scope: string) {
  return scope
    .trim()
    .replace(/^https:\/\/graph\.microsoft\.com\//i, "")
    .toLowerCase();
}

export function hasReadScope(provider: MailboxProvider, scopes: string[]) {
  const wanted = normalizeScope(mailboxProviders[provider].readScope);
  return scopes.some((scope) => normalizeScope(scope) === wanted);
}

export const configurationSetHeader = "x-ses-configuration-set";

export const configurationSetPattern = /^[A-Za-z0-9_-]{1,64}$/;

export const awsRegionPattern = /^[a-z]{2}(-[a-z]+)+-\d+$/;
