import { InjectQueue } from "@nestjs/bullmq";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Queue } from "bullmq";
import { uuidv7, uuidv7Date } from "../../common/uuid";
import {
  CAMPAIGN_OUTCOMES_QUEUE,
  type MessageEventType,
  type MessageOutcomeJob,
  outcomeJobId,
  outcomeJobOptions,
  SEQUENCE_OUTCOMES_QUEUE,
} from "./dispatch.constants";
import {
  DispatchRepository,
  type MessageListRow,
  type NewMessageRow,
} from "./dispatch.repository";
import { type MessageDto, toMessageDto } from "./message";

export type RecordEventInput = {
  messageId: string;
  type: MessageEventType;
  occurredAt?: Date;
  url?: string;
  userAgent?: string;
  metadata?: Record<string, string>;
};

export type RecordEventResult = { message: MessageDto; first: boolean };

export type EventWriteOptions = {
  patch?: Partial<NewMessageRow>;
  error?: { code: string; message: string };
  expectedStatus?: string[];
  internal?: boolean;
};

const maxUrlLength = 2000;
const maxUserAgentLength = 500;
const maxErrorLength = 2000;

function validDate(value: Date | undefined) {
  return value && !Number.isNaN(value.getTime()) ? value : null;
}

@Injectable()
export class MessageEvents {
  private readonly logger = new Logger(MessageEvents.name);

  constructor(
    @Inject(DispatchRepository) private readonly repository: DispatchRepository,
    @InjectQueue(CAMPAIGN_OUTCOMES_QUEUE)
    private readonly campaignOutcomes: Queue<MessageOutcomeJob>,
    @InjectQueue(SEQUENCE_OUTCOMES_QUEUE)
    private readonly sequenceOutcomes: Queue<MessageOutcomeJob>,
  ) {}

  async record(
    input: RecordEventInput,
    options: EventWriteOptions = {},
  ): Promise<RecordEventResult | null> {
    const messageCreatedAt = uuidv7Date(input.messageId);
    if (!messageCreatedAt) {
      return null;
    }
    const now = new Date();
    const occurredAt = validDate(input.occurredAt) ?? now;
    const eventCreatedAt = new Date(
      Math.max(
        messageCreatedAt.getTime(),
        Math.min(occurredAt.getTime(), now.getTime()),
      ),
    );
    const eventId = uuidv7(eventCreatedAt);
    const impliedEventId = uuidv7(eventCreatedAt);
    const url = input.url?.slice(0, maxUrlLength) ?? null;
    const result = await this.repository.applyEvent({
      messageId: input.messageId,
      messageCreatedAt,
      eventId,
      impliedEventId,
      eventCreatedAt,
      type: input.type,
      occurredAt,
      url,
      userAgent: input.userAgent?.slice(0, maxUserAgentLength) ?? null,
      metadata: input.metadata ?? null,
      patch: options.patch,
      error: options.error
        ? {
            code: options.error.code,
            message: options.error.message.slice(0, maxErrorLength),
          }
        : undefined,
      expectedStatus: options.expectedStatus,
      touchLastEvent: options.internal !== true,
    });
    if (!result) {
      return null;
    }
    const row = await this.repository.findListedMessage(
      result.workspaceId,
      input.messageId,
      messageCreatedAt,
    );
    if (!row) {
      return null;
    }
    await this.publish(row, input.type, result.first, eventId, occurredAt, url);
    if (result.impliedOpen) {
      await this.publish(row, "opened", true, impliedEventId, occurredAt, null);
    }
    return { message: toMessageDto(row), first: result.first };
  }

  private async publish(
    row: MessageListRow,
    type: MessageEventType,
    first: boolean,
    eventId: string,
    occurredAt: Date,
    url: string | null,
  ) {
    if (!row.campaignId && !row.sequenceId) {
      return;
    }
    const job: MessageOutcomeJob = {
      workspaceId: row.workspaceId,
      messageId: row.id,
      type,
      first,
      occurredAt: occurredAt.toISOString(),
      contactId: row.contactId,
      campaignId: row.campaignId,
      sequenceId: row.sequenceId,
      sequenceStepId: row.sequenceStepId,
      enrollmentId: row.enrollmentId,
      email: row.toEmails[0] ?? "",
      url,
    };
    const options = {
      ...outcomeJobOptions,
      jobId: outcomeJobId(row.id, type, eventId),
    };
    try {
      if (row.campaignId) {
        await this.campaignOutcomes.add(type, job, options);
      }
      if (row.sequenceId) {
        await this.sequenceOutcomes.add(type, job, options);
      }
    } catch (error) {
      this.logger.error(
        `The ${type} outcome for message ${row.id} was not queued: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
  }
}
