import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  decodeClickTarget,
  readMessageToken,
  verifyClickSignature,
} from "@workspace/email-renderer";
import { apiError } from "../../common/api-error";
import type { Env } from "../../config/env";
import { TrackingKeys } from "../../infra/tracking-keys/tracking-keys";
import { BrandService } from "../brand/brand.service";
import { ContactsService } from "../contacts/contacts.service";
import {
  DispatchService,
  type TrackedMessage,
} from "../dispatch/dispatch.service";
import { ListsService } from "../lists/lists.service";
import {
  normalizeEmail,
  SuppressionService,
} from "../suppression/suppression.service";
import { isLinkScanner, isPrefetch } from "./link-scanner";
import { maskEmail, type Visitor } from "./request-info";
import {
  type TrackingRateGroup,
  TrackingRateLimiter,
} from "./tracking.rate-limiter";

export type UnsubscribeScope = "list" | "all";

export type UnsubscribeDetails = {
  email: string;
  brandName: string;
  listName: string | null;
  alreadyUnsubscribed: boolean;
};

type Membership = { name: string; status: "subscribed" | "unsubscribed" };

const scopes: UnsubscribeScope[] = ["list", "all"];

function linkNotFound() {
  return apiError(
    HttpStatus.NOT_FOUND,
    "not_found",
    "This link is not valid or has expired.",
  );
}

