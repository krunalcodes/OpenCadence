import { Inject, Injectable } from "@nestjs/common";
import { and, type Db, eq, schema, sql } from "@workspace/db";
import {
  type KeysetCursor,
  keysetTimestampFormat,
} from "../../common/pagination/keyset-cursor";
import { DATABASE } from "../../infra/database/database.module";

const { mediaAssets } = schema;

export type MediaRow = {
  id: string;
  workspaceId: string;
  storageKey: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  createdAt: Date;
  cursorAt: string;
};

export type NewMediaRow = {
  id: string;
  workspaceId: string;
  storageKey: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  createdByUserId: string | null;
};

const columns = {
  id: mediaAssets.id,
  workspaceId: mediaAssets.workspaceId,
  storageKey: mediaAssets.storageKey,
  fileName: mediaAssets.fileName,
  contentType: mediaAssets.contentType,
  byteSize: mediaAssets.byteSize,
  width: mediaAssets.width,
  height: mediaAssets.height,
  createdAt: mediaAssets.createdAt,
  cursorAt: sql<string>`to_char(${mediaAssets.createdAt} at time zone 'UTC', ${keysetTimestampFormat})`,
};

@Injectable()
export class MediaRepository {
  constructor(@Inject(DATABASE) private readonly db: Db) {}

  async insert(values: NewMediaRow): Promise<MediaRow> {
    const [row] = await this.db
      .insert(mediaAssets)
      .values(values)
      .returning(columns);
    if (!row) {
      throw new Error("The media asset was not saved.");
    }
    return row;
  }

  async find(workspaceId: string, id: string): Promise<MediaRow | null> {
    const [row] = await this.db
      .select(columns)
      .from(mediaAssets)
      .where(
        and(eq(mediaAssets.workspaceId, workspaceId), eq(mediaAssets.id, id)),
      );
    return row ?? null;
  }

  async findPublic(id: string) {
    const [row] = await this.db
      .select({
        storageKey: mediaAssets.storageKey,
        contentType: mediaAssets.contentType,
      })
      .from(mediaAssets)
      .where(eq(mediaAssets.id, id));
    return row ?? null;
  }

  list(
    workspaceId: string,
    query: { cursor?: KeysetCursor; limit: number },
  ): Promise<MediaRow[]> {
    return this.db
      .select(columns)
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.workspaceId, workspaceId),
          query.cursor
            ? sql`(${mediaAssets.createdAt}, ${mediaAssets.id}) < (${query.cursor.at}::timestamptz, ${query.cursor.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(
        sql`${mediaAssets.createdAt} desc nulls last`,
        sql`${mediaAssets.id} desc nulls last`,
      )
      .limit(query.limit);
  }

  async delete(workspaceId: string, id: string) {
    const [row] = await this.db
      .delete(mediaAssets)
      .where(
        and(eq(mediaAssets.workspaceId, workspaceId), eq(mediaAssets.id, id)),
      )
      .returning({ storageKey: mediaAssets.storageKey });
    return row?.storageKey ?? null;
  }
}
