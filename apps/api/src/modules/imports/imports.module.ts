import { BullModule, InjectQueue } from "@nestjs/bullmq";
import { Inject, Module, type OnModuleInit } from "@nestjs/common";
import type { Queue } from "bullmq";
import { WorkspaceAuthGuard } from "../../common/guards/workspace-auth.guard";
import { QueueBoard } from "../../infra/queue/queue-board.service";
import { ContactsModule } from "../contacts/contacts.module";
import { ListsModule } from "../lists/lists.module";
import { TagsModule } from "../tags/tags.module";
import { ImportFiles } from "./import-files";
import { IMPORTS_QUEUE } from "./imports.constants";
import { ImportsController } from "./imports.controller";
import { ImportsRepository } from "./imports.repository";
import { ImportsService } from "./imports.service";

export const importsQueues = BullModule.registerQueue({ name: IMPORTS_QUEUE });

@Module({
  imports: [importsQueues, ContactsModule, ListsModule, TagsModule],
  controllers: [ImportsController],
  providers: [
    ImportFiles,
    ImportsRepository,
    ImportsService,
    WorkspaceAuthGuard,
  ],
})
export class ImportsModule implements OnModuleInit {
  constructor(
    @InjectQueue(IMPORTS_QUEUE) private readonly queue: Queue,
    @Inject(QueueBoard) private readonly board: QueueBoard,
  ) {}

  onModuleInit() {
    this.board.register(this.queue);
  }
}
