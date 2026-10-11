import { Module } from "@nestjs/common";
import { MediaWorkerModule } from "../media/media.worker.module";
import { BrandRepository } from "./brand.repository";
import { BrandService } from "./brand.service";

@Module({
  imports: [MediaWorkerModule],
  providers: [BrandRepository, BrandService],
  exports: [BrandService],
})
export class BrandWorkerModule {}
