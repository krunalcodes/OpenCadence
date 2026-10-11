import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { IntegrationAdapter } from "@workspace/integration-core";
import { createGmailAdapter } from "@workspace/integration-gmail";
import { createImapSmtpAdapter } from "@workspace/integration-imap-smtp";
import { createResendAdapter } from "@workspace/integration-resend";
import type { Env } from "../../config/env";

@Injectable()
export class AdapterRegistry {
  private readonly adapters = new Map<string, IntegrationAdapter>();

  constructor(@Inject(ConfigService) config: ConfigService<Env, true>) {
    this.add(createResendAdapter({ userAgent: "OpenCadence" }));
    this.add(createImapSmtpAdapter());

    const clientId = config.get("GMAIL_CLIENT_ID", { infer: true });
    const clientSecret = config.get("GMAIL_CLIENT_SECRET", { infer: true });
    if (clientId && clientSecret) {
      this.add(createGmailAdapter({ clientId, clientSecret }));
    }
  }

  private add(adapter: IntegrationAdapter) {
    this.adapters.set(adapter.type, adapter);
  }

  find(type: string) {
    return this.adapters.get(type) ?? null;
  }

  has(type: string) {
    return this.adapters.has(type);
  }
}
