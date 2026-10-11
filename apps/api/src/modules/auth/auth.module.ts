import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthModule as BetterAuthModule } from "@thallesp/nestjs-better-auth";
import { createAuth } from "@workspace/auth";
import type { Db } from "@workspace/db";
import { createMailer } from "@workspace/email";
import type { Env } from "../../config/env";
import { DATABASE } from "../../infra/database/database.module";
import { AuthController } from "./auth.controller";

@Module({
  imports: [
    BetterAuthModule.forRootAsync({
      inject: [ConfigService, DATABASE],
      useFactory: (config: ConfigService<Env, true>, db: Db) => {
        const clientId = config.get("GOOGLE_CLIENT_ID", { infer: true });
        const clientSecret = config.get("GOOGLE_CLIENT_SECRET", {
          infer: true,
        });

        return {
          auth: createAuth({
            db,
            mailer: createMailer({
              provider: config.get("EMAIL_PROVIDER", { infer: true }),
              from: config.get("EMAIL_FROM", { infer: true }),
              resendApiKey: config.get("RESEND_API_KEY", { infer: true }),
            }),
            secret: config.get("BETTER_AUTH_SECRET", { infer: true }),
            baseURL: config.get("BETTER_AUTH_URL", { infer: true }),
            google:
              clientId && clientSecret ? { clientId, clientSecret } : undefined,
          }),
        };
      },
    }),
  ],
  controllers: [AuthController],
})
export class AuthModule {}
