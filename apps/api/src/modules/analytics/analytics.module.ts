import { Module } from "@nestjs/common";
import { WorkspaceAuthGuard } from "../../common/guards/workspace-auth.guard";
import { CampaignsModule } from "../campaigns/campaigns.module";
import { ContactsModule } from "../contacts/contacts.module";
import { DispatchModule } from "../dispatch/dispatch.module";
import { DomainsModule } from "../domains/domains.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { SequencesModule } from "../sequences/sequences.module";
import { TemplatesModule } from "../templates/templates.module";
import { OverviewController } from "./overview.controller";
import { OverviewService } from "./overview.service";

@Module({
  imports: [
    CampaignsModule,
    ContactsModule,
    DispatchModule,
    DomainsModule,
    IntegrationsModule,
    SequencesModule,
    TemplatesModule,
  ],
  controllers: [OverviewController],
  providers: [OverviewService, WorkspaceAuthGuard],
})
export class AnalyticsModule {}
