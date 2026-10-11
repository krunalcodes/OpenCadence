import type { FetchLike } from "@workspace/integration-core";

export type GmailAdapterConfig = {
  clientId: string;
  clientSecret: string;
  inboxAccess?: boolean;
  fetch?: FetchLike;
};

export type GmailContext = {
  clientId: string;
  clientSecret: string;
  inboxAccess: boolean;
  fetch: FetchLike;
};

export const gmailSendScope = "https://www.googleapis.com/auth/gmail.send";

export const gmailReadScope = "https://www.googleapis.com/auth/gmail.readonly";

export const gmailScopes = ["openid", "email", gmailSendScope];

export const gmailInboxScopes = [...gmailScopes, gmailReadScope];

const apiBase = "https://gmail.googleapis.com/gmail/v1/users/me";

export const endpoints = {
  authorization: "https://accounts.google.com/o/oauth2/v2/auth",
  token: "https://oauth2.googleapis.com/token",
  revoke: "https://oauth2.googleapis.com/revoke",
  userinfo: "https://openidconnect.googleapis.com/v1/userinfo",
  send: `${apiBase}/messages/send`,
  profile: `${apiBase}/profile`,
  history: `${apiBase}/history`,
  messages: `${apiBase}/messages`,
  message: (id: string) => `${apiBase}/messages/${encodeURIComponent(id)}`,
} as const;

export function scopesFor(context: Pick<GmailContext, "inboxAccess">) {
  return context.inboxAccess ? [...gmailInboxScopes] : [...gmailScopes];
}

export function createContext(config: GmailAdapterConfig): GmailContext {
  return {
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    inboxAccess: config.inboxAccess === true,
    fetch: config.fetch ?? ((input, init) => fetch(input, init)),
  };
}
