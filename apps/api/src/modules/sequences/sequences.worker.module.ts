import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { BrandWorkerModule } from "../brand/brand.worker.module";
import { ContactsWorkerModule } from "../contacts/contacts.worker.module";
import { SEQUENCE_OUTCOMES_QUEUE } from "../dispatch/dispatch.constants";
import { DispatchWorkerModule } from "../dispatch/dispatch.worker.module";
import { IntegrationsWorkerModule } from "../integrations/integrations.worker.module";
import { SegmentsWorkerModule } from "../segments/segments.worker.module";
import { SuppressionWorkerModule } from "../suppression/suppression.worker.module";
import { SequenceEnrollProcessor } from "./jobs/sequence-enroll.processor";
import { SequenceOutcomesProcessor } from "./jobs/sequence-outcomes.processor";
import { SequenceTickProcessor } from "./jobs/sequence-tick.processor";
import { sequencesProviders, sequencesQueues } from "./sequences.module";

@Module({
  imports: [
    sequencesQueues,
    BullModule.registerQueue({ name: SEQUENCE_OUTCOMES_QUEUE }),
    BrandWorkerModule,
    ContactsWorkerModule,
    DispatchWorkerModule,
    IntegrationsWorkerModule,
    SegmentsWorkerModule,
    SuppressionWorkerModule,
  ],
  providers: [
    ...sequencesProviders,
    SequenceTickProcessor,
    SequenceEnrollProcessor,
    SequenceOutcomesProcessor,
  ],
})
export class SequencesWorkerModule {}
