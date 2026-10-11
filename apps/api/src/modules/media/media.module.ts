import {
  type ExecutionContext,
  HttpException,
  Inject,
  Logger,
  Module,
  type OnModuleInit,
} from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { AuthService } from "@thallesp/nestjs-better-auth";
import type { Auth } from "@workspace/auth";
import {
  type WorkspaceAuthContext,
  WorkspaceAuthGuard,
} from "../../common/guards/workspace-auth.guard";
import { MediaController } from "./media.controller";
import { MediaRepository } from "./media.repository";
import {
  MediaService,
  maxMediaBytes,
  tooLarge,
  unsupportedType,
} from "./media.service";

type UploadRequest = {
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
  session?: unknown;
  workspaceAuth?: WorkspaceAuthContext;
};

type UploadReply = {
  code(status: number): UploadReply;
  send(payload?: unknown): unknown;
};

type UploadScope = {
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
  addHook(
    name: "onRequest",
    hook: (request: UploadRequest, reply: UploadReply) => Promise<unknown>,
  ): void;
  setErrorHandler(
    handler: (
      error: { code?: string; statusCode?: number },
      request: UploadRequest,
      reply: UploadReply,
    ) => unknown,
  ): void;
  post(
    path: string,
    handler: (request: UploadRequest, reply: UploadReply) => Promise<unknown>,
  ): void;
};

type UploadServer = {
  register(plugin: (scope: UploadScope) => Promise<void>): unknown;
};

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function sendError(reply: UploadReply, error: HttpException) {
  return reply.code(error.getStatus()).send(error.getResponse());
}

function uploadHandler() {}

@Module({
  controllers: [MediaController],
  providers: [MediaRepository, MediaService, WorkspaceAuthGuard],
  exports: [MediaService],
})
export class MediaModule implements OnModuleInit {
  private readonly logger = new Logger(MediaModule.name);

  constructor(
    @Inject(HttpAdapterHost) private readonly host: HttpAdapterHost,
    @Inject(AuthService) private readonly authService: AuthService<Auth>,
    @Inject(WorkspaceAuthGuard) private readonly guard: WorkspaceAuthGuard,
    @Inject(MediaService) private readonly media: MediaService,
  ) {}

  onModuleInit() {
    const server = this.host.httpAdapter.getInstance<UploadServer>();
    server.register(async (scope) => {
      scope.removeAllContentTypeParsers();
      scope.addContentTypeParser(
        "*",
        { parseAs: "buffer", bodyLimit: maxMediaBytes },
        (_request, body, done) => done(null, body),
      );
      scope.setErrorHandler((error, _request, reply) => {
        if (error instanceof HttpException) {
          return sendError(reply, error);
        }
        if (
          error.code === "FST_ERR_CTP_BODY_TOO_LARGE" ||
          error.statusCode === 413
        ) {
          return sendError(reply, tooLarge());
        }
        if (
          error.code === "FST_ERR_CTP_INVALID_MEDIA_TYPE" ||
          error.statusCode === 415
        ) {
          return sendError(reply, unsupportedType());
        }
        const status = error.statusCode ?? 500;
        if (status >= 400 && status < 500) {
          return reply.code(status).send({
            statusCode: status,
            message: "The request could not be read.",
          });
        }
        this.logger.error(
          error instanceof Error ? error.message : "The upload failed.",
          error instanceof Error ? error.stack : undefined,
        );
        return reply
          .code(500)
          .send({ statusCode: 500, message: "Internal server error" });
      });
      scope.addHook("onRequest", async (request) => {
        await this.authenticate(request);
      });
      scope.post("/v1/media", async (request, reply) => {
        const workspace = request.workspaceAuth;
        if (!workspace) {
          return reply
            .code(401)
            .send({ statusCode: 401, message: "Unauthorized" });
        }
        const asset = await this.media.upload({
          workspaceId: workspace.workspaceId,
          userId: workspace.method === "session" ? workspace.userId : null,
          contentType: single(request.headers["content-type"]),
          fileName: single(request.headers["x-file-name"]),
          body: request.body,
        });
        return reply.code(201).send(asset);
      });
    });
  }

  private async authenticate(request: UploadRequest) {
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          headers.append(name, item);
        }
      } else if (value !== undefined) {
        headers.set(name, value);
      }
    }
    request.session = await this.authService.api.getSession({ headers });
    const context = {
      getHandler: () => uploadHandler,
      getClass: () => MediaModule,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    await this.guard.canActivate(context);
  }
}
