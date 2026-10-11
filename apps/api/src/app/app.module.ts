import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { rootEnvFile, validateEnv } from "../config/env";
import { CryptoModule } from "../infra/crypto/crypto.module";
import { DatabaseModule } from "../infra/database/database.module";
import { QueueModule } from "../infra/queue/queue.module";
import { RedisModule } from "../infra/redis/redis.module";
import { StorageModule } from "../infra/storage/storage.module";
import { AuthModule } from "../modules/auth/auth.module";
import { ContactsModule } from "../modules/contacts/contacts.module";
import { DispatchModule } from "../modules/dispatch/dispatch.module";
import { ImportsModule } from "../modules/imports/imports.module";
import { IntegrationsModule } from "../modules/integrations/integrations.module";
import { ListsModule } from "../modules/lists/lists.module";
import { ProviderEventsModule } from "../modules/provider-events/provider-events.module";
import { SegmentsModule } from "../modules/segments/segments.module";
import { SuppressionModule } from "../modules/suppression/suppression.module";
import { TagsModule } from "../modules/tags/tags.module";
import { TransactionalModule } from "../modules/transactional/transactional.module";
import { WarmupModule } from "../modules/warmup/warmup.module";
import { WorkspacesModule } from "../modules/workspaces/workspaces.module";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";

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
    AuthModule,
    WorkspacesModule,
    IntegrationsModule,
    ProviderEventsModule,
    SuppressionModule,
    DispatchModule,
    TransactionalModule,
    WarmupModule,
    ListsModule,
    TagsModule,
    ContactsModule,
    SegmentsModule,
    ImportsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
