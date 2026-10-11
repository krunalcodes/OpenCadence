import { Module } from "@nestjs/common";
import { WorkspaceAuthGuard } from "../../common/guards/workspace-auth.guard";
import { MediaModule } from "../media/media.module";
import { BrandController } from "./brand.controller";
import { BrandRepository } from "./brand.repository";
import { BrandService } from "./brand.service";

@Module({
  imports: [MediaModule],
  controllers: [BrandController],
  providers: [BrandRepository, BrandService, WorkspaceAuthGuard],
  exports: [BrandService],
})
export class BrandModule {}
