import { randomInt, randomUUID } from "node:crypto";
import { getQueueToken } from "@nestjs/bullmq";
import { VersioningType } from "@nestjs/common";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { and, type Db, eq, schema, sql } from "@workspace/db";
import { messageToken } from "@workspace/email-renderer";
import type { Queue } from "bullmq";
import { AppModule } from "../src/app/app.module";
import { DATABASE } from "../src/infra/database/database.module";
import { TrackingKeys } from "../src/infra/tracking-keys/tracking-keys";
import { SEND_QUEUE } from "../src/modules/dispatch/dispatch.constants";
import { confirmToken, renderToken } from "../src/modules/forms/form-tokens";
import {
  formRateRules,
  honeypotField,
  renderTokenField,
} from "../src/modules/forms/forms.constants";
import { FormsRepository } from "../src/modules/forms/forms.repository";
import type { Form, Submission } from "../src/modules/forms/forms.service";
import { FormsMaintenanceProcessor } from "../src/modules/forms/jobs/forms-maintenance.processor";
import type {
  ConfirmResult,
  PublicForm,
} from "../src/modules/forms/public-forms.service";
import {
  createWorkspaceSessions,
  type TestWorkspace,
} from "./support/workspace-session";

type Method = "GET" | "POST" | "PATCH" | "DELETE" | "OPTIONS";

type StubbedQueue = {
  add: (...args: unknown[]) => Promise<unknown>;
  addBulk: (...args: unknown[]) => Promise<unknown>;
};

const browser =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const appUrl = "http://localhost:3000";
const dayMs = 24 * 60 * 60 * 1000;

