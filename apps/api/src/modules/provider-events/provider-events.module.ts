import { Inject, Module, type OnModuleInit } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { DispatchModule } from "../dispatch/dispatch.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { SuppressionModule } from "../suppression/suppression.module";
import { ProviderEventsService } from "./provider-events.service";

type WebhookRequest = {
  body: unknown;
  params: { type: string; sourceId: string };
  headers: Record<string, string | string[] | undefined>;
};

type WebhookReply = {
  code(status: number): WebhookReply;
  send(payload?: unknown): unknown;
};

type WebhookScope = {
  removeContentTypeParser(contentType: string): void;
  addContentTypeParser(
    contentType: string,
    options: { parseAs: "string"; bodyLimit: number },
    parser: (
      request: unknown,
      body: string,
      done: (error: Error | null, body?: string) => void,
    ) => void,
  ): void;
  post(
    path: string,
    handler: (request: WebhookRequest, reply: WebhookReply) => Promise<unknown>,
  ): void;
};

type WebhookServer = {
  register(plugin: (scope: WebhookScope) => Promise<void>): unknown;
};

const statusByOutcome = { accepted: 204, not_found: 404, rejected: 401 };

@Module({
  imports: [DispatchModule, IntegrationsModule, SuppressionModule],
  providers: [ProviderEventsService],
})
export class ProviderEventsModule implements OnModuleInit {
  constructor(
    @Inject(HttpAdapterHost) private readonly host: HttpAdapterHost,
    @Inject(ProviderEventsService)
    private readonly events: ProviderEventsService,
  ) {}

  onModuleInit() {
    const server = this.host.httpAdapter.getInstance<WebhookServer>();
    server.register(async (scope) => {
      scope.removeContentTypeParser("application/json");
      scope.addContentTypeParser(
        "application/json",
        { parseAs: "string", bodyLimit: 1024 * 1024 },
        (_request, body, done) => done(null, body),
      );
      scope.post(
        "/v1/provider-webhooks/:type/:sourceId",
        async (request, reply) => {
          const headers: Record<string, string | undefined> = {};
          for (const [name, value] of Object.entries(request.headers)) {
            headers[name] = Array.isArray(value) ? value[0] : value;
          }
          const outcome = await this.events.receive(
            request.params.type,
            request.params.sourceId,
            typeof request.body === "string" ? request.body : "",
            headers,
          );
          return reply.code(statusByOutcome[outcome]).send();
        },
      );
    });
  }
}
