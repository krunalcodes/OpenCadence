import { VersioningType } from "@nestjs/common";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test, type TestingModule } from "@nestjs/testing";
import { AppModule } from "../src/app/app.module";

describe("AppController (e2e)", () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
      { bodyParser: false },
    );
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  it("/v1 (GET)", async () => {
    const response = await app.inject({ method: "GET", url: "/v1" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("Hello World!");
  });

  it("/v1/me (GET) rejects a request without a session", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/me" });

    expect(response.statusCode).toBe(401);
  });

  it("/v1/workspace (GET) rejects a request without a session or API key", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/workspace" });

    expect(response.statusCode).toBe(401);
  });

  it("/v1/workspace (GET) rejects an unknown API key", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/workspace",
      headers: { "x-api-key": `oc_${"a".repeat(64)}` },
    });

    expect(response.statusCode).toBe(401);
  });

  it("/api/auth/ok (GET) is served outside versioning", async () => {
    const response = await app.inject({ method: "GET", url: "/api/auth/ok" });

    expect(response.statusCode).toBe(200);
  });

  afterEach(async () => {
    await app.close();
  });
});