describe("Forms (e2e)", () => {
  let app: NestFastifyApplication;
  let db: Db;
  let secret: Buffer;
  let sessions: ReturnType<typeof createWorkspaceSessions>;
  let workspace: TestWorkspace;
  let other: TestWorkspace;
  let listId: string;
  let secondListId: string;
  let otherListId: string;
  let sourceId: string;
  const network = `10.${randomInt(1, 250)}.${randomInt(1, 250)}`;
  let host = 0;

  function freshIp() {
    host += 1;
    return `${network}.${host}`;
  }

  function address(label = "reader") {
    return `${label}-${randomUUID()}@example.com`;
  }

  function api(
    member: TestWorkspace,
    method: Method,
    url: string,
    payload?: object,
  ) {
    return app.inject({
      method,
      url,
      headers: { cookie: member.owner.cookie },
      payload,
    });
  }

  function visit(
    method: Method,
    url: string,
    options: {
      ip?: string;
      payload?: string | object;
      contentType?: string;
      userAgent?: string;
    } = {},
  ) {
    const headers: Record<string, string> = {
      "x-forwarded-for": options.ip ?? freshIp(),
      "user-agent": options.userAgent ?? browser,
    };
    if (options.contentType) {
      headers["content-type"] = options.contentType;
    }
    return app.inject({ method, url, headers, payload: options.payload });
  }

  function submit(
    form: Form,
    payload: Record<string, unknown>,
    options: { ip?: string } = {},
  ) {
    return visit("POST", `/v1/public/forms/${form.publicId}/submit`, {
      payload,
      ...options,
    });
  }

  async function createList(target: TestWorkspace, name: string) {
    const [list] = await db
      .insert(schema.lists)
      .values({
        workspaceId: target.workspaceId,
        name: `${name} ${randomUUID()}`,
      })
      .returning({ id: schema.lists.id });
    if (!list) {
      throw new Error("The test list was not created.");
    }
    return list.id;
  }

  async function createSource(
    target: TestWorkspace,
    values: { email?: string | null; status?: string; isDefault?: boolean },
  ) {
    const [source] = await db
      .insert(schema.sendingSources)
      .values({
        workspaceId: target.workspaceId,
        integrationType: "resend",
        name: `Forms source ${randomUUID()}`,
        email: values.email ?? null,
        status: values.status ?? "active",
        isDefault: values.isDefault ?? false,
      })
      .returning({ id: schema.sendingSources.id });
    if (!source) {
      throw new Error("The test source was not created.");
    }
    return source.id;
  }

  async function createForm(
    patch: Record<string, unknown> = {},
    target: TestWorkspace = workspace,
  ): Promise<Form> {
    const created = await api(target, "POST", "/v1/forms", {
      name: `Form ${randomUUID()}`,
    });
    expect(created.statusCode).toBe(201);
    const updated = await api(
      target,
      "PATCH",
      `/v1/forms/${created.json().id}`,
      { listIds: [listId], sourceId, ...patch },
    );
    expect(updated.statusCode).toBe(200);
    return updated.json();
  }

  async function publishedForm(patch: Record<string, unknown> = {}) {
    const form = await createForm(patch);
    const published = await api(
      workspace,
      "POST",
      `/v1/forms/${form.id}/publish`,
    );
    expect(published.statusCode).toBe(200);
    return published.json() as Form;
  }

  function submissionsOf(form: Form) {
    return db
      .select()
      .from(schema.formSubmissions)
      .where(eq(schema.formSubmissions.formId, form.id))
      .orderBy(schema.formSubmissions.createdAt);
  }

  async function contactOf(email: string, target = workspace) {
    const [row] = await db
      .select()
      .from(schema.contacts)
      .where(
        and(
          eq(schema.contacts.workspaceId, target.workspaceId),
          eq(schema.contacts.email, email),
        ),
      );
    return row ?? null;
  }

  async function memberStatus(list: string, contactId: string) {
    const [row] = await db
      .select({ status: schema.listMembers.status })
      .from(schema.listMembers)
      .where(
        and(
          eq(schema.listMembers.listId, list),
          eq(schema.listMembers.contactId, contactId),
        ),
      );
    return row?.status ?? null;
  }

  function messagesTo(email: string) {
    return db
      .select()
      .from(schema.messages)
      .where(
        and(
          eq(schema.messages.workspaceId, workspace.workspaceId),
          sql`${schema.messages.toEmails} = array[${email}]::text[]`,
        ),
      );
  }

  async function confirmationEmail(email: string) {
    const [message] = await messagesTo(email);
    if (!message) {
      throw new Error("No confirmation email was queued.");
    }
    const [content] = await db
      .select()
      .from(schema.messageContents)
      .where(eq(schema.messageContents.messageId, message.id));
    const html = content?.html ?? "";
    const token = /\/f\/confirm\/([A-Za-z0-9_-]+)"/.exec(html)?.[1];
    if (!token) {
      throw new Error("The confirmation email has no confirm link.");
    }
    return { message, html, text: content?.text ?? "", token };
  }

  async function suppress(email: string, reason: string) {
    await db.insert(schema.suppressions).values({
      workspaceId: workspace.workspaceId,
      email,
      reason,
      origin: "user",
    });
  }

  function suppressionsFor(email: string) {
    return db
      .select({ reason: schema.suppressions.reason })
      .from(schema.suppressions)
      .where(
        and(
          eq(schema.suppressions.workspaceId, workspace.workspaceId),
          eq(schema.suppressions.email, email),
        ),
      );
  }

  async function counts(form: Form) {
    const response = await api(workspace, "GET", `/v1/forms/${form.id}`);
    const body = response.json() as Form;
    return {
      submissions: body.submissionCount,
      confirmed: body.confirmedCount,
    };
  }

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
      { bodyParser: false },
    );
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    db = app.get<Db>(DATABASE);
    secret = app.get(TrackingKeys).secret;
    const sendQueue = app.get<StubbedQueue>(getQueueToken(SEND_QUEUE));
    vi.spyOn(sendQueue, "add").mockImplementation(async () => ({}));
    vi.spyOn(sendQueue, "addBulk").mockImplementation(async () => []);

    sessions = createWorkspaceSessions(app, "forms-e2e");
    workspace = await sessions.workspace();
    other = await sessions.workspace();
    listId = await createList(workspace, "Newsletter");
    secondListId = await createList(workspace, "Product news");
    otherListId = await createList(other, "Other list");
    sourceId = await createSource(workspace, {
      email: "hello@northwind.example",
      isDefault: true,
    });
    await db.insert(schema.workspaceBrandSettings).values({
      workspaceId: workspace.workspaceId,
      brandName: "Northwind <Traders>",
    });
  });

  afterAll(async () => {
    await sessions.cleanup();
    await app.close();
  });

  describe("managing forms", () => {
    it("needs a session", async () => {
      const response = await app.inject({ method: "GET", url: "/v1/forms" });
      expect(response.statusCode).toBe(401);
    });

    it("creates a draft with an email field, defaults and share snippets", async () => {
      const name = `Welcome ${randomUUID()}`;
      const created = await api(workspace, "POST", "/v1/forms", { name });
      expect(created.statusCode).toBe(201);
      const form = created.json() as Form;
      expect(form).toMatchObject({
        name,
        status: "draft",
        doubleOptIn: true,
        lists: [],
        submissionCount: 0,
        confirmedCount: 0,
        source: null,
        url: `${appUrl}/f/${form.publicId}`,
        fields: [
          {
            key: "email",
            label: "Email",
            required: true,
            type: "email",
            options: null,
          },
        ],
        settings: {
          title: "Subscribe to our newsletter",
          description: "",
          buttonLabel: "Subscribe",
          successTitle: "Check your inbox",
          redirectUrl: null,
          confirmSubject: "Confirm your subscription",
          fromEmail: null,
        },
      });
      expect(form.publicId).toMatch(/^[a-z0-9]{16}$/);
      expect(form.settings.consentText).not.toBe("");
      expect(form.embed.url).toBe(form.url);
      expect(form.embed.iframe).toContain(`src="${form.url}?embed=1"`);
      expect(form.embed.html).toContain(
        `action="${appUrl}/api/v1/public/forms/${form.publicId}/submit" method="post"`,
      );
      expect(form.embed.html).toContain(`name="${honeypotField}"`);
      expect(form.embed.html).toContain('name="email" type="email"');

      const duplicate = await api(workspace, "POST", "/v1/forms", {
        name: name.toUpperCase(),
      });
      expect(duplicate.statusCode).toBe(409);
      expect(duplicate.json().code).toBe("name_taken");
      const unnamed = await api(workspace, "POST", "/v1/forms", { name: " " });
      expect(unnamed.statusCode).toBe(400);

      const listed = await api(workspace, "GET", "/v1/forms");
      const summary = (listed.json().forms as Form[]).find(
        (entry) => entry.id === form.id,
      );
      expect(summary).toMatchObject({ id: form.id, name, status: "draft" });
      expect(summary).not.toHaveProperty("embed");
    });

    it("updates lists, fields, texts and the source, and escapes the snippets", async () => {
      const field = await api(workspace, "POST", "/v1/contact-fields", {
        label: `Plan ${randomUUID().slice(0, 8)}`,
        type: "select",
        options: ["Free", "Pro <b>"],
      });
      expect(field.statusCode).toBe(201);
      const key = `fields.${field.json().key}`;
      const form = await createForm({
        name: `Renamed ${randomUUID()}`,
        listIds: [listId, secondListId],
        doubleOptIn: false,
        fields: [
          { key: "first_name", label: 'Name "you"', required: true },
          { key, required: false },
          { key: "email", label: "Work email" },
        ],
        settings: {
          title: "Join <us>",
          buttonLabel: "Sign up & go",
          consentText: "We email <weekly>.",
          redirectUrl: "https://example.com/thanks?a=1&b=2",
        },
      });
      expect(form.doubleOptIn).toBe(false);
      expect(form.lists.map((list) => list.id).sort()).toEqual(
        [listId, secondListId].sort(),
      );
      expect(form.source?.id).toBe(sourceId);
      expect(form.fields.map((entry) => entry.key)).toEqual([
        "email",
        "first_name",
        key,
      ]);
      expect(form.fields[0]).toMatchObject({
        label: "Work email",
        required: true,
      });
      expect(form.fields[2]).toMatchObject({
        type: "select",
        options: ["Free", "Pro <b>"],
      });
      expect(form.settings).toMatchObject({
        title: "Join <us>",
        successTitle: "You are subscribed",
        redirectUrl: "https://example.com/thanks?a=1&b=2",
      });
      expect(form.embed.html).toContain("Name &quot;you&quot;");
      expect(form.embed.html).toContain("Sign up &amp; go");
      expect(form.embed.html).toContain("We email &lt;weekly&gt;.");
      expect(form.embed.html).toContain('<option value="Pro &lt;b&gt;">');
      expect(form.embed.html).not.toContain("<weekly>");
    });

    it("refuses invalid changes", async () => {
      const form = await createForm();
      const cases: [Record<string, unknown>, string][] = [
        [{ name: "" }, "name"],
        [{ doubleOptIn: "yes" }, "doubleOptIn"],
        [{ listIds: "all" }, "listIds"],
        [{ listIds: [otherListId] }, "listIds"],
        [{ listIds: [randomUUID()] }, "listIds"],
        [{ fields: [{ key: "timezone" }] }, "fields"],
        [{ fields: [{ key: "fields.not_a_field" }] }, "fields"],
        [
          { fields: Array.from({ length: 13 }, () => ({ key: "city" })) },
          "fields",
        ],
        [{ settings: { title: "x".repeat(121) } }, "settings.title"],
        [
          { settings: { redirectUrl: "javascript:alert(1)" } },
          "settings.redirectUrl",
        ],
        [{ settings: { fromEmail: "nope" } }, "settings.fromEmail"],
        [{ sourceId: randomUUID() }, "sourceId"],
        [{ sourceId: "nope" }, "sourceId"],
      ];
      for (const [patch, field] of cases) {
        const response = await api(
          workspace,
          "PATCH",
          `/v1/forms/${form.id}`,
          patch,
        );
        expect([field, response.statusCode]).toEqual([field, 400]);
        expect(response.json()).toMatchObject({ code: "validation", field });
      }
      const otherSource = await createSource(other, {
        email: "x@other.example",
      });
      const foreign = await api(workspace, "PATCH", `/v1/forms/${form.id}`, {
        sourceId: otherSource,
      });
      expect(foreign.statusCode).toBe(400);
    });

    it("keeps one workspace out of another's forms", async () => {
      const form = await publishedForm();
      await submit(form, { email: address() });
      const requests: [Method, string, object?][] = [
        ["GET", `/v1/forms/${form.id}`],
        ["PATCH", `/v1/forms/${form.id}`, { name: "Taken over" }],
        ["POST", `/v1/forms/${form.id}/publish`],
        ["POST", `/v1/forms/${form.id}/unpublish`],
        ["POST", `/v1/forms/${form.id}/archive`],
        ["GET", `/v1/forms/${form.id}/submissions`],
        ["DELETE", `/v1/forms/${form.id}`],
      ];
      for (const [method, url, payload] of requests) {
        const response = await api(other, method, url, payload);
        expect([url, response.statusCode]).toEqual([url, 404]);
      }
      const listed = await api(other, "GET", "/v1/forms");
      expect(listed.json().forms).toEqual([]);
      const still = await api(workspace, "GET", `/v1/forms/${form.id}`);
      expect(still.json()).toMatchObject({ status: "published" });
      expect((await submissionsOf(form)).length).toBe(1);
    });
  });

  describe("publishing", () => {
    it("refuses a form with no list, or with double opt-in and nothing to send from", async () => {
      const bare = await sessions.workspace();
      const bareListId = await createList(bare, "Bare list");
      const created = await api(bare, "POST", "/v1/forms", {
        name: `Bare ${randomUUID()}`,
      });
      const id = created.json().id as string;
      const refused = await api(bare, "POST", `/v1/forms/${id}/publish`);
      expect(refused.statusCode).toBe(409);
      expect(refused.json()).toMatchObject({
        code: "form_not_ready",
        field: "listIds",
      });
      expect(
        (refused.json().problems as { code: string }[]).map(
          (problem) => problem.code,
        ),
      ).toEqual(["no_lists", "no_source"]);

      await api(bare, "PATCH", `/v1/forms/${id}`, { listIds: [bareListId] });
      const noSource = await api(bare, "POST", `/v1/forms/${id}/publish`);
      expect(noSource.statusCode).toBe(409);
      expect(noSource.json().problems).toMatchObject([
        { code: "no_source", field: "sourceId" },
      ]);

      const paused = await createSource(bare, {
        email: "paused@bare.example",
        status: "paused",
      });
      await api(bare, "PATCH", `/v1/forms/${id}`, { sourceId: paused });
      const pausedSource = await api(bare, "POST", `/v1/forms/${id}/publish`);
      expect(pausedSource.json().problems).toMatchObject([
        { code: "source_paused" },
      ]);

      const keyOnly = await createSource(bare, { email: null });
      await api(bare, "PATCH", `/v1/forms/${id}`, { sourceId: keyOnly });
      const noFrom = await api(bare, "POST", `/v1/forms/${id}/publish`);
      expect(noFrom.statusCode).toBe(409);
      expect(noFrom.json().problems).toMatchObject([
        { code: "from_missing", field: "settings.fromEmail" },
      ]);

      await api(bare, "PATCH", `/v1/forms/${id}`, {
        settings: { fromEmail: "news@bare.example" },
      });
      const published = await api(bare, "POST", `/v1/forms/${id}/publish`);
      expect(published.statusCode).toBe(200);
      expect(published.json().status).toBe("published");

      const broken = await api(bare, "PATCH", `/v1/forms/${id}`, {
        listIds: [],
      });
      expect(broken.statusCode).toBe(409);
      expect(broken.json().code).toBe("form_not_ready");
      const kept = await api(bare, "GET", `/v1/forms/${id}`);
      expect(kept.json().lists).toHaveLength(1);
    });

    it("publishes without a source when double opt-in is off", async () => {
      const created = await api(other, "POST", "/v1/forms", {
        name: `Single ${randomUUID()}`,
      });
      const id = created.json().id as string;
      await api(other, "PATCH", `/v1/forms/${id}`, {
        listIds: [otherListId],
        doubleOptIn: false,
        sourceId: null,
      });
      await db
        .update(schema.sendingSources)
        .set({ status: "disconnected" })
        .where(eq(schema.sendingSources.workspaceId, other.workspaceId));
      const published = await api(other, "POST", `/v1/forms/${id}/publish`);
      expect(published.statusCode).toBe(200);
    });

    it("serves the public form only while it is published", async () => {
      const form = await createForm({
        fields: [{ key: "first_name", required: true }],
      });
      const url = `/v1/public/forms/${form.publicId}`;
      expect((await visit("GET", url)).statusCode).toBe(404);
      expect((await submit(form, { email: address() })).statusCode).toBe(404);

      await api(workspace, "POST", `/v1/forms/${form.id}/publish`);
      const shown = await visit("GET", url);
      expect(shown.statusCode).toBe(200);
      const body = shown.json() as PublicForm;
      expect(body).toMatchObject({
        name: form.name,
        brand: { name: "Northwind <Traders>", logoUrl: null },
        doubleOptIn: true,
        submitUrl: `${appUrl}/api/v1/public/forms/${form.publicId}/submit`,
        protection: { honeypotField, renderTokenField },
      });
      expect(body.fields.map((field) => field.key)).toEqual([
        "email",
        "first_name",
      ]);
      expect(body.settings).not.toHaveProperty("fromEmail");
      expect(body).not.toHaveProperty("id");
      expect(JSON.stringify(body)).not.toContain(workspace.workspaceId);
      expect(body.protection.renderToken).toMatch(/^[A-Za-z0-9_-]{20,}$/);

      for (const action of ["unpublish", "archive"]) {
        await api(workspace, "POST", `/v1/forms/${form.id}/publish`);
        expect((await visit("GET", url)).statusCode).toBe(200);
        await api(workspace, "POST", `/v1/forms/${form.id}/${action}`);
        expect((await visit("GET", url)).statusCode).toBe(404);
        expect((await submit(form, { email: address() })).statusCode).toBe(404);
      }
      expect(await submissionsOf(form)).toHaveLength(0);
      for (const bad of ["nope", "UPPERCASEUPPERCASE", "a".repeat(16)]) {
        expect((await visit("GET", `/v1/public/forms/${bad}`)).statusCode).toBe(
          404,
        );
      }
    });
  });

  describe("double opt-in", () => {
    it("stores a pending submission, sends one email with nothing the visitor typed, and subscribes on confirm", async () => {
      const form = await publishedForm({
        listIds: [listId, secondListId],
        fields: [
          { key: "first_name", required: true },
          { key: "company", required: false },
        ],
        settings: { consentText: "I agree to weekly emails." },
      });
      const email = address("Ada.Lovelace");
      const ip = freshIp();
      const marker = "ZZMARKER<script>alert(1)</script>";
      const response = await submit(
        form,
        {
          email: ` ${email.toUpperCase()} `,
          first_name: marker,
          company: "Analytical Engines",
          last_name: "not on the form",
          role: "admin",
        },
        { ip },
      );
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: "pending", redirectUrl: null });
      expect(response.headers["access-control-allow-origin"]).toBe("*");
      expect(response.headers["cache-control"]).toBe("no-store");

      const normalized = email.toLowerCase();
      const [submission] = await submissionsOf(form);
      expect(submission).toMatchObject({
        workspaceId: workspace.workspaceId,
        email: normalized,
        status: "pending",
        contactId: null,
        consentText: "I agree to weekly emails.",
        userAgent: browser,
        confirmedAt: null,
        data: { first_name: marker, company: "Analytical Engines" },
      });
      expect(JSON.stringify(submission)).not.toContain(ip);
      expect(await contactOf(normalized)).toBeNull();
      expect(await counts(form)).toEqual({ submissions: 1, confirmed: 0 });

      const sent = await confirmationEmail(normalized);
      expect(sent.message).toMatchObject({
        id: submission?.confirmationMessageId,
        kind: "transactional",
        status: "queued",
        sourceId,
        fromEmail: "hello@northwind.example",
        fromName: "Northwind <Traders>",
        subject: "Confirm your subscription",
        contactId: null,
        trackOpens: false,
        trackClicks: false,
      });
      expect(sent.html).toContain(`href="${appUrl}/f/confirm/${sent.token}"`);
      expect(sent.html).toContain("Northwind &lt;Traders&gt;");
      expect(sent.html).not.toContain("<Traders>");
      for (const content of [sent.html, sent.text, sent.message.subject]) {
        expect(content).not.toContain("ZZMARKER");
        expect(content).not.toContain("Analytical Engines");
        expect(content).not.toContain("<script>");
      }

      const url = `/v1/public/forms/confirm/${sent.token}`;
      const before = await visit("GET", url);
      expect(before.statusCode).toBe(200);
      expect(before.json()).toEqual({
        status: "pending",
        brandName: "Northwind <Traders>",
        redirectUrl: null,
        email: `a***@example.com`,
      });
      expect(await contactOf(normalized)).toBeNull();

      const confirmed = await visit("POST", url);
      expect(confirmed.statusCode).toBe(200);
      expect((confirmed.json() as ConfirmResult).status).toBe("confirmed");

      const contact = await contactOf(normalized);
      expect(contact).toMatchObject({
        origin: "form",
        firstName: marker,
        company: "Analytical Engines",
        lastName: null,
      });
      expect(await memberStatus(listId, contact?.id ?? "")).toBe("subscribed");
      expect(await memberStatus(secondListId, contact?.id ?? "")).toBe(
        "subscribed",
      );
      const [done] = await submissionsOf(form);
      expect(done).toMatchObject({
        status: "subscribed",
        contactId: contact?.id,
      });
      expect(done?.confirmedAt).toBeInstanceOf(Date);
      expect(await counts(form)).toEqual({ submissions: 1, confirmed: 1 });

      const again = await visit("POST", url);
      expect((again.json() as ConfirmResult).status).toBe("already");
      const after = await visit("GET", url);
      expect((after.json() as ConfirmResult).status).toBe("already");
      expect(await counts(form)).toEqual({ submissions: 1, confirmed: 1 });
      expect(await messagesTo(normalized)).toHaveLength(1);
    });

    it("counts one confirmation when the link is used twice at once", async () => {
      const form = await publishedForm();
      const email = address();
      await submit(form, { email });
      const { token } = await confirmationEmail(email);
      const results = await Promise.all(
        [1, 2, 3].map(() => visit("POST", `/v1/public/forms/confirm/${token}`)),
      );
      expect(results.map((result) => result.statusCode)).toEqual([
        200, 200, 200,
      ]);
      expect(await counts(form)).toEqual({ submissions: 1, confirmed: 1 });
      const contact = await contactOf(email);
      expect(await memberStatus(listId, contact?.id ?? "")).toBe("subscribed");
    });

    it("refuses forged, foreign and expired tokens", async () => {
      const form = await publishedForm({
        settings: { redirectUrl: "https://example.com/welcome" },
      });
      const email = address();
      await submit(form, { email });
      const [submission] = await submissionsOf(form);
      const id = submission?.id ?? "";
      const { token } = await confirmationEmail(email);

      for (const bad of [
        "nope",
        `${token.slice(0, -2)}AA`,
        messageToken(id, secret),
        renderToken(id, new Date(Date.now() + dayMs), secret),
        confirmToken(id, new Date(Date.now() + dayMs), Buffer.alloc(32, 1)),
      ]) {
        const url = `/v1/public/forms/confirm/${bad}`;
        expect((await visit("GET", url)).statusCode).toBe(404);
        expect((await visit("POST", url)).statusCode).toBe(404);
      }

      const expired = confirmToken(id, new Date(Date.now() - 1000), secret);
      for (const method of ["GET", "POST"] as const) {
        const response = await visit(
          method,
          `/v1/public/forms/confirm/${expired}`,
        );
        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
          status: "expired",
          brandName: "Northwind <Traders>",
          redirectUrl: "https://example.com/welcome",
        });
      }
      expect(await contactOf(email)).toBeNull();
      expect((await submissionsOf(form))[0]?.status).toBe("pending");

      const unknown = confirmToken(
        randomUUID(),
        new Date(Date.now() + dayMs),
        secret,
      );
      const missing = await visit(
        "POST",
        `/v1/public/forms/confirm/${unknown}`,
      );
      expect(missing.json()).toEqual({
        status: "expired",
        brandName: "",
        redirectUrl: null,
        email: null,
      });
    });

    it("still confirms after the form is archived, and expires once it is deleted", async () => {
      const form = await publishedForm();
      const first = address();
      const second = address();
      await submit(form, { email: first });
      await submit(form, { email: second });
      const firstToken = (await confirmationEmail(first)).token;
      const secondToken = (await confirmationEmail(second)).token;

      await api(workspace, "POST", `/v1/forms/${form.id}/archive`);
      const confirmed = await visit(
        "POST",
        `/v1/public/forms/confirm/${firstToken}`,
      );
      expect((confirmed.json() as ConfirmResult).status).toBe("confirmed");
      expect(await contactOf(first)).not.toBeNull();

      const removed = await api(workspace, "DELETE", `/v1/forms/${form.id}`);
      expect(removed.statusCode).toBe(204);
      expect(await submissionsOf(form)).toHaveLength(0);
      const gone = await visit(
        "POST",
        `/v1/public/forms/confirm/${secondToken}`,
      );
      expect((gone.json() as ConfirmResult).status).toBe("expired");
      expect(await contactOf(second)).toBeNull();
      expect(await contactOf(first)).not.toBeNull();
    });

    it("subscribes again someone who had unsubscribed, once they confirm", async () => {
      const form = await publishedForm();
      const email = address();
      const [contact] = await db
        .insert(schema.contacts)
        .values({
          workspaceId: workspace.workspaceId,
          email,
          firstName: "Old",
          origin: "import",
        })
        .returning({ id: schema.contacts.id });
      const contactId = contact?.id ?? "";
      await db.insert(schema.listMembers).values({
        workspaceId: workspace.workspaceId,
        listId,
        contactId,
        status: "unsubscribed",
        unsubscribedAt: new Date(),
      });
      await suppress(email, "unsubscribed");

      const response = await submit(form, { email });
      expect(response.json()).toEqual({ status: "pending", redirectUrl: null });
      expect(await memberStatus(listId, contactId)).toBe("unsubscribed");
      expect(await suppressionsFor(email)).toEqual([
        { reason: "unsubscribed" },
      ]);

      const { token } = await confirmationEmail(email);
      await visit("POST", `/v1/public/forms/confirm/${token}`);
      expect(await memberStatus(listId, contactId)).toBe("subscribed");
      expect(await suppressionsFor(email)).toEqual([]);
      expect(await contactOf(email)).toMatchObject({
        id: contactId,
        origin: "import",
        firstName: "Old",
      });
    });
  });

  describe("abuse", () => {
    it("answers the same for a new, a known, a suppressed and a repeated address", async () => {
      const form = await publishedForm();
      const fresh = address();
      const known = address();
      const bounced = address();
      const complained = address();
      const blocked = address();
      const repeated = address();
      const [contact] = await db
        .insert(schema.contacts)
        .values({ workspaceId: workspace.workspaceId, email: known })
        .returning({ id: schema.contacts.id });
      await db.insert(schema.listMembers).values({
        workspaceId: workspace.workspaceId,
        listId,
        contactId: contact?.id ?? "",
        status: "subscribed",
        subscribedAt: new Date(),
      });
      await suppress(bounced, "bounced");
      await suppress(complained, "complained");
      await suppress(blocked, "manual");
      await submit(form, { email: repeated });

      const responses = [];
      for (const email of [
        fresh,
        known,
        bounced,
        complained,
        blocked,
        repeated,
      ]) {
        const response = await submit(form, { email });
        responses.push({
          status: response.statusCode,
          body: response.body,
          type: response.headers["content-type"],
        });
      }
      for (const response of responses) {
        expect(response).toEqual(responses[0]);
      }
      expect(responses[0]).toMatchObject({
        status: 200,
        body: JSON.stringify({ status: "pending", redirectUrl: null }),
      });

      expect(await messagesTo(fresh)).toHaveLength(1);
      expect(await messagesTo(known)).toHaveLength(1);
      expect(await messagesTo(repeated)).toHaveLength(1);
      for (const email of [bounced, complained, blocked]) {
        expect(await messagesTo(email)).toHaveLength(0);
        expect(await contactOf(email)).toBeNull();
      }
      const stored = await submissionsOf(form);
      const statusOf = (email: string) =>
        stored.filter((row) => row.email === email).map((row) => row.status);
      expect(statusOf(fresh)).toEqual(["pending"]);
      expect(statusOf(repeated)).toEqual(["pending"]);
      expect(statusOf(bounced)).toEqual(["rejected"]);
      expect(statusOf(complained)).toEqual(["rejected"]);
      expect(statusOf(blocked)).toEqual(["rejected"]);
      expect(await suppressionsFor(bounced)).toEqual([{ reason: "bounced" }]);
    });

    it("sends one confirmation per address per form per hour, whatever the network", async () => {
      const form = await publishedForm();
      const secondForm = await publishedForm();
      const email = address();
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const response = await submit(form, {
          email: attempt % 2 === 0 ? email : email.toUpperCase(),
        });
        expect(response.json()).toEqual({
          status: "pending",
          redirectUrl: null,
        });
      }
      expect(await messagesTo(email)).toHaveLength(1);
      expect(await submissionsOf(form)).toHaveLength(1);
      expect(await counts(form)).toEqual({ submissions: 1, confirmed: 0 });

      await submit(secondForm, { email });
      expect(await messagesTo(email)).toHaveLength(2);
    });

    it("caps how many confirmations one address gets in a day across forms", async () => {
      const email = address();
      const limit = formRateRules.addressPerDay.limit;
      for (let index = 0; index < limit + 2; index += 1) {
        const form = await publishedForm();
        const response = await submit(form, { email });
        expect(response.json()).toEqual({
          status: "pending",
          redirectUrl: null,
        });
      }
      expect(await messagesTo(email)).toHaveLength(limit);
    });

    it("swallows a filled honeypot and a submit that came too fast", async () => {
      const form = await publishedForm();
      const shown = await visit("GET", `/v1/public/forms/${form.publicId}`);
      const { renderToken: justRendered } = (shown.json() as PublicForm)
        .protection;
      const otherForm = await publishedForm();
      const cases: Record<string, unknown>[] = [
        { [honeypotField]: "+1 555 0100" },
        { [renderTokenField]: justRendered },
        { renderToken: justRendered },
        { [renderTokenField]: "forged" },
        {
          [renderTokenField]: renderToken(
            otherForm.id,
            new Date(Date.now() - 60_000),
            secret,
          ),
        },
        {
          [renderTokenField]: renderToken(
            form.id,
            new Date(Date.now() - 60_000),
            Buffer.alloc(32, 3),
          ),
        },
        { [honeypotField]: "x", email: "not an address" },
      ];
      for (const extra of cases) {
        const email = address();
        const response = await submit(form, { email, ...extra });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
          status: "pending",
          redirectUrl: null,
        });
        expect(await messagesTo(email)).toHaveLength(0);
      }
      expect(await submissionsOf(form)).toHaveLength(0);
      expect(await counts(form)).toEqual({ submissions: 0, confirmed: 0 });

      const patient = address();
      await submit(form, {
        email: patient,
        [honeypotField]: "",
        [renderTokenField]: renderToken(
          form.id,
          new Date(Date.now() - 2500),
          secret,
        ),
      });
      expect(await messagesTo(patient)).toHaveLength(1);
      expect(await submissionsOf(form)).toHaveLength(1);
    });

    it("validates the address and the fields, and ignores everything else", async () => {
      const form = await publishedForm({
        fields: [
          { key: "first_name", label: "First name", required: true },
          { key: "phone", required: false },
        ],
      });
      const cases: [Record<string, unknown>, string][] = [
        [{}, "email"],
        [{ email: "nope", first_name: "Ada" }, "email"],
        [{ email: { $ne: "" }, first_name: "Ada" }, "email"],
        [{ email: ["a@example.com"], first_name: "Ada" }, "email"],
        [
          { email: `${"a".repeat(320)}@example.com`, first_name: "Ada" },
          "email",
        ],
        [{ email: address() }, "first_name"],
        [{ email: address(), first_name: "x".repeat(256) }, "first_name"],
        [
          { email: address(), first_name: "Ada", phone: "1".repeat(51) },
          "phone",
        ],
      ];
      for (const [payload, field] of cases) {
        const response = await submit(form, payload);
        expect([field, response.statusCode]).toEqual([field, 400]);
        expect(response.json()).toMatchObject({ code: "validation", field });
      }
      const broken = await visit(
        "POST",
        `/v1/public/forms/${form.publicId}/submit`,
        { payload: "{nope", contentType: "application/json" },
      );
      expect(broken.statusCode).toBe(400);
      const huge = await visit(
        "POST",
        `/v1/public/forms/${form.publicId}/submit`,
        {
          payload: JSON.stringify({
            email: address(),
            first_name: "x".repeat(20_000),
          }),
          contentType: "application/json",
        },
      );
      expect(huge.statusCode).toBe(413);
      expect(await submissionsOf(form)).toHaveLength(0);
    });

    it("limits submits per network", async () => {
      const form = await publishedForm();
      const ip = freshIp();
      const limit = formRateRules.submitPerIpMinute.limit;
      const statuses: number[] = [];
      for (let attempt = 0; attempt < limit + 2; attempt += 1) {
        const response = await submit(form, { email: address() }, { ip });
        statuses.push(response.statusCode);
      }
      expect(statuses).toEqual([
        ...Array.from({ length: limit }, () => 200),
        429,
        429,
      ]);
      expect(await submissionsOf(form)).toHaveLength(limit);
      const elsewhere = await submit(form, { email: address() });
      expect(elsewhere.statusCode).toBe(200);
      const plain = await visit(
        "POST",
        `/v1/public/forms/${form.publicId}/submit`,
        {
          ip,
          payload: `email=${encodeURIComponent(address())}`,
          contentType: "application/x-www-form-urlencoded",
        },
      );
      expect(plain.statusCode).toBe(303);
      expect(plain.headers.location).toBe(
        `${appUrl}/f/${form.publicId}?error=rate_limited`,
      );
    });

    it("limits how often one network can read forms and confirmation links", async () => {
      const form = await publishedForm();
      const ip = freshIp();
      const limit = formRateRules.page.limit;
      let last = 0;
      for (let attempt = 0; attempt < limit + 1; attempt += 1) {
        const response = await visit(
          "GET",
          attempt % 2 === 0
            ? `/v1/public/forms/${form.publicId}`
            : "/v1/public/forms/confirm/nope",
          { ip },
        );
        last = response.statusCode;
      }
      expect(last).toBe(429);
    });
  });

  describe("plain form posts from another site", () => {
    it("answers a preflight and allows any origin without credentials", async () => {
      const form = await publishedForm();
      const preflight = await app.inject({
        method: "OPTIONS",
        url: `/v1/public/forms/${form.publicId}/submit`,
        headers: {
          origin: "https://customer.example",
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type",
        },
      });
      expect(preflight.statusCode).toBe(204);
      expect(preflight.headers).toMatchObject({
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "Content-Type",
      });
      expect(preflight.headers).not.toHaveProperty(
        "access-control-allow-credentials",
      );
    });

    it("redirects only to the hosted page or the form's own redirect address", async () => {
      const form = await publishedForm({
        fields: [{ key: "first_name", required: true }],
      });
      const post = (body: string) =>
        visit("POST", `/v1/public/forms/${form.publicId}/submit`, {
          payload: body,
          contentType: "application/x-www-form-urlencoded",
        });
      const email = address();
      const evil = encodeURIComponent("https://evil.example/phish");
      const accepted = await post(
        `email=${encodeURIComponent(email)}&first_name=Ada+L&redirectUrl=${evil}&redirect=${evil}&next=${evil}&return_to=${evil}`,
      );
      expect(accepted.statusCode).toBe(303);
      expect(accepted.headers.location).toBe(
        `${appUrl}/f/${form.publicId}?submitted=pending`,
      );
      expect(accepted.headers["access-control-allow-origin"]).toBe("*");
      const [submission] = await submissionsOf(form);
      expect(submission).toMatchObject({
        email,
        data: { first_name: "Ada L" },
      });

      const invalid = await post(`email=nope&first_name=Ada&next=${evil}`);
      expect(invalid.statusCode).toBe(303);
      expect(invalid.headers.location).toBe(
        `${appUrl}/f/${form.publicId}?error=validation&field=email`,
      );
      const missing = await post(`email=${encodeURIComponent(address())}`);
      expect(missing.headers.location).toBe(
        `${appUrl}/f/${form.publicId}?error=validation&field=first_name`,
      );
      const trapped = await post(
        `email=${encodeURIComponent(address())}&first_name=Bot&${honeypotField}=1`,
      );
      expect(trapped.headers.location).toBe(
        `${appUrl}/f/${form.publicId}?submitted=pending`,
      );
      expect(await submissionsOf(form)).toHaveLength(1);

      await api(workspace, "PATCH", `/v1/forms/${form.id}`, {
        settings: { redirectUrl: "https://customer.example/thanks" },
      });
      const redirected = await post(
        `email=${encodeURIComponent(address())}&first_name=Ada&redirectUrl=${evil}`,
      );
      expect(redirected.headers.location).toBe(
        "https://customer.example/thanks",
      );
      const json = await submit(form, {
        email: address(),
        first_name: "Ada",
        redirectUrl: "https://evil.example/phish",
      });
      expect(json.json()).toEqual({
        status: "pending",
        redirectUrl: "https://customer.example/thanks",
      });

      const unknown = await visit(
        "POST",
        "/v1/public/forms/aaaaaaaaaaaaaaaa/submit",
        {
          payload: "email=a%40example.com",
          contentType: "application/x-www-form-urlencoded",
        },
      );
      expect(unknown.statusCode).toBe(404);
      expect(unknown.headers).not.toHaveProperty("location");
    });
  });

  describe("single opt-in", () => {
    it("subscribes at once, sends nothing and leaves an existing contact's details alone", async () => {
      const form = await publishedForm({
        doubleOptIn: false,
        listIds: [listId, secondListId],
        fields: [{ key: "first_name", required: false }],
      });
      const email = address();
      const response = await submit(form, { email, first_name: "Grace" });
      expect(response.json()).toEqual({
        status: "subscribed",
        redirectUrl: null,
      });
      const contact = await contactOf(email);
      expect(contact).toMatchObject({ origin: "form", firstName: "Grace" });
      expect(await memberStatus(listId, contact?.id ?? "")).toBe("subscribed");
      expect(await memberStatus(secondListId, contact?.id ?? "")).toBe(
        "subscribed",
      );
      expect(await messagesTo(email)).toHaveLength(0);
      expect((await submissionsOf(form))[0]).toMatchObject({
        status: "subscribed",
        contactId: contact?.id,
        confirmationMessageId: null,
      });
      expect(await counts(form)).toEqual({ submissions: 1, confirmed: 1 });

      const existing = address();
      await db.insert(schema.contacts).values({
        workspaceId: workspace.workspaceId,
        email: existing,
        firstName: "Real name",
        origin: "manual",
      });
      await submit(form, { email: existing, first_name: "Defaced" });
      const kept = await contactOf(existing);
      expect(kept).toMatchObject({ firstName: "Real name", origin: "manual" });
      expect(await memberStatus(listId, kept?.id ?? "")).toBe("subscribed");

      const bounced = address();
      await suppress(bounced, "bounced");
      const refused = await submit(form, { email: bounced });
      expect(refused.json()).toEqual({
        status: "subscribed",
        redirectUrl: null,
      });
      expect(await contactOf(bounced)).toBeNull();
      expect(await counts(form)).toEqual({ submissions: 3, confirmed: 2 });
    });

    it("skips a list that was deleted after the form was published", async () => {
      const temporary = await createList(workspace, "Temporary");
      const form = await publishedForm({
        doubleOptIn: false,
        listIds: [listId, temporary],
      });
      await db.delete(schema.lists).where(eq(schema.lists.id, temporary));
      const email = address();
      await submit(form, { email });
      const contact = await contactOf(email);
      expect(await memberStatus(listId, contact?.id ?? "")).toBe("subscribed");
      const read = await api(workspace, "GET", `/v1/forms/${form.id}`);
      expect((read.json() as Form).lists.map((list) => list.id)).toEqual([
        listId,
      ]);
    });
  });

  describe("submissions", () => {
    it("lists them newest first with a status filter and a cursor", async () => {
      const form = await publishedForm();
      const emails = [address(), address(), address()];
      for (const email of emails) {
        await submit(form, { email });
      }
      const { token } = await confirmationEmail(emails[0] ?? "");
      await visit("POST", `/v1/public/forms/confirm/${token}`);
      const bounced = address();
      await suppress(bounced, "bounced");
      await submit(form, { email: bounced });

      const url = `/v1/forms/${form.id}/submissions`;
      const all = await api(workspace, "GET", url);
      expect(all.statusCode).toBe(200);
      const items = all.json().items as Submission[];
      expect(items.map((item) => item.email)).toEqual([
        bounced,
        ...[...emails].reverse(),
      ]);
      expect(items[0]).toMatchObject({
        status: "rejected",
        contactId: null,
        confirmedAt: null,
        data: {},
      });
      expect(Object.keys(items[0] ?? {}).sort()).toEqual([
        "confirmedAt",
        "contactId",
        "createdAt",
        "data",
        "email",
        "id",
        "status",
      ]);
      expect(all.json().nextCursor).toBeNull();

      const first = await api(workspace, "GET", `${url}?limit=3`);
      expect(first.json().items).toHaveLength(3);
      const cursor = first.json().nextCursor as string;
      expect(cursor).toEqual(expect.any(String));
      const rest = await api(
        workspace,
        "GET",
        `${url}?limit=3&cursor=${cursor}`,
      );
      expect(
        (rest.json().items as Submission[]).map((item) => item.email),
      ).toEqual([emails[0]]);
      expect(rest.json().nextCursor).toBeNull();

      const subscribed = await api(
        workspace,
        "GET",
        `${url}?status=subscribed`,
      );
      expect(
        (subscribed.json().items as Submission[]).map((item) => item.email),
      ).toEqual([emails[0]]);
      const pending = await api(workspace, "GET", `${url}?status=pending`);
      expect(pending.json().items).toHaveLength(2);
      for (const bad of ["status=nope", "cursor=nope"]) {
        const response = await api(workspace, "GET", `${url}?${bad}`);
        expect(response.statusCode).toBe(400);
      }
    });

    it("deletes pending submissions after 30 days and nothing else", async () => {
      const form = await publishedForm();
      const old = new Date(Date.now() - 31 * dayMs);
      const recent = new Date(Date.now() - 29 * dayMs);
      const rows = await db
        .insert(schema.formSubmissions)
        .values(
          [
            {
              email: address("old-pending"),
              status: "pending",
              createdAt: old,
            },
            {
              email: address("recent-pending"),
              status: "pending",
              createdAt: recent,
            },
            {
              email: address("old-subscribed"),
              status: "subscribed",
              createdAt: old,
            },
            {
              email: address("old-rejected"),
              status: "rejected",
              createdAt: old,
            },
          ].map((row) => ({
            ...row,
            workspaceId: workspace.workspaceId,
            formId: form.id,
          })),
        )
        .returning({ id: schema.formSubmissions.id });
      expect(rows).toHaveLength(4);
      const processor = new FormsMaintenanceProcessor(
        { upsertJobScheduler: async () => undefined } as unknown as Queue,
        app.get(FormsRepository),
      );
      const result = await processor.purgePending();
      expect(result.removed).toBeGreaterThanOrEqual(1);
      const left = await submissionsOf(form);
      expect(
        left.map((row) => row.email.split("-").slice(0, 2).join("-")).sort(),
      ).toEqual(["old-rejected", "old-subscribed", "recent-pending"]);
      expect((await processor.purgePending()).removed).toBe(0);
    });
  });
});
