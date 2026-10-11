import { VersioningType } from "@nestjs/common";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { type Db, eq, schema } from "@workspace/db";
import type { FetchLike } from "@workspace/integration-core";
import {
  createGmailAdapter,
  gmailReadScope,
  gmailSendScope,
} from "@workspace/integration-gmail";
import { createOutlookAdapter } from "@workspace/integration-outlook";
import { AppModule } from "../src/app/app.module";
import { DATABASE } from "../src/infra/database/database.module";
import { AdapterRegistry } from "../src/modules/integrations/adapter-registry";
import {
  type SendingSourceDto,
  SendingSourcesService,
} from "../src/modules/integrations/sending-sources.service";
import {
  createApiKey,
  createWorkspaceSessions,
  type TestWorkspace,
} from "./support/workspace-session";

const secrets = {
  googleClient: "google-client-secret-value",
  microsoftClient: "microsoft-client-secret-value",
  refresh: "refresh-token-value",
  access: "access-token-value",
};

type Listing = {
  sources: SendingSourceDto[];
  connectable: Record<string, boolean>;
  replyDetection: Record<string, boolean>;
  redirectUris: Record<string, string>;
};

function fakeProviders() {
  const state = {
    gmailScope: `openid email ${gmailSendScope}`,
    gmailAccount: { sub: "google-ada", email: "ada@gmail.test" },
    outlookScope: "openid email User.Read Mail.Send",
    outlookAccount: { id: "ms-grace", mail: "Grace@Outlook.test" },
    gmailReadEnabled: true,
    outlookConfigured: true,
    tokenCalls: 0,
  };
  const requests: { url: string; method: string; body: string }[] = [];
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json" },
    });
  const fetch: FetchLike = async (input, init) => {
    const url = String(input);
    requests.push({
      url,
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : "",
    });
    if (url === "https://oauth2.googleapis.com/token") {
      state.tokenCalls += 1;
      return json({
        access_token: `${secrets.access}-${state.tokenCalls}`,
        refresh_token: `${secrets.refresh}-${state.tokenCalls}`,
        expires_in: 3600,
        scope: state.gmailScope,
      });
    }
    if (url.startsWith("https://openidconnect.googleapis.com/")) {
      return json(state.gmailAccount);
    }
    if (url.startsWith("https://login.microsoftonline.com/")) {
      state.tokenCalls += 1;
      return json({
        access_token: `${secrets.access}-${state.tokenCalls}`,
        refresh_token: `${secrets.refresh}-${state.tokenCalls}`,
        expires_in: 3600,
        scope: state.outlookScope,
      });
    }
    if (url.startsWith("https://graph.microsoft.com/v1.0/me?")) {
      return json(state.outlookAccount);
    }
    return new Response("{}", { status: 404 });
  };

  const google = {
    clientId: "client.apps.googleusercontent.com",
    clientSecret: secrets.googleClient,
    fetch,
  };
  const microsoft = {
    clientId: "11112222-bbbb-3333-cccc-4444dddd5555",
    clientSecret: secrets.microsoftClient,
    fetch,
  };
  const sendOnly = {
    gmail: createGmailAdapter(google),
    outlook: createOutlookAdapter(microsoft),
  };
  const withInbox = {
    gmail: createGmailAdapter({ ...google, inboxAccess: true }),
    outlook: createOutlookAdapter({ ...microsoft, inboxAccess: true }),
  };
  const find = (type: string) => {
    if (type === "gmail") {
      return state.gmailReadEnabled ? withInbox.gmail : sendOnly.gmail;
    }
    if (type === "outlook" && state.outlookConfigured) {
      return withInbox.outlook;
    }
    return null;
  };
  const registry = {
    find,
    has: (type: string) => find(type) !== null,
    oauth: (type: string, access: "send" | "inbox") => {
      const primary = find(type);
      if (!primary) {
        return null;
      }
      if (access === "inbox") {
        return primary.inbox?.listReceived ? (primary.oauth ?? null) : null;
      }
      return type === "gmail"
        ? (sendOnly.gmail.oauth ?? null)
        : (sendOnly.outlook.oauth ?? null);
    },
  };
  return { registry, state, requests };
}

