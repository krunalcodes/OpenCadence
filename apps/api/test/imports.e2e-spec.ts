import { randomUUID } from "node:crypto";
import { getQueueToken } from "@nestjs/bullmq";
import { VersioningType } from "@nestjs/common";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { and, type Db, eq, inArray, schema, sql } from "@workspace/db";
import type { Job, Queue } from "bullmq";
import { AppModule } from "../src/app/app.module";
import { DATABASE } from "../src/infra/database/database.module";
import { REDIS, type Redis } from "../src/infra/redis/redis.module";
import { StorageService } from "../src/infra/storage/storage.service";
import { ContactsService } from "../src/modules/contacts/contacts.service";
import { encodeCsvRow, parseCsv } from "../src/modules/imports/csv-parser";
import {
  chunkSize,
  errorReportKey,
  filePrefix,
  IMPORTS_QUEUE,
  type ImportJob,
  partKey,
  sessionKey,
} from "../src/modules/imports/imports.constants";
import { ImportsController } from "../src/modules/imports/imports.controller";
import { ImportsModule } from "../src/modules/imports/imports.module";
import {
  type Import,
  ImportsService,
} from "../src/modules/imports/imports.service";
import { ImportsWorkerModule } from "../src/modules/imports/imports.worker.module";
import { ImportContactsProcessor } from "../src/modules/imports/jobs/import-contacts.processor";
import { ListsService } from "../src/modules/lists/lists.service";
import { TagsService } from "../src/modules/tags/tags.service";

type StartInput = {
  mapping: Record<string, string>;
  updateExisting?: boolean;
  listIds?: string[];
  tagIds?: string[];
};

function pieces(text: string, cuts: number[]) {
  const parts: string[] = [];
  let from = 0;
  for (const cut of [...cuts, text.length]) {
    parts.push(text.slice(from, cut));
    from = cut;
  }
  return parts;
}

