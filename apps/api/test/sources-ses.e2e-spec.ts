import { VersioningType } from "@nestjs/common";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { type Db, eq, schema } from "@workspace/db";
import type {
  AccessKeyCredentials,
  FetchLike,
} from "@workspace/integration-core";
import { createSesAdapter, type SesCommand } from "@workspace/integration-ses";
import { AppModule } from "../src/app/app.module";
import { DATABASE } from "../src/infra/database/database.module";
import { DispatchService } from "../src/modules/dispatch/dispatch.service";
import { AdapterRegistry } from "../src/modules/integrations/adapter-registry";
import {
  type SendingSourceDto,
  SendingSourcesService,
} from "../src/modules/integrations/sending-sources.service";
import { SuppressionService } from "../src/modules/suppression/suppression.service";
import {
  certificateUrl,
  confirmation,
  createSigningIdentity,
  notification,
  subscribeUrl,
  topicArn,
} from "./support/sns-signing";
import {
  createApiKey,
  createWorkspaceSessions,
  type TestWorkspace,
} from "./support/workspace-session";

const accessKeyId = "AKIAIOSFODNN7EXAMPLE";
const secretAccessKey = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
const webhookBase = "https://mail.example.com";

function awsError(name: string, message: string, status: number) {
  return Object.assign(new Error(message), {
    name,
    $fault: "client",
    $metadata: { httpStatusCode: status, attempts: 1 },
  });
}

function fakeSes() {
  const identity = createSigningIdentity();
  const commands: { name: string; input: Record<string, unknown> }[] = [];
  const fetched: string[] = [];
  const state = { sandbox: true, denyDestination: false };
  const createClient = (credentials: AccessKeyCredentials) => ({
    send: async (command: SesCommand) => {
      const name = command.constructor.name;
      const input = command.input as Record<string, unknown>;
      commands.push({ name, input });
      if (credentials.secretAccessKey !== secretAccessKey) {
        throw awsError(
          "InvalidClientTokenId",
          "The security token included in the request is invalid.",
          403,
        );
      }
      if (credentials.region === "ap-south-2") {
        throw awsError(
          "AccessDeniedException",
          "User: arn:aws:iam::123456789012:user/mailer is not authorized to perform: ses:GetAccount on resource: *",
          403,
        );
      }
      if (name === "GetAccountCommand") {
        return {
          ProductionAccessEnabled: !state.sandbox,
          SendingEnabled: true,
          EnforcementStatus: "HEALTHY",
          SendQuota: { Max24HourSend: 200, MaxSendRate: 1, SentLast24Hours: 3 },
        };
      }
      if (name === "ListEmailIdentitiesCommand") {
        return {
          EmailIdentities: [
            {
              IdentityName: "example.com",
              IdentityType: "DOMAIN",
              VerificationStatus: "SUCCESS",
              SendingEnabled: true,
            },
            {
              IdentityName: "pending@example.org",
              IdentityType: "EMAIL_ADDRESS",
              VerificationStatus: "PENDING",
              SendingEnabled: true,
            },
          ],
        };
      }
      if (name === "CreateConfigurationSetCommand" && state.denyDestination) {
        throw awsError(
          "AccessDeniedException",
          "User is not authorized to perform: ses:CreateConfigurationSet on resource: *",
          403,
        );
      }
      if (name === "SendEmailCommand") {
        return { MessageId: "010f0199-ses-message-000000" };
      }
      return {};
    },
  });
  const fetch: FetchLike = async (input) => {
    const url = String(input);
    fetched.push(url);
    if (url === certificateUrl) {
      return new Response(identity.certificate);
    }
    if (url === subscribeUrl) {
      return new Response(
        `<ConfirmSubscriptionResponse><ConfirmSubscriptionResult><SubscriptionArn>${topicArn}:2bcfbf39</SubscriptionArn></ConfirmSubscriptionResult></ConfirmSubscriptionResponse>`,
      );
    }
    return new Response("", { status: 404 });
  };
  return {
    adapter: createSesAdapter({ createClient, fetch }),
    identity,
    commands,
    fetched,
    state,
  };
}

