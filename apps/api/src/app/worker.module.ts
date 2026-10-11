import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { rootEnvFile, validateEnv } from "../config/env";
import { CryptoModule } from "../infra/crypto/crypto.module";
import { DatabaseModule } from "../infra/database/database.module";
import { QueueModule } from "../infra/queue/queue.module";
import { RedisModule } from "../infra/redis/redis.module";
import { StorageModule } from "../infra/storage/storage.module";
import { TrackingKeysModule } from "../infra/tracking-keys/tracking-keys.module";
import { CampaignsWorkerModule } from "../modules/campaigns/campaigns.worker.module";
import { DispatchWorkerModule } from "../modules/dispatch/dispatch.worker.module";
import { ImportsWorkerModule } from "../modules/imports/imports.worker.module";
import { IntegrationsWorkerModule } from "../modules/integrations/integrations.worker.module";
import { SequencesWorkerModule } from "../modules/sequences/sequences.worker.module";
import { WarmupWorkerModule } from "../modules/warmup/warmup.worker.module";

const featureWorkerModules = [
  IntegrationsWorkerModule,
  DispatchWorkerModule,
  WarmupWorkerModule,
  ImportsWorkerModule,
  CampaignsWorkerModule,
  SequencesWorkerModule,
];

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
    TrackingKeysModule,
    ...featureWorkerModules,
  ],
})
export class WorkerModule {}
