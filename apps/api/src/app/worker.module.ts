import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { rootEnvFile, validateEnv } from "../config/env";
import { CryptoModule } from "../infra/crypto/crypto.module";
import { DatabaseModule } from "../infra/database/database.module";
import { QueueModule } from "../infra/queue/queue.module";
import { RedisModule } from "../infra/redis/redis.module";
import { StorageModule } from "../infra/storage/storage.module";
import { DispatchWorkerModule } from "../modules/dispatch/dispatch.worker.module";
import { IntegrationsWorkerModule } from "../modules/integrations/integrations.worker.module";

const featureWorkerModules = [IntegrationsWorkerModule, DispatchWorkerModule];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: rootEnvFile,
      validate: validateEnv,
    }),
    DatabaseModule,
    RedisModule,
    QueueModule,
    CryptoModule,
    StorageModule,
    ...featureWorkerModules,
  ],
})
export class WorkerModule {}
