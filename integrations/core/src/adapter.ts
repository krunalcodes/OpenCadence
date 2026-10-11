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

export type MailServer = {
  host: string;
  port: number;
  security: "tls" | "starttls";
};

export type PasswordCredentials = {
  kind: "password";
  username: string;
  password: string;
  smtp: MailServer;
  imap: MailServer;
};

export type AccessKeyCredentials = {
  kind: "access_key";
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
};

export type Credentials =
  | OAuthCredentials
  | ApiKeyCredentials
  | PasswordCredentials
  | AccessKeyCredentials;

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

export type InboxMessageRef = {
  providerMessageId: string;
  providerThreadId?: string;
  folder?: string;
};

export type InboxMessage = InboxMessageRef & {
  messageId?: string;
  inReplyTo?: string;
  references: string[];
  from?: MessageAddress;
  to: MessageAddress[];
  subject?: string;
  receivedAt: Date;
  flags: {
    isSpam: boolean;
    isUnread: boolean;
    isInInbox: boolean;
    isStarred: boolean;
    isImportant?: boolean;
  };
};

export type InboxSearch = {
  messageId: string;
  since: Date;
  includeSpam: boolean;
};

export type InboxAction =
  | { type: "markRead" }
  | { type: "markImportant" }
  | { type: "star" }
  | { type: "notSpam" }
  | { type: "fileUnder"; folder: InboxFolder };

export type InboxFolder = { providerFolderId: string; name: string };

export type InboxActionResult = {
  ref: InboxMessageRef;
  unsupported: InboxAction["type"][];
};

export const receivedHeaderNames = [
  "auto-submitted",
  "x-autoreply",
  "x-autorespond",
  "precedence",
  "x-failed-recipients",
  "content-type",
] as const;

export type ReceivedHeaderName = (typeof receivedHeaderNames)[number];

export type DeliveryStatus = {
  action?: string;
  status?: string;
  originalMessageId?: string;
  failedRecipient?: string;
};

export type ReceivedMessage = {
  ref?: string;
  messageId?: string;
  inReplyTo?: string;
  references: string[];
  from?: { email: string };
  receivedAt: Date;
  headers: Partial<Record<ReceivedHeaderName, string>>;
  deliveryStatus?: DeliveryStatus;
};

export type ReceivedCursor = Record<string, string | number>;

export type ReceivedQuery = {
  since: Date;
  state: ReceivedCursor | null;
  limit: number;
};

export type ReceivedPage = {
  messages: ReceivedMessage[];
  state: ReceivedCursor;
  more: boolean;
};

export type ReceivedContent = {
  subject: string;
  text: string | null;
  html: string | null;
  from: MessageAddress | null;
  to: string[];
  date: Date | null;
};

export type InboxSupport = {
  search(
    credentials: Credentials,
    query: InboxSearch,
  ): Promise<InboxMessage | null>;
  applyActions(
    credentials: Credentials,
    ref: InboxMessageRef,
    actions: InboxAction[],
  ): Promise<InboxActionResult>;
  ensureFolder(credentials: Credentials, name: string): Promise<InboxFolder>;
  listReceived?(
    credentials: Credentials,
    input: ReceivedQuery,
  ): Promise<ReceivedPage>;
  fetchReceived?(
    credentials: Credentials,
    ref: string,
  ): Promise<ReceivedContent | null>;
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
  inbox?: InboxSupport;
};
