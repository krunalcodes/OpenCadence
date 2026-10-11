import { Module } from "@nestjs/common";
import { WorkspaceAuthGuard } from "../../common/guards/workspace-auth.guard";
import { SuppressionController } from "./suppression.controller";
import { SuppressionRepository } from "./suppression.repository";
import { SuppressionService } from "./suppression.service";

@Module({
  controllers: [SuppressionController],
  providers: [SuppressionRepository, SuppressionService, WorkspaceAuthGuard],
  exports: [SuppressionService],
})
export class SuppressionModule {}
