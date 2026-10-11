import { VersioningType } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { apiReference } from "@scalar/nestjs-api-reference";
import { AppModule } from "./app/app.module.js";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: "1",
  });

  const config = new DocumentBuilder()
    .setTitle("OpenCadence API")
    .setDescription("API for the OpenCadence email platform")
    .setVersion("1")
    .build();
  const document = SwaggerModule.createDocument(app, config);
  app.use("/docs", apiReference({ content: document, withFastify: true }));

  await app.listen(process.env.PORT ?? 3001, process.env.HOST ?? "0.0.0.0");
}
await bootstrap();
