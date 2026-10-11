import { BullModule, InjectQueue } from "@nestjs/bullmq";
import {
  HttpException,
  Inject,
  Logger,
  Module,
  type OnModuleInit,
} from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import type { Queue } from "bullmq";
import { WorkspaceAuthGuard } from "../../common/guards/workspace-auth.guard";
import { QueueBoard } from "../../infra/queue/queue-board.service";
import { BrandModule } from "../brand/brand.module";
import { ContactsModule } from "../contacts/contacts.module";
import { DispatchModule } from "../dispatch/dispatch.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { ListsModule } from "../lists/lists.module";
import { SuppressionModule } from "../suppression/suppression.module";
import { type TrackedRequest, visitorOf } from "../tracking/request-info";
import { parseFormBody } from "./form-input";
import { FORMS_MAINTENANCE_QUEUE, submitBodyLimit } from "./forms.constants";
import { FormsController } from "./forms.controller";
import { FormsRateLimiter } from "./forms.rate-limiter";
import { FormsRepository } from "./forms.repository";
import { FormsService } from "./forms.service";
import { PublicFormsController } from "./public-forms.controller";
import { isPublicId, PublicFormsService } from "./public-forms.service";

type SubmitRequest = TrackedRequest & {
  params: { publicId?: string };
  body?: unknown;
};

type SubmitReply = {
  code(status: number): SubmitReply;
  header(name: string, value: string): SubmitReply;
  send(payload?: unknown): unknown;
};

type SubmitHandler = (
  request: SubmitRequest,
  reply: SubmitReply,
) => Promise<unknown>;

type SubmitScope = {
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
  post(path: string, handler: SubmitHandler): void;
  options(path: string, handler: SubmitHandler): void;
};

type SubmitServer = {
  register(plugin: (scope: SubmitScope) => Promise<void>): unknown;
};

export const formsQueues = BullModule.registerQueue({
  name: FORMS_MAINTENANCE_QUEUE,
});

const submitPath = "/v1/public/forms/:publicId/submit";

function header(request: SubmitRequest, name: string) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function crossOrigin(reply: SubmitReply) {
  return reply
    .header("Access-Control-Allow-Origin", "*")
    .header("Access-Control-Allow-Methods", "POST, OPTIONS")
    .header("Access-Control-Allow-Headers", "Content-Type")
    .header("Access-Control-Max-Age", "600")
    .header("Cache-Control", "no-store")
    .header("X-Content-Type-Options", "nosniff")
    .header("Referrer-Policy", "no-referrer");
}

function errorCode(status: number) {
  if (status === 400) {
    return "validation";
  }
  return status === 429 ? "rate_limited" : "unavailable";
}

@Module({
  imports: [
    formsQueues,
    BrandModule,
    ContactsModule,
    DispatchModule,
    IntegrationsModule,
    ListsModule,
    SuppressionModule,
  ],
  controllers: [FormsController, PublicFormsController],
  providers: [
    FormsRepository,
    FormsRateLimiter,
    FormsService,
    PublicFormsService,
    WorkspaceAuthGuard,
  ],
  exports: [FormsService],
})
export class FormsModule implements OnModuleInit {
  private readonly logger = new Logger(FormsModule.name);

  constructor(
    @Inject(HttpAdapterHost) private readonly host: HttpAdapterHost,
    @Inject(PublicFormsService) private readonly forms: PublicFormsService,
    @InjectQueue(FORMS_MAINTENANCE_QUEUE)
    private readonly maintenanceQueue: Queue,
    @Inject(QueueBoard) private readonly board: QueueBoard,
  ) {}

  onModuleInit() {
    this.board.register(this.maintenanceQueue);
    const server = this.host.httpAdapter.getInstance<SubmitServer>();
    server.register(async (scope) => {
      scope.removeAllContentTypeParsers();
      scope.addContentTypeParser(
        "*",
        { parseAs: "buffer", bodyLimit: submitBodyLimit },
        (_request, body, done) => done(null, body),
      );
      scope.options(submitPath, async (_request, reply) =>
        crossOrigin(reply).code(204).send(),
      );
      scope.post(submitPath, (request, reply) => this.submit(request, reply));
    });
  }

  private async submit(request: SubmitRequest, reply: SubmitReply) {
    crossOrigin(reply);
    const publicId = request.params.publicId ?? "";
    const { json, values } = parseFormBody(
      Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0),
      header(request, "content-type"),
    );
    try {
      const result = await this.forms.submit(
        publicId,
        values,
        visitorOf(request),
      );
      if (json) {
        return reply.code(200).send(result);
      }
      return reply
        .code(303)
        .header(
          "Location",
          result.redirectUrl ??
            this.forms.successLocation(publicId, result.status),
        )
        .send();
    } catch (error) {
      const status = error instanceof HttpException ? error.getStatus() : 500;
      if (!(error instanceof HttpException)) {
        this.logger.error(
          error instanceof Error ? error.message : "A form submit failed.",
          error instanceof Error ? error.stack : undefined,
        );
      }
      if (json || status === 404 || !isPublicId(publicId)) {
        return reply
          .code(status)
          .send(
            error instanceof HttpException
              ? error.getResponse()
              : { statusCode: 500, message: "Internal server error" },
          );
      }
      const response =
        error instanceof HttpException ? error.getResponse() : null;
      const field =
        typeof response === "object" &&
        response !== null &&
        typeof (response as { field?: unknown }).field === "string"
          ? (response as { field: string }).field
          : undefined;
      return reply
        .code(303)
        .header(
          "Location",
          this.forms.errorLocation(publicId, errorCode(status), field),
        )
        .send();
    }
  }
}
