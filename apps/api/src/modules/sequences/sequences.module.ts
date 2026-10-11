import { BullModule, InjectQueue } from "@nestjs/bullmq";
import { Inject, Module, type OnModuleInit } from "@nestjs/common";
import type { Queue } from "bullmq";
import { WorkspaceAuthGuard } from "../../common/guards/workspace-auth.guard";
import { QueueBoard } from "../../infra/queue/queue-board.service";
import { BrandModule } from "../brand/brand.module";
import { ContactsModule } from "../contacts/contacts.module";
import { DispatchModule } from "../dispatch/dispatch.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { SegmentsModule } from "../segments/segments.module";
import { SuppressionModule } from "../suppression/suppression.module";
import { TemplatesModule } from "../templates/templates.module";
import { EnrollmentsService } from "./enrollments.service";
import { SequenceOutcomes } from "./sequence-outcomes";
import { SequenceRunner } from "./sequence-runner";
import {
  SEQUENCE_CLOCK,
  SEQUENCE_ENROLL_QUEUE,
  SEQUENCE_TICK_QUEUE,
  systemClock,
} from "./sequences.constants";
import { SequencesController } from "./sequences.controller";
import { SequencesRepository } from "./sequences.repository";
import { SequencesService } from "./sequences.service";

export const sequencesQueues = BullModule.registerQueue(
  { name: SEQUENCE_TICK_QUEUE },
  { name: SEQUENCE_ENROLL_QUEUE },
);

export const sequencesProviders = [
  { provide: SEQUENCE_CLOCK, useValue: systemClock },
  SequencesRepository,
  EnrollmentsService,
  SequenceRunner,
  SequenceOutcomes,
];

@Module({
  imports: [
    sequencesQueues,
    BrandModule,
    ContactsModule,
    DispatchModule,
    IntegrationsModule,
    SegmentsModule,
    SuppressionModule,
    TemplatesModule,
  ],
  controllers: [SequencesController],
  providers: [...sequencesProviders, SequencesService, WorkspaceAuthGuard],
  exports: [SequencesService],
})
export class SequencesModule implements OnModuleInit {
  constructor(
    @InjectQueue(SEQUENCE_TICK_QUEUE) private readonly tickQueue: Queue,
    @InjectQueue(SEQUENCE_ENROLL_QUEUE) private readonly enrollQueue: Queue,
    @Inject(QueueBoard) private readonly board: QueueBoard,
  ) {}

  onModuleInit() {
    this.board.register(this.tickQueue);
    this.board.register(this.enrollQueue);
  }
}
