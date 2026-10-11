import { Module } from "@nestjs/common";
import { BrandModule } from "../brand/brand.module";
import { ContactsModule } from "../contacts/contacts.module";
import { DispatchModule } from "../dispatch/dispatch.module";
import { ListsModule } from "../lists/lists.module";
import { SuppressionModule } from "../suppression/suppression.module";
import { PreferencesController } from "./preferences.controller";
import { PreferencesRateLimiter } from "./preferences.rate-limiter";
import { PreferencesService } from "./preferences.service";

@Module({
  imports: [
    BrandModule,
    ContactsModule,
    DispatchModule,
    ListsModule,
    SuppressionModule,
  ],
  controllers: [PreferencesController],
  providers: [PreferencesRateLimiter, PreferencesService],
})
export class PreferencesModule {}
