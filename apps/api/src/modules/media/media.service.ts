import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { apiError } from "../../common/api-error";
import {
  clampLimit,
  decodeKeysetCursor,
  encodeKeysetCursor,
} from "../../common/pagination/keyset-cursor";
import { isUuid, uuidv7 } from "../../common/uuid";
import type { Env } from "../../config/env";
import { StorageService } from "../../infra/storage/storage.service";
import {
  imageTypes,
  inspectImage,
  isImageContentType,
  safeFileName,
} from "./image-info";
import { MediaRepository, type MediaRow } from "./media.repository";

export type MediaAsset = {
  id: string;
  url: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  createdAt: string;
};

export type MediaFile = { body: Buffer; contentType: string };

export type MediaUpload = {
  workspaceId: string;
  userId: string | null;
  contentType: string | undefined;
  fileName: string | undefined;
  body: unknown;
};

export const maxMediaBytes = 5 * 1024 * 1024;

const defaultLimit = 30;
const maxLimit = 100;

function notFound() {
  return apiError(
    HttpStatus.NOT_FOUND,
    "not_found",
    "This image was not found. It may have been deleted.",
  );
}

export function unsupportedType() {
  return apiError(
    HttpStatus.UNSUPPORTED_MEDIA_TYPE,
    "unsupported_type",
    "Upload a PNG, JPEG, GIF, or WebP image.",
    "file",
  );
}

export function tooLarge() {
  return apiError(
    HttpStatus.PAYLOAD_TOO_LARGE,
    "too_large",
    "The image is larger than 5 MB.",
    "file",
  );
}

@Injectable()
export class MediaService {
  private readonly baseUrl: string;

  constructor(
    @Inject(MediaRepository) private readonly repository: MediaRepository,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(ConfigService) config: ConfigService<Env, true>,
  ) {
    this.baseUrl = config.get("MEDIA_BASE_URL", { infer: true });
  }

  urlFor(asset: { id: string; fileName: string }) {
    return `${this.baseUrl}/media/${asset.id}/${encodeURIComponent(asset.fileName)}`;
  }

  async upload(input: MediaUpload): Promise<MediaAsset> {
    const declared = (input.contentType ?? "")
      .split(";")[0]
      ?.trim()
      .toLowerCase();
    if (!declared || !isImageContentType(declared)) {
      throw unsupportedType();
    }
    if (!Buffer.isBuffer(input.body) || input.body.length === 0) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "validation",
        "Send the image file as the request body.",
        "file",
      );
    }
    if (input.body.length > maxMediaBytes) {
      throw tooLarge();
    }
    const info = inspectImage(input.body);
    if (!info || info.contentType !== declared) {
      throw unsupportedType();
    }

    const id = uuidv7();
    const storageKey = `media/${input.workspaceId}/${id}.${imageTypes[declared]}`;
    await this.storage.putObject(storageKey, input.body, declared);
    try {
      const row = await this.repository.insert({
        id,
        workspaceId: input.workspaceId,
        storageKey,
        fileName: safeFileName(input.fileName, declared),
        contentType: declared,
        byteSize: input.body.length,
        width: info.width,
        height: info.height,
        createdByUserId: input.userId,
      });
      return this.toAsset(row);
    } catch (error) {
      await this.storage.deleteObject(storageKey).catch(() => undefined);
      throw error;
    }
  }

  async list(
    workspaceId: string,
    query: { cursor?: string; limit?: number },
  ): Promise<{ items: MediaAsset[]; nextCursor: string | null }> {
    const cursor = query.cursor ? decodeKeysetCursor(query.cursor) : undefined;
    if (cursor === null) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        "validation",
        "The cursor is not valid. Start again from the first page.",
        "cursor",
      );
    }
    const limit = clampLimit(query.limit, defaultLimit, maxLimit);
    const rows = await this.repository.list(workspaceId, {
      cursor,
      limit: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map((row) => this.toAsset(row)),
      nextCursor:
        rows.length > limit && last
          ? encodeKeysetCursor({ at: last.cursorAt, id: last.id })
          : null,
    };
  }

  async get(workspaceId: string, id: string): Promise<MediaAsset | null> {
    const row = isUuid(id) ? await this.repository.find(workspaceId, id) : null;
    return row ? this.toAsset(row) : null;
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const storageKey = isUuid(id)
      ? await this.repository.delete(workspaceId, id)
      : null;
    if (!storageKey) {
      throw notFound();
    }
    await this.storage.deleteObject(storageKey);
  }

  async read(id: string): Promise<MediaFile> {
    const row = isUuid(id) ? await this.repository.findPublic(id) : null;
    const body = row ? await this.storage.getObject(row.storageKey) : null;
    if (!row || !body) {
      throw notFound();
    }
    return { body, contentType: row.contentType };
  }

  private toAsset(row: MediaRow): MediaAsset {
    return {
      id: row.id,
      url: this.urlFor(row),
      fileName: row.fileName,
      contentType: row.contentType,
      byteSize: row.byteSize,
      width: row.width,
      height: row.height,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