function isNotFound(error: unknown) {
  return (
    error instanceof HttpException && error.getStatus() === HttpStatus.NOT_FOUND
  );
}

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);
  private readonly appUrl: string;

  constructor(
    @Inject(TrackingKeys) private readonly keys: TrackingKeys,
    @Inject(TrackingRateLimiter) private readonly limiter: TrackingRateLimiter,
    @Inject(DispatchService) private readonly dispatch: DispatchService,
    @Inject(ListsService) private readonly lists: ListsService,
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Inject(SuppressionService)
    private readonly suppression: SuppressionService,
    @Inject(BrandService) private readonly brand: BrandService,
    @Inject(ConfigService) config: ConfigService<Env, true>,
  ) {
    this.appUrl = config
      .get("BETTER_AUTH_URL", { infer: true })
      .trim()
      .replace(/\/+$/, "");
  }

  readToken(token: string) {
    return readMessageToken(token, this.keys.secret);
  }

  clickTarget(token: string, target: unknown, signature: unknown) {
    const messageId = this.readToken(token);
    if (
      messageId === null ||
      typeof target !== "string" ||
      typeof signature !== "string"
    ) {
      return null;
    }
    const url = decodeClickTarget(target);
    if (
      url === null ||
      !verifyClickSignature(messageId, url, signature, this.keys.secret) ||
      !URL.canParse(url)
    ) {
      return null;
    }
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return { messageId, url, location: parsed.href };
  }

  unsubscribePage(token: string) {
    return this.readToken(token) === null
      ? null
      : `${this.appUrl}/unsubscribe/${token}`;
  }

  preferencesPage(token: string) {
    return this.readToken(token) === null
      ? null
      : `${this.appUrl}/preferences/${token}`;
  }

  async recordOpen(token: string, visitor: Visitor) {
    const messageId = this.readToken(token);
    if (messageId !== null) {
      await this.recordEngagement(messageId, "opened", visitor);
    }
  }

  async recordClick(messageId: string, url: string, visitor: Visitor) {
    await this.recordEngagement(messageId, "clicked", visitor, url);
  }

  async allow(group: TrackingRateGroup, visitor: Visitor) {
    if (!(await this.limiter.take(group, visitor.ip))) {
      throw apiError(
        HttpStatus.TOO_MANY_REQUESTS,
        "rate_limited",
        "Too many requests. Wait a minute and try again.",
      );
    }
  }

  async details(token: string): Promise<UnsubscribeDetails> {
    const message = await this.requireMessage(token);
    const [membership, suppressed, brandName] = await Promise.all([
      this.membership(message),
      this.isSuppressed(message),
      this.brandName(message),
    ]);
    return {
      email: maskEmail(message.email),
      brandName,
      listName: membership?.name ?? null,
      alreadyUnsubscribed: suppressed || membership?.status === "unsubscribed",
    };
  }

  async unsubscribe(token: string, input: { scope?: unknown } = {}) {
    if (
      input.scope !== undefined &&
      !scopes.includes(input.scope as UnsubscribeScope)
    ) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "validation",
        "scope must be list or all.",
        "scope",
      );
    }
    const message = await this.requireMessage(token);
    const wanted =
      (input.scope as UnsubscribeScope | undefined) ??
      (message.unsubscribeListId ? "list" : "all");
    const scope: UnsubscribeScope =
      wanted === "list" && (await this.leaveList(message)) ? "list" : "all";
    if (scope === "all") {
      await this.suppression.record({
        workspaceId: message.workspaceId,
        email: message.email,
        reason: "unsubscribed",
        origin: "user",
        messageId: message.id,
      });
    }
    if (message.unsubscribedAt === null) {
      await this.dispatch.recordEvent({
        messageId: message.id,
        type: "unsubscribed",
        metadata: { scope },
      });
    }
    return { ok: true as const };
  }

  async resubscribe(token: string) {
    const message = await this.requireMessage(token);
    if (message.unsubscribeListId && message.contactId) {
      await this.setListStatus(message, "subscribed");
    }
    const email = normalizeEmail(message.email);
    const { suppressions } = await this.suppression.list(message.workspaceId, {
      reason: "unsubscribed",
      search: email,
      limit: 100,
    });
    for (const suppression of suppressions) {
      if (suppression.email !== email) {
        continue;
      }
      try {
        await this.suppression.remove(message.workspaceId, suppression.id);
      } catch (error) {
        if (!isNotFound(error)) {
          throw error;
        }
      }
    }
    return { ok: true as const };
  }

  private async recordEngagement(
    messageId: string,
    type: "opened" | "clicked",
    visitor: Visitor,
    url?: string,
  ) {
    try {
      if (isLinkScanner(visitor.userAgent)) {
        return;
      }
      if (!(await this.limiter.take("event", visitor.ip))) {
        return;
      }
      const message = await this.findMessage(messageId);
      if (!message || isPrefetch(message.sentAt, new Date())) {
        return;
      }
      await this.dispatch.recordEvent({
        messageId,
        type,
        url,
        userAgent: visitor.userAgent,
      });
    } catch (error) {
      this.logger.warn(
        `The ${type} event for message ${messageId} was not recorded: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
  }

  private findMessage(messageId: string) {
    return this.dispatch.findTracked(messageId);
  }

  private async requireMessage(token: string) {
    const messageId = this.readToken(token);
    const message = messageId ? await this.findMessage(messageId) : null;
    if (!message) {
      throw linkNotFound();
    }
    return message;
  }

  private async membership(
    message: TrackedMessage,
  ): Promise<Membership | null> {
    if (!message.unsubscribeListId || !message.contactId) {
      return null;
    }
    try {
      const contact = await this.contacts.get(
        message.workspaceId,
        message.contactId,
      );
      const list = contact.lists.find(
        (item) => item.id === message.unsubscribeListId,
      );
      return list ? { name: list.name, status: list.status } : null;
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  private async isSuppressed(message: TrackedMessage) {
    const blocked = await this.suppression.findBlocked(
      message.workspaceId,
      [message.email],
      "campaign",
    );
    return blocked.has(normalizeEmail(message.email));
  }

  private async brandName(message: TrackedMessage) {
    const brand = await this.brand.get(message.workspaceId);
    return brand.brandName.trim() || message.fromName?.trim() || "";
  }

  private leaveList(message: TrackedMessage) {
    return this.setListStatus(message, "unsubscribed");
  }

  private async setListStatus(
    message: TrackedMessage,
    status: "subscribed" | "unsubscribed",
  ) {
    if (!message.unsubscribeListId || !message.contactId) {
      return false;
    }
    try {
      await this.lists.setMemberStatus(
        message.workspaceId,
        message.unsubscribeListId,
        message.contactId,
        { status },
      );
      return true;
    } catch (error) {
      if (isNotFound(error)) {
        return false;
      }
      throw error;
    }
  }
}
