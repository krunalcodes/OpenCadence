import { randomUUID } from "node:crypto";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { type Env, rootEnvFile, validateEnv } from "../src/config/env";
import { StorageModule } from "../src/infra/storage/storage.module";
import { StorageService } from "../src/infra/storage/storage.service";

describe("StorageService (e2e)", () => {
  const prefix = `e2e-storage/${randomUUID()}`;
  const written = new Set<string>();
  let moduleRef: TestingModule;
  let storage: StorageService;

  function key(name: string) {
    const value = `${prefix}/${name}`;
    written.add(value);
    return value;
  }

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: rootEnvFile,
          validate: validateEnv,
        }),
        StorageModule,
      ],
    }).compile();
    await moduleRef.init();
    storage = moduleRef.get(StorageService);
  });

  afterAll(async () => {
    for (const value of written) {
      await storage.deleteObject(value);
    }
    await moduleRef.close();
  });

  it("creates the bucket once and tolerates repeated and concurrent calls", async () => {
    await Promise.all([storage.ensureBucket(), storage.ensureBucket()]);
    await expect(storage.ensureBucket()).resolves.toBeUndefined();
  });

  it("stores and reads back a string body", async () => {
    const target = key("message.html");

    await storage.putObject(target, "<p>Hello</p>", "text/html");

    const stored = await storage.getObject(target);
    expect(stored?.toString("utf8")).toBe("<p>Hello</p>");
  });

  it("stores and reads back a binary body", async () => {
    const target = key("blob.bin");
    const body = Buffer.from([0, 255, 1, 254, 2, 253]);

    await storage.putObject(target, body, "application/octet-stream");

    const stored = await storage.getObject(target);
    expect(stored?.equals(body)).toBe(true);
  });

  it("returns null for a key that does not exist", async () => {
    await expect(storage.getObject(key("missing"))).resolves.toBeNull();
  });

  it("deletes an object", async () => {
    const target = key("deleted.txt");
    await storage.putObject(target, "gone soon", "text/plain");

    await storage.deleteObject(target);

    await expect(storage.getObject(target)).resolves.toBeNull();
  });

  it("does not fail when deleting a key that does not exist", async () => {
    await expect(
      storage.deleteObject(key("never-written")),
    ).resolves.toBeUndefined();
  });

  it("reports failures without credentials in the message", async () => {
    const config = moduleRef.get<ConfigService<Env, true>>(ConfigService);
    const wrongSecret = `wrong-${randomUUID()}`;
    const accessKeyId = config.get("S3_ACCESS_KEY_ID", { infer: true });
    const overrides: Partial<Env> = { S3_SECRET_ACCESS_KEY: wrongSecret };
    const denied = new StorageService({
      get: (name: keyof Env) =>
        overrides[name] ?? config.get(name, { infer: true }),
    } as unknown as ConfigService<Env, true>);

    const failure = await denied
      .putObject(key("denied.txt"), "nope", "text/plain")
      .then(
        () => null,
        (error: unknown) => error,
      );
    denied.onApplicationShutdown();

    expect(failure).toBeInstanceOf(Error);
    const message = (failure as Error).message;
    expect(message).toMatch(/^Storage could not /);
    expect(message).not.toContain(wrongSecret);
    expect(message).not.toContain(accessKeyId);
  });
});
