import { Module } from "@nestjs/common";
import { DispatchWorkerModule } from "../dispatch/dispatch.worker.module";
import { IntegrationsWorkerModule } from "../integrations/integrations.worker.module";
import { SuppressionWorkerModule } from "../suppression/suppression.worker.module";
import { inboxProviders, inboxQueues } from "./inbox.module";
import { InboxMaintenanceProcessor } from "./jobs/inbox-maintenance.processor";
import { InboxPollProcessor } from "./jobs/inbox-poll.processor";

@Module({
  imports: [
    inboxQueues,
    DispatchWorkerModule,
    IntegrationsWorkerModule,
    SuppressionWorkerModule,
  ],
  providers: [...inboxProviders, InboxPollProcessor, InboxMaintenanceProcessor],
})
export class InboxWorkerModule {}
