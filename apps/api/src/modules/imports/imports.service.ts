import { randomUUID } from "node:crypto";
import { InjectQueue } from "@nestjs/bullmq";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { Queue } from "bullmq";
import { apiError } from "../../common/api-error";
import { isUuid } from "../../common/uuid";
import { REDIS, type Redis } from "../../infra/redis/redis.module";
import { ContactsService } from "../contacts/contacts.service";
import { ListsService } from "../lists/lists.service";
import { TagsService } from "../tags/tags.service";
import { fitRow } from "./csv-parser";
import { ImportFiles, MissingPartError } from "./import-files";
import {
  chunkSize,
  filePrefix,
  IMPORT_CONTACTS_JOB,
  IMPORTS_QUEUE,
  type ImportJob,
  importJobOptions,
  maxActiveImports,
  maxChunkIndex,
  maxColumns,
  maxFileSize,
  maxSampleCellLength,
  sampleRowCount,
  sessionKey,
  sessionTtlSeconds,
} from "./imports.constants";
import { headerColumns, validateMapping } from "./imports.mapping";
import {
  type ImportRow,
  type ImportStatus,
  ImportsRepository,
  readOptions,
} from "./imports.repository";

export type Import = {
  id: string;
  status: ImportStatus;
  fileName: string;
  fileSize: number;
  columns: string[];
  sampleRows: string[][];
  mapping: Record<string, string> | null;
  options: {
    updateExisting: boolean;
    listIds: string[];
    tagIds: string[];
  } | null;
  totalRows: number;
  processedRows: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  hasErrorReport: boolean;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type ImportActor = { workspaceId: string; userId: string | null };

type UploadSession = {
  workspaceId: string;
  fileName: string;
  fileSize: number;
  userId: string | null;
  parts: Map<number, number>;
};

const maxFileNameLength = 255;
const maxAttachedIds = 100;
const partField = "part:";
const listLimit = 50;

function validation(message: string, field: string) {
  return apiError(HttpStatus.BAD_REQUEST, "validation", message, field);
}

function notFound() {
  return apiError(
    HttpStatus.NOT_FOUND,
    "not_found",
    "This import was not found.",
  );
}

function uploadNotFound() {
  return apiError(
    HttpStatus.NOT_FOUND,
    "not_found",
    "This upload was not found or has expired. Start the upload again.",
  );
}

function tooLarge(field: string) {
  return validation(
    "The file is larger than 50 MB. Split it and import each part.",
    field,
  );
}

function serialize(row: ImportRow): Import {
  const options = readOptions(row.options);
  return {
    id: row.id,
    status: row.status as ImportStatus,
    fileName: row.fileName,
    fileSize: row.fileSize,
    columns: row.columns,
    sampleRows: row.sampleRows,
    mapping: row.mapping,
    options: options.started
      ? {
          updateExisting: options.updateExisting,
          listIds: options.listIds,
          tagIds: options.tagIds,
        }
      : null,
    totalRows: row.totalRows,
    processedRows: row.processedRows,
    createdCount: row.createdCount,
    updatedCount: row.updatedCount,
    skippedCount: row.skippedCount,
    errorCount: row.errorCount,
    hasErrorReport: row.errorReportKey !== null,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

function idList(value: unknown, field: string): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || !isUuid(item))
  ) {
    throw validation(`${field} must be a list of ids.`, field);
  }
  const unique = [
    ...new Set((value as string[]).map((id) => id.toLowerCase())),
  ];
  if (unique.length > maxAttachedIds) {
    throw validation(`Choose up to ${maxAttachedIds} at a time.`, field);
  }
  return unique;
}

