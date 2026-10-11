import { Inject, Injectable } from "@nestjs/common";
import { DispatchService } from "../dispatch/dispatch.service";
import { SendingSourcesService } from "../integrations/sending-sources.service";
import {
  isValidEmail,
  type SuppressionReason,
  SuppressionService,
} from "../suppression/suppression.service";

export type WebhookOutcome = "accepted" | "not_found" | "rejected";

@Injectable()
export class ProviderEventsService {
  constructor(
    @Inject(SendingSourcesService)
    private readonly sources: SendingSourcesService,
    @Inject(DispatchService) private readonly dispatch: DispatchService,
    @Inject(SuppressionService)
    private readonly suppression: SuppressionService,
  ) {}

  async receive(
    integrationType: string,
    sourceId: string,
    rawBody: string,
    headers: Record<string, string | undefined>,
  ): Promise<WebhookOutcome> {
    const result = await this.sources.receiveWebhook(
      integrationType,
      sourceId,
      rawBody,
      headers,
    );
    if (result.outcome === "duplicate") {
      return "accepted";
    }
    if (result.outcome !== "accepted") {
      return result.outcome;
    }

    const { event, workspaceId } = result;
    const applied = await this.dispatch.applyProviderEvent(sourceId, event);
    const reason: SuppressionReason | null =
      event.type === "complained"
        ? "complained"
        : event.type === "suppressed" ||
            (event.type === "bounced" && event.bounce?.permanent === true)
          ? "bounced"
          : null;
    if (reason) {
      const recipients = applied?.recipients ?? event.recipients;
      for (const email of recipients.filter(isValidEmail)) {
        await this.suppression.record({
          workspaceId,
          email,
          reason,
          origin: "webhook",
          sourceId,
          messageId: applied?.messageId ?? null,
        });
      }
    }
    return "accepted";
  }
}
