import { HttpStatus } from "@nestjs/common";
import { apiError } from "../../common/api-error";
import { isUuid } from "../../common/uuid";
import { isTimezone } from "./send-window";
import {
  maxDelayMinutes,
  maxEnrollContactIds,
  maxSources,
  maxSteps,
} from "./sequences.constants";
import type { SequenceSettings } from "./sequences.repository";

export type StepInput = {
  id?: string;
  delayMinutes: number;
  templateId: string | null;
  subject?: string;
  threadMode: "reply" | "new";
};

export const maxNameLength = 120;
const maxSubjectLength = 998;
const maxDailyLimit = 10_000;
const maxLayoutNodes = 100;
const maxLayoutKeyLength = 64;
const maxCoordinate = 1_000_000;

export function validation(message: string, field: string) {
  return apiError(HttpStatus.BAD_REQUEST, "validation", message, field);
}

export function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isWholeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

export function parseName(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw validation("Give the sequence a name.", "name");
  }
  const name = value.trim();
  if (name.length > maxNameLength || /[\r\n\0]/.test(name)) {
    throw validation(
      `Keep the name to one line of ${maxNameLength} characters or fewer.`,
      "name",
    );
  }
  return name;
}

function parseLine(value: unknown, field: string, label: string, max: number) {
  if (typeof value !== "string") {
    throw validation(`${field} must be text.`, field);
  }
  const line = value.trim();
  if (line.length > max || /[\r\n\0]/.test(line)) {
    throw validation(
      `Keep ${label} to one line of ${max} characters or fewer.`,
      field,
    );
  }
  return line;
}

function parseFlag(value: unknown, field: string) {
  if (typeof value !== "boolean") {
    throw validation(`${field} must be true or false.`, field);
  }
  return value;
}

function parseSourceIds(value: unknown) {
  if (!Array.isArray(value)) {
    throw validation("sourceIds must be a list of mailbox ids.", "sourceIds");
  }
  const ids = new Set<string>();
  for (const id of value) {
    if (typeof id !== "string" || !isUuid(id)) {
      throw validation("Every entry must be a mailbox id.", "sourceIds");
    }
    ids.add(id.toLowerCase());
  }
  if (ids.size > maxSources) {
    throw validation(`Choose up to ${maxSources} mailboxes.`, "sourceIds");
  }
  return [...ids];
}

function parseSendDays(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    throw validation("Choose at least one day to send on.", "sendDays");
  }
  const days = new Set<number>();
  for (const day of value) {
    if (!isWholeNumber(day) || day < 1 || day > 7) {
      throw validation(
        "Days are numbers from 1 (Monday) to 7 (Sunday).",
        "sendDays",
      );
    }
    days.add(day);
  }
  return [...days].sort((left, right) => left - right);
}

function parseMinute(value: unknown, field: string, min: number, max: number) {
  if (!isWholeNumber(value) || value < min || value > max) {
    throw validation(
      `${field} must be a whole number of minutes from ${min} to ${max}.`,
      field,
    );
  }
  return value;
}

function parseLayout(value: unknown) {
  if (value === null) {
    return null;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw validation("layout must be an object or null.", "layout");
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > maxLayoutNodes) {
    throw validation(
      `layout holds up to ${maxLayoutNodes} positions.`,
      "layout",
    );
  }
  const layout: Record<string, { x: number; y: number }> = {};
  for (const [key, position] of entries) {
    const { x, y } = record(position);
    if (
      key.length === 0 ||
      key.length > maxLayoutKeyLength ||
      typeof x !== "number" ||
      typeof y !== "number" ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      Math.abs(x) > maxCoordinate ||
      Math.abs(y) > maxCoordinate
    ) {
      throw validation("Every layout entry needs a numeric x and y.", "layout");
    }
    layout[key] = { x, y };
  }
  return layout;
}

