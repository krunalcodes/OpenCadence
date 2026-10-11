import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { rootEnvFile, validateEnv } from "../config/env";
import { CryptoModule } from "../infra/crypto/crypto.module";
import { DatabaseModule } from "../infra/database/database.module";
import { QueueModule } from "../infra/queue/queue.module";
import { RedisModule } from "../infra/redis/redis.module";
import { AuthModule } from "../modules/auth/auth.module";
import { IntegrationsModule } from "../modules/integrations/integrations.module";
import { ProviderEventsModule } from "../modules/provider-events/provider-events.module";
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
    AuthModule,
    WorkspacesModule,
    IntegrationsModule,
    ProviderEventsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