describe("Gmail and Outlook mailboxes (e2e)", () => {
  let app: NestFastifyApplication;
  let db: Db;
  let service: SendingSourcesService;
  let sessions: ReturnType<typeof createWorkspaceSessions>;
  let alpha: TestWorkspace;
  let beta: TestWorkspace;
  let apiKey = "";
  const fake = fakeProviders();
  const responses: string[] = [];

  async function http<T = Record<string, unknown>>(
    method: "GET" | "POST" | "DELETE",
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

  async function callback(
    provider: string,
    query: Record<string, string>,
    cookie: string | null = alpha.owner.cookie,
  ) {
    const response = await app.inject({
      method: "GET",
      url: `/v1/sending-sources/${provider}/callback?${new URLSearchParams(query)}`,
      headers: cookie ? { cookie } : {},
    });
    expect(response.statusCode).toBe(302);
    const location = new URL(String(response.headers.location));
    expect(location.origin + location.pathname).toBe(
      "http://localhost:3000/app/integrations",
    );
    return location.searchParams;
  }

  async function authorize(path: string, workspace: TestWorkspace = alpha) {
    const response = await http<{ url: string }>("POST", path, {}, workspace);
    expect(response.status).toBe(200);
    return new URL(response.body.url);
  }

  async function sources(workspace: TestWorkspace = alpha) {
    const listed = await http<Listing>(
      "GET",
      "/v1/sending-sources",
      undefined,
      workspace,
    );
    return listed.body;
  }

  async function sourceOf(type: string) {
    const found = (await sources()).sources.find(
      (source) => source.integrationType === type,
    );
    if (!found) {
      throw new Error(`No ${type} source is connected.`);
    }
    return found;
  }

  async function storedScopes(sourceId: string) {
    const [row] = await db
      .select()
      .from(schema.sendingSourceCredentials)
      .where(eq(schema.sendingSourceCredentials.sourceId, sourceId));
    return row?.scopes ?? [];
  }

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AdapterRegistry)
      .useValue(fake.registry)
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
    sessions = createWorkspaceSessions(app, "sources-mailboxes-e2e");
    alpha = await sessions.workspace();
    beta = await sessions.workspace();
    apiKey = await createApiKey(app, alpha.owner, alpha.workspaceId);
  });

  afterAll(async () => {
    await sessions.cleanup();
    await app.close();
  });

  describe("Outlook", () => {
    it("says so when Outlook is not configured on the server", async () => {
      fake.state.outlookConfigured = false;
      const listed = await sources();
      expect(listed.connectable).toEqual({ gmail: true, outlook: false });
      expect(listed.redirectUris.outlook).toBe(
        "http://localhost:3000/api/v1/sending-sources/outlook/callback",
      );

      const response = await http(
        "POST",
        "/v1/sending-sources/outlook/authorize",
        {},
      );
      expect(response.status).toBe(400);
      expect(response.body.code).toBe("outlook_not_configured");

      const returned = await callback("outlook", { code: "c", state: "s" });
      expect(returned.get("connect_error")).toBe("not_configured");
      expect(returned.get("provider")).toBe("outlook");
      fake.state.outlookConfigured = true;
    });

    it("needs a signed-in user, and knows only gmail and outlook", async () => {
      const viaKey = await app.inject({
        method: "POST",
        url: "/v1/sending-sources/outlook/authorize",
        headers: { "x-api-key": apiKey },
        payload: {},
      });
      expect([401, 403]).toContain(viaKey.statusCode);

      const unknown = await http(
        "POST",
        "/v1/sending-sources/yahoo/authorize",
        {},
      );
      expect(unknown.status).toBe(404);
    });

    it("returns a consent address that asks for sending only", async () => {
      const url = await authorize("/v1/sending-sources/outlook/authorize");
      expect(url.origin + url.pathname).toBe(
        "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      );
      const scopes = url.searchParams.get("scope")?.split(" ") ?? [];
      expect(scopes).toContain("Mail.Send");
      expect(scopes).not.toContain("Mail.Read");
      expect(url.searchParams.get("redirect_uri")).toBe(
        "http://localhost:3000/api/v1/sending-sources/outlook/callback",
      );
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");
      expect(url.searchParams.get("state")?.length).toBeGreaterThan(20);
    });

    it("reports a denied consent and uses each state once", async () => {
      const url = await authorize("/v1/sending-sources/outlook/authorize");
      const state = url.searchParams.get("state") ?? "";

      const denied = await callback("outlook", {
        error: "access_denied",
        state,
      });
      expect(denied.get("connect_error")).toBe("access_denied");

      const replayed = await callback("outlook", { code: "code", state });
      expect(replayed.get("connect_error")).toBe("state_expired");
      expect((await sources()).sources).toHaveLength(0);
    });

    it("rejects an unknown state, a missing state, and another user", async () => {
      expect(
        (await callback("outlook", { code: "code", state: "made-up" })).get(
          "connect_error",
        ),
      ).toBe("state_expired");
      expect(
        (await callback("outlook", { code: "code" })).get("connect_error"),
      ).toBe("state_expired");

      const url = await authorize("/v1/sending-sources/outlook/authorize");
      const state = url.searchParams.get("state") ?? "";
      const stranger = await callback(
        "outlook",
        { code: "code", state },
        beta.owner.cookie,
      );
      expect(stranger.get("connect_error")).toBe("failed");

      const gmailUrl = await authorize("/v1/sending-sources/gmail/authorize");
      const crossed = await callback("outlook", {
        code: "code",
        state: gmailUrl.searchParams.get("state") ?? "",
      });
      expect(crossed.get("connect_error")).toBe("state_expired");
      expect((await sources()).sources).toHaveLength(0);
    });

    it("reports a missing send permission", async () => {
      fake.state.outlookScope = "openid email User.Read";
      const url = await authorize("/v1/sending-sources/outlook/authorize");
      const returned = await callback("outlook", {
        code: "code",
        state: url.searchParams.get("state") ?? "",
      });
      expect(returned.get("connect_error")).toBe("missing_scope");
      fake.state.outlookScope = "openid email User.Read Mail.Send";
    });

    it("connects the mailbox for sending only", async () => {
      const url = await authorize("/v1/sending-sources/outlook/authorize");
      const returned = await callback("outlook", {
        code: "auth-code",
        state: url.searchParams.get("state") ?? "",
      });
      expect(returned.get("connected")).toBe("outlook");

      const exchange = fake.requests.findLast((request) =>
        request.url.startsWith("https://login.microsoftonline.com/"),
      );
      const form = new URLSearchParams(exchange?.body);
      expect(form.get("code")).toBe("auth-code");
      expect(form.get("code_verifier")?.length).toBeGreaterThan(40);

      const outlook = await sourceOf("outlook");
      expect(outlook).toMatchObject({
        name: "grace@outlook.test",
        email: "grace@outlook.test",
        status: "active",
        replyDetection: "off",
      });
      expect(service.canDetectReplies(outlook)).toBe(false);
      expect(service.hasInbox("outlook")).toBe(false);
      expect(await storedScopes(outlook.id)).not.toContain("Mail.Read");
    });

    it("turns reply detection on only after Mail.Read is granted", async () => {
      const outlook = await sourceOf("outlook");
      const url = await authorize(
        `/v1/sending-sources/${outlook.id}/reply-detection`,
      );
      expect(url.searchParams.get("scope")?.split(" ")).toContain("Mail.Read");
      expect(url.searchParams.get("login_hint")).toBe("grace@outlook.test");

      fake.state.outlookScope = "openid email User.Read Mail.Send Mail.Read";
      const returned = await callback("outlook", {
        code: "code",
        state: url.searchParams.get("state") ?? "",
      });
      expect(returned.get("reply_detection")).toBe("outlook");

      const after = await sourceOf("outlook");
      expect(after.replyDetection).toBe("on");
      expect(service.canDetectReplies(after)).toBe(true);
      expect(await storedScopes(after.id)).toContain("Mail.Read");
      expect((await sources()).sources).toHaveLength(1);
    });

    it("reconnecting without the read permission stops reply detection", async () => {
      fake.state.outlookScope = "openid email User.Read Mail.Send";
      const url = await authorize("/v1/sending-sources/outlook/authorize");
      const returned = await callback("outlook", {
        code: "code",
        state: url.searchParams.get("state") ?? "",
      });
      expect(returned.get("connected")).toBe("outlook");
      const outlook = await sourceOf("outlook");
      expect(outlook.replyDetection).toBe("off");
      expect(service.canDetectReplies(outlook)).toBe(false);
      expect((await sources()).sources).toHaveLength(1);
    });
  });

  describe("Gmail reply detection", () => {
    let gmail: SendingSourceDto;

    it("connects Gmail for sending only", async () => {
      const url = await authorize("/v1/sending-sources/gmail/authorize");
      expect(url.searchParams.get("scope")?.split(" ")).not.toContain(
        gmailReadScope,
      );
      const returned = await callback("gmail", {
        code: "code",
        state: url.searchParams.get("state") ?? "",
      });
      expect(returned.get("connected")).toBe("gmail");

      gmail = await sourceOf("gmail");
      expect(gmail.replyDetection).toBe("off");
      expect(service.canDetectReplies(gmail)).toBe(false);
      expect((await sources()).replyDetection).toEqual({
        gmail: true,
        outlook: true,
      });
    });

    it("explains that it is not enabled on this server", async () => {
      fake.state.gmailReadEnabled = false;
      const listed = await sources();
      expect(listed.replyDetection.gmail).toBe(false);
      expect(
        listed.sources.find((source) => source.id === gmail.id)?.replyDetection,
      ).toBe("not_enabled");

      const response = await http(
        "POST",
        `/v1/sending-sources/${gmail.id}/reply-detection`,
      );
      expect(response.status).toBe(409);
      expect(response.body.code).toBe("reply_detection_disabled");
      expect(String(response.body.message)).toContain("IMAP/SMTP");
      fake.state.gmailReadEnabled = true;
    });

    it("refuses a grant that started before the server turned it off", async () => {
      const url = await authorize(
        `/v1/sending-sources/${gmail.id}/reply-detection`,
      );
      fake.state.gmailReadEnabled = false;
      const returned = await callback("gmail", {
        code: "code",
        state: url.searchParams.get("state") ?? "",
      });
      expect(returned.get("connect_error")).toBe("reply_detection_disabled");
      fake.state.gmailReadEnabled = true;
    });

    it("asks Google for the read scope on top of what was granted", async () => {
      const url = await authorize(
        `/v1/sending-sources/${gmail.id}/reply-detection`,
      );
      expect(url.searchParams.get("scope")?.split(" ")).toEqual(
        expect.arrayContaining([gmailSendScope, gmailReadScope]),
      );
      expect(url.searchParams.get("include_granted_scopes")).toBe("true");
      expect(url.searchParams.get("login_hint")).toBe("ada@gmail.test");
    });

    it("stays off when the read scope was not granted", async () => {
      const url = await authorize(
        `/v1/sending-sources/${gmail.id}/reply-detection`,
      );
      const before = fake.state.tokenCalls;
      const returned = await callback("gmail", {
        code: "code",
        state: url.searchParams.get("state") ?? "",
      });
      expect(returned.get("connect_error")).toBe("read_scope_not_granted");
      expect(returned.get("provider")).toBe("gmail");
      expect(fake.state.tokenCalls).toBe(before + 1);

      const after = await sourceOf("gmail");
      expect(after.replyDetection).toBe("off");
      expect(after.status).toBe("active");
      expect(service.canDetectReplies(after)).toBe(false);
      expect(await storedScopes(after.id)).not.toContain(gmailReadScope);
    });

    it("refuses a grant made with a different Google account", async () => {
      const url = await authorize(
        `/v1/sending-sources/${gmail.id}/reply-detection`,
      );
      fake.state.gmailScope = `openid email ${gmailSendScope} ${gmailReadScope}`;
      fake.state.gmailAccount = { sub: "google-eve", email: "eve@gmail.test" };
      const returned = await callback("gmail", {
        code: "code",
        state: url.searchParams.get("state") ?? "",
      });
      expect(returned.get("connect_error")).toBe("account_mismatch");
      fake.state.gmailAccount = { sub: "google-ada", email: "ada@gmail.test" };
      expect((await sourceOf("gmail")).replyDetection).toBe("off");
      expect(await storedScopes(gmail.id)).not.toContain(gmailReadScope);
    });

    it("turns on when the read scope was granted, for that source only", async () => {
      const url = await authorize(
        `/v1/sending-sources/${gmail.id}/reply-detection`,
      );
      const returned = await callback("gmail", {
        code: "code",
        state: url.searchParams.get("state") ?? "",
      });
      expect(returned.get("reply_detection")).toBe("gmail");

      const listed = await sources();
      const after = listed.sources.find((source) => source.id === gmail.id);
      const outlook = listed.sources.find(
        (source) => source.integrationType === "outlook",
      );
      if (!after || !outlook) {
        throw new Error("A source is missing.");
      }
      expect(after.replyDetection).toBe("on");
      expect(service.canDetectReplies(after)).toBe(true);
      expect(service.canDetectReplies(outlook)).toBe(false);
      expect(service.hasInbox("gmail")).toBe(false);
      expect(service.readsMail("gmail")).toBe(true);
      expect(await storedScopes(after.id)).toContain(gmailReadScope);

      const { events } = await service.events(alpha.workspaceId, {
        sourceId: gmail.id,
      });
      expect(events.map((event) => event.type)).toEqual(
        expect.arrayContaining([
          "reply_detection_enabled",
          "reply_detection_not_granted",
        ]),
      );
    });

    it("stops detecting when the server turns the read scope off", async () => {
      fake.state.gmailReadEnabled = false;
      const off = await sourceOf("gmail");
      expect(off.replyDetection).toBe("not_enabled");
      expect(service.canDetectReplies(off)).toBe(false);
      fake.state.gmailReadEnabled = true;
    });

    it("turns off on request and keeps the mailbox connected", async () => {
      const response = await http<SendingSourceDto>(
        "DELETE",
        `/v1/sending-sources/${gmail.id}/reply-detection`,
      );
      expect(response.status).toBe(200);
      expect(response.body.replyDetection).toBe("off");
      expect(response.body.status).toBe("active");
      expect(service.canDetectReplies(response.body)).toBe(false);

      const again = await http<SendingSourceDto>(
        "DELETE",
        `/v1/sending-sources/${gmail.id}/reply-detection`,
      );
      expect(again.status).toBe(200);
    });
  });

  it("keeps mailboxes of one workspace out of reach of another", async () => {
    const gmail = await sourceOf("gmail");
    expect((await sources(beta)).sources).toHaveLength(0);
    for (const method of ["POST", "DELETE"] as const) {
      const response = await http(
        method,
        `/v1/sending-sources/${gmail.id}/reply-detection`,
        undefined,
        beta,
      );
      expect(response.status).toBe(404);
    }
  });

  it("stores tokens encrypted and never returns them", async () => {
    const rows = await db
      .select()
      .from(schema.sendingSourceCredentials)
      .where(
        eq(schema.sendingSourceCredentials.workspaceId, alpha.workspaceId),
      );
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.authType).toBe("oauth2");
      expect(row.secretCiphertext.toString("utf8")).not.toContain(
        secrets.refresh,
      );
      expect(row.accessTokenCiphertext?.toString("utf8")).not.toContain(
        secrets.access,
      );
    }
    await http("GET", "/v1/sending-sources/events");
    expect(responses.length).toBeGreaterThan(10);
    for (const body of responses) {
      for (const secret of Object.values(secrets)) {
        expect(body).not.toContain(secret);
      }
    }
  });
});
