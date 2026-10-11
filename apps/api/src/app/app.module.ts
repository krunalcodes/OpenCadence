import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { rootEnvFile, validateEnv } from "../config/env";
import { DatabaseModule } from "../infra/database/database.module";
import { AuthModule } from "../modules/auth/auth.module";
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
    AuthModule,
    WorkspacesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
