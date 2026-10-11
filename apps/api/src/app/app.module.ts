import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { rootEnvFile, validateEnv } from "../config/env";
import { CryptoModule } from "../infra/crypto/crypto.module";
import { DatabaseModule } from "../infra/database/database.module";
import { QueueModule } from "../infra/queue/queue.module";
import { RedisModule } from "../infra/redis/redis.module";
import { StorageModule } from "../infra/storage/storage.module";
import { TrackingKeysModule } from "../infra/tracking-keys/tracking-keys.module";
import { AiModule } from "../modules/ai/ai.module";
import { AnalyticsModule } from "../modules/analytics/analytics.module";
import { AuthModule } from "../modules/auth/auth.module";
import { BrandModule } from "../modules/brand/brand.module";
import { CampaignsModule } from "../modules/campaigns/campaigns.module";
import { ContactsModule } from "../modules/contacts/contacts.module";
import { DispatchModule } from "../modules/dispatch/dispatch.module";
import { ImportsModule } from "../modules/imports/imports.module";
import { IntegrationsModule } from "../modules/integrations/integrations.module";
import { ListsModule } from "../modules/lists/lists.module";
import { MediaModule } from "../modules/media/media.module";
import { ProviderEventsModule } from "../modules/provider-events/provider-events.module";
import { SegmentsModule } from "../modules/segments/segments.module";
import { SequencesModule } from "../modules/sequences/sequences.module";
import { SuppressionModule } from "../modules/suppression/suppression.module";
import { TagsModule } from "../modules/tags/tags.module";
import { TemplatesModule } from "../modules/templates/templates.module";
import { TrackingModule } from "../modules/tracking/tracking.module";
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
    TrackingKeysModule,
    AuthModule,
    WorkspacesModule,
    IntegrationsModule,
    ProviderEventsModule,
    SuppressionModule,
    DispatchModule,
    TrackingModule,
    TransactionalModule,
    WarmupModule,
    ListsModule,
    TagsModule,
    ContactsModule,
    SegmentsModule,
    MediaModule,
    BrandModule,
    TemplatesModule,
    CampaignsModule,
    SequencesModule,
    ImportsModule,
    AiModule,
    AnalyticsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
