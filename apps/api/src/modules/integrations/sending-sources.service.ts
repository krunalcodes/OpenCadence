import { createHash, randomBytes, randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  type Credentials,
  type IntegrationAdapter,
  IntegrationError,
  type OutboundMessage,
  type SourceSettings,
  toIntegrationError,
} from "@workspace/integration-core";
import type { Env } from "../../config/env";
import { REDIS, type Redis } from "../../infra/redis/redis.module";
import { AdapterRegistry } from "./adapter-registry";
import { apiError, integrationApiError } from "./api-error";
import { CredentialsService } from "./credentials.service";
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
  sentToday: number;
  lastError: { code: string; message: string; at: string } | null;
  lastTestedAt: string | null;
  createdAt: string;
  details: {
    permission?: "full" | "sending";
    domains?: { name: string; status: string }[];
    webhook?: "registered" | "not_registered";
  };
  health: HealthDay[];
};

export type SourcePatch = {
  name?: string;
  dailySendLimit?: number | null;
  paused?: boolean;
};

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
};

export type GmailCallbackOutcome =
  | { connected: true }
  | { connected: false; code: string };

function oauthStateKey(state: string) {
  const digest = createHash("sha256").update(state).digest("hex");
  return `opencadence:oauth:gmail:${digest}`;
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
    return {
      sources: await this.toDtos(workspaceId, rows),
      connectable: { gmail: this.adapters.has("gmail") },
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

  async gmailAuthorizeUrl(actor: Actor, input: { dailySendLimit?: unknown }) {
    const adapter = this.adapters.find("gmail");
    if (!adapter?.oauth) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "gmail_not_configured",
        "Gmail is not set up on this server. Add a Google OAuth client to the server configuration first.",
      );
    }
    if (!actor.userId) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        "session_required",
        "Connect a mailbox while signed in. An API key cannot approve access on Google.",
      );
    }

    const dailySendLimit =
      input.dailySendLimit === undefined
        ? null
        : this.validLimit(input.dailySendLimit);
    const state = randomBytes(32).toString("base64url");
    const codeVerifier = randomBytes(48).toString("base64url");
    const stored: OAuthState = {
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      codeVerifier,
      dailySendLimit,
    };
    await this.redis.set(
      oauthStateKey(state),
      JSON.stringify(stored),
      "EX",
      oauthStateTtlSeconds,
      "NX",
    );

    return {
      url: adapter.oauth.authorizationUrl({
        state,
        redirectUri: this.gmailRedirectUri(),
        codeChallenge: createHash("sha256")
          .update(codeVerifier)
          .digest("base64url"),
      }),
    };
  }

  async gmailCallback(
    userId: string | null,
    query: { code?: string; state?: string; error?: string },
  ): Promise<GmailCallbackOutcome> {
    const adapter = this.adapters.find("gmail");
    if (!adapter?.oauth) {
      return { connected: false, code: "not_configured" };
    }
    if (!query.state) {
      return { connected: false, code: "state_expired" };
    }
    const raw = await this.redis.getdel(oauthStateKey(query.state));
    if (!raw) {
      return { connected: false, code: "state_expired" };
    }
    const stored = JSON.parse(raw) as OAuthState;
    if (!userId || userId !== stored.userId) {
      return { connected: false, code: "failed" };
    }
    if (query.error || !query.code) {
      return {
        connected: false,
        code: query.error === "access_denied" ? "access_denied" : "failed",
      };
    }

    const actor: Actor = {
      workspaceId: stored.workspaceId,
      userId: stored.userId,
    };

    try {
      const connection = await adapter.oauth.exchangeCode({
        code: query.code,
        redirectUri: this.gmailRedirectUri(),
        codeVerifier: stored.codeVerifier,
      });
      const { externalId, email } = connection.account;
      if (!externalId || !email) {
        return { connected: false, code: "failed" };
      }

      const existing = await this.repository.findSourceByAccount(
        actor.workspaceId,
        adapter.type,
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
        return { connected: true };
      }

      const base = {
        integrationType: adapter.type,
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
          name: `${email} (Gmail)`,
        });
      }
      return { connected: true };
    } catch (error) {
      if (error instanceof IntegrationError) {
        return {
          connected: false,
          code:
            error.code === "insufficient_permission"
              ? "missing_scope"
              : "failed",
        };
      }
      this.logger.error("Gmail connection failed.", error);
      return { connected: false, code: "failed" };
    }
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
        (credentials) => adapter.send(credentials, message),
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
        const shared = this.config.get("GMAIL_CLIENT_SHARED", { infer: true });
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
        { status: "disconnected", disconnectedAt: new Date() },
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
  ): Promise<"accepted" | "not_found" | "rejected"> {
    if (!uuidPattern.test(sourceId)) {
      return "not_found";
    }
    const source = await this.repository.findSourceById(sourceId);
    const adapter = this.adapters.find(integrationType);
    if (
      !source ||
      source.integrationType !== integrationType ||
      !adapter?.webhooks
    ) {
      return "not_found";
    }
    const row = await this.repository.findCredentials(sourceId);
    const signingSecret = row ? this.credentials.openWebhookSecret(row) : null;
    if (!signingSecret) {
      return "not_found";
    }

    let event: ReturnType<NonNullable<IntegrationAdapter["webhooks"]>["parse"]>;
    try {
      event = adapter.webhooks.parse({ rawBody, headers, signingSecret });
    } catch {
      return "rejected";
    }

    const fresh = await this.repository.insertWebhookReceipt(
      source.workspaceId,
      sourceId,
      event.id,
    );
    if (!fresh) {
      return "accepted";
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
    return "accepted";
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
    const [stats, counts] = await Promise.all([
      this.repository.listDailyStats(workspaceId, ids, days[0] ?? today),
      this.counter.today(ids),
    ]);
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
      const settings = row.settings as SendingSourceDto["details"] & {
        domains?: { name?: unknown; status?: unknown }[];
      };

      return {
        id: row.id,
        integrationType: row.integrationType,
        name: row.name,
        email: row.email,
        status: row.status as SendingSourceDto["status"],
        dailySendLimit: row.dailySendLimit,
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
        },
        health,
      };
    });
  }

  private gmailRedirectUri() {
    const base = this.config
      .get("BETTER_AUTH_URL", { infer: true })
      .replace(/\/+$/, "");
    return `${base}/api/v1/sending-sources/gmail/callback`;
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

  private validEmail(value: unknown, field: string, message: string) {
    const email = typeof value === "string" ? value.trim() : "";
    if (!emailPattern.test(email)) {
      throw apiError(HttpStatus.BAD_REQUEST, "validation", message, field);
    }
    return email;
  }
}