export function parseSettings(input: unknown): Partial<SequenceSettings> {
  const body = record(input);
  const values: Partial<SequenceSettings> = {};
  if (body.name !== undefined) {
    values.name = parseName(body.name);
  }
  if (body.sourceIds !== undefined) {
    values.sourceIds = parseSourceIds(body.sourceIds);
  }
  if (body.fromName !== undefined) {
    values.fromName =
      body.fromName === null
        ? null
        : parseLine(body.fromName, "fromName", "the from name", 120) || null;
  }
  if (body.trackOpens !== undefined) {
    values.trackOpens = parseFlag(body.trackOpens, "trackOpens");
  }
  if (body.trackClicks !== undefined) {
    values.trackClicks = parseFlag(body.trackClicks, "trackClicks");
  }
  if (body.stopOnReply !== undefined) {
    values.stopOnReply = parseFlag(body.stopOnReply, "stopOnReply");
  }
  if (body.timezone !== undefined) {
    if (typeof body.timezone !== "string" || !isTimezone(body.timezone)) {
      throw validation(
        "Choose a timezone by its IANA name, for example Europe/Berlin.",
        "timezone",
      );
    }
    values.timezone = body.timezone;
  }
  if (body.sendDays !== undefined) {
    values.sendDays = parseSendDays(body.sendDays);
  }
  if (body.windowStartMinute !== undefined) {
    values.windowStartMinute = parseMinute(
      body.windowStartMinute,
      "windowStartMinute",
      0,
      1439,
    );
  }
  if (body.windowEndMinute !== undefined) {
    values.windowEndMinute = parseMinute(
      body.windowEndMinute,
      "windowEndMinute",
      1,
      1440,
    );
  }
  if (body.dailyLimitPerSource !== undefined) {
    const limit = body.dailyLimitPerSource;
    if (
      limit !== null &&
      (!isWholeNumber(limit) || limit < 1 || limit > maxDailyLimit)
    ) {
      throw validation(
        `The daily limit per mailbox is a whole number from 1 to ${maxDailyLimit}, or empty for no limit.`,
        "dailyLimitPerSource",
      );
    }
    values.dailyLimitPerSource = limit;
  }
  if (body.layout !== undefined) {
    values.layout = parseLayout(body.layout);
  }
  return values;
}

export function parseSteps(input: unknown): StepInput[] {
  const { steps } = record(input);
  if (!Array.isArray(steps)) {
    throw validation("steps must be a list.", "steps");
  }
  if (steps.length > maxSteps) {
    throw validation(`A sequence holds up to ${maxSteps} steps.`, "steps");
  }
  const seen = new Set<string>();
  return steps.map((item, index) => {
    const field = `steps.${index}`;
    const step = record(item);
    let id: string | undefined;
    if (step.id !== undefined && step.id !== null) {
      if (typeof step.id !== "string" || !isUuid(step.id)) {
        throw validation("id is not a valid step id.", `${field}.id`);
      }
      id = step.id.toLowerCase();
      if (seen.has(id)) {
        throw validation("A step is listed twice.", `${field}.id`);
      }
      seen.add(id);
    }
    const minimum = index === 0 ? 0 : 1;
    if (
      !isWholeNumber(step.delayMinutes) ||
      step.delayMinutes < minimum ||
      step.delayMinutes > maxDelayMinutes
    ) {
      throw validation(
        index === 0
          ? "The first wait is a whole number of minutes, zero or more."
          : "Wait at least one minute between steps.",
        `${field}.delayMinutes`,
      );
    }
    let templateId: string | null = null;
    if (step.templateId !== undefined && step.templateId !== null) {
      if (typeof step.templateId !== "string" || !isUuid(step.templateId)) {
        throw validation(
          "templateId is not a valid template id.",
          `${field}.templateId`,
        );
      }
      templateId = step.templateId.toLowerCase();
    }
    const threadMode = step.threadMode ?? "reply";
    if (threadMode !== "reply" && threadMode !== "new") {
      throw validation(
        "threadMode must be reply or new.",
        `${field}.threadMode`,
      );
    }
    return {
      ...(id ? { id } : {}),
      delayMinutes: step.delayMinutes,
      templateId,
      ...(step.subject === undefined || step.subject === null
        ? {}
        : {
            subject: parseLine(
              step.subject,
              `${field}.subject`,
              "the subject",
              maxSubjectLength,
            ),
          }),
      threadMode,
    };
  });
}

export function parseContactIds(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    throw validation("Choose at least one contact.", "contactIds");
  }
  if (value.length > maxEnrollContactIds) {
    throw validation(
      `Enrol up to ${maxEnrollContactIds} contacts at a time, or choose a list or segment.`,
      "contactIds",
    );
  }
  const ids = new Set<string>();
  for (const id of value) {
    if (typeof id !== "string" || !isUuid(id)) {
      throw validation("Every entry must be a contact id.", "contactIds");
    }
    ids.add(id.toLowerCase());
  }
  return [...ids];
}
