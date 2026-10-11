import { randomUUID } from "node:crypto";
import { VersioningType } from "@nestjs/common";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { type Db, eq, schema } from "@workspace/db";
import { AppModule } from "../src/app/app.module";
import { DATABASE } from "../src/infra/database/database.module";
import { StorageService } from "../src/infra/storage/storage.service";
import { MediaService } from "../src/modules/media/media.service";
import {
  createWorkspaceSessions,
  type TestMember,
  type TestWorkspace,
} from "./support/workspace-session";

type Asset = {
  id: string;
  url: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  createdAt: string;
};

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const gif = Buffer.from(
  "R0lGODlhAgADAIAAAAAAAP///yH5BAEAAAAALAAAAAACAAMAAAIDhI8FADs=",
  "base64",
);
const jpeg = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]),
  Buffer.from([0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x09, 0x00, 0x10]),
  Buffer.from([0x01, 0x01, 0x11, 0x00, 0xff, 0xd9]),
]);
const webp = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([0x16, 0, 0, 0]),
  Buffer.from("WEBPVP8X"),
  Buffer.from([0x0a, 0, 0, 0, 0, 0, 0, 0]),
  Buffer.from([0x3f, 0, 0, 0x1f, 0, 0]),
]);
const svg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script></svg>',
);

