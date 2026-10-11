import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env";
import { TrackingKeys } from "./tracking-keys";

@Global()
@Module({
  providers: [
    {
      provide: TrackingKeys,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new TrackingKeys(config),
    },
  ],
  exports: [TrackingKeys],
})
export class TrackingKeysModule {}
