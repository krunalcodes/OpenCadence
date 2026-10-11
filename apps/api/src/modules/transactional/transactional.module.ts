import { Module } from "@nestjs/common";
import { WorkspaceAuthGuard } from "../../common/guards/workspace-auth.guard";
import { DispatchModule } from "../dispatch/dispatch.module";
import { TransactionalController } from "./transactional.controller";
import { TransactionalService } from "./transactional.service";

@Module({
  imports: [DispatchModule],
  controllers: [TransactionalController],
  providers: [TransactionalService, WorkspaceAuthGuard],
})
export class TransactionalModule {}
