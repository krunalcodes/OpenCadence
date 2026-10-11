import type { FetchLike } from "@workspace/integration-core";

export type OutlookAdapterConfig = {
  clientId: string;
  clientSecret: string;
  tenant?: string;
  inboxAccess?: boolean;
  fetch?: FetchLike;
};

export type OutlookContext = {
  clientId: string;
  clientSecret: string;
  tenant: string;
  inboxAccess: boolean;
  fetch: FetchLike;
};

export const outlookMailSendScope = "Mail.Send";

export const outlookMailReadScope = "Mail.Read";

export const outlookSendScopes = [
  "offline_access",
  "openid",
  "email",
  "User.Read",
  outlookMailSendScope,
];

export const outlookInboxScopes = [...outlookSendScopes, outlookMailReadScope];

export const defaultTenant = "common";

export const graphOrigin = "https://graph.microsoft.com";

export const graphBase = `${graphOrigin}/v1.0`;

const loginBase = "https://login.microsoftonline.com";

const tenantPattern = /^[A-Za-z0-9][A-Za-z0-9.-]*$/;

export const endpoints = {
  authorization: (tenant: string) =>
    `${loginBase}/${tenant}/oauth2/v2.0/authorize`,
  token: (tenant: string) => `${loginBase}/${tenant}/oauth2/v2.0/token`,
  me: `${graphBase}/me?$select=id,mail,userPrincipalName,displayName`,
  sendMail: `${graphBase}/me/sendMail`,
  inboxDelta: `${graphBase}/me/mailFolders/inbox/messages/delta`,
  message: (id: string) => `${graphBase}/me/messages/${encodeURIComponent(id)}`,
} as const;

export function scopesFor(context: Pick<OutlookContext, "inboxAccess">) {
  return context.inboxAccess ? [...outlookInboxScopes] : [...outlookSendScopes];
}

export function createContext(config: OutlookAdapterConfig): OutlookContext {
  const tenant = config.tenant?.trim() || defaultTenant;
  if (!tenantPattern.test(tenant)) {
    throw new Error(
      "The Microsoft tenant must be common, organizations, consumers, a tenant ID, or a tenant domain.",
    );
  }
  return {
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    tenant,
    inboxAccess: config.inboxAccess === true,
    fetch: config.fetch ?? ((input, init) => fetch(input, init)),
  };
}
