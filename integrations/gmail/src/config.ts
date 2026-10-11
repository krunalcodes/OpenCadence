import type { FetchLike } from "@workspace/integration-core";

export type GmailAdapterConfig = {
  clientId: string;
  clientSecret: string;
  fetch?: FetchLike;
};

export type GmailContext = {
  clientId: string;
  clientSecret: string;
  fetch: FetchLike;
};

export const gmailSendScope = "https://www.googleapis.com/auth/gmail.send";

export const gmailScopes = ["openid", "email", gmailSendScope];

export const endpoints = {
  authorization: "https://accounts.google.com/o/oauth2/v2/auth",
  token: "https://oauth2.googleapis.com/token",
  revoke: "https://oauth2.googleapis.com/revoke",
  userinfo: "https://openidconnect.googleapis.com/v1/userinfo",
  send: "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
} as const;

export function createContext(config: GmailAdapterConfig): GmailContext {
  return {
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    fetch: config.fetch ?? ((input, init) => fetch(input, init)),
  };
}
