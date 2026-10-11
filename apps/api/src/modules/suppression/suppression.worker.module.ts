import { Module } from "@nestjs/common";
import { SuppressionRepository } from "./suppression.repository";
import { SuppressionService } from "./suppression.service";

@Module({
  providers: [SuppressionRepository, SuppressionService],
  exports: [SuppressionService],
})
export class SuppressionWorkerModule {}
