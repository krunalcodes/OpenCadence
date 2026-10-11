import { Module } from "@nestjs/common";
import { WorkspaceAuthGuard } from "../../common/guards/workspace-auth.guard";
import { BrandModule } from "../brand/brand.module";
import { AiController } from "./ai.controller";
import { AiRateLimiter } from "./ai.rate-limiter";
import { AiRepository } from "./ai.repository";
import { AiService } from "./ai.service";

@Module({
  imports: [BrandModule],
  controllers: [AiController],
  providers: [AiRepository, AiRateLimiter, AiService, WorkspaceAuthGuard],
})
export class AiModule {}
