import { Module } from "@nestjs/common";
import { MediaRepository } from "./media.repository";
import { MediaService } from "./media.service";

@Module({
  providers: [MediaRepository, MediaService],
  exports: [MediaService],
})
export class MediaWorkerModule {}
