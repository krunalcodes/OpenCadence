import { createHash, randomBytes, randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  type Credentials,
  type IntegrationAdapter,
  IntegrationError,
  type OAuthConnection,
  type OAuthSupport,
  type OutboundMessage,
  type ProviderEvent,
  type SendResult,
  type SourceSettings,
  toIntegrationError,
} from "@workspace/integration-core";
import {
  isStandardTopicArn,
  type SesAdapter,
} from "@workspace/integration-ses";
import type { Env } from "../../config/env";
import { REDIS, type Redis } from "../../infra/redis/redis.module";
import { AdapterRegistry } from "./adapter-registry";
import { apiError, integrationApiError } from "./api-error";
import { CredentialsService } from "./credentials.service";
import {
  awsRegionPattern,
  configurationSetHeader,
  configurationSetPattern,
  hasReadScope,
  isMailboxProvider,
  type MailboxProvider,
  mailboxProviderNames,
  mailboxProviders,
} from "./mailbox-providers";
import { SendCounter } from "./send-counter";
import {
  type DailyStatsRow,
  type EventCursor,
  type EventSeverity,
  isUniqueViolation,
  nameConstraint,
  SendingSourcesRepository,
  type SourceRow,
  utcDay,
} from "./sending-sources.repository";

export type Actor = { workspaceId: string; userId: string | null };

type HealthDay = {
  day: string;
  health: "healthy" | "warning" | "failing" | "none";
  sent: number;
};

export type SendingSourceDto = {
  id: string;
  integrationType: string;
  name: string;
  email: string | null;
  status: "active" | "paused" | "needs_attention";
  dailySendLimit: number | null;
  isDefault: boolean;
  sentToday: number;
  lastError: { code: string; message: string; at: string } | null;
  lastTestedAt: string | null;
  createdAt: string;
  details: {
    permission?: "full" | "sending";
    domains?: { name: string; status: string }[];
    webhook?: "registered" | "pending" | "not_registered";
    account?: {
      region: string;
      sandbox: boolean;
      sendingEnabled: boolean;
      quota: {
        max24HourSend: number | null;
        maxSendRate: number | null;
        sentLast24Hours: number | null;
      };
      configurationSet: string | null;
    };
    identities?: SourceIdentity[];
    identitiesTruncated?: boolean;
    events?: {
      webhookUrl: string | null;
      topicArn: string | null;
      destination: "configured" | "manual" | null;
    };
  };
  replyDetection: ReplyDetectionState;
  health: HealthDay[];
};

export type SourceIdentity = {
  name: string;
  type: "email" | "domain";
  verified: boolean;
  status: string;
};

export type ReplyDetectionState =
  | "on"
  | "off"
  | "not_enabled"
  | "always"
  | "unsupported";

type ReplyDetectionSource = Pick<
  SendingSourceDto,
  "integrationType" | "replyDetection"
>;

export type SourcePatch = {
  name?: string;
  dailySendLimit?: number | null;
  paused?: boolean;
  isDefault?: boolean;
};

export type WebhookResult =
  | { outcome: "not_found" | "rejected" | "unavailable" }
  | {
      outcome: "accepted";
      workspaceId: string;
      sourceId: string;
      events: ProviderEvent[];
    };

export class SourceUnavailableError extends Error {
  constructor(
    readonly code:
      | "source_paused"
      | "source_needs_attention"
      | "source_missing",
    message: string,
  ) {
    super(message);
    this.name = "SourceUnavailableError";
  }
}

export type EventsQuery = {
  sourceId?: string;
  severity?: "warning" | "error";
  cursor?: string;
  limit?: number;
};

const healthDays = 14;
const maxNameLength = 80;
const maxDailyLimit = 100000;
const oauthStateTtlSeconds = 600;
const accessTokenSkewMs = 60_000;
const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const brokenCredentialCodes = [
  "invalid_credentials",
  "auth_revoked",
  "insufficient_permission",
  "blocked_by_policy",
];

const severityNames: Record<number, "info" | "warning" | "error"> = {
  1: "info",
  2: "warning",
  3: "error",
};

const severityValues: Record<"warning" | "error", EventSeverity> = {
  warning: 2,
  error: 3,
};

type OAuthState = {
  workspaceId: string;
  userId: string;
  codeVerifier: string;
  dailySendLimit: number | null;
  replyDetectionFor?: string;
};

export type OAuthCallbackOutcome =
  | { ok: true; result: "connected" | "reply_detection" }
  | { ok: false; code: string };

function oauthStateKey(provider: MailboxProvider, state: string) {
  const digest = createHash("sha256").update(state).digest("hex");
  return `opencadence:oauth:${provider}:${digest}`;
}

function hasSns(adapter: IntegrationAdapter): adapter is SesAdapter {
  return typeof (adapter as Partial<SesAdapter>).sns?.receive === "function";
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function daysBack(count: number) {
  const days: string[] = [];
  const today = new Date();
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - offset);
    days.push(utcDay(date));
  }
  return days;
}

function encodeCursor(cursor: EventCursor) {
  return Buffer.from(
    `${cursor.createdAt.toISOString()}|${cursor.id}`,
    "utf8",
  ).toString("base64url");
}

function decodeCursor(value: string): EventCursor | null {
  const [createdAt, id] = Buffer.from(value, "base64url")
    .toString("utf8")
    .split("|");
  const date = createdAt ? new Date(createdAt) : null;
  if (!date || Number.isNaN(date.getTime()) || !id || !uuidPattern.test(id)) {
    return null;
  }
  return { createdAt: date, id };
}

@Injectable()
export class SendingSourcesService {
  private readonly logger = new Logger(SendingSourcesService.name);

