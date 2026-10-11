import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  IntegrationAdapter,
  OAuthSupport,
} from "@workspace/integration-core";
import { createGmailAdapter } from "@workspace/integration-gmail";
import { createImapSmtpAdapter } from "@workspace/integration-imap-smtp";
import { createOutlookAdapter } from "@workspace/integration-outlook";
import { createResendAdapter } from "@workspace/integration-resend";
import { createSesAdapter } from "@workspace/integration-ses";
import type { Env } from "../../config/env";

export type OAuthAccess = "send" | "inbox";

@Injectable()
export class AdapterRegistry {
  private readonly adapters = new Map<string, IntegrationAdapter>();
  private readonly sendOnly = new Map<string, IntegrationAdapter>();

  constructor(@Inject(ConfigService) config: ConfigService<Env, true>) {
    this.add(createResendAdapter({ userAgent: "OpenCadence" }));
    this.add(createImapSmtpAdapter());
    this.add(createSesAdapter({ userAgent: "OpenCadence" }));

    const gmailId = config.get("GMAIL_CLIENT_ID", { infer: true });
    const gmailSecret = config.get("GMAIL_CLIENT_SECRET", { infer: true });
    if (gmailId && gmailSecret) {
      const client = { clientId: gmailId, clientSecret: gmailSecret };
      this.addMailbox(
        createGmailAdapter(client),
        config.get("GMAIL_READ_SCOPE_ENABLED", { infer: true })
          ? createGmailAdapter({ ...client, inboxAccess: true })
          : null,
      );
    }

    const outlookId = config.get("OUTLOOK_CLIENT_ID", { infer: true });
    const outlookSecret = config.get("OUTLOOK_CLIENT_SECRET", { infer: true });
    if (outlookId && outlookSecret) {
      const client = {
        clientId: outlookId,
        clientSecret: outlookSecret,
        tenant: config.get("OUTLOOK_TENANT", { infer: true }),
      };
      this.addMailbox(
        createOutlookAdapter(client),
        config.get("OUTLOOK_READ_SCOPE_ENABLED", { infer: true })
          ? createOutlookAdapter({ ...client, inboxAccess: true })
          : null,
      );
    }
  }

  private add(adapter: IntegrationAdapter) {
    this.adapters.set(adapter.type, adapter);
  }

  private addMailbox(
    sendOnly: IntegrationAdapter,
    withInbox: IntegrationAdapter | null,
  ) {
    this.sendOnly.set(sendOnly.type, sendOnly);
    this.add(withInbox ?? sendOnly);
  }

  find(type: string) {
    return this.adapters.get(type) ?? null;
  }

  has(type: string) {
    return this.adapters.has(type);
  }

  oauth(type: string, access: OAuthAccess): OAuthSupport | null {
    const adapter =
      access === "send"
        ? (this.sendOnly.get(type) ?? this.adapters.get(type))
        : this.adapters.get(type);
    if (!adapter?.oauth) {
      return null;
    }
    return access === "inbox" && !adapter.inbox?.listReceived
      ? null
      : adapter.oauth;
  }
}
