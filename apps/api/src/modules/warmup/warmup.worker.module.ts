import { Module } from "@nestjs/common";
import { IntegrationsWorkerModule } from "../integrations/integrations.worker.module";
import { WarmupProcessor } from "./jobs/warmup.processor";
import { WARMUP_CONTENT } from "./warmup.constants";
import { TemplateWarmupContentGenerator } from "./warmup.content";
import { WarmupEngine } from "./warmup.engine";
import { warmupQueues, warmupRandomProvider } from "./warmup.module";
import { WarmupRepository } from "./warmup.repository";

@Module({
  imports: [warmupQueues, IntegrationsWorkerModule],
  providers: [
    warmupRandomProvider,
    { provide: WARMUP_CONTENT, useClass: TemplateWarmupContentGenerator },
    WarmupRepository,
    WarmupEngine,
    WarmupProcessor,
  ],
})
export class WarmupWorkerModule {}