function downloadName(fileName: string) {
  const base = fileName
    .replace(/\.[^.]*$/, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base || "import"}-errors.csv`;
}

@Injectable()
export class ImportsService {
  constructor(
    @Inject(ImportsRepository) private readonly repository: ImportsRepository,
    @Inject(ImportFiles) private readonly files: ImportFiles,
    @Inject(REDIS) private readonly redis: Redis,
    @InjectQueue(IMPORTS_QUEUE) private readonly queue: Queue<ImportJob>,
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Inject(ListsService) private readonly lists: ListsService,
    @Inject(TagsService) private readonly tags: TagsService,
  ) {}

  async create(
    actor: ImportActor,
    input: { fileName?: unknown; fileSize?: unknown },
  ) {
    const fileName =
      typeof input.fileName === "string" ? input.fileName.trim() : "";
    if (!fileName || fileName.length > maxFileNameLength) {
      throw validation(
        `fileName must be between 1 and ${maxFileNameLength} characters.`,
        "fileName",
      );
    }
    const fileSize = input.fileSize;
    if (
      typeof fileSize !== "number" ||
      !Number.isInteger(fileSize) ||
      fileSize < 1
    ) {
      throw validation("fileSize must be a whole number above 0.", "fileSize");
    }
    if (fileSize > maxFileSize) {
      throw tooLarge("fileSize");
    }
    const id = randomUUID();
    await this.redis
      .multi()
      .hset(sessionKey(id), {
        workspaceId: actor.workspaceId,
        fileName,
        fileSize: String(fileSize),
        userId: actor.userId ?? "",
      })
      .expire(sessionKey(id), sessionTtlSeconds)
      .exec();
    return { id, chunkSize };
  }

  async putChunk(
    workspaceId: string,
    id: string,
    indexInput: string,
    input: { data?: unknown },
  ) {
    const session = await this.session(workspaceId, id);
    const index = /^\d{1,4}$/.test(indexInput) ? Number(indexInput) : -1;
    if (index < 0 || index > maxChunkIndex) {
      throw validation(
        `The chunk index must be a whole number from 0 to ${maxChunkIndex}.`,
        "index",
      );
    }
    const data = input.data;
    if (typeof data !== "string") {
      throw validation("data must be text.", "data");
    }
    if (data.length > chunkSize) {
      throw validation(`A chunk holds up to ${chunkSize} characters.`, "data");
    }
    let received = data.length;
    for (const [other, size] of session.parts) {
      if (other !== index) {
        received += size;
      }
    }
    if (received > maxFileSize) {
      throw tooLarge("data");
    }
    await this.files.putPart(filePrefix(workspaceId, id), index, data);
    await this.redis.hset(
      sessionKey(id),
      `${partField}${index}`,
      String(data.length),
    );
  }

  async finishUpload(
    workspaceId: string,
    id: string,
    input: { chunks?: unknown },
  ): Promise<Import> {
    const session = await this.session(workspaceId, id);
    const chunks = input.chunks;
    if (
      typeof chunks !== "number" ||
      !Number.isInteger(chunks) ||
      chunks < 1 ||
      chunks > maxChunkIndex + 1
    ) {
      throw validation(
        `chunks must be a whole number from 1 to ${maxChunkIndex + 1}.`,
        "chunks",
      );
    }
    let received = 0;
    for (let index = 0; index < chunks; index += 1) {
      const size = session.parts.get(index);
      if (size === undefined) {
        throw validation(
          `Chunk ${index} is missing. Send it again, then finish the upload.`,
          "chunks",
        );
      }
      received += size;
    }
    const prefix = filePrefix(workspaceId, id);
    const discard = async (error: unknown) => {
      await this.files.deleteIndexes(prefix, [...session.parts.keys()]);
      await this.redis.del(sessionKey(id));
      return error;
    };
    if (received > maxFileSize) {
      throw await discard(tooLarge("chunks"));
    }

    let rows: string[][];
    try {
      rows = await this.firstRows(prefix, chunks, sampleRowCount + 1);
    } catch (error) {
      if (error instanceof MissingPartError) {
        throw validation(
          `Chunk ${error.index} is missing. Send it again, then finish the upload.`,
          "chunks",
        );
      }
      throw error;
    }
    const header = rows[0];
    if (!header) {
      throw await discard(
        validation(
          "The file is empty. Choose a CSV file with a header row and at least one contact.",
          "file",
        ),
      );
    }
    if (header.length > maxColumns) {
      throw await discard(
        validation(
          `The file has more than ${maxColumns} columns. Remove the columns you do not need and upload it again.`,
          "file",
        ),
      );
    }
    const columns = headerColumns(header);
    const sampleRows = rows
      .slice(1)
      .map((row) =>
        fitRow(row, columns.length).map((cell) =>
          cell.slice(0, maxSampleCellLength),
        ),
      );

    await this.files.deleteIndexes(
      prefix,
      [...session.parts.keys()].filter((index) => index >= chunks),
    );
    await this.repository.insert({
      id,
      workspaceId,
      status: "uploaded",
      fileKey: prefix,
      fileName: session.fileName,
      fileSize: session.fileSize,
      columns,
      sampleRows,
      options: { parts: chunks },
      createdByUserId: session.userId,
    });
    await this.redis.del(sessionKey(id));
    return this.get(workspaceId, id);
  }

  async start(
    workspaceId: string,
    id: string,
    input: {
      mapping?: unknown;
      updateExisting?: unknown;
      listIds?: unknown;
      tagIds?: unknown;
    },
  ): Promise<Import> {
    const row = await this.find(workspaceId, id);
    if (row.status !== "uploaded") {
      throw this.alreadyStarted();
    }
    const checked = validateMapping(input.mapping, row.columns);
    if (!checked.ok) {
      throw validation(checked.message, "mapping");
    }
    if (checked.customKeys.length > 0) {
      const fields = await this.contacts.listFields(workspaceId);
      const keys = new Set(fields.map((field) => field.key));
      const unknown = checked.customKeys.find((key) => !keys.has(key));
      if (unknown !== undefined) {
        throw validation(
          `There is no custom field with the key "${unknown.slice(0, 100)}". Create it first or map the column to another field.`,
          "mapping",
        );
      }
    }
    if (typeof input.updateExisting !== "boolean") {
      throw validation(
        "updateExisting must be true or false.",
        "updateExisting",
      );
    }
    const listIds = idList(input.listIds, "listIds");
    const tagIds = idList(input.tagIds, "tagIds");
    if (listIds.length > 0) {
      await this.lists.assertExist(workspaceId, listIds);
    }
    if (tagIds.length > 0) {
      await this.tags.assertExist(workspaceId, tagIds);
    }

    const result = await this.repository.start(
      workspaceId,
      id,
      {
        mapping: checked.mapping,
        options: {
          parts: readOptions(row.options).parts,
          updateExisting: input.updateExisting,
          listIds,
          tagIds,
        },
      },
      maxActiveImports,
    );
    if (result.outcome !== "started") {
      if (result.outcome === "not_found") {
        throw notFound();
      }
      if (result.outcome === "conflict") {
        throw this.alreadyStarted();
      }
      throw apiError(
        HttpStatus.CONFLICT,
        "too_many_imports",
        `A workspace can run ${maxActiveImports} imports at a time. Wait for one to finish, then start this one.`,
      );
    }
    try {
      await this.queue.add(
        IMPORT_CONTACTS_JOB,
        { importId: id },
        { ...importJobOptions, jobId: id },
      );
    } catch (error) {
      await this.repository.update(id, { status: "uploaded" }, ["queued"]);
      throw error;
    }
    return serialize(result.row);
  }

  async list(workspaceId: string) {
    const rows = await this.repository.list(workspaceId, listLimit);
    return { imports: rows.map(serialize) };
  }

  async get(workspaceId: string, id: string): Promise<Import> {
    return serialize(await this.find(workspaceId, id));
  }

  async cancel(workspaceId: string, id: string): Promise<Import> {
    const row = await this.find(workspaceId, id);
    if (
      row.status !== "uploaded" &&
      row.status !== "queued" &&
      row.status !== "running"
    ) {
      return serialize(row);
    }
    const cancelled = await this.repository.update(
      id,
      { status: "cancelled", finishedAt: new Date() },
      [row.status],
    );
    if (!cancelled) {
      return this.cancel(workspaceId, id);
    }
    if (row.status !== "running") {
      await this.queue.remove(id).catch(() => undefined);
      await this.files.deleteParts(row.fileKey, readOptions(row.options).parts);
    }
    return serialize(cancelled);
  }

  async errorReport(workspaceId: string, id: string) {
    const row = await this.find(workspaceId, id);
    const content = row.errorReportKey
      ? await this.files.getErrorReport(row.fileKey)
      : null;
    if (!content) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        "not_found",
        "This import has no error report.",
      );
    }
    return { fileName: downloadName(row.fileName), content };
  }

  private alreadyStarted() {
    return apiError(
      HttpStatus.CONFLICT,
      "conflict",
      "This import has already been started.",
    );
  }

  private async find(workspaceId: string, id: string) {
    const row = isUuid(id) ? await this.repository.find(workspaceId, id) : null;
    if (!row) {
      throw notFound();
    }
    return row;
  }

  private async session(
    workspaceId: string,
    id: string,
  ): Promise<UploadSession> {
    const stored = isUuid(id) ? await this.redis.hgetall(sessionKey(id)) : {};
    if (!stored.workspaceId || stored.workspaceId !== workspaceId) {
      throw uploadNotFound();
    }
    const parts = new Map<number, number>();
    for (const [field, value] of Object.entries(stored)) {
      if (field.startsWith(partField)) {
        parts.set(Number(field.slice(partField.length)), Number(value));
      }
    }
    return {
      workspaceId,
      fileName: stored.fileName ?? "",
      fileSize: Number(stored.fileSize),
      userId: stored.userId || null,
      parts,
    };
  }

  private async firstRows(prefix: string, parts: number, count: number) {
    const rows: string[][] = [];
    for await (const row of this.files.rows(prefix, parts)) {
      rows.push(row);
      if (rows.length === count) {
        break;
      }
    }
    return rows;
  }
}
