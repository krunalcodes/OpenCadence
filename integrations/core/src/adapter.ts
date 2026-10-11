import type { Capability } from "./capabilities";

export type FetchLike = typeof fetch;

export type OAuthCredentials = {
  kind: "oauth2";
  refreshToken: string;
  accessToken?: string;
  accessTokenExpiresAt?: Date;
  scopes: string[];
};

export type ApiKeyCredentials = {
  kind: "api_key";
  apiKey: string;
};

export type Credentials = OAuthCredentials | ApiKeyCredentials;

export type AuthKind = Credentials["kind"];

export type ExternalAccount = {
  externalId?: string;
  email?: string;
  displayName?: string;
};

export type SourceSettings = Record<string, unknown>;

export type VerifyResult = {
  account: ExternalAccount;
  settings: SourceSettings;
};

export type MessageAddress = {
  email: string;
  name?: string;
};

export type OutboundMessage = {
  from: MessageAddress;
  to: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  subject: string;
  html?: string;
  text?: string;
  headers?: Record<string, string>;
  messageId?: string;
  thread?: {
    providerThreadId?: string;
    inReplyTo?: string;
    references?: string[];
  };
  idempotencyKey?: string;
  tags?: Record<string, string>;
};

export type SendResult = {
  providerMessageId: string;
  providerThreadId?: string;
  messageId?: string;
};

export type OAuthAuthorizationRequest = {
  state: string;
  redirectUri: string;
  codeChallenge?: string;
  loginHint?: string;
};

export type OAuthExchangeRequest = {
  code: string;
  redirectUri: string;
  codeVerifier?: string;
};

export type OAuthConnection = {
  credentials: OAuthCredentials;
  account: ExternalAccount;
  settings: SourceSettings;
};

export type OAuthSupport = {
  scopes: string[];
  authorizationUrl(request: OAuthAuthorizationRequest): string;
  exchangeCode(request: OAuthExchangeRequest): Promise<OAuthConnection>;
  refresh(credentials: OAuthCredentials): Promise<OAuthCredentials>;
  revoke(credentials: OAuthCredentials): Promise<void>;
};

export const providerEventTypes = [
  "sent",
  "delivered",
  "delayed",
  "bounced",
  "complained",
  "failed",
  "suppressed",
  "opened",
  "clicked",
  "other",
] as const;

export type ProviderEventType = (typeof providerEventTypes)[number];

export type ProviderEvent = {
  id: string;
  type: ProviderEventType;
  rawType: string;
  occurredAt: Date;
  providerMessageId?: string;
  recipients: string[];
  bounce?: {
    permanent: boolean;
    type?: string;
    subType?: string;
    message?: string;
  };
  reason?: string;
};

export type WebhookRegistration = {
  externalId: string;
  signingSecret: string;
};

export type WebhookRequest = {
  rawBody: string;
  headers: Record<string, string | undefined>;
  signingSecret: string;
};

export type WebhookSupport = {
  register(credentials: Credentials, url: string): Promise<WebhookRegistration>;
  unregister(credentials: Credentials, externalId: string): Promise<void>;
  parse(request: WebhookRequest): ProviderEvent;
};

export type IntegrationAdapter = {
  type: string;
  name: string;
  auth: AuthKind;
  capabilities: Capability[];
  verify(credentials: Credentials): Promise<VerifyResult>;
  send(credentials: Credentials, message: OutboundMessage): Promise<SendResult>;
  oauth?: OAuthSupport;
  webhooks?: WebhookSupport;
};
