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

@Injectable()
export class ContentArchive {
  constructor(
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  async put(
    workspaceId: string,
    messageId: string,
    createdAt: Date,
    content: MessageContent,
  ) {
    await this.storage.putObject(
      contentArchiveKey(workspaceId, messageId, createdAt),
      await compress(Buffer.from(JSON.stringify(content), "utf8")),
      "application/gzip",
    );
  }

  async get(
    workspaceId: string,
    messageId: string,
    createdAt: Date,
  ): Promise<MessageContent | null> {
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
    };
    return {
      html: typeof parsed.html === "string" ? parsed.html : null,
      text: typeof parsed.text === "string" ? parsed.text : null,
      headers:
        typeof parsed.headers === "object" && parsed.headers !== null
          ? (parsed.headers as Record<string, string>)
          : {},
    };
  }
}
