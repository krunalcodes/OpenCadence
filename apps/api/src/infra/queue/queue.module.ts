import { BullModule } from "@nestjs/bullmq";
import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env";
import { QueueBoard } from "./queue-board.service";

export const QUEUE_PREFIX = "opencadence";

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        connection: {
          url: config.get("REDIS_URL", { infer: true }),
          maxRetriesPerRequest: null,
        },
        prefix: QUEUE_PREFIX,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: { age: 86400, count: 1000 },
          removeOnFail: { age: 1209600, count: 5000 },
        },
      }),
    }),
  ],
  providers: [QueueBoard],
  exports: [BullModule, QueueBoard],
})
export class QueueModule {}
