import { VersioningType } from "@nestjs/common";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app/app.module";
import { BrandService, fontStack } from "../src/modules/brand/brand.service";
import {
  createApiKey,
  createWorkspaceSessions,
  type TestMember,
  type TestWorkspace,
} from "./support/workspace-session";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

describe("Brand (e2e)", () => {
  let app: NestFastifyApplication;
  let sessions: ReturnType<typeof createWorkspaceSessions>;
  let workspace: TestWorkspace;
  let other: TestWorkspace;
  let admin: TestMember;
  let member: TestMember;

  function get(who: TestMember) {
    return app.inject({
      method: "GET",
      url: "/v1/brand",
      headers: { cookie: who.cookie },
    });
  }

  function put(who: TestMember, payload: Record<string, unknown>) {
    return app.inject({
      method: "PUT",
      url: "/v1/brand",
      headers: { cookie: who.cookie },
      payload,
    });
  }

  async function upload(who: TestMember) {
    const response = await app.inject({
      method: "POST",
      url: "/v1/media",
      headers: {
        cookie: who.cookie,
        "content-type": "image/png",
        "x-file-name": "logo.png",
      },
      payload: png,
    });
    expect(response.statusCode).toBe(201);
    return response.json() as { id: string; url: string };
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

    sessions = createWorkspaceSessions(app, "brand-e2e");
    workspace = await sessions.workspace();
    other = await sessions.workspace();
    admin = await workspace.addMember("admin");
    member = await workspace.addMember("member");
  });

  afterAll(async () => {
    await sessions.cleanup();
    await app.close();
  });

  it("rejects requests without a session", async () => {
    const responses = await Promise.all([
      app.inject({ method: "GET", url: "/v1/brand" }),
      app.inject({ method: "PUT", url: "/v1/brand", payload: {} }),
      app.inject({
        method: "PUT",
        url: "/v1/brand",
        headers: { "x-api-key": `oc_${"a".repeat(64)}` },
        payload: { brandName: "Nope" },
      }),
    ]);
    expect(responses.map((response) => response.statusCode)).toEqual([
      401, 401, 401,
    ]);
  });

  it("returns the defaults before anything is saved", async () => {
    const response = await get(workspace.owner);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      brandName: "",
      websiteUrl: null,
      logo: null,
      primaryColor: "#2563eb",
      backgroundColor: "#f4f4f5",
      contentColor: "#ffffff",
      textColor: "#18181b",
      fontFamily: "system",
      postalAddress: null,
      voice: null,
      socialLinks: [],
      canManage: true,
    });
  });

  it("tells each member whether they can manage the brand", async () => {
    expect((await get(admin)).json().canManage).toBe(true);
    expect((await get(member)).json().canManage).toBe(false);
  });

  it("only lets owners and admins save", async () => {
    const refused = await put(member, { brandName: "Member edit" });
    expect(refused.statusCode).toBe(403);
    expect(refused.json()).toMatchObject({ code: "forbidden" });
    expect((await get(workspace.owner)).json().brandName).toBe("");

    const byAdmin = await put(admin, { brandName: "  Northwind  " });
    expect(byAdmin.statusCode).toBe(200);
    expect(byAdmin.json()).toMatchObject({
      brandName: "Northwind",
      canManage: true,
    });
  });

  it("saves a subset of fields and keeps the rest", async () => {
    const saved = await put(workspace.owner, {
      websiteUrl: "https://northwind.example",
      primaryColor: "#ABC",
      textColor: "0F172A",
      fontFamily: "georgia",
      postalAddress: " 1 Harbour Street, London ",
      voice: "Plain and friendly.",
      socialLinks: [{ network: "linkedin", url: "https://example.com/in" }],
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({
      brandName: "Northwind",
      websiteUrl: "https://northwind.example",
      primaryColor: "#aabbcc",
      backgroundColor: "#f4f4f5",
      textColor: "#0f172a",
      fontFamily: "georgia",
      postalAddress: "1 Harbour Street, London",
      voice: "Plain and friendly.",
      socialLinks: [{ network: "linkedin", url: "https://example.com/in" }],
    });

    const cleared = await put(workspace.owner, {
      websiteUrl: null,
      voice: "",
      socialLinks: [],
    });
    expect(cleared.json()).toMatchObject({
      brandName: "Northwind",
      websiteUrl: null,
      voice: null,
      socialLinks: [],
      primaryColor: "#aabbcc",
      fontFamily: "georgia",
    });
    expect((await get(member)).json()).toMatchObject({
      brandName: "Northwind",
      primaryColor: "#aabbcc",
      canManage: false,
    });
  });

  it("validates each field and changes nothing on a bad request", async () => {
    const link = { network: "x", url: "https://example.com" };
    const cases: [Record<string, unknown>, string][] = [
      [{ brandName: "a".repeat(121) }, "brandName"],
      [{ brandName: 5 }, "brandName"],
      [{ websiteUrl: "javascript:alert(1)" }, "websiteUrl"],
      [{ websiteUrl: "northwind.example" }, "websiteUrl"],
      [{ primaryColor: "blue" }, "primaryColor"],
      [{ backgroundColor: "#12345" }, "backgroundColor"],
      [{ contentColor: null }, "contentColor"],
      [{ textColor: "#gggggg" }, "textColor"],
      [{ fontFamily: "comic-sans" }, "fontFamily"],
      [{ postalAddress: "a".repeat(501) }, "postalAddress"],
      [{ voice: "a".repeat(1001) }, "voice"],
      [{ socialLinks: "none" }, "socialLinks"],
      [{ socialLinks: Array.from({ length: 9 }, () => link) }, "socialLinks"],
      [{ socialLinks: [{ network: "", url: link.url }] }, "socialLinks"],
      [{ socialLinks: [{ network: "x", url: "ftp://x.test" }] }, "socialLinks"],
      [{ socialLinks: [{ network: "x" }] }, "socialLinks"],
      [{ logoMediaId: "not-an-id" }, "logoMediaId"],
      [{ logoMediaId: "0198c0de-0000-7000-8000-000000000000" }, "logoMediaId"],
    ];
    for (const [payload, field] of cases) {
      const response = await put(workspace.owner, {
        brandName: "Should not save",
        ...payload,
      });
      expect([field, response.statusCode]).toEqual([field, 400]);
      expect(response.json()).toMatchObject({ code: "validation", field });
    }
    expect((await get(workspace.owner)).json().brandName).toBe("Northwind");
  });

  it("accepts the largest allowed set of social links", async () => {
    const links = Array.from({ length: 8 }, (_, index) => ({
      network: `network-${index}`,
      url: `http://example.com/${index}`,
    }));
    const saved = await put(workspace.owner, { socialLinks: links });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().socialLinks).toEqual(links);
  });

  it("uses an uploaded image as the logo until the image is deleted", async () => {
    const asset = await upload(workspace.owner);
    const saved = await put(workspace.owner, { logoMediaId: asset.id });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().logo).toEqual({
      id: asset.id,
      url: asset.url,
      width: 1,
      height: 1,
    });
    expect((await get(member)).json().logo).toMatchObject({ id: asset.id });

    const second = await upload(workspace.owner);
    const swapped = await put(workspace.owner, { logoMediaId: second.id });
    expect(swapped.json().logo).toMatchObject({ id: second.id });
    const cleared = await put(workspace.owner, { logoMediaId: null });
    expect(cleared.json().logo).toBeNull();

    await put(workspace.owner, { logoMediaId: asset.id });
    const deleted = await app.inject({
      method: "DELETE",
      url: `/v1/media/${asset.id}`,
      headers: { cookie: workspace.owner.cookie },
    });
    expect(deleted.statusCode).toBe(204);
    expect((await get(workspace.owner)).json()).toMatchObject({
      brandName: "Northwind",
      logo: null,
    });
  });

  it("keeps each workspace's brand and images apart", async () => {
    const before = (await get(other.owner)).json();
    expect(before).toMatchObject({ brandName: "", primaryColor: "#2563eb" });

    const asset = await upload(workspace.owner);
    const borrowed = await put(other.owner, { logoMediaId: asset.id });
    expect(borrowed.statusCode).toBe(400);
    expect(borrowed.json()).toMatchObject({
      code: "validation",
      field: "logoMediaId",
    });

    await put(other.owner, { brandName: "Other brand" });
    expect((await get(other.owner)).json().brandName).toBe("Other brand");
    expect((await get(workspace.owner)).json().brandName).toBe("Northwind");
  });

  it("lets an API key read the brand but not change it", async () => {
    const key = await createApiKey(app, workspace.owner, workspace.workspaceId);
    const read = await app.inject({
      method: "GET",
      url: "/v1/brand",
      headers: { "x-api-key": key },
    });
    expect(read.statusCode).toBe(200);
    expect(read.json()).toMatchObject({
      brandName: "Northwind",
      canManage: false,
    });

    const write = await app.inject({
      method: "PUT",
      url: "/v1/brand",
      headers: { "x-api-key": key },
      payload: { brandName: "From a key" },
    });
    expect(write.statusCode).toBe(401);
    expect((await get(workspace.owner)).json().brandName).toBe("Northwind");
  });

  it("exposes the brand to other modules without canManage", async () => {
    const brand = await app.get(BrandService).get(workspace.workspaceId);
    expect(brand).toMatchObject({ brandName: "Northwind" });
    expect(brand).not.toHaveProperty("canManage");
  });

  it("maps every font to an email-safe stack", () => {
    expect(fontStack("georgia")).toBe(
      "Georgia, 'Times New Roman', Times, serif",
    );
    expect(fontStack("system")).toContain("sans-serif");
    expect(fontStack("unknown")).toBe(fontStack("system"));
  });
});
