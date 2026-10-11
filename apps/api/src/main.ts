import { VersioningType } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { apiReference } from "@scalar/nestjs-api-reference";
import { API_KEY_HEADER } from "@workspace/auth";
import { AppModule } from "./app/app.module";
import { API_KEY_SECURITY } from "./common/decorators/workspace-auth.decorator";
import { mountQueueBoard } from "./infra/queue/queue-board.mount";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { bodyParser: false },
  );

  app.enableShutdownHooks();

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: "1",
  });

  const config = new DocumentBuilder()
    .setTitle("OpenCadence API")
    .setDescription("API for the OpenCadence email platform")
    .setVersion("1")
    .addCookieAuth("better-auth.session_token")
    .addApiKey(
      {
        type: "apiKey",
        in: "header",
        name: API_KEY_HEADER,
        description:
          "A workspace API key. Create one under Settings, API keys. The key acts for the workspace that owns it.",
      },
      API_KEY_SECURITY,
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);
  app.use("/docs", apiReference({ content: document, withFastify: true }));

  await mountQueueBoard(app);

  await app.listen(process.env.PORT ?? 3001, process.env.HOST ?? "0.0.0.0");
}
await bootstrap();
