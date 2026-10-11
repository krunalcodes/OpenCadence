import { Module } from "@nestjs/common";
import { IntegrationsWorkerModule } from "../integrations/integrations.worker.module";
import { domainsProviders, domainsQueues } from "./domains.module";
import { DomainChecksProcessor } from "./jobs/domain-checks.processor";

@Module({
  imports: [domainsQueues, IntegrationsWorkerModule],
  providers: [...domainsProviders, DomainChecksProcessor],
})
export class DomainsWorkerModule {}
