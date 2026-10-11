import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { WorkerModule } from "./app/worker.module";

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);

  app.enableShutdownHooks();

  new Logger("Worker").log("Queue worker ready");
}
await bootstrap();