describe("Media (e2e)", () => {
  let app: NestFastifyApplication;
  let db: Db;
  let storage: StorageService;
  let sessions: ReturnType<typeof createWorkspaceSessions>;
  let workspace: TestWorkspace;
  let other: TestWorkspace;
  let member: TestMember;

  function upload(
    who: TestMember | null,
    body: Buffer,
    contentType: string | undefined,
    fileName?: string,
  ) {
    return app.inject({
      method: "POST",
      url: "/v1/media",
      headers: {
        ...(who ? { cookie: who.cookie } : {}),
        ...(contentType ? { "content-type": contentType } : {}),
        ...(fileName ? { "x-file-name": encodeURIComponent(fileName) } : {}),
      },
      payload: body,
    });
  }

  function list(who: TestMember, query = "") {
    return app.inject({
      method: "GET",
      url: `/v1/media${query}`,
      headers: { cookie: who.cookie },
    });
  }

  function remove(who: TestMember, id: string) {
    return app.inject({
      method: "DELETE",
      url: `/v1/media/${id}`,
      headers: { cookie: who.cookie },
    });
  }

  function publicPath(asset: Asset) {
    return new URL(asset.url).pathname.replace(/^\/api/, "");
  }

  async function storedRows(workspaceId: string) {
    return db
      .select()
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.workspaceId, workspaceId));
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
    storage = app.get(StorageService);
    sessions = createWorkspaceSessions(app, "media-e2e");
    workspace = await sessions.workspace();
    other = await sessions.workspace();
    member = await workspace.addMember("member");
  });

  afterAll(async () => {
    for (const target of [workspace, other]) {
      for (const row of await storedRows(target.workspaceId)) {
        await storage.deleteObject(row.storageKey);
      }
    }
    await sessions.cleanup();
    await app.close();
  });

  it("rejects requests without a session, and API keys", async () => {
    const id = randomUUID();
    const key = { "x-api-key": `oc_${"a".repeat(64)}` };
    const responses = await Promise.all([
      upload(null, png, "image/png"),
      app.inject({ method: "GET", url: "/v1/media" }),
      app.inject({ method: "DELETE", url: `/v1/media/${id}` }),
      app.inject({
        method: "POST",
        url: "/v1/media",
        headers: { ...key, "content-type": "image/png" },
        payload: png,
      }),
      app.inject({ method: "GET", url: "/v1/media", headers: key }),
    ]);
    expect(responses.map((response) => response.statusCode)).toEqual([
      401, 401, 401, 401, 401,
    ]);
    expect(await storedRows(workspace.workspaceId)).toHaveLength(0);
  });

  it("refuses an oversized body before reading it when there is no session", async () => {
    const response = await upload(
      null,
      Buffer.concat([png, Buffer.alloc(6 * 1024 * 1024)]),
      "image/png",
    );
    expect(response.statusCode).toBe(401);
  });

  it("stores each supported type with its size and a clean name", async () => {
    const cases: [Buffer, string, string, string, number, number][] = [
      [png, "image/png", "Summer Sale/Hero Image.PNG", "hero-image.png", 1, 1],
      [jpeg, "image/jpeg", "photo.jpeg", "photo.jpg", 16, 9],
      [
        gif,
        "image/gif; charset=binary",
        "../../etc/passwd",
        "passwd.gif",
        2,
        3,
      ],
      [webp, "IMAGE/WEBP", "<script>.svg", "script.webp", 64, 32],
    ];
    for (const [body, type, name, fileName, width, height] of cases) {
      const response = await upload(member, body, type, name);
      expect([name, response.statusCode]).toEqual([name, 201]);
      const asset = response.json() as Asset;
      const contentType = type.split(";")[0]?.toLowerCase();
      expect(asset).toMatchObject({
        fileName,
        contentType,
        byteSize: body.length,
        width,
        height,
      });
      expect(asset.url).toBe(
        `http://localhost:3000/api/v1/media/${asset.id}/${fileName}`,
      );
      expect(Number.isNaN(Date.parse(asset.createdAt))).toBe(false);

      const [row] = await db
        .select()
        .from(schema.mediaAssets)
        .where(eq(schema.mediaAssets.id, asset.id));
      expect(row).toMatchObject({
        workspaceId: workspace.workspaceId,
        storageKey: `media/${workspace.workspaceId}/${asset.id}.${fileName.split(".").pop()}`,
        createdByUserId: member.userId,
      });
      const stored = await storage.getObject(row?.storageKey ?? "");
      expect(stored?.equals(body)).toBe(true);
    }
  });

  it("uses a default name when none is sent", async () => {
    const response = await upload(workspace.owner, png, "image/png");
    expect(response.statusCode).toBe(201);
    expect(response.json().fileName).toBe("image.png");
  });

  it("rejects a body that is not the declared type", async () => {
    const before = (await storedRows(workspace.workspaceId)).length;
    const cases: [Buffer, string | undefined][] = [
      [png, "image/jpeg"],
      [jpeg, "image/png"],
      [svg, "image/svg+xml"],
      [svg, "image/png"],
      [Buffer.from("<!doctype html><script>alert(1)</script>"), "image/gif"],
      [png, "application/octet-stream"],
      [png, "application/json"],
      [png, "text/plain"],
      [png, undefined],
      [Buffer.concat([Buffer.from("GIF89a"), svg]), "image/png"],
    ];
    for (const [body, type] of cases) {
      const response = await upload(workspace.owner, body, type, "x.png");
      expect([type, response.statusCode]).toEqual([type, 415]);
      expect(response.json()).toMatchObject({ code: "unsupported_type" });
    }
    expect(await storedRows(workspace.workspaceId)).toHaveLength(before);
  });

  it("rejects an empty body", async () => {
    const response = await upload(
      workspace.owner,
      Buffer.alloc(0),
      "image/png",
    );
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation" });
  });

  it("accepts up to 5 MB and rejects more", async () => {
    const limit = 5 * 1024 * 1024;
    const atLimit = Buffer.concat([png, Buffer.alloc(limit - png.length)]);
    const accepted = await upload(workspace.owner, atLimit, "image/png");
    expect(accepted.statusCode).toBe(201);
    expect(accepted.json().byteSize).toBe(limit);

    const before = (await storedRows(workspace.workspaceId)).length;
    const rejected = await upload(
      workspace.owner,
      Buffer.concat([atLimit, Buffer.alloc(1)]),
      "image/png",
    );
    expect(rejected.statusCode).toBe(413);
    expect(rejected.json()).toMatchObject({ code: "too_large" });
    expect(await storedRows(workspace.workspaceId)).toHaveLength(before);
  });

  it("serves the bytes publicly with safe headers", async () => {
    const uploaded = await upload(workspace.owner, gif, "image/gif", "dot.gif");
    const asset = uploaded.json() as Asset;

    const response = await app.inject({
      method: "GET",
      url: publicPath(asset),
    });
    expect(response.statusCode).toBe(200);
    expect(response.rawPayload.equals(gif)).toBe(true);
    expect(response.headers).toMatchObject({
      "content-type": "image/gif",
      "content-length": String(gif.length),
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'",
    });

    const renamed = await app.inject({
      method: "GET",
      url: `/v1/media/${asset.id}/anything.html`,
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.headers["content-type"]).toBe("image/gif");
    expect(renamed.rawPayload.equals(gif)).toBe(true);
  });

  it("answers 404 without the cache header for an image that does not exist", async () => {
    for (const id of [randomUUID(), "not-an-id"]) {
      const response = await app.inject({
        method: "GET",
        url: `/v1/media/${id}/missing.png`,
      });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: "not_found" });
      expect(response.headers["cache-control"]).toBeUndefined();
    }
  });

  it("pages through the list newest first", async () => {
    const all = (await list(workspace.owner, "?limit=100")).json() as {
      items: Asset[];
      nextCursor: string | null;
    };
    expect(all.nextCursor).toBeNull();
    expect(all.items.length).toBeGreaterThanOrEqual(7);
    const ids = all.items.map((item) => item.id);
    expect([...ids].sort().reverse()).toEqual(ids);

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page += 1) {
      const query: string = cursor
        ? `?limit=3&cursor=${encodeURIComponent(cursor)}`
        : "?limit=3";
      const body = (await list(workspace.owner, query)).json() as {
        items: Asset[];
        nextCursor: string | null;
      };
      expect(body.items.length).toBeLessThanOrEqual(3);
      seen.push(...body.items.map((item) => item.id));
      cursor = body.nextCursor;
      if (!cursor) {
        break;
      }
    }
    expect(seen).toEqual(ids);

    const invalid = await list(workspace.owner, "?cursor=nonsense");
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({
      code: "validation",
      field: "cursor",
    });
  });

  it("keeps each workspace's images apart", async () => {
    const uploaded = await upload(
      workspace.owner,
      png,
      "image/png",
      "mine.png",
    );
    const asset = uploaded.json() as Asset;

    const theirs = (await list(other.owner)).json() as { items: Asset[] };
    expect(theirs.items).toEqual([]);
    expect((await remove(other.owner, asset.id)).statusCode).toBe(404);
    const media = app.get(MediaService);
    await expect(media.get(other.workspaceId, asset.id)).resolves.toBeNull();
    await expect(
      media.get(workspace.workspaceId, asset.id),
    ).resolves.toMatchObject({ id: asset.id, url: asset.url });
    expect(media.urlFor(asset)).toBe(asset.url);

    const stillThere = await app.inject({
      method: "GET",
      url: publicPath(asset),
    });
    expect(stillThere.statusCode).toBe(200);
  });

  it("deletes the image and its file", async () => {
    const uploaded = await upload(member, png, "image/png", "gone.png");
    const asset = uploaded.json() as Asset;
    const [row] = await db
      .select()
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.id, asset.id));

    expect((await remove(member, asset.id)).statusCode).toBe(204);
    expect((await remove(member, asset.id)).statusCode).toBe(404);
    expect((await remove(member, "not-an-id")).statusCode).toBe(404);
    await expect(storage.getObject(row?.storageKey ?? "")).resolves.toBeNull();
    const gone = await app.inject({ method: "GET", url: publicPath(asset) });
    expect(gone.statusCode).toBe(404);
  });
});