describe("Amazon SES sources (e2e)", () => {
  let app: NestFastifyApplication;
  let db: Db;
  let service: SendingSourcesService;
  let suppression: SuppressionService;
  let dispatch: DispatchService;
  let sessions: ReturnType<typeof createWorkspaceSessions>;
  let alpha: TestWorkspace;
  let beta: TestWorkspace;
  let apiKey = "";
  let source: SendingSourceDto;
  const fake = fakeSes();
  const responses: string[] = [];

  async function http<T = Record<string, unknown>>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    url: string,
    payload?: unknown,
    workspace: TestWorkspace = alpha,
  ) {
    const response = await app.inject({
      method,
      url,
      headers: { cookie: workspace.owner.cookie },
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
    responses.push(response.body);
    return {
      status: response.statusCode,
      body: (response.body ? response.json() : {}) as T,
    };
  }

  function sns(sourceId: string, fields: Record<string, string>) {
    return app.inject({
      method: "POST",
      url: `/v1/provider-webhooks/ses/${sourceId}`,
      headers: {
        "content-type": "text/plain; charset=UTF-8",
        "x-amz-sns-message-type": fields.Type,
      },
      payload: JSON.stringify(fields),
    });
  }

  const valid = {
    name: "Bulk mail",
    accessKeyId,
    secretAccessKey,
    region: "eu-west-1",
    configurationSet: "opencadence",
    dailySendLimit: 500,
  };

  beforeAll(async () => {
    process.env.WEBHOOK_BASE_URL = webhookBase;
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AdapterRegistry)
      .useValue({
        find: (type: string) => (type === "ses" ? fake.adapter : null),
        has: (type: string) => type === "ses",
        oauth: () => null,
      })
      .compile();
    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
      { bodyParser: false },
    );
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    db = app.get<Db>(DATABASE);
    service = app.get(SendingSourcesService);
    suppression = app.get(SuppressionService);
    dispatch = app.get(DispatchService);
    sessions = createWorkspaceSessions(app, "sources-ses-e2e");
    alpha = await sessions.workspace();
    beta = await sessions.workspace();
    apiKey = await createApiKey(app, alpha.owner, alpha.workspaceId);
  });

  afterAll(async () => {
    await sessions.cleanup();
    await app.close();
  });

  it("validates the form before calling Amazon SES", async () => {
    const before = fake.commands.length;
    for (const [patch, field] of [
      [{ name: "" }, "name"],
      [{ accessKeyId: " " }, "accessKeyId"],
      [{ secretAccessKey: "" }, "secretAccessKey"],
      [{ region: "Ireland" }, "region"],
      [{ configurationSet: "has spaces" }, "configurationSet"],
      [{ topicArn: "arn:aws:sqs:eu-west-1:123456789012:queue" }, "topicArn"],
      [{ dailySendLimit: 0 }, "dailySendLimit"],
    ] as const) {
      const response = await http("POST", "/v1/sending-sources/ses", {
        ...valid,
        ...patch,
      });
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: "validation", field });
    }
    expect(fake.commands).toHaveLength(before);
  });

  it("surfaces the precise error for invalid keys, temporary keys and a missing permission", async () => {
    const wrong = await http("POST", "/v1/sending-sources/ses", {
      ...valid,
      secretAccessKey: "not-the-secret-access-key-value-0000000",
    });
    expect(wrong.status).toBe(400);
    expect(wrong.body).toMatchObject({
      code: "invalid_credentials",
      field: "accessKeyId",
    });
    expect(String(wrong.body.message)).toContain("eu-west-1");

    const temporary = await http("POST", "/v1/sending-sources/ses", {
      ...valid,
      accessKeyId: "ASIAIOSFODNN7EXAMPLE",
    });
    expect(temporary.status).toBe(400);
    expect(String(temporary.body.message)).toContain("Temporary");

    const denied = await http("POST", "/v1/sending-sources/ses", {
      ...valid,
      region: "ap-south-2",
    });
    expect(denied.status).toBe(400);
    expect(denied.body.code).toBe("insufficient_permission");
    expect(String(denied.body.message)).toContain("ses:GetAccount");

    const listed = await http<{ sources: unknown[] }>(
      "GET",
      "/v1/sending-sources",
    );
    expect(listed.body.sources).toHaveLength(0);
  });

  it("connects an account and reports the sandbox, quota and identities", async () => {
    const response = await http<SendingSourceDto>(
      "POST",
      "/v1/sending-sources/ses",
      valid,
    );
    expect(response.status).toBe(201);
    source = response.body;
    expect(source).toMatchObject({
      integrationType: "ses",
      name: "Bulk mail",
      email: null,
      status: "active",
      dailySendLimit: 500,
      replyDetection: "unsupported",
      details: {
        webhook: "not_registered",
        account: {
          region: "eu-west-1",
          sandbox: true,
          sendingEnabled: true,
          quota: { max24HourSend: 200, maxSendRate: 1, sentLast24Hours: 3 },
          configurationSet: "opencadence",
        },
        identities: [
          {
            name: "example.com",
            type: "domain",
            verified: true,
            status: "SUCCESS",
          },
          {
            name: "pending@example.org",
            type: "email",
            verified: false,
            status: "PENDING",
          },
        ],
        events: {
          webhookUrl: `${webhookBase}/api/v1/provider-webhooks/ses/${source.id}`,
          topicArn: null,
          destination: null,
        },
      },
    });
    expect(service.canDetectReplies(source)).toBe(false);
    expect(service.hasInbox("ses")).toBe(false);
    expect(service.readsMail("ses")).toBe(false);
  });

  it("stores the access key encrypted with a hint and never returns it", async () => {
    const [row] = await db
      .select()
      .from(schema.sendingSourceCredentials)
      .where(eq(schema.sendingSourceCredentials.sourceId, source.id));
    expect(row?.authType).toBe("access_key");
    expect(row?.secretHint).toBe("MPLE");
    const stored = row?.secretCiphertext.toString("utf8") ?? "";
    expect(stored).not.toContain(secretAccessKey);
    expect(stored).not.toContain(accessKeyId);

    const [saved] = await db
      .select()
      .from(schema.sendingSources)
      .where(eq(schema.sendingSources.id, source.id));
    expect(JSON.stringify(saved)).not.toContain(secretAccessKey);
    expect(JSON.stringify(saved)).not.toContain(accessKeyId);

    await http("GET", "/v1/sending-sources");
    await http("POST", `/v1/sending-sources/${source.id}/test`);
    await http("GET", "/v1/sending-sources/events");
    for (const body of responses) {
      expect(body).not.toContain(secretAccessKey);
      expect(body).not.toContain(accessKeyId);
    }
  });

  it("reports production access after the account leaves the sandbox", async () => {
    fake.state.sandbox = false;
    const tested = await http<{ ok: boolean; source: SendingSourceDto }>(
      "POST",
      `/v1/sending-sources/${source.id}/test`,
    );
    expect(tested.body.ok).toBe(true);
    expect(tested.body.source.details.account?.sandbox).toBe(false);
    expect(tested.body.source.details.account?.configurationSet).toBe(
      "opencadence",
    );
  });

  it("sends with the configuration set of the source and a from address", async () => {
    const missing = await http(
      "POST",
      `/v1/sending-sources/${source.id}/test-email`,
      { to: "someone@example.org" },
    );
    expect(missing.body).toMatchObject({ code: "validation", field: "from" });

    const sent = await http(
      "POST",
      `/v1/sending-sources/${source.id}/test-email`,
      { to: "someone@example.org", from: "hello@example.com" },
    );
    expect(sent.status).toBe(200);
    const command = fake.commands.findLast(
      (entry) => entry.name === "SendEmailCommand",
    );
    expect(command?.input.ConfigurationSetName).toBe("opencadence");
    expect(JSON.stringify(command?.input)).not.toContain(
      "x-ses-configuration-set",
    );
  });

  it("answers 404 for events before a topic is saved", async () => {
    const response = await sns(
      source.id,
      confirmation(fake.identity, "SubscriptionConfirmation"),
    );
    expect(response.statusCode).toBe(404);
    expect(fake.fetched).not.toContain(subscribeUrl);
  });

  it("saves the topic and creates the event destination", async () => {
    const invalid = await http(
      "PUT",
      `/v1/sending-sources/${source.id}/event-topic`,
      { topicArn: "arn:aws:sns:eu-west-1:123456789012:events.fifo" },
    );
    expect(invalid.status).toBe(400);
    expect(invalid.body).toMatchObject({ field: "topicArn" });

    fake.state.denyDestination = true;
    const manual = await http<{
      source: SendingSourceDto;
      destination: string;
      error: { code: string; message: string } | null;
    }>("PUT", `/v1/sending-sources/${source.id}/event-topic`, { topicArn });
    expect(manual.status).toBe(200);
    expect(manual.body.destination).toBe("manual");
    expect(manual.body.error?.code).toBe("insufficient_permission");
    expect(manual.body.error?.message).toContain("ses:CreateConfigurationSet");

    fake.state.denyDestination = false;
    const saved = await http<{
      source: SendingSourceDto;
      destination: string;
      error: unknown;
    }>("PUT", `/v1/sending-sources/${source.id}/event-topic`, { topicArn });
    expect(saved.body.error).toBeNull();
    expect(saved.body.source.details).toMatchObject({
      webhook: "pending",
      events: { topicArn, destination: "configured" },
    });
    const created = fake.commands.findLast(
      (entry) => entry.name === "CreateConfigurationSetEventDestinationCommand",
    );
    expect(created?.input).toMatchObject({
      ConfigurationSetName: "opencadence",
      EventDestination: { SnsDestination: { TopicArn: topicArn } },
    });
  });

  it("confirms the SNS subscription", async () => {
    const response = await sns(
      source.id,
      confirmation(fake.identity, "SubscriptionConfirmation"),
    );
    expect(response.statusCode).toBe(204);
    expect(fake.fetched).toContain(subscribeUrl);

    const listed = await service.list(alpha.workspaceId);
    expect(listed.sources[0]?.details.webhook).toBe("registered");
    const { events } = await service.events(alpha.workspaceId, {
      sourceId: source.id,
    });
    expect(events.map((event) => event.type)).toContain("webhook_registered");
  });

  it("suppresses the recipient of a permanent bounce once", async () => {
    const bounce = notification(
      fake.identity,
      {
        eventType: "Bounce",
        mail: {
          messageId: "010f0199-bounced-000000",
          timestamp: new Date().toISOString(),
          destination: ["gone@customer.test"],
        },
        bounce: {
          bounceType: "Permanent",
          bounceSubType: "General",
          timestamp: new Date().toISOString(),
          feedbackId: "feedback-1",
          bouncedRecipients: [
            {
              emailAddress: "gone@customer.test",
              status: "5.1.1",
              diagnosticCode: "smtp; 550 5.1.1 user unknown",
            },
          ],
        },
      },
      { MessageId: "sns-bounce-1" },
    );

    const first = await sns(source.id, bounce);
    const replay = await sns(source.id, bounce);
    expect(first.statusCode).toBe(204);
    expect(replay.statusCode).toBe(204);

    const blocked = await suppression.findBlocked(
      alpha.workspaceId,
      ["gone@customer.test"],
      "transactional",
    );
    expect(blocked.get("gone@customer.test")).toBe("bounced");
    const elsewhere = await suppression.findBlocked(
      beta.workspaceId,
      ["gone@customer.test"],
      "transactional",
    );
    expect(elsewhere.size).toBe(0);

    const { events } = await service.events(alpha.workspaceId, {
      sourceId: source.id,
      severity: "warning",
    });
    expect(
      events.filter(
        (event) => event.type === "provider_event" && event.code === "bounced",
      ),
    ).toHaveLength(1);
  });

  it("rejects a forged message, another topic, and a webhook-style body", async () => {
    const complaint = {
      eventType: "Complaint",
      mail: {
        messageId: "010f0199-complaint-000000",
        destination: ["innocent@customer.test"],
      },
      complaint: {
        complainedRecipients: [{ emailAddress: "innocent@customer.test" }],
        timestamp: new Date().toISOString(),
        feedbackId: "feedback-2",
      },
    };
    const signed = notification(fake.identity, complaint, {
      MessageId: "sns-forged-1",
    });

    const tampered = await sns(source.id, {
      ...signed,
      Message: JSON.stringify({
        ...complaint,
        mail: { ...complaint.mail, destination: ["victim@customer.test"] },
      }),
    });
    expect(tampered.statusCode).toBe(401);

    const stranger = createSigningIdentity();
    const forged = await sns(
      source.id,
      notification(stranger, complaint, { MessageId: "sns-forged-2" }),
    );
    expect(forged.statusCode).toBe(401);

    const otherTopic = await sns(
      source.id,
      notification(fake.identity, complaint, {
        MessageId: "sns-forged-3",
        TopicArn: "arn:aws:sns:eu-west-1:999999999999:someone-else",
      }),
    );
    expect(otherTopic.statusCode).toBe(401);

    const plain = await app.inject({
      method: "POST",
      url: `/v1/provider-webhooks/ses/${source.id}`,
      headers: { "content-type": "application/json" },
      payload: JSON.stringify(complaint),
    });
    expect(plain.statusCode).toBe(401);

    const wrongType = await sns(source.id, signed).then(() =>
      app.inject({
        method: "POST",
        url: `/v1/provider-webhooks/resend/${source.id}`,
        headers: { "content-type": "text/plain" },
        payload: JSON.stringify(signed),
      }),
    );
    expect(wrongType.statusCode).toBe(404);

    const blocked = await suppression.findBlocked(
      alpha.workspaceId,
      ["victim@customer.test"],
      "campaign",
    );
    expect(blocked.size).toBe(0);
  });

  it("finds an email by the Message-ID Amazon SES assigned", async () => {
    const assigned = "<010f0199-assigned-000000@eu-west-1.amazonses.com>";
    await db.insert(schema.messages).values({
      workspaceId: alpha.workspaceId,
      sourceId: source.id,
      kind: "campaign",
      status: "sent",
      fromEmail: "hello@example.com",
      toEmails: ["reader@customer.test"],
      subject: "Hello",
      rfcMessageId: assigned,
      providerMessageId: "010f0199-assigned-000000",
      sentAt: new Date(),
    });

    const found = await dispatch.findByRfcMessageId(
      alpha.workspaceId,
      assigned,
    );
    expect(found?.subject).toBe("Hello");
    expect(
      (
        await dispatch.findByRfcMessageId(
          alpha.workspaceId,
          assigned.slice(1, -1),
        )
      )?.id,
    ).toBe(found?.id);
    expect(
      await dispatch.findByRfcMessageId(beta.workspaceId, assigned),
    ).toBeNull();
    expect(
      await dispatch.findByRfcMessageId(
        alpha.workspaceId,
        "<010f0199-assigned-000000@elsewhere.test>",
      ),
    ).toBeNull();
  });

  it("keeps sources of one workspace out of reach of another", async () => {
    const listed = await http<{ sources: unknown[] }>(
      "GET",
      "/v1/sending-sources",
      undefined,
      beta,
    );
    expect(listed.body.sources).toHaveLength(0);

    for (const [method, path, payload] of [
      ["PUT", "event-topic", { topicArn }],
      ["POST", "test", undefined],
      ["POST", "reply-detection", undefined],
      ["DELETE", "reply-detection", undefined],
    ] as const) {
      const response = await http(
        method,
        `/v1/sending-sources/${source.id}/${path}`,
        payload,
        beta,
      );
      expect(response.status).toBe(404);
    }
  });

  it("accepts an API key and refuses reply detection for a provider account", async () => {
    const listed = await app.inject({
      method: "GET",
      url: "/v1/sending-sources",
      headers: { "x-api-key": apiKey },
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.body).not.toContain(secretAccessKey);

    const response = await http(
      "POST",
      `/v1/sending-sources/${source.id}/reply-detection`,
    );
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("not_supported");
  });

  it("marks the webhook as gone after an unsubscribe confirmation", async () => {
    const response = await sns(
      source.id,
      confirmation(fake.identity, "UnsubscribeConfirmation", {
        MessageId: "sns-unsubscribe-1",
      }),
    );
    expect(response.statusCode).toBe(204);
    const listed = await service.list(alpha.workspaceId);
    expect(listed.sources[0]?.details.webhook).toBe("not_registered");
  });
});