describe("Imports (e2e)", () => {
  let app: NestFastifyApplication;
  let db: Db;
  let redis: Redis;
  let storage: StorageService;
  let queue: Queue<ImportJob>;
  let imports: ImportsService;
  let processor: ImportContactsProcessor;
  let lists: ListsService;
  let tags: TagsService;
  let workspaceId: string;
  let otherWorkspaceId: string;

  async function createWorkspace(label: string) {
    const [workspace] = await db
      .insert(schema.workspaces)
      .values({ name: label, slug: `imports-e2e-${randomUUID()}` })
      .returning();
    if (!workspace) {
      throw new Error("The test workspace was not created.");
    }
    return workspace.id;
  }

  async function upload(
    chunks: string[],
    fileName = "contacts.csv",
    workspace = workspaceId,
  ): Promise<Import> {
    const size = chunks.reduce((total, chunk) => total + chunk.length, 0);
    const created = await imports.create(
      { workspaceId: workspace, userId: null },
      { fileName, fileSize: Math.max(size, 1) },
    );
    for (const [index, data] of chunks.entries()) {
      await imports.putChunk(workspace, created.id, String(index), { data });
    }
    return imports.finishUpload(workspace, created.id, {
      chunks: chunks.length,
    });
  }

  function start(id: string, input: StartInput, workspace = workspaceId) {
    return imports.start(workspace, id, {
      updateExisting: false,
      ...input,
    });
  }

  async function run(id: string, attemptsMade = 0) {
    try {
      return await processor.process({
        data: { importId: id },
        attemptsMade,
        opts: { attempts: 3 },
      } as Job<ImportJob>);
    } finally {
      await queue.remove(id).catch(() => undefined);
    }
  }

  async function importCsv(
    chunks: string[],
    input: StartInput,
    fileName?: string,
  ) {
    const uploaded = await upload(chunks, fileName);
    await start(uploaded.id, input);
    await run(uploaded.id);
    return imports.get(workspaceId, uploaded.id);
  }

  function contactsByEmail(emails: string[], workspace = workspaceId) {
    return db
      .select()
      .from(schema.contacts)
      .where(
        and(
          eq(schema.contacts.workspaceId, workspace),
          inArray(schema.contacts.email, emails),
        ),
      );
  }

  async function contactCount(pattern: string) {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.contacts)
      .where(
        and(
          eq(schema.contacts.workspaceId, workspaceId),
          sql`${schema.contacts.email} like ${pattern}`,
        ),
      );
    return row?.count ?? 0;
  }

  async function partsLeft(id: string, count: number, workspace = workspaceId) {
    let left = 0;
    for (let index = 0; index < count; index += 1) {
      if (await storage.getObject(partKey(filePrefix(workspace, id), index))) {
        left += 1;
      }
    }
    return left;
  }

  function bigCsv(prefix: string, rows: number, invalidEvery = 0) {
    const lines = ["email,first_name"];
    for (let index = 0; index < rows; index += 1) {
      lines.push(
        invalidEvery > 0 && index % invalidEvery === 5
          ? `${prefix}-broken-${index},Row ${index}`
          : `${prefix}-${index}@example.com,Row ${index}`,
      );
    }
    return `${lines.join("\n")}\n`;
  }

  const bigMapping = { email: "email", first_name: "firstName" };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule, ImportsModule, ImportsWorkerModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
      { bodyParser: false },
    );
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    db = app.get<Db>(DATABASE);
    redis = app.get<Redis>(REDIS);
    storage = app.get(StorageService);
    queue = app.get<Queue<ImportJob>>(getQueueToken(IMPORTS_QUEUE), {
      strict: false,
    });
    imports = app.get(ImportsService, { strict: false });
    processor = app.get(ImportContactsProcessor, { strict: false });
    lists = app.get(ListsService, { strict: false });
    tags = app.get(TagsService, { strict: false });
    await processor.worker.pause();

    workspaceId = await createWorkspace("Imports e2e");
    otherWorkspaceId = await createWorkspace("Imports e2e other");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    const rows = await db
      .select({ id: schema.imports.id, fileKey: schema.imports.fileKey })
      .from(schema.imports)
      .where(
        inArray(schema.imports.workspaceId, [workspaceId, otherWorkspaceId]),
      );
    for (const row of rows) {
      await queue.remove(row.id).catch(() => undefined);
      await storage.deleteObject(errorReportKey(row.fileKey));
    }
    await db
      .delete(schema.workspaces)
      .where(inArray(schema.workspaces.id, [workspaceId, otherWorkspaceId]));
    await app.close();
  });

  it("rejects requests without a session or API key", async () => {
    const id = randomUUID();
    const requests: [string, string, object?][] = [
      ["POST", "/v1/imports", { fileName: "a.csv", fileSize: 10 }],
      ["GET", "/v1/imports"],
      ["PUT", `/v1/imports/${id}/chunks/0`, { data: "email\n" }],
      ["POST", `/v1/imports/${id}/uploaded`, { chunks: 1 }],
      ["POST", `/v1/imports/${id}/start`, { mapping: {} }],
      ["GET", `/v1/imports/${id}`],
      ["POST", `/v1/imports/${id}/cancel`],
      ["GET", `/v1/imports/${id}/errors`],
    ];
    for (const [method, url, payload] of requests) {
      const response = await app.inject({
        method: method as "GET",
        url,
        payload,
      });
      expect(response.statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it("validates the upload session and its chunks", async () => {
    const actor = { workspaceId, userId: null };
    await expect(
      imports.create(actor, { fileName: "", fileSize: 10 }),
    ).rejects.toMatchObject({
      response: { code: "validation", field: "fileName" },
    });
    await expect(
      imports.create(actor, { fileName: "a.csv", fileSize: 0 }),
    ).rejects.toMatchObject({
      response: { code: "validation", field: "fileSize" },
    });
    await expect(
      imports.create(actor, { fileName: "a.csv", fileSize: 52_428_801 }),
    ).rejects.toMatchObject({
      response: { code: "validation", field: "fileSize" },
    });

    const created = await imports.create(actor, {
      fileName: "a.csv",
      fileSize: 52_428_800,
    });
    expect(created.chunkSize).toBe(262_144);
    expect(chunkSize).toBe(262_144);
    const ttl = await redis.ttl(sessionKey(created.id));
    expect(ttl).toBeGreaterThan(7100);
    expect(ttl).toBeLessThanOrEqual(7200);
    expect(await imports.list(workspaceId)).toEqual({ imports: [] });

    await expect(
      imports.putChunk(workspaceId, created.id, "0", {
        data: "x".repeat(chunkSize + 1),
      }),
    ).rejects.toMatchObject({
      response: { code: "validation", field: "data" },
    });
    await expect(
      imports.putChunk(workspaceId, created.id, "0", { data: 5 }),
    ).rejects.toMatchObject({
      response: { code: "validation", field: "data" },
    });
    for (const index of ["401", "-1", "1.5", "abc"]) {
      await expect(
        imports.putChunk(workspaceId, created.id, index, { data: "a" }),
      ).rejects.toMatchObject({
        response: { code: "validation", field: "index" },
      });
    }
    await expect(
      imports.putChunk(otherWorkspaceId, created.id, "0", { data: "a" }),
    ).rejects.toMatchObject({
      response: { statusCode: 404, code: "not_found" },
    });
    await expect(
      imports.putChunk(workspaceId, randomUUID(), "0", { data: "a" }),
    ).rejects.toMatchObject({
      response: { statusCode: 404, code: "not_found" },
    });
    await expect(
      imports.finishUpload(otherWorkspaceId, created.id, { chunks: 1 }),
    ).rejects.toMatchObject({
      response: { statusCode: 404, code: "not_found" },
    });

    await imports.putChunk(workspaceId, created.id, "0", {
      data: "email\n",
    });
    await imports.putChunk(workspaceId, created.id, "400", {
      data: "tail@example.com\n",
    });
    await expect(
      imports.finishUpload(workspaceId, created.id, { chunks: 0 }),
    ).rejects.toMatchObject({
      response: { code: "validation", field: "chunks" },
    });
    await expect(
      imports.finishUpload(workspaceId, created.id, { chunks: 2 }),
    ).rejects.toMatchObject({
      response: {
        code: "validation",
        field: "chunks",
        message: expect.stringContaining("Chunk 1"),
      },
    });

    const uploaded = await imports.finishUpload(workspaceId, created.id, {
      chunks: 1,
    });
    expect(uploaded.columns).toEqual(["email"]);
    expect(uploaded.sampleRows).toEqual([]);
    expect(await redis.exists(sessionKey(created.id))).toBe(0);
    expect(
      await storage.getObject(
        partKey(filePrefix(workspaceId, created.id), 400),
      ),
    ).toBeNull();
    await expect(
      imports.putChunk(workspaceId, created.id, "0", { data: "a" }),
    ).rejects.toMatchObject({ response: { statusCode: 404 } });
    await imports.cancel(workspaceId, created.id);
  });

  it("refuses more than 52,428,800 characters in total", async () => {
    const created = await imports.create(
      { workspaceId, userId: null },
      { fileName: "huge.csv", fileSize: 1000 },
    );
    const fields = Object.fromEntries(
      Array.from({ length: 200 }, (_, index) => [
        `part:${index + 1}`,
        String(chunkSize),
      ]),
    );
    await redis.hset(sessionKey(created.id), fields);
    await expect(
      imports.putChunk(workspaceId, created.id, "0", { data: "a" }),
    ).rejects.toMatchObject({
      response: { code: "validation", field: "data" },
    });
    await redis.hdel(sessionKey(created.id), "part:200");
    await imports.putChunk(workspaceId, created.id, "0", { data: "a" });
    await storage.deleteObject(partKey(filePrefix(workspaceId, created.id), 0));
    await redis.del(sessionKey(created.id));
  });

  it("rejects an empty file and a file with too many columns", async () => {
    await expect(upload(["\n\n", "  \r\n"])).rejects.toMatchObject({
      response: { code: "validation", field: "file" },
    });
    await expect(upload([",,,\n", ",,,\n"])).rejects.toMatchObject({
      response: { code: "validation", field: "file" },
    });
    const wide = Array.from({ length: 201 }, (_, index) => `c${index}`);
    await expect(upload([`${wide.join(",")}\n`])).rejects.toMatchObject({
      response: {
        code: "validation",
        field: "file",
        message: expect.stringContaining("200 columns"),
      },
    });
    const exact = await upload([`${wide.slice(0, 200).join(",")}\n`]);
    expect(exact.columns).toHaveLength(200);
    await imports.cancel(workspaceId, exact.id);
  });

  it("detects the header and the first five rows", async () => {
    const text = [
      "﻿ Email ,Name,,Name,City",
      "",
      "one@example.com,One,x,Uno,Paris",
      "two@example.com,Two",
      ",,,,",
      'three@example.com,"Three, the third",y,Tres,"New\nYork",extra,cells',
      "four@example.com,Four,,,",
      "five@example.com,Five,,,",
      "six@example.com,Six,,,",
      "seven@example.com,Seven,,,",
    ].join("\r\n");
    const uploaded = await upload([text], "  people list.csv ");
    expect(uploaded).toMatchObject({
      status: "uploaded",
      fileName: "people list.csv",
      fileSize: text.length,
      columns: ["Email", "Name", "Column 3", "Name (2)", "City"],
      mapping: null,
      options: null,
      totalRows: 0,
      processedRows: 0,
      hasErrorReport: false,
      errorMessage: null,
      startedAt: null,
      finishedAt: null,
    });
    expect(uploaded.sampleRows).toEqual([
      ["one@example.com", "One", "x", "Uno", "Paris"],
      ["two@example.com", "Two", "", "", ""],
      ["three@example.com", "Three, the third", "y", "Tres", "New\nYork"],
      ["four@example.com", "Four", "", "", ""],
      ["five@example.com", "Five", "", "", ""],
    ]);
    expect(await imports.get(workspaceId, uploaded.id)).toEqual(uploaded);
    const listed = await imports.list(workspaceId);
    expect(listed.imports[0]?.id).toBe(uploaded.id);
    await imports.cancel(workspaceId, uploaded.id);
  });

  it("reads only the parts it needs for the header and sample", async () => {
    const head =
      "email,name\na@example.com,A\nb@example.com,B\nc@example.com,C\n";
    const more = "d@example.com,D\ne@example.com,E\nf@example.com,F\n";
    const created = await imports.create(
      { workspaceId, userId: null },
      { fileName: "parts.csv", fileSize: 500 },
    );
    for (const [index, data] of [
      head,
      more,
      "g@example.com,G\n",
      "h@example.com,H\n",
    ].entries()) {
      await imports.putChunk(workspaceId, created.id, String(index), { data });
    }
    const read = vi.spyOn(storage, "getObject");
    const uploaded = await imports.finishUpload(workspaceId, created.id, {
      chunks: 4,
    });
    expect(read).toHaveBeenCalledTimes(2);
    expect(uploaded.sampleRows).toHaveLength(5);
    expect(uploaded.sampleRows[4]).toEqual(["e@example.com", "E"]);
    await imports.cancel(workspaceId, uploaded.id);
    expect(await partsLeft(uploaded.id, 4)).toBe(0);
  });

  it("imports a small CSV with quoted fields", async () => {
    const text = [
      "Email,First name,Last name,Company,Job,Phone,City,Country,Time zone,Ignored",
      '  Ada@Example.com ,Ada,"Lovelace, Countess",Analytical Engines,"Chief ""Enchantress"" of Numbers",+44 20 7946 0000,London,United Kingdom,Europe/London,x',
      'grace@example.com,Grace,Hopper,"Navy\nReserve",,,,,,y',
      "linus@example.com,,,,,,,,,",
    ].join("\r\n");
    const uploaded = await upload([text]);
    const mapping = {
      Email: "email",
      "First name": "firstName",
      "Last name": "lastName",
      Company: "company",
      Job: "jobTitle",
      Phone: "phone",
      City: "city",
      Country: "country",
      "Time zone": "timezone",
    };
    const queued = await start(uploaded.id, { mapping });
    expect(queued).toMatchObject({
      status: "queued",
      mapping: { ...mapping, Ignored: "skip" },
      options: { updateExisting: false, listIds: [], tagIds: [] },
    });
    expect(await queue.getJob(uploaded.id)).toMatchObject({
      id: uploaded.id,
      data: { importId: uploaded.id },
    });

    await run(uploaded.id);
    const done = await imports.get(workspaceId, uploaded.id);
    expect(done).toMatchObject({
      status: "completed",
      totalRows: 3,
      processedRows: 3,
      createdCount: 3,
      updatedCount: 0,
      skippedCount: 0,
      errorCount: 0,
      hasErrorReport: false,
      errorMessage: null,
    });
    expect(done.startedAt).not.toBeNull();
    expect(done.finishedAt).not.toBeNull();

    const rows = await contactsByEmail([
      "ada@example.com",
      "grace@example.com",
      "linus@example.com",
    ]);
    expect(rows).toHaveLength(3);
    expect(rows.find((row) => row.email === "ada@example.com")).toMatchObject({
      firstName: "Ada",
      lastName: "Lovelace, Countess",
      company: "Analytical Engines",
      jobTitle: 'Chief "Enchantress" of Numbers',
      phone: "+44 20 7946 0000",
      city: "London",
      country: "United Kingdom",
      timezone: "Europe/London",
      origin: "import",
    });
    expect(rows.find((row) => row.email === "grace@example.com")).toMatchObject(
      { company: "Navy\nReserve", jobTitle: null, city: null },
    );
    expect(rows.find((row) => row.email === "linus@example.com")).toMatchObject(
      { firstName: null, lastName: null, company: null },
    );
    expect(await partsLeft(uploaded.id, 1)).toBe(0);
    await expect(
      imports.errorReport(workspaceId, uploaded.id),
    ).rejects.toMatchObject({
      response: { statusCode: 404, code: "not_found" },
    });
  });

  it("imports a semicolon-delimited file", async () => {
    const text =
      'email;name;city\nsemi-one@example.com;"Doe; Jane";Lyon, France\nsemi-two@example.com;Roe;Nice\n';
    const done = await importCsv([text], {
      mapping: { email: "email", name: "lastName", city: "city" },
    });
    expect(done).toMatchObject({ status: "completed", createdCount: 2 });
    const rows = await contactsByEmail([
      "semi-one@example.com",
      "semi-two@example.com",
    ]);
    expect(
      rows.find((row) => row.email === "semi-one@example.com"),
    ).toMatchObject({ lastName: "Doe; Jane", city: "Lyon, France" });
  });

  it("imports a file split across chunks at awkward places", async () => {
    const text =
      '﻿email,name,note\r\nsplit-one@example.com,"Quoted, ""name""","line one\r\nline two"\r\nsplit-two@example.com,Smile 😀 face,plain\r\nsplit-three@example.com,"",last\r\n';
    const cuts = [
      1,
      text.indexOf("\r\n") + 1,
      text.indexOf("Quoted") + 3,
      text.indexOf('""name') + 1,
      text.indexOf('name""') + 5,
      text.indexOf("line one\r\n") + 9,
      text.indexOf("😀") + 1,
      text.indexOf('"",last') + 1,
      text.length - 1,
    ];
    const chunks = pieces(text, cuts);
    expect(chunks.join("")).toBe(text);
    expect(chunks).toHaveLength(10);
    const uploaded = await upload(chunks, "split.csv");
    expect(uploaded.columns).toEqual(["email", "name", "note"]);
    expect(uploaded.sampleRows).toEqual([
      ["split-one@example.com", 'Quoted, "name"', "line one\r\nline two"],
      ["split-two@example.com", "Smile 😀 face", "plain"],
      ["split-three@example.com", "", "last"],
    ]);
    await start(uploaded.id, {
      mapping: { email: "email", name: "firstName", note: "company" },
    });
    await run(uploaded.id);
    expect(await imports.get(workspaceId, uploaded.id)).toMatchObject({
      status: "completed",
      totalRows: 3,
      createdCount: 3,
    });
    const rows = await contactsByEmail([
      "split-one@example.com",
      "split-two@example.com",
      "split-three@example.com",
    ]);
    expect(
      Object.fromEntries(
        rows.map((row) => [row.email, [row.firstName, row.company]]),
      ),
    ).toEqual({
      "split-one@example.com": ['Quoted, "name"', "line one\r\nline two"],
      "split-two@example.com": ["Smile 😀 face", "plain"],
      "split-three@example.com": [null, "last"],
    });
    expect(await partsLeft(uploaded.id, chunks.length)).toBe(0);
  });

  it("rejects a bad mapping, list or tag", async () => {
    const uploaded = await upload(["email,first,last\nmap@example.com,A,B\n"]);
    const bad: unknown[] = [
      undefined,
      "email",
      {},
      { first: "firstName" },
      { email: "email", missing: "firstName" },
      { email: "email", first: "nickname" },
      { email: "email", first: "email" },
      { email: "email", first: "lastName", last: "lastName" },
      { email: "email", first: "custom:" },
      { email: "email", first: "custom:no_such_field" },
      { email: "email", first: 7 },
    ];
    for (const mapping of bad) {
      await expect(
        imports.start(workspaceId, uploaded.id, {
          mapping,
          updateExisting: true,
        }),
        JSON.stringify(mapping),
      ).rejects.toMatchObject({
        response: { statusCode: 400, code: "validation", field: "mapping" },
      });
    }
    const mapping = { email: "email" };
    await expect(
      imports.start(workspaceId, uploaded.id, { mapping }),
    ).rejects.toMatchObject({
      response: { code: "validation", field: "updateExisting" },
    });
    await expect(
      start(uploaded.id, { mapping, listIds: [randomUUID()] }),
    ).rejects.toMatchObject({
      response: { code: "validation", field: "listIds" },
    });
    await expect(
      start(uploaded.id, { mapping, listIds: ["not-an-id"] }),
    ).rejects.toMatchObject({
      response: { code: "validation", field: "listIds" },
    });
    await expect(
      start(uploaded.id, { mapping, tagIds: [randomUUID()] }),
    ).rejects.toMatchObject({
      response: { code: "validation", field: "tagIds" },
    });
    const foreignList = await lists.create(otherWorkspaceId, {
      name: "Foreign list",
    });
    await expect(
      start(uploaded.id, { mapping, listIds: [foreignList.id] }),
    ).rejects.toMatchObject({
      response: { code: "validation", field: "listIds" },
    });
    expect(await imports.get(workspaceId, uploaded.id)).toMatchObject({
      status: "uploaded",
      mapping: null,
    });
    expect(await queue.getJob(uploaded.id)).toBeUndefined();
    await imports.cancel(workspaceId, uploaded.id);
  });

  it("imports 2,500 rows and reports invalid and duplicate ones", async () => {
    const lines = ["email,first_name,note"];
    const expectedErrors: string[][] = [];
    let duplicates = 0;
    for (let index = 0; index < 2500; index += 1) {
      let cells = [`bulk-${index}@example.com`, `Person ${index}`, "ok"];
      if (index % 100 === 7) {
        cells = [
          `bulk-not-an-email-${index}`,
          `Person ${index}`,
          'has "quotes", commas',
        ];
        expectedErrors.push(cells);
      } else if (index % 500 === 3) {
        cells = ["", `Person ${index}`, "no address"];
        expectedErrors.push(cells);
      } else if (index % 250 === 10) {
        cells = [
          `BULK-${index - 1}@example.com`,
          `Person ${index}`,
          "duplicate",
        ];
        duplicates += 1;
      }
      lines.push(encodeCsvRow(cells));
    }
    expect(expectedErrors).toHaveLength(30);
    expect(duplicates).toBe(10);
    const text = `${lines.join("\r\n")}\r\n`;
    const chunks = pieces(text, [20_001, 40_003, 77_777]);

    const uploaded = await upload(chunks, "Big list (2024).csv");
    await start(uploaded.id, {
      mapping: { email: "email", first_name: "firstName", note: "skip" },
    });
    const progress: number[] = [];
    const upsertMany = ContactsService.prototype.upsertMany;
    vi.spyOn(ContactsService.prototype, "upsertMany").mockImplementation(
      async function (this: ContactsService, ...args) {
        const before = await imports.get(workspaceId, uploaded.id);
        progress.push(before.processedRows);
        expect(before.status).toBe("running");
        expect(args[1].length).toBeLessThanOrEqual(500);
        return upsertMany.apply(this, args);
      },
    );
    await run(uploaded.id);
    expect(progress).toEqual([0, 500, 1000, 1500, 2000]);

    const done = await imports.get(workspaceId, uploaded.id);
    expect(done).toMatchObject({
      status: "completed",
      totalRows: 2500,
      processedRows: 2500,
      createdCount: 2460,
      updatedCount: 0,
      skippedCount: 10,
      errorCount: 30,
      hasErrorReport: true,
    });
    expect(await contactCount("bulk-%")).toBe(2460);
    const [winner] = await contactsByEmail(["bulk-9@example.com"]);
    expect(winner?.firstName).toBe("Person 10");

    const report = await imports.errorReport(workspaceId, uploaded.id);
    expect(report.fileName).toBe("Big-list-2024-errors.csv");
    const reportRows = parseCsv(report.content.toString("utf8"), ",");
    expect(reportRows[0]).toEqual(["error", "email", "first_name", "note"]);
    expect(reportRows.slice(1).map((row) => row.slice(1))).toEqual(
      expectedErrors,
    );
    expect(reportRows.slice(1).every((row) => (row[0] ?? "").length > 0)).toBe(
      true,
    );

    const file = await app
      .get(ImportsController, { strict: false })
      .errors({ method: "apiKey", workspaceId, apiKeyId: "test" }, uploaded.id);
    expect(file.getHeaders()).toMatchObject({
      type: "text/csv; charset=utf-8",
      disposition: 'attachment; filename="Big-list-2024-errors.csv"',
    });
    expect(await partsLeft(uploaded.id, chunks.length)).toBe(0);
    expect(
      await storage.getObject(
        errorReportKey(filePrefix(workspaceId, uploaded.id)),
      ),
    ).not.toBeNull();
  });

  it("skips or updates existing contacts as asked", async () => {
    const first = await importCsv(
      [
        "email,name,city\nexisting-1@example.com,Old One,Rome\nexisting-2@example.com,Old Two,Oslo\n",
      ],
      { mapping: { email: "email", name: "firstName", city: "city" } },
    );
    expect(first).toMatchObject({ createdCount: 2, updatedCount: 0 });

    const again =
      "email,name\nEXISTING-1@example.com,New One\nexisting-2@example.com,New Two\nexisting-3@example.com,New Three\n";
    const kept = await importCsv([again], {
      mapping: { email: "email", name: "firstName" },
      updateExisting: false,
    });
    expect(kept).toMatchObject({
      status: "completed",
      createdCount: 1,
      updatedCount: 0,
      skippedCount: 2,
      options: { updateExisting: false },
    });
    const emails = [
      "existing-1@example.com",
      "existing-2@example.com",
      "existing-3@example.com",
    ];
    const before = await contactsByEmail(emails);
    expect(before.map((row) => row.firstName).sort()).toEqual([
      "New Three",
      "Old One",
      "Old Two",
    ]);

    const updated = await importCsv([again], {
      mapping: { email: "email", name: "firstName" },
      updateExisting: true,
    });
    expect(updated).toMatchObject({
      status: "completed",
      createdCount: 0,
      updatedCount: 3,
      skippedCount: 0,
      options: { updateExisting: true },
    });
    const after = await contactsByEmail(emails);
    expect(after.map((row) => row.firstName).sort()).toEqual([
      "New One",
      "New Three",
      "New Two",
    ]);
    expect(
      after.find((row) => row.email === "existing-1@example.com")?.city,
    ).toBe("Rome");
  });

  it("adds imported contacts to lists and tags", async () => {
    const list = await lists.create(workspaceId, { name: "Imported list" });
    const second = await lists.create(workspaceId, { name: "Second list" });
    const tag = await tags.create(workspaceId, { name: "imported" });
    const done = await importCsv(
      ["email\nmember-1@example.com\nmember-2@example.com\nnot-valid\n"],
      {
        mapping: { email: "email" },
        listIds: [list.id, second.id, list.id],
        tagIds: [tag.id],
      },
    );
    expect(done).toMatchObject({
      status: "completed",
      createdCount: 2,
      errorCount: 1,
      options: { listIds: [list.id, second.id], tagIds: [tag.id] },
    });
    const contacts = await contactsByEmail([
      "member-1@example.com",
      "member-2@example.com",
    ]);
    const ids = contacts.map((row) => row.id);
    const members = await db
      .select()
      .from(schema.listMembers)
      .where(inArray(schema.listMembers.contactId, ids));
    expect(members).toHaveLength(4);
    expect(members.every((row) => row.status === "subscribed")).toBe(true);
    expect(new Set(members.map((row) => row.listId))).toEqual(
      new Set([list.id, second.id]),
    );
    const tagged = await db
      .select()
      .from(schema.contactTags)
      .where(inArray(schema.contactTags.contactId, ids));
    expect(tagged.map((row) => row.tagId)).toEqual([tag.id, tag.id]);
  });

  it("maps columns to custom fields", async () => {
    await db.insert(schema.contactFields).values([
      { workspaceId, key: "plan", label: "Plan", type: "text", position: 0 },
      {
        workspaceId,
        key: "seats",
        label: "Seats",
        type: "number",
        position: 1,
      },
    ]);
    const done = await importCsv(
      [
        "email,Plan,Seats\ncustom-1@example.com,pro,12\ncustom-2@example.com,,\ncustom-3@example.com,free,many\n",
      ],
      {
        mapping: { email: "email", Plan: "custom:plan", Seats: "custom:seats" },
      },
    );
    expect(done).toMatchObject({
      status: "completed",
      createdCount: 2,
      errorCount: 1,
      mapping: { email: "email", Plan: "custom:plan", Seats: "custom:seats" },
    });
    const rows = await contactsByEmail([
      "custom-1@example.com",
      "custom-2@example.com",
      "custom-3@example.com",
    ]);
    expect(
      Object.fromEntries(rows.map((row) => [row.email, row.fields])),
    ).toEqual({
      "custom-1@example.com": { plan: "pro", seats: 12 },
      "custom-2@example.com": {},
    });
    const report = await imports.errorReport(workspaceId, done.id);
    const reportRows = parseCsv(report.content.toString("utf8"), ",");
    expect(reportRows[1]?.slice(1)).toEqual([
      "custom-3@example.com",
      "free",
      "many",
    ]);
  });

  it("stops when cancelled and keeps what was imported", async () => {
    const chunks = pieces(bigCsv("cancel", 1200), [9000, 18_000]);
    const uploaded = await upload(chunks, "cancel.csv");
    await start(uploaded.id, { mapping: bigMapping });
    const upsertMany = ContactsService.prototype.upsertMany;
    const spy = vi
      .spyOn(ContactsService.prototype, "upsertMany")
      .mockImplementation(async function (this: ContactsService, ...args) {
        const result = await upsertMany.apply(this, args);
        const cancelled = await imports.cancel(workspaceId, uploaded.id);
        expect(cancelled.status).toBe("cancelled");
        return result;
      });
    const result = await run(uploaded.id);
    expect(result).toMatchObject({ status: "cancelled" });
    expect(spy).toHaveBeenCalledTimes(1);

    const stopped = await imports.get(workspaceId, uploaded.id);
    expect(stopped).toMatchObject({
      status: "cancelled",
      processedRows: 500,
      createdCount: 500,
      totalRows: 0,
    });
    expect(stopped.finishedAt).not.toBeNull();
    expect(await contactCount("cancel-%")).toBe(500);
    expect(await partsLeft(uploaded.id, chunks.length)).toBe(0);

    vi.restoreAllMocks();
    expect(await run(uploaded.id)).toMatchObject({ status: "cancelled" });
    expect(await contactCount("cancel-%")).toBe(500);
    const again = await imports.cancel(workspaceId, uploaded.id);
    expect(again.status).toBe("cancelled");
    await expect(
      start(uploaded.id, { mapping: bigMapping }),
    ).rejects.toMatchObject({
      response: { statusCode: 409, code: "conflict" },
    });
  });

  it("cancels a queued import before it runs", async () => {
    const uploaded = await upload([bigCsv("never", 3)]);
    await start(uploaded.id, { mapping: bigMapping });
    const cancelled = await imports.cancel(workspaceId, uploaded.id);
    expect(cancelled.status).toBe("cancelled");
    expect(await queue.getJob(uploaded.id)).toBeUndefined();
    expect(await partsLeft(uploaded.id, 1)).toBe(0);
    expect(await run(uploaded.id)).toMatchObject({ status: "cancelled" });
    expect(await contactCount("never-%")).toBe(0);
  });

  it("resumes after a crash without counting rows twice", async () => {
    const text = bigCsv("crash", 1200, 100);
    const chunks = pieces(text, [7000, 21_000]);
    const uploaded = await upload(chunks, "crash.csv");
    await start(uploaded.id, { mapping: bigMapping });

    const upsertMany = ContactsService.prototype.upsertMany;
    let calls = 0;
    vi.spyOn(ContactsService.prototype, "upsertMany").mockImplementation(
      async function (this: ContactsService, ...args) {
        calls += 1;
        if (calls === 2) {
          throw new Error("connection lost at secret-host:5432");
        }
        return upsertMany.apply(this, args);
      },
    );
    await expect(run(uploaded.id, 0)).rejects.toThrow("connection lost");
    const interrupted = await imports.get(workspaceId, uploaded.id);
    expect(interrupted).toMatchObject({
      status: "running",
      processedRows: 500,
      createdCount: 495,
      errorCount: 5,
      hasErrorReport: false,
      errorMessage: null,
    });
    expect(await partsLeft(uploaded.id, chunks.length)).toBe(chunks.length);

    vi.restoreAllMocks();
    const batches: number[] = [];
    vi.spyOn(ContactsService.prototype, "upsertMany").mockImplementation(
      async function (this: ContactsService, ...args) {
        batches.push(args[1].length);
        return upsertMany.apply(this, args);
      },
    );
    await run(uploaded.id, 1);
    expect(batches).toEqual([500, 200]);
    const done = await imports.get(workspaceId, uploaded.id);
    expect(done).toMatchObject({
      status: "completed",
      totalRows: 1200,
      processedRows: 1200,
      createdCount: 1188,
      updatedCount: 0,
      skippedCount: 0,
      errorCount: 12,
      hasErrorReport: true,
    });
    expect(done.startedAt).toBe(interrupted.startedAt);
    expect(await contactCount("crash-%")).toBe(1188);
    const report = await imports.errorReport(workspaceId, uploaded.id);
    const reportRows = parseCsv(report.content.toString("utf8"), ",");
    expect(reportRows.slice(1).map((row) => row[1])).toEqual(
      Array.from(
        { length: 12 },
        (_, index) => `crash-broken-${index * 100 + 5}`,
      ),
    );
    expect(await partsLeft(uploaded.id, chunks.length)).toBe(0);
  });

  it("marks the import failed when the last attempt fails", async () => {
    const uploaded = await upload([bigCsv("fail", 20, 10)], "fail.csv");
    await start(uploaded.id, { mapping: bigMapping });
    vi.spyOn(ContactsService.prototype, "upsertMany").mockRejectedValue(
      new Error("connection lost at secret-host:5432"),
    );
    await expect(run(uploaded.id, 1)).rejects.toThrow("connection lost");
    expect(await imports.get(workspaceId, uploaded.id)).toMatchObject({
      status: "running",
      errorMessage: null,
    });
    await expect(run(uploaded.id, 2)).rejects.toThrow("connection lost");
    const failed = await imports.get(workspaceId, uploaded.id);
    expect(failed).toMatchObject({
      status: "failed",
      processedRows: 0,
      createdCount: 0,
    });
    expect(failed.errorMessage).toEqual(expect.any(String));
    expect(failed.errorMessage).not.toContain("secret-host");
    expect(failed.finishedAt).not.toBeNull();
    expect(await partsLeft(uploaded.id, 1)).toBe(0);
    expect(await contactCount("fail-%")).toBe(0);
    vi.restoreAllMocks();
    expect(await run(uploaded.id)).toMatchObject({ status: "failed" });
  });

  it("refuses a second start", async () => {
    const uploaded = await upload(["email\nsecond-start@example.com\n"]);
    const mapping = { email: "email" };
    await start(uploaded.id, { mapping });
    await expect(start(uploaded.id, { mapping })).rejects.toMatchObject({
      response: { statusCode: 409, code: "conflict" },
    });
    await run(uploaded.id);
    await expect(start(uploaded.id, { mapping })).rejects.toMatchObject({
      response: { statusCode: 409, code: "conflict" },
    });
    expect(await imports.get(workspaceId, uploaded.id)).toMatchObject({
      status: "completed",
      createdCount: 1,
    });
  });

  it("lets a workspace run three imports at a time", async () => {
    const mapping = { email: "email" };
    const uploads = [];
    for (let index = 0; index < 4; index += 1) {
      uploads.push(await upload([`email\nlimit-${index}@example.com\n`]));
    }
    const [first, second, third, fourth] = uploads as [
      Import,
      Import,
      Import,
      Import,
    ];
    await start(first.id, { mapping });
    await start(second.id, { mapping });
    await start(third.id, { mapping });
    await expect(start(fourth.id, { mapping })).rejects.toMatchObject({
      response: { statusCode: 409, code: "too_many_imports" },
    });
    expect(await imports.get(workspaceId, fourth.id)).toMatchObject({
      status: "uploaded",
    });

    const elsewhere = await upload(
      ["email\nlimit-other@example.com\n"],
      "other.csv",
      otherWorkspaceId,
    );
    await start(elsewhere.id, { mapping }, otherWorkspaceId);
    await imports.cancel(otherWorkspaceId, elsewhere.id);

    await run(first.id);
    await start(fourth.id, { mapping });
    await imports.cancel(workspaceId, second.id);
    await run(third.id);
    await run(fourth.id);
    const statuses = await Promise.all(
      uploads.map(
        async (item) => (await imports.get(workspaceId, item.id)).status,
      ),
    );
    expect(statuses).toEqual([
      "completed",
      "cancelled",
      "completed",
      "completed",
    ]);
  });

  it("starts only one of two concurrent starts past the limit", async () => {
    const mapping = { email: "email" };
    const uploads = [];
    for (let index = 0; index < 5; index += 1) {
      uploads.push(await upload([`email\nrace-${index}@example.com\n`]));
    }
    const results = await Promise.allSettled(
      uploads.map((item) => start(item.id, { mapping })),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(3);
    for (const item of uploads) {
      await imports.cancel(workspaceId, item.id);
    }
  });

  it("keeps imports private to their workspace", async () => {
    const uploaded = await upload(["email\nprivate@example.com\nbroken\n"]);
    const mapping = { email: "email" };
    const missing = { response: { statusCode: 404, code: "not_found" } };
    await expect(
      imports.get(otherWorkspaceId, uploaded.id),
    ).rejects.toMatchObject(missing);
    await expect(
      start(uploaded.id, { mapping }, otherWorkspaceId),
    ).rejects.toMatchObject(missing);
    await expect(
      imports.cancel(otherWorkspaceId, uploaded.id),
    ).rejects.toMatchObject(missing);
    await start(uploaded.id, { mapping });
    await run(uploaded.id);
    expect(
      (await imports.errorReport(workspaceId, uploaded.id)).content.length,
    ).toBeGreaterThan(0);
    await expect(
      imports.errorReport(otherWorkspaceId, uploaded.id),
    ).rejects.toMatchObject(missing);
    const listed = await imports.list(otherWorkspaceId);
    expect(listed.imports.map((item) => item.id)).not.toContain(uploaded.id);
    expect(
      await contactsByEmail(["private@example.com"], otherWorkspaceId),
    ).toHaveLength(0);
    await expect(imports.get(workspaceId, "not-an-id")).rejects.toMatchObject(
      missing,
    );
  });

  it("runs a queued import through the worker", async () => {
    const uploaded = await upload([bigCsv("worker", 620)], "worker.csv");
    processor.worker.resume();
    try {
      await start(uploaded.id, { mapping: bigMapping });
      let current = await imports.get(workspaceId, uploaded.id);
      for (
        let attempt = 0;
        attempt < 200 && current.status !== "completed";
        attempt += 1
      ) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        current = await imports.get(workspaceId, uploaded.id);
      }
      expect(current).toMatchObject({
        status: "completed",
        totalRows: 620,
        createdCount: 620,
      });
    } finally {
      await processor.worker.pause();
    }
  });
});
