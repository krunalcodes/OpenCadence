import { Module } from "@nestjs/common";
import { WorkspaceAuthGuard } from "../../common/guards/workspace-auth.guard";
import { BrandModule } from "../brand/brand.module";
import { DispatchModule } from "../dispatch/dispatch.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { TemplatesController } from "./templates.controller";
import { TemplatesRepository } from "./templates.repository";
import { TemplatesService } from "./templates.service";

@Module({
  imports: [BrandModule, DispatchModule, IntegrationsModule],
  controllers: [TemplatesController],
  providers: [TemplatesRepository, TemplatesService, WorkspaceAuthGuard],
  exports: [TemplatesService],
})
export class TemplatesModule {}
