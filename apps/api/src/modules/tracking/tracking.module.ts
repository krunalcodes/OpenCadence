import {
  HttpException,
  Inject,
  Logger,
  Module,
  type OnModuleInit,
} from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { BrandModule } from "../brand/brand.module";
import { ContactsModule } from "../contacts/contacts.module";
import { DispatchModule } from "../dispatch/dispatch.module";
import { ListsModule } from "../lists/lists.module";
import { SuppressionModule } from "../suppression/suppression.module";
import { type TrackedRequest, visitorOf } from "./request-info";
import { TrackingController } from "./tracking.controller";
import { TrackingRateLimiter } from "./tracking.rate-limiter";
import { TrackingService } from "./tracking.service";

type OneClickRequest = TrackedRequest & { params: { token?: string } };

type OneClickReply = {
  code(status: number): OneClickReply;
  header(name: string, value: string): OneClickReply;
  send(payload?: unknown): unknown;
};

type OneClickScope = {
  removeAllContentTypeParsers(): void;
  addContentTypeParser(
    contentType: string,
    options: { parseAs: "buffer"; bodyLimit: number },
    parser: (
      request: unknown,
      body: Buffer,
      done: (error: Error | null, body?: Buffer) => void,
    ) => void,
  ): void;
  post(
    path: string,
    handler: (
      request: OneClickRequest,
      reply: OneClickReply,
    ) => Promise<unknown>,
  ): void;
};

type OneClickServer = {
  register(plugin: (scope: OneClickScope) => Promise<void>): unknown;
};

const oneClickBodyLimit = 16 * 1024;

@Module({
  imports: [
    DispatchModule,
    ListsModule,
    ContactsModule,
    SuppressionModule,
    BrandModule,
  ],
  controllers: [TrackingController],
  providers: [TrackingRateLimiter, TrackingService],
})
export class TrackingModule implements OnModuleInit {
  private readonly logger = new Logger(TrackingModule.name);

  constructor(
    @Inject(HttpAdapterHost) private readonly host: HttpAdapterHost,
    @Inject(TrackingService) private readonly tracking: TrackingService,
  ) {}

  onModuleInit() {
    const server = this.host.httpAdapter.getInstance<OneClickServer>();
    server.register(async (scope) => {
      scope.removeAllContentTypeParsers();
      scope.addContentTypeParser(
        "*",
        { parseAs: "buffer", bodyLimit: oneClickBodyLimit },
        (_request, body, done) => done(null, body),
      );
      scope.post("/v1/t/u/:token", async (request, reply) => {
        reply.header("Cache-Control", "no-store");
        try {
          await this.tracking.allow("one-click", visitorOf(request));
          await this.tracking.unsubscribe(request.params.token ?? "");
          return reply.code(200).send({});
        } catch (error) {
          if (error instanceof HttpException) {
            return reply.code(error.getStatus()).send(error.getResponse());
          }
          this.logger.error(
            error instanceof Error
              ? error.message
              : "The one-click unsubscribe failed.",
            error instanceof Error ? error.stack : undefined,
          );
          return reply
            .code(500)
            .send({ statusCode: 500, message: "Internal server error" });
        }
      });
    });
  }
}