  constructor(
    @Inject(SendingSourcesRepository)
    private readonly repository: SendingSourcesRepository,
    @Inject(AdapterRegistry) private readonly adapters: AdapterRegistry,
    @Inject(CredentialsService)
    private readonly credentials: CredentialsService,
    @Inject(SendCounter) private readonly counter: SendCounter,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  async list(workspaceId: string) {
    const rows = await this.repository.listSources(workspaceId);
    const connectable = {} as Record<MailboxProvider, boolean>;
    const replyDetection = {} as Record<MailboxProvider, boolean>;
    const redirectUris = {} as Record<MailboxProvider, string>;
    for (const provider of mailboxProviderNames) {
      const adapter = this.adapters.find(provider);
      connectable[provider] = Boolean(adapter?.oauth);
      replyDetection[provider] = Boolean(adapter?.inbox?.listReceived);
      redirectUris[provider] = this.redirectUri(provider);
    }
    return {
      sources: await this.toDtos(workspaceId, rows),
      connectable,
      replyDetection,
      redirectUris,
    };
  }

  async connectSes(actor: Actor, input: Record<string, unknown>) {
    const adapter = this.requireAdapter("ses");
    const name = this.validName(input.name);
    const accessKeyId = text(input.accessKeyId);
    if (accessKeyId === "") {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "validation",
        "Paste the access key ID of the IAM user.",
        "accessKeyId",
      );
    }
    const secretAccessKey = text(input.secretAccessKey);
    if (secretAccessKey === "") {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "validation",
        "Paste the secret access key of the IAM user.",
        "secretAccessKey",
      );
    }
    const region = text(input.region).toLowerCase();
    if (!awsRegionPattern.test(region)) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "validation",
        "Choose the AWS region your Amazon SES account sends from, such as us-east-1.",
        "region",
      );
    }
    const configurationSet = text(input.configurationSet);
    if (
      configurationSet !== "" &&
      !configurationSetPattern.test(configurationSet)
    ) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "validation",
        "A configuration set name can use up to 64 letters, numbers, hyphens, and underscores.",
        "configurationSet",
      );
    }
    const topicArn = text(input.topicArn);
    if (topicArn !== "" && !isStandardTopicArn(topicArn)) {
      throw this.invalidTopic();
    }
    const dailySendLimit =
      input.dailySendLimit === undefined || input.dailySendLimit === null
        ? null
        : this.validLimit(input.dailySendLimit);

    const credentials: Credentials = {
      kind: "access_key",
      accessKeyId,
      secretAccessKey,
      region,
    };
    let settings: SourceSettings;
    try {
      settings = (await adapter.verify(credentials)).settings;
    } catch (error) {
      const failure = toIntegrationError(error);
      throw integrationApiError(
        failure,
        failure.code === "invalid_credentials"
          ? "accessKeyId"
          : failure.code === "validation"
            ? "region"
            : undefined,
      );
    }

    const id = randomUUID();
    await this.insert(actor, {
      id,
      integrationType: adapter.type,
      name,
      settings: {
        ...settings,
        configurationSet: configurationSet === "" ? null : configurationSet,
        webhook: "not_registered",
      },
      credentials,
      dailySendLimit,
    });
    if (topicArn !== "") {
      await this.setEventTopic(actor, id, { topicArn });
    }
    return this.dto(actor.workspaceId, id);
  }

  async setEventTopic(actor: Actor, id: string, input: { topicArn: unknown }) {
    const source = await this.requireSource(actor.workspaceId, id);
    const adapter = this.requireAdapter(source.integrationType);
    if (!hasSns(adapter)) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "not_supported",
        "This kind of sending source does not receive events through an SNS topic.",
      );
    }
    const topicArn = text(input.topicArn);
    if (!isStandardTopicArn(topicArn)) {
      throw this.invalidTopic();
    }
    const row = await this.repository.findCredentials(id);
    if (!row) {
      throw this.notFound();
    }

    const configurationSet = text(source.settings.configurationSet);
    let destination: "configured" | "manual" = "manual";
    let failure: IntegrationError | null = null;
    if (configurationSet !== "") {
      try {
        await adapter.ensureEventDestination(this.credentials.open(row), {
          configurationSetName: configurationSet,
          topicArn,
        });
        destination = "configured";
      } catch (error) {
        failure = toIntegrationError(error);
      }
    }

    const unchanged =
      source.settings.topicArn === topicArn &&
      source.settings.webhook === "registered";
    await this.repository.transaction(async (tx) => {
      await this.repository.updateCredentials(
        id,
        {
          webhookExternalId: topicArn,
          webhookSecretCiphertext: this.credentials.sealWebhookSecret(
            row,
            topicArn,
          ),
        },
        tx,
      );
      await this.repository.updateSource(
        actor.workspaceId,
        id,
        {
          settings: {
            ...source.settings,
            topicArn,
            eventDestination: destination,
            webhook: unchanged ? "registered" : "pending",
          },
        },
        tx,
      );
      await this.repository.insertEvent(
        {
          workspaceId: actor.workspaceId,
          sourceId: id,
          severity: 1,
          type: "event_topic_saved",
          actorUserId: actor.userId,
        },
        tx,
      );
      if (failure) {
        await this.repository.insertEvent(
          {
            workspaceId: actor.workspaceId,
            sourceId: id,
            severity: 2,
            type: "event_destination_failed",
            code: failure.code,
            message: failure.message,
            actorUserId: actor.userId,
          },
          tx,
        );
      }
    });
    return {
      source: await this.dto(actor.workspaceId, id),
      destination,
      error: failure ? { code: failure.code, message: failure.message } : null,
    };
  }

  async connectResend(actor: Actor, input: { name: unknown; apiKey: unknown }) {
    const name = this.validName(input.name);
    const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
    if (apiKey === "") {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "validation",
        "Paste the API key from your Resend account.",
        "apiKey",
      );
    }

    const adapter = this.requireAdapter("resend");
    const credentials: Credentials = { kind: "api_key", apiKey };
    let settings: SourceSettings;
    try {
      settings = (await adapter.verify(credentials)).settings;
    } catch (error) {
      throw integrationApiError(toIntegrationError(error), "apiKey");
    }

    const id = randomUUID();
    const row = await this.insert(actor, {
      id,
      integrationType: adapter.type,
      name,
      settings,
      credentials,
      dailySendLimit: null,
    });

    await this.registerWebhook(actor, row, adapter, credentials);
    return this.dto(actor.workspaceId, id);
  }

  async connectImapSmtp(actor: Actor, input: Record<string, unknown>) {
    const adapter = this.requireAdapter("imap-smtp");
    const email = this.validEmail(
      input.email,
      "email",
      "Enter the full address of the mailbox, such as you@yourdomain.com.",
    );
    const password = typeof input.password === "string" ? input.password : "";
    if (password === "") {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "validation",
        "Enter the password or app password for this mailbox.",
        "password",
      );
    }
    const credentials: Credentials = {
      kind: "password",
      username:
        typeof input.username === "string" && input.username.trim() !== ""
          ? input.username.trim()
          : email,
      password,
      smtp: this.validMailServer(input, "smtp"),
      imap: this.validMailServer(input, "imap"),
    };
    const dailySendLimit =
      input.dailySendLimit === undefined || input.dailySendLimit === null
        ? null
        : this.validLimit(input.dailySendLimit);
    const name =
      input.name === undefined || input.name === null || input.name === ""
        ? email
        : this.validName(input.name);

    let settings: SourceSettings;
    try {
      settings = (await adapter.verify(credentials)).settings;
    } catch (error) {
      const failure = toIntegrationError(error);
      throw integrationApiError(
        failure,
        failure.code === "invalid_credentials" ? "password" : undefined,
      );
    }

    const id = randomUUID();
    await this.insert(actor, {
      id,
      integrationType: adapter.type,
      name,
      settings,
      credentials,
      dailySendLimit,
      externalAccountId: email.toLowerCase(),
      email: email.toLowerCase(),
    });
    return this.dto(actor.workspaceId, id);
  }

  async withInbox<T>(
    sourceId: string,
    run: (
      inbox: NonNullable<IntegrationAdapter["inbox"]>,
      credentials: Credentials,
    ) => Promise<T>,
  ): Promise<T> {
    const source = await this.repository.findSourceById(sourceId);
    const adapter = source ? this.adapters.find(source.integrationType) : null;
    if (!source || !adapter?.inbox) {
      throw new SourceUnavailableError(
        "source_missing",
        "This sending source cannot read its inbox.",
      );
    }
    const inbox = adapter.inbox;
    return this.withCredentials(source, adapter, (credentials) =>
      run(inbox, credentials),
    );
  }

  hasInbox(integrationType: string) {
    const adapter = this.adapters.find(integrationType);
    return Boolean(adapter?.inbox && adapter.capabilities.includes("warmup"));
  }

  readsMail(integrationType: string) {
    return Boolean(this.adapters.find(integrationType)?.inbox?.listReceived);
  }

  canDetectReplies(source: ReplyDetectionSource) {
    return (
      this.readsMail(source.integrationType) &&
      (source.replyDetection === "on" || source.replyDetection === "always")
    );
  }

  async authorizeUrl(
    provider: MailboxProvider,
    actor: Actor,
    input: { dailySendLimit?: unknown },
  ) {
    const { label, company, setup } = mailboxProviders[provider];
    const oauth = this.adapters.oauth(provider, "send");
    if (!oauth) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        `${provider}_not_configured`,
        `${label} is not set up on this server. ${setup}`,
      );
    }
    const userId = this.requireUser(actor, company);
    const dailySendLimit =
      input.dailySendLimit === undefined || input.dailySendLimit === null
        ? null
        : this.validLimit(input.dailySendLimit);
    return this.startOAuth(provider, oauth, {
      workspaceId: actor.workspaceId,
      userId,
      dailySendLimit,
    });
  }

  async replyDetectionAuthorizeUrl(actor: Actor, id: string) {
    const source = await this.requireSource(actor.workspaceId, id);
    const provider = source.integrationType;
    if (!isMailboxProvider(provider)) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "not_supported",
        this.readsMail(provider)
          ? "This source already reads its inbox, so replies are detected without an extra permission."
          : "This kind of sending source cannot read an inbox, so it cannot detect replies.",
      );
    }
    const { label, company } = mailboxProviders[provider];
    const oauth = this.adapters.oauth(provider, "inbox");
    if (!oauth) {
      throw apiError(
        HttpStatus.CONFLICT,
        "reply_detection_disabled",
        `Reply detection for ${label} is not enabled on this server. Connect the mailbox with IMAP/SMTP and an app password to detect replies.`,
      );
    }
    const userId = this.requireUser(actor, company);
    return this.startOAuth(
      provider,
      oauth,
      {
        workspaceId: actor.workspaceId,
        userId,
        dailySendLimit: null,
        replyDetectionFor: source.id,
      },
      source.email ?? undefined,
    );
  }

  async disableReplyDetection(actor: Actor, id: string) {
    const source = await this.requireSource(actor.workspaceId, id);
    if (!isMailboxProvider(source.integrationType)) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "not_supported",
        "Reply detection cannot be turned off for this kind of sending source.",
      );
    }
    if (source.settings.replyDetection === true) {
      await this.repository.transaction(async (tx) => {
        await this.repository.updateSource(
          actor.workspaceId,
          id,
          { settings: { ...source.settings, replyDetection: false } },
          tx,
        );
        await this.repository.insertEvent(
          {
            workspaceId: actor.workspaceId,
            sourceId: id,
            severity: 1,
            type: "reply_detection_disabled",
            actorUserId: actor.userId,
          },
          tx,
        );
      });
    }
    return this.dto(actor.workspaceId, id);
  }

  async oauthCallback(
    provider: MailboxProvider,
    userId: string | null,
    query: { code?: string; state?: string; error?: string },
  ): Promise<OAuthCallbackOutcome> {
    if (!this.adapters.oauth(provider, "send")) {
      return { ok: false, code: "not_configured" };
    }
    if (!query.state) {
      return { ok: false, code: "state_expired" };
    }
    const raw = await this.redis.getdel(oauthStateKey(provider, query.state));
    if (!raw) {
      return { ok: false, code: "state_expired" };
    }
    const stored = JSON.parse(raw) as OAuthState;
    if (!userId || userId !== stored.userId) {
      return { ok: false, code: "failed" };
    }
    if (query.error || !query.code) {
      return {
        ok: false,
        code: query.error === "access_denied" ? "access_denied" : "failed",
      };
    }
    const oauth = this.adapters.oauth(
      provider,
      stored.replyDetectionFor ? "inbox" : "send",
    );
    if (!oauth) {
      return { ok: false, code: "reply_detection_disabled" };
    }

    const actor: Actor = {
      workspaceId: stored.workspaceId,
      userId: stored.userId,
    };

    try {
      const connection = await oauth.exchangeCode({
        code: query.code,
        redirectUri: this.redirectUri(provider),
        codeVerifier: stored.codeVerifier,
      });
      if (stored.replyDetectionFor) {
        return await this.finishReplyDetection(
          provider,
          actor,
          stored.replyDetectionFor,
          connection,
        );
      }
      const { externalId, email } = connection.account;
      if (!externalId || !email) {
        return { ok: false, code: "failed" };
      }

      const existing = await this.repository.findSourceByAccount(
        actor.workspaceId,
        provider,
        externalId,
      );
      if (existing) {
        await this.repository.transaction(async (tx) => {
          await this.repository.replaceCredentials(
            this.credentials.seal({
              sourceId: existing.id,
              workspaceId: actor.workspaceId,
              credentials: connection.credentials,
            }),
            tx,
          );
          await this.repository.updateSource(
            actor.workspaceId,
            existing.id,
            {
              email,
              settings: { ...existing.settings, ...connection.settings },
              status: existing.pausedAt ? "paused" : "active",
              lastErrorCode: null,
              lastErrorMessage: null,
              lastErrorAt: null,
              lastVerifiedAt: new Date(),
            },
            tx,
          );
          await this.repository.insertEvent(
            {
              workspaceId: actor.workspaceId,
              sourceId: existing.id,
              severity: 1,
              type: "reconnected",
              actorUserId: actor.userId,
            },
            tx,
          );
        });
        return { ok: true, result: "connected" };
      }

      const base = {
        integrationType: provider,
        settings: connection.settings,
        credentials: connection.credentials,
        dailySendLimit: stored.dailySendLimit,
        externalAccountId: externalId,
        email,
      };
      try {
        await this.insert(actor, { ...base, id: randomUUID(), name: email });
      } catch (error) {
        if (!this.isNameTaken(error)) {
          throw error;
        }
        await this.insert(actor, {
          ...base,
          id: randomUUID(),
          name: `${email} (${mailboxProviders[provider].label})`,
        });
      }
      return { ok: true, result: "connected" };
    } catch (error) {
      if (error instanceof IntegrationError) {
        return {
          ok: false,
          code:
            error.code === "insufficient_permission"
              ? "missing_scope"
              : "failed",
        };
      }
      this.logger.error(
        `${mailboxProviders[provider].label} connection failed.`,
        error,
      );
      return { ok: false, code: "failed" };
    }
  }

  private async finishReplyDetection(
    provider: MailboxProvider,
    actor: Actor,
    sourceId: string,
    connection: OAuthConnection,
  ): Promise<OAuthCallbackOutcome> {
    const source = await this.repository.findSource(
      actor.workspaceId,
      sourceId,
    );
    if (!source || source.integrationType !== provider) {
      return { ok: false, code: "source_missing" };
    }
    if (
      !connection.account.externalId ||
      connection.account.externalId !== source.externalAccountId
    ) {
      return { ok: false, code: "account_mismatch" };
    }
    const granted = hasReadScope(provider, connection.credentials.scopes);
    await this.repository.transaction(async (tx) => {
      await this.repository.replaceCredentials(
        this.credentials.seal({
          sourceId: source.id,
          workspaceId: actor.workspaceId,
          credentials: connection.credentials,
        }),
        tx,
      );
      await this.repository.updateSource(
        actor.workspaceId,
        source.id,
        {
          settings: {
            ...source.settings,
            ...connection.settings,
            replyDetection: granted,
          },
          status: source.pausedAt ? "paused" : "active",
          lastErrorCode: null,
          lastErrorMessage: null,
          lastErrorAt: null,
          lastVerifiedAt: new Date(),
        },
        tx,
      );
      await this.repository.insertEvent(
        {
          workspaceId: actor.workspaceId,
          sourceId: source.id,
          severity: granted ? 1 : 2,
          type: granted
            ? "reply_detection_enabled"
            : "reply_detection_not_granted",
          actorUserId: actor.userId,
        },
        tx,
      );
    });
    return granted
      ? { ok: true, result: "reply_detection" }
      : { ok: false, code: "read_scope_not_granted" };
  }

  private requireUser(actor: Actor, company: string) {
    if (!actor.userId) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        "session_required",
        `Connect a mailbox while signed in. An API key cannot approve access on ${company}.`,
      );
    }
    return actor.userId;
  }

  private async startOAuth(
    provider: MailboxProvider,
    oauth: OAuthSupport,
    stored: Omit<OAuthState, "codeVerifier">,
    loginHint?: string,
  ) {
    const state = randomBytes(32).toString("base64url");
    const codeVerifier = randomBytes(48).toString("base64url");
    await this.redis.set(
      oauthStateKey(provider, state),
      JSON.stringify({ ...stored, codeVerifier } satisfies OAuthState),
      "EX",
      oauthStateTtlSeconds,
      "NX",
    );
    return {
      url: oauth.authorizationUrl({
        state,
        redirectUri: this.redirectUri(provider),
        codeChallenge: createHash("sha256")
          .update(codeVerifier)
          .digest("base64url"),
        loginHint,
      }),
    };
  }

  async update(actor: Actor, id: string, patch: SourcePatch) {
    const source = await this.requireSource(actor.workspaceId, id);
    const changes: Parameters<SendingSourcesRepository["updateSource"]>[2] = {};
    const events: { type: string; message?: string }[] = [];

    if (patch.name !== undefined) {
      const name = this.validName(patch.name);
      if (name !== source.name) {
        changes.name = name;
        events.push({ type: "renamed" });
      }
    }
    if (patch.dailySendLimit !== undefined) {
      const limit =
        patch.dailySendLimit === null
          ? null
          : this.validLimit(patch.dailySendLimit);
      if (limit !== source.dailySendLimit) {
        changes.dailySendLimit = limit;
        events.push({ type: "limit_changed" });
      }
    }
    let makeDefault = false;
    if (patch.isDefault !== undefined) {
      if (typeof patch.isDefault !== "boolean") {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          "validation",
          "Send isDefault as true or false.",
          "isDefault",
        );
      }
      if (patch.isDefault && !source.isDefault) {
        if (source.status === "needs_attention") {
          throw apiError(
            HttpStatus.CONFLICT,
            "not_sendable",
            "Fix this source before making it the default.",
          );
        }
        makeDefault = true;
        changes.isDefault = true;
        events.push({ type: "made_default" });
      }
      if (!patch.isDefault && source.isDefault) {
        changes.isDefault = false;
        events.push({ type: "default_removed" });
      }
    }
    if (patch.paused !== undefined) {
      if (typeof patch.paused !== "boolean") {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          "validation",
          "Send paused as true or false.",
          "paused",
        );
      }
      if (patch.paused && !source.pausedAt) {
        changes.pausedAt = new Date();
        changes.status =
          source.status === "needs_attention" ? source.status : "paused";
        events.push({ type: "paused" });
      }
      if (!patch.paused && source.pausedAt) {
        changes.pausedAt = null;
        changes.status = source.lastErrorCode ? "needs_attention" : "active";
        events.push({ type: "resumed" });
      }
    }

    if (events.length > 0) {
      try {
        await this.repository.transaction(async (tx) => {
          if (makeDefault) {
            await this.repository.clearDefault(actor.workspaceId, tx);
          }
          await this.repository.updateSource(
            actor.workspaceId,
            id,
            changes,
            tx,
          );
          for (const event of events) {
            await this.repository.insertEvent(
              {
                workspaceId: actor.workspaceId,
                sourceId: id,
                severity: 1,
                type: event.type,
                actorUserId: actor.userId,
              },
              tx,
            );
          }
        });
      } catch (error) {
        throw this.isNameTaken(error) ? this.nameTaken(patch.name) : error;
      }
    }
    return this.dto(actor.workspaceId, id);
  }

  async test(actor: Actor, id: string) {
    const source = await this.requireSource(actor.workspaceId, id);
    const adapter = this.requireAdapter(source.integrationType);

    try {
      const result = await this.withCredentials(
        source,
        adapter,
        (credentials) => adapter.verify(credentials),
      );
      await this.repository.transaction(async (tx) => {
        await this.repository.updateSource(
          actor.workspaceId,
          id,
          {
            settings: { ...source.settings, ...result.settings },
            email: result.account.email ?? source.email,
            status: source.pausedAt ? "paused" : "active",
            lastErrorCode: null,
            lastErrorMessage: null,
            lastErrorAt: null,
            lastTestedAt: new Date(),
            lastVerifiedAt: new Date(),
          },
          tx,
        );
        await this.repository.insertEvent(
          {
            workspaceId: actor.workspaceId,
            sourceId: id,
            severity: 1,
            type: "connection_test_passed",
            actorUserId: actor.userId,
          },
          tx,
        );
      });
      return { ok: true, source: await this.dto(actor.workspaceId, id) };
    } catch (error) {
      const failure = toIntegrationError(error);
      await this.recordFailure(
        actor,
        source,
        failure,
        "connection_test_failed",
      );
      return {
        ok: false,
        source: await this.dto(actor.workspaceId, id),
        error: { code: failure.code, message: failure.message },
      };
    }
  }

  async sendTestEmail(
    actor: Actor,
    id: string,
    input: { to: unknown; from?: unknown },
  ) {
    const source = await this.requireSource(actor.workspaceId, id);
    const adapter = this.requireAdapter(source.integrationType);
    const to = this.validEmail(
      input.to,
      "to",
      "Enter the address to send the test to.",
    );
    const from = source.email
      ? source.email
      : this.validEmail(
          input.from,
          "from",
          "Enter a From address on a domain that is verified in this account.",
        );

    if (source.pausedAt) {
      throw apiError(
        HttpStatus.CONFLICT,
        "paused",
        "Sending through this source is paused. Resume it to send a test.",
      );
    }

    const reserved = await this.counter.reserve(
      actor.workspaceId,
      id,
      source.dailySendLimit,
    );
    if (!reserved) {
      throw apiError(
        HttpStatus.TOO_MANY_REQUESTS,
        "daily_limit_reached",
        "This source has reached its daily sending limit.",
      );
    }

    const message: OutboundMessage = {
      from: { email: from, name: "OpenCadence" },
      to: [to],
      subject: "Test email from OpenCadence",
      text: `This is a test email sent through ${source.name}. If you can read it, the sending source works.`,
      idempotencyKey: randomUUID(),
    };

    try {
      const result = await this.withCredentials(
        source,
        adapter,
        (credentials) =>
          adapter.send(credentials, this.outgoing(source, adapter, message)),
      );
      await this.repository.insertEvent({
        workspaceId: actor.workspaceId,
        sourceId: id,
        severity: 1,
        type: "test_email_sent",
        metadata: { providerMessageId: result.providerMessageId },
        actorUserId: actor.userId,
      });
      return { ok: true as const };
    } catch (error) {
      await this.counter.release(id);
      const failure = toIntegrationError(error);
      await this.recordFailure(actor, source, failure, "test_email_failed");
      throw integrationApiError(
        failure,
        failure.code === "domain_not_verified" ? "from" : undefined,
      );
    }
  }

  async disconnect(actor: Actor, id: string) {
    const source = await this.requireSource(actor.workspaceId, id);
    const adapter = this.adapters.find(source.integrationType);
    const row = await this.repository.findCredentials(id);

    if (adapter && row) {
      try {
        const credentials = this.credentials.open(row);
        if (adapter.webhooks && row.webhookExternalId) {
          await adapter.webhooks.unregister(credentials, row.webhookExternalId);
        }
        const shared =
          source.integrationType === "gmail" &&
          this.config.get("GMAIL_CLIENT_SHARED", { infer: true });
        if (adapter.oauth && credentials.kind === "oauth2" && !shared) {
          await adapter.oauth.revoke(credentials);
        }
      } catch (error) {
        this.logger.warn(
          `Could not clean up ${source.integrationType} source ${id} at the provider: ${toIntegrationError(error).code}`,
        );
      }
    }

    await this.repository.transaction(async (tx) => {
      await this.repository.deleteCredentials(id, tx);
      await this.repository.updateSource(
        actor.workspaceId,
        id,
        {
          status: "disconnected",
          disconnectedAt: new Date(),
          isDefault: false,
        },
        tx,
      );
      await this.repository.insertEvent(
        {
          workspaceId: actor.workspaceId,
          sourceId: id,
          severity: 1,
          type: "disconnected",
          actorUserId: actor.userId,
        },
        tx,
      );
    });
  }

  async events(workspaceId: string, query: EventsQuery) {
    const limit = Math.min(Math.max(Math.trunc(query.limit ?? 50), 1), 100);
    if (query.sourceId && !uuidPattern.test(query.sourceId)) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "validation",
        "sourceId is not a valid id.",
        "sourceId",
      );
    }
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
    if (cursor === null) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "validation",
        "The cursor is not valid. Start again from the first page.",
        "cursor",
      );
    }

    const rows = await this.repository.listEvents({
      workspaceId,
      sourceId: query.sourceId,
      severity: query.severity ? severityValues[query.severity] : undefined,
      cursor,
      limit: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page.at(-1);

    return {
      events: page.map((row) => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        sourceId: row.sourceId,
        sourceName: row.sourceName,
        integrationType: row.integrationType,
        severity: severityNames[row.severity] ?? "info",
        type: row.type,
        code: row.code,
        message: row.message,
      })),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ createdAt: last.createdAt, id: last.id })
          : null,
    };
  }

  async receiveWebhook(
    integrationType: string,
    sourceId: string,
    rawBody: string,
    headers: Record<string, string | undefined>,
  ): Promise<WebhookResult> {
    if (!uuidPattern.test(sourceId)) {
      return { outcome: "not_found" };
    }
    const source = await this.repository.findSourceById(sourceId);
    const adapter = this.adapters.find(integrationType);
    if (!source || source.integrationType !== integrationType || !adapter) {
      return { outcome: "not_found" };
    }
    const row = await this.repository.findCredentials(sourceId);
    const signingSecret = row ? this.credentials.openWebhookSecret(row) : null;
    if (!signingSecret) {
      return { outcome: "not_found" };
    }

    let events: ProviderEvent[];
    if (hasSns(adapter)) {
      const received = await this.receiveSns(
        adapter,
        source,
        rawBody,
        signingSecret,
      );
      if (!Array.isArray(received)) {
        return received;
      }
      events = received;
    } else if (adapter.webhooks) {
      try {
        events = [adapter.webhooks.parse({ rawBody, headers, signingSecret })];
      } catch {
        return { outcome: "rejected" };
      }
    } else {
      return { outcome: "not_found" };
    }

    const fresh: ProviderEvent[] = [];
    for (const event of events) {
      const first = await this.repository.insertWebhookReceipt(
        source.workspaceId,
        sourceId,
        event.id,
      );
      if (!first) {
        continue;
      }
      const serious =
        event.type === "complained" ||
        event.type === "failed" ||
        (event.type === "bounced" && event.bounce?.permanent !== false);
      await this.repository.insertEvent({
        workspaceId: source.workspaceId,
        sourceId,
        severity: serious ? 2 : 1,
        type: "provider_event",
        code: event.type,
        message: event.bounce?.message ?? event.reason ?? null,
        metadata: {
          rawType: event.rawType,
          providerMessageId: event.providerMessageId ?? null,
          recipientCount: event.recipients.length,
        },
      });
      fresh.push(event);
    }
    return {
      outcome: "accepted",
      workspaceId: source.workspaceId,
      sourceId,
      events: fresh,
    };
  }

  private async receiveSns(
    adapter: SesAdapter,
    source: SourceRow,
    rawBody: string,
    topicArn: string,
  ): Promise<ProviderEvent[] | WebhookResult> {
    let outcome: Awaited<ReturnType<SesAdapter["sns"]["receive"]>>;
    try {
      outcome = await adapter.sns.receive({ rawBody, topicArn });
    } catch (error) {
      return {
        outcome:
          toIntegrationError(error).code === "temporary"
            ? "unavailable"
            : "rejected",
      };
    }
    if (outcome.kind === "events") {
      return outcome.events;
    }
    const confirmed = outcome.kind === "subscription_confirmed";
    const webhook = confirmed ? "registered" : "not_registered";
    if (source.settings.webhook !== webhook) {
      await this.repository.transaction(async (tx) => {
        await this.repository.updateSource(
          source.workspaceId,
          source.id,
          { settings: { ...source.settings, webhook } },
          tx,
        );
        await this.repository.insertEvent(
          {
            workspaceId: source.workspaceId,
            sourceId: source.id,
            severity: confirmed ? 1 : 2,
            type: confirmed ? "webhook_registered" : "webhook_unsubscribed",
          },
          tx,
        );
      });
    }
    return [];
  }

  async resolveForSend(workspaceId: string, sourceId?: string) {
    if (sourceId) {
      return this.requireSource(workspaceId, sourceId);
    }
    const sources = await this.repository.listSources(workspaceId);
    const chosen =
      sources.find((source) => source.isDefault) ??
      (sources.length === 1 ? sources[0] : undefined);
    if (!chosen) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "no_default_source",
        sources.length === 0
          ? "Connect a sending source before sending email."
          : "Choose a default sending source, or pass sourceId with the request.",
        "sourceId",
      );
    }
    return chosen;
  }

  async deliver(
    workspaceId: string,
    sourceId: string,
    message: OutboundMessage,
  ): Promise<SendResult> {
    const source = await this.repository.findSource(workspaceId, sourceId);
    if (!source) {
      throw new SourceUnavailableError(
        "source_missing",
        "The sending source was disconnected.",
      );
    }
    if (source.pausedAt) {
      throw new SourceUnavailableError(
        "source_paused",
        "Sending through this source is paused.",
      );
    }
    if (source.status === "needs_attention") {
      throw new SourceUnavailableError(
        "source_needs_attention",
        "This sending source needs attention before it can send.",
      );
    }
    const adapter = this.adapters.find(source.integrationType);
    if (!adapter) {
      throw new SourceUnavailableError(
        "source_missing",
        "This kind of sending source is not available on this server.",
      );
    }

    const reserved = await this.counter.reserve(
      workspaceId,
      sourceId,
      source.dailySendLimit,
    );
    if (!reserved) {
      throw new IntegrationError(
        "daily_limit_reached",
        "This source has reached its daily sending limit.",
      );
    }

    try {
      return await this.withCredentials(source, adapter, (credentials) =>
        adapter.send(credentials, this.outgoing(source, adapter, message)),
      );
    } catch (error) {
      await this.counter.release(sourceId);
      const failure = toIntegrationError(error);
      if (brokenCredentialCodes.includes(failure.code)) {
        await this.recordFailure(
          { workspaceId, userId: null },
          source,
          failure,
          "send_failed",
        );
      }
      throw failure;
    }
  }

  private async insert(
    actor: Actor,
    input: {
      id: string;
      integrationType: string;
      name: string;
      settings: SourceSettings;
      credentials: Credentials;
      dailySendLimit: number | null;
      externalAccountId?: string;
      email?: string;
    },
  ) {
    try {
      return await this.repository.transaction(async (tx) => {
        const row = await this.repository.insertSource(
          {
            id: input.id,
            workspaceId: actor.workspaceId,
            integrationType: input.integrationType,
            name: input.name,
            settings: input.settings,
            dailySendLimit: input.dailySendLimit,
            externalAccountId: input.externalAccountId,
            email: input.email,
            lastVerifiedAt: new Date(),
            createdByUserId: actor.userId,
          },
          this.credentials.seal({
            sourceId: input.id,
            workspaceId: actor.workspaceId,
            credentials: input.credentials,
          }),
          tx,
        );
        await this.repository.insertEvent(
          {
            workspaceId: actor.workspaceId,
            sourceId: input.id,
            severity: 1,
            type: "connected",
            actorUserId: actor.userId,
          },
          tx,
        );
        return row;
      });
    } catch (error) {
      throw this.isNameTaken(error) ? this.nameTaken(input.name) : error;
    }
  }

  private async registerWebhook(
    actor: Actor,
    source: SourceRow,
    adapter: IntegrationAdapter,
    credentials: Credentials,
  ) {
    const baseUrl = this.config.get("WEBHOOK_BASE_URL", { infer: true });
    const canRegister =
      adapter.webhooks && baseUrl && source.settings.permission === "full";
    let registered = false;

    if (adapter.webhooks && canRegister) {
      try {
        const registration = await adapter.webhooks.register(
          credentials,
          `${baseUrl}/api/v1/provider-webhooks/${adapter.type}/${source.id}`,
        );
        const row = await this.repository.findCredentials(source.id);
        if (row) {
          await this.repository.updateCredentials(source.id, {
            webhookExternalId: registration.externalId,
            webhookSecretCiphertext: this.credentials.sealWebhookSecret(
              row,
              registration.signingSecret,
            ),
          });
          registered = true;
        }
        await this.repository.insertEvent({
          workspaceId: actor.workspaceId,
          sourceId: source.id,
          severity: 1,
          type: "webhook_registered",
          actorUserId: actor.userId,
        });
      } catch (error) {
        const failure = toIntegrationError(error);
        await this.repository.insertEvent({
          workspaceId: actor.workspaceId,
          sourceId: source.id,
          severity: 2,
          type: "webhook_registration_failed",
          code: failure.code,
          message: failure.providerMessage ?? failure.message,
          actorUserId: actor.userId,
        });
      }
    }

    await this.repository.updateSource(actor.workspaceId, source.id, {
      settings: {
        ...source.settings,
        webhook: registered ? "registered" : "not_registered",
      },
    });
  }

  private async withCredentials<T>(
    source: SourceRow,
    adapter: IntegrationAdapter,
    run: (credentials: Credentials) => Promise<T>,
  ) {
    const credentials = await this.freshCredentials(source, adapter, false);
    try {
      return await run(credentials);
    } catch (error) {
      if (
        error instanceof IntegrationError &&
        error.code === "auth_expired" &&
        adapter.oauth
      ) {
        return run(await this.freshCredentials(source, adapter, true));
      }
      throw error;
    }
  }

  private async freshCredentials(
    source: SourceRow,
    adapter: IntegrationAdapter,
    force: boolean,
  ): Promise<Credentials> {
    const oauth = adapter.oauth;
    return this.repository.transaction(async (tx) => {
      const row = oauth
        ? await this.repository.lockCredentials(source.id, tx)
        : await this.repository.findCredentials(source.id, tx);
      if (!row) {
        throw new IntegrationError(
          "auth_revoked",
          "This source has no saved credentials. Connect it again.",
        );
      }
      const credentials = this.credentials.open(row);
      if (!oauth || credentials.kind !== "oauth2") {
        return credentials;
      }
      const expiresAt = credentials.accessTokenExpiresAt?.getTime() ?? 0;
      const usable =
        credentials.accessToken && expiresAt - Date.now() > accessTokenSkewMs;
      if (usable && !force) {
        return credentials;
      }
      const refreshed = await oauth.refresh(credentials);
      await this.repository.updateCredentials(
        source.id,
        this.credentials.sealRefreshed(row, refreshed),
        tx,
      );
      return refreshed;
    });
  }

  private async recordFailure(
    actor: Actor,
    source: SourceRow,
    failure: IntegrationError,
    type: string,
  ) {
    const broken = brokenCredentialCodes.includes(failure.code);
    await this.repository.transaction(async (tx) => {
      await this.repository.updateSource(
        actor.workspaceId,
        source.id,
        {
          lastErrorCode: failure.code,
          lastErrorMessage: failure.message,
          lastErrorAt: new Date(),
          lastTestedAt:
            type === "connection_test_failed" ? new Date() : undefined,
          status: broken ? "needs_attention" : undefined,
        },
        tx,
      );
      await this.repository.insertEvent(
        {
          workspaceId: actor.workspaceId,
          sourceId: source.id,
          severity: failure.retryable ? 2 : 3,
          type: failure.code === "rate_limited" ? "rate_limited" : type,
          code: failure.code,
          message: failure.providerMessage ?? failure.message,
          metadata: {
            providerStatus: failure.providerStatus ?? null,
            providerCode: failure.providerCode ?? null,
          },
          actorUserId: actor.userId,
        },
        tx,
      );
    });
  }

  private async dto(workspaceId: string, id: string) {
    const row = await this.requireSource(workspaceId, id);
    const [dto] = await this.toDtos(workspaceId, [row]);
    if (!dto) {
      throw this.notFound();
    }
    return dto;
  }

  private async toDtos(
    workspaceId: string,
    rows: SourceRow[],
  ): Promise<SendingSourceDto[]> {
    const ids = rows.map((row) => row.id);
    const days = daysBack(healthDays);
    const today = days.at(-1) ?? utcDay();
    const [stats, counts, scopeRows] = await Promise.all([
      this.repository.listDailyStats(workspaceId, ids, days[0] ?? today),
      this.counter.today(ids),
      this.repository.listScopes(
        rows
          .filter((row) => isMailboxProvider(row.integrationType))
          .map((row) => row.id),
      ),
    ]);
    const scopesById = new Map(
      scopeRows.map((row) => [row.sourceId, row.scopes ?? []]),
    );
    const webhookBase = this.config.get("WEBHOOK_BASE_URL", { infer: true });
    const statsByKey = new Map<string, DailyStatsRow>(
      stats.map((stat) => [`${stat.sourceId}:${stat.day}`, stat]),
    );

    return rows.map((row) => {
      const live = counts.get(row.id);
      const health = days.map((day): HealthDay => {
        const stat = statsByKey.get(`${row.id}:${day}`);
        const sent =
          day === today
            ? Math.max(stat?.sentCount ?? 0, live ?? 0)
            : (stat?.sentCount ?? 0);
        if (!stat) {
          return { day, health: sent > 0 ? "healthy" : "none", sent };
        }
        return { day, health: stat.health as HealthDay["health"], sent };
      });
      const settings = row.settings as {
        permission?: "full" | "sending";
        webhook?: SendingSourceDto["details"]["webhook"];
        domains?: { name?: unknown; status?: unknown }[];
        identities?: Record<string, unknown>[];
        quota?: Record<string, unknown>;
      } & Record<string, unknown>;
      const adapter = this.adapters.find(row.integrationType);
      const sns = adapter ? hasSns(adapter) : false;

      return {
        id: row.id,
        integrationType: row.integrationType,
        name: row.name,
        email: row.email,
        status: row.status as SendingSourceDto["status"],
        dailySendLimit: row.dailySendLimit,
        isDefault: row.isDefault,
        sentToday: health.at(-1)?.sent ?? 0,
        lastError:
          row.lastErrorCode && row.lastErrorAt
            ? {
                code: row.lastErrorCode,
                message: row.lastErrorMessage ?? "",
                at: row.lastErrorAt.toISOString(),
              }
            : null,
        lastTestedAt: row.lastTestedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        details: {
          permission: settings.permission,
          domains: Array.isArray(settings.domains)
            ? settings.domains.map((domain) => ({
                name: String(domain.name ?? ""),
                status: String(domain.status ?? ""),
              }))
            : undefined,
          webhook: settings.webhook,
          account:
            typeof settings.region === "string"
              ? {
                  region: settings.region,
                  sandbox: settings.sandbox === true,
                  sendingEnabled: settings.sendingEnabled === true,
                  quota: {
                    max24HourSend: numberOrNull(settings.quota?.max24HourSend),
                    maxSendRate: numberOrNull(settings.quota?.maxSendRate),
                    sentLast24Hours: numberOrNull(
                      settings.quota?.sentLast24Hours,
                    ),
                  },
                  configurationSet: text(settings.configurationSet) || null,
                }
              : undefined,
          identities: Array.isArray(settings.identities)
            ? settings.identities.map((identity) => ({
                name: String(identity.name ?? ""),
                type: identity.type === "email" ? "email" : "domain",
                verified: identity.verified === true,
                status: String(identity.verificationStatus ?? ""),
              }))
            : undefined,
          identitiesTruncated:
            settings.identitiesTruncated === true ? true : undefined,
          events: sns
            ? {
                webhookUrl: webhookBase
                  ? `${webhookBase}/api/v1/provider-webhooks/${row.integrationType}/${row.id}`
                  : null,
                topicArn: text(settings.topicArn) || null,
                destination:
                  settings.eventDestination === "configured" ||
                  settings.eventDestination === "manual"
                    ? settings.eventDestination
                    : null,
              }
            : undefined,
        },
        replyDetection: this.replyDetection(
          row,
          adapter,
          scopesById.get(row.id) ?? [],
        ),
        health,
      };
    });
  }

  private replyDetection(
    row: SourceRow,
    adapter: IntegrationAdapter | null,
    scopes: string[],
  ): ReplyDetectionState {
    const reads = Boolean(adapter?.inbox?.listReceived);
    if (!isMailboxProvider(row.integrationType)) {
      return reads ? "always" : "unsupported";
    }
    if (!reads) {
      return "not_enabled";
    }
    return row.settings.replyDetection === true &&
      hasReadScope(row.integrationType, scopes)
      ? "on"
      : "off";
  }

  private outgoing(
    source: SourceRow,
    adapter: IntegrationAdapter,
    message: OutboundMessage,
  ): OutboundMessage {
    const configurationSet = text(source.settings.configurationSet);
    if (!hasSns(adapter) || configurationSet === "") {
      return message;
    }
    return {
      ...message,
      headers: {
        ...message.headers,
        [configurationSetHeader]: configurationSet,
      },
    };
  }

  private redirectUri(provider: MailboxProvider) {
    const base = this.config
      .get("BETTER_AUTH_URL", { infer: true })
      .replace(/\/+$/, "");
    return `${base}/api/v1/sending-sources/${provider}/callback`;
  }

  private requireAdapter(type: string) {
    const adapter = this.adapters.find(type);
    if (!adapter) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "integration_unavailable",
        "This kind of sending source is not available on this server.",
      );
    }
    return adapter;
  }

  private async requireSource(workspaceId: string, id: string) {
    const row = uuidPattern.test(id)
      ? await this.repository.findSource(workspaceId, id)
      : null;
    if (!row) {
      throw this.notFound();
    }
    return row;
  }

  private notFound() {
    return apiError(
      HttpStatus.NOT_FOUND,
      "not_found",
      "This sending source does not exist in the workspace.",
    );
  }

  private invalidTopic() {
    return apiError(
      HttpStatus.BAD_REQUEST,
      "validation",
      "Paste the ARN of a standard SNS topic, such as arn:aws:sns:us-east-1:123456789012:opencadence-events.",
      "topicArn",
    );
  }

  private isNameTaken(error: unknown) {
    return isUniqueViolation(error, nameConstraint);
  }

  private nameTaken(name: unknown) {
    return apiError(
      HttpStatus.CONFLICT,
      "name_taken",
      `Another source is already called ${String(name).trim()}. Choose a different name.`,
      "name",
    );
  }

  private validName(value: unknown) {
    const name = typeof value === "string" ? value.trim() : "";
    if (name === "" || name.length > maxNameLength) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "validation",
        `Enter a name of 1 to ${maxNameLength} characters.`,
        "name",
      );
    }
    return name;
  }

  private validLimit(value: unknown) {
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > maxDailyLimit
    ) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "validation",
        `Enter a whole number between 1 and ${maxDailyLimit}, or remove the limit.`,
        "dailySendLimit",
      );
    }
    return value;
  }

  private validMailServer(
    input: Record<string, unknown>,
    side: "smtp" | "imap",
  ) {
    const host = input[`${side}Host`];
    const port = Number(input[`${side}Port`]);
    const security = input[`${side}Security`];
    const label = side.toUpperCase();
    if (
      typeof host !== "string" ||
      !/^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/i.test(host.trim())
    ) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "validation",
        `Enter the ${label} server name, such as ${side}.yourdomain.com.`,
        `${side}Host`,
      );
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "validation",
        `Enter the ${label} port as a number between 1 and 65535.`,
        `${side}Port`,
      );
    }
    if (security !== "tls" && security !== "starttls") {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "validation",
        `Choose SSL/TLS or STARTTLS for ${label}.`,
        `${side}Security`,
      );
    }
    return { host: host.trim().toLowerCase(), port, security } as const;
  }

  private validEmail(value: unknown, field: string, message: string) {
    const email = typeof value === "string" ? value.trim() : "";
    if (!emailPattern.test(email)) {
      throw apiError(HttpStatus.BAD_REQUEST, "validation", message, field);
    }
    return email;
  }
}
