import { promisify } from "node:util";
import { gunzip, gzip } from "node:zlib";
import { Inject, Injectable } from "@nestjs/common";
import { StorageService } from "../../infra/storage/storage.service";
import { contentArchiveKey } from "./dispatch.constants";

const compress = promisify(gzip);
const decompress = promisify(gunzip);

export type MessageContent = {
  html: string | null;
  text: string | null;
  headers: Record<string, string>;
};

export type StoredContent = MessageContent & {
  snapshotId: string | null;
  variables: Record<string, string> | null;
};

function isRecord(value: unknown): value is Record<string, string> {
  return typeof value === "object" && value !== null;
}

@Injectable()
export class ContentArchive {
  constructor(
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  async put(
    workspaceId: string,
    messageId: string,
    createdAt: Date,
    content: MessageContent & Partial<StoredContent>,
  ) {
    await this.storage.putObject(
      contentArchiveKey(workspaceId, messageId, createdAt),
      await compress(
        Buffer.from(
          JSON.stringify({
            html: content.html,
            text: content.text,
            headers: content.headers,
            ...(content.snapshotId
              ? {
                  snapshotId: content.snapshotId,
                  variables: content.variables ?? {},
                }
              : {}),
          }),
          "utf8",
        ),
      ),
      "application/gzip",
    );
  }

  async get(
    workspaceId: string,
    messageId: string,
    createdAt: Date,
  ): Promise<MessageContent | null> {
    const stored = await this.getStored(workspaceId, messageId, createdAt);
    return stored
      ? { html: stored.html, text: stored.text, headers: stored.headers }
      : null;
  }

  async getStored(
    workspaceId: string,
    messageId: string,
    createdAt: Date,
  ): Promise<StoredContent | null> {
    const object = await this.storage.getObject(
      contentArchiveKey(workspaceId, messageId, createdAt),
    );
    if (!object) {
      return null;
    }
    const parsed = JSON.parse((await decompress(object)).toString("utf8")) as {
      html?: unknown;
      text?: unknown;
      headers?: unknown;
      snapshotId?: unknown;
      variables?: unknown;
    };
    return {
      html: typeof parsed.html === "string" ? parsed.html : null,
      text: typeof parsed.text === "string" ? parsed.text : null,
      headers: isRecord(parsed.headers) ? parsed.headers : {},
      snapshotId:
        typeof parsed.snapshotId === "string" ? parsed.snapshotId : null,
      variables: isRecord(parsed.variables) ? parsed.variables : null,
    };
  }
}
