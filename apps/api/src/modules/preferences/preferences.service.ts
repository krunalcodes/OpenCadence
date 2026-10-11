import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { readMessageToken } from "@workspace/email-renderer";
import { apiError } from "../../common/api-error";
import { isUuid } from "../../common/uuid";
import { TrackingKeys } from "../../infra/tracking-keys/tracking-keys";
import { BrandService } from "../brand/brand.service";
import { type Contact, ContactsService } from "../contacts/contacts.service";
import {
  DispatchService,
  type TrackedMessage,
} from "../dispatch/dispatch.service";
import { type ListCatalogEntry, ListsService } from "../lists/lists.service";
import {
  normalizeEmail,
  SuppressionService,
} from "../suppression/suppression.service";
import { maskEmail, type Visitor } from "../tracking/request-info";
import { PreferencesRateLimiter } from "./preferences.rate-limiter";

export type PreferenceList = {
  id: string;
  name: string;
  description: string | null;
  subscribed: boolean;
};

export type Preferences = {
  email: string;
  brandName: string;
  lists: PreferenceList[];
  unsubscribedFromAll: boolean;
  contactFound: boolean;
};

type ShownList = PreferenceList & { member: boolean };

const maxListIds = 200;

function linkNotFound() {
  return apiError(
    HttpStatus.NOT_FOUND,
    "not_found",
    "This link is not valid or has expired.",
  );
}

function validation(message: string, field: string) {
  return apiError(HttpStatus.BAD_REQUEST, "validation", message, field);
}

function isNotFound(error: unknown) {
  return (
    error instanceof HttpException && error.getStatus() === HttpStatus.NOT_FOUND
  );
}

export function shownLists(
  catalog: ListCatalogEntry[],
  contact: Pick<Contact, "lists"> | null,
): ShownList[] {
  if (!contact) {
    return [];
  }
  const memberships = new Map(
    contact.lists.map((list) => [list.id, list.status]),
  );
  return catalog.flatMap((list) => {
    const status = memberships.get(list.id);
    const subscribed = status === "subscribed";
    if (!list.isPublic && !subscribed) {
      return [];
    }
    return [
      {
        id: list.id,
        name: list.publicName?.trim() || list.name,
        description: list.publicDescription?.trim() || null,
        subscribed,
        member: status !== undefined,
      },
    ];
  });
}

function parseListIds(value: unknown) {
  if (value === undefined || value === null) {
    return new Set<string>();
  }
  if (!Array.isArray(value) || value.length > maxListIds) {
    throw validation("listIds must be a list of list ids.", "listIds");
  }
  const ids = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string" || !isUuid(entry)) {
      throw validation("Every entry in listIds must be a list id.", "listIds");
    }
    ids.add(entry.toLowerCase());
  }
  return ids;
}

@Injectable()
export class PreferencesService {
  constructor(
    @Inject(TrackingKeys) private readonly keys: TrackingKeys,
    @Inject(PreferencesRateLimiter)
    private readonly limiter: PreferencesRateLimiter,
    @Inject(DispatchService) private readonly dispatch: DispatchService,
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Inject(ListsService) private readonly lists: ListsService,
    @Inject(SuppressionService)
    private readonly suppression: SuppressionService,
    @Inject(BrandService) private readonly brand: BrandService,
  ) {}

  async read(token: string, visitor: Visitor): Promise<Preferences> {
    await this.allow(visitor);
    return this.describe(await this.requireMessage(token));
  }

  async save(
    token: string,
    input: unknown,
    visitor: Visitor,
  ): Promise<Preferences> {
    await this.allow(visitor);
    const body =
      typeof input === "object" && input !== null && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : {};
    if (
      body.unsubscribeAll !== undefined &&
      typeof body.unsubscribeAll !== "boolean"
    ) {
      throw validation(
        "unsubscribeAll must be true or false.",
        "unsubscribeAll",
      );
    }
    const wanted = parseListIds(body.listIds);
    const message = await this.requireMessage(token);
    const { workspaceId } = message;

    if (body.unsubscribeAll === true) {
      await this.suppression.record({
        workspaceId,
        email: message.email,
        reason: "unsubscribed",
        origin: "user",
        messageId: message.id,
      });
      if (message.unsubscribedAt === null) {
        await this.dispatch.recordEvent({
          messageId: message.id,
          type: "unsubscribed",
          metadata: { scope: "all" },
        });
      }
      return this.describe(message);
    }

    const contact = await this.findContact(message);
    if (contact) {
      const shown = shownLists(await this.lists.catalog(workspaceId), contact);
      let subscribedToAny = false;
      for (const list of shown) {
        const subscribe = wanted.has(list.id);
        subscribedToAny ||= subscribe;
        if (subscribe === list.subscribed) {
          continue;
        }
        if (subscribe && !list.member) {
          await this.lists.addMembers(workspaceId, [list.id], [contact.id]);
        } else {
          await this.setStatus(
            workspaceId,
            list.id,
            contact.id,
            subscribe ? "subscribed" : "unsubscribed",
          );
        }
      }
      if (subscribedToAny) {
        await this.liftUnsubscribe(workspaceId, message.email);
      }
    }
    return this.describe(message);
  }

  private async allow(visitor: Visitor) {
    if (!(await this.limiter.take(visitor.ip))) {
      throw apiError(
        HttpStatus.TOO_MANY_REQUESTS,
        "rate_limited",
        "Too many requests. Wait a minute and try again.",
      );
    }
  }

  private async requireMessage(token: string) {
    const messageId = readMessageToken(token, this.keys.secret);
    const message = messageId
      ? await this.dispatch.findTracked(messageId)
      : null;
    if (!message) {
      throw linkNotFound();
    }
    return message;
  }

  private async describe(message: TrackedMessage): Promise<Preferences> {
    const email = normalizeEmail(message.email);
    const [contact, brand, blocked] = await Promise.all([
      this.findContact(message),
      this.brand.get(message.workspaceId),
      this.suppression.findBlocked(message.workspaceId, [email], "campaign"),
    ]);
    const lists = contact
      ? shownLists(await this.lists.catalog(message.workspaceId), contact)
      : [];
    return {
      email: maskEmail(message.email),
      brandName: brand.brandName.trim() || message.fromName?.trim() || "",
      lists: lists.map(({ member: _member, ...list }) => list),
      unsubscribedFromAll: blocked.has(email),
      contactFound: contact !== null,
    };
  }

  private async findContact(message: TrackedMessage): Promise<Contact | null> {
    if (!message.contactId) {
      return null;
    }
    try {
      const contact = await this.contacts.get(
        message.workspaceId,
        message.contactId,
      );
      return contact.email === normalizeEmail(message.email) ? contact : null;
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  private async setStatus(
    workspaceId: string,
    listId: string,
    contactId: string,
    status: "subscribed" | "unsubscribed",
  ) {
    try {
      await this.lists.setMemberStatus(workspaceId, listId, contactId, {
        status,
      });
    } catch (error) {
      if (!isNotFound(error)) {
        throw error;
      }
    }
  }

  private async liftUnsubscribe(workspaceId: string, address: string) {
    const email = normalizeEmail(address);
    const { suppressions } = await this.suppression.list(workspaceId, {
      reason: "unsubscribed",
      search: email,
      limit: 100,
    });
    for (const suppression of suppressions) {
      if (suppression.email !== email) {
        continue;
      }
      try {
        await this.suppression.remove(workspaceId, suppression.id);
      } catch (error) {
        if (!isNotFound(error)) {
          throw error;
        }
      }
    }
  }
}
