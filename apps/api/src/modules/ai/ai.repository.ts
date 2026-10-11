import { Inject, Injectable } from "@nestjs/common";
import { type Db, eq, schema } from "@workspace/db";
import { DATABASE } from "../../infra/database/database.module";

const { workspaceAiSettings } = schema;

export type AiSettingsRow = typeof workspaceAiSettings.$inferSelect;

export type AiSettingsKey = {
  keyVersion: number;
  wrappedDataKey: Buffer;
  apiKeyCiphertext: Buffer;
  apiKeyHint: string | null;
};

export type AiSettingsWrite = {
  baseUrl: string;
  model: string;
  updatedByUserId: string | null;
  key: AiSettingsKey | null;
};

@Injectable()
export class AiRepository {
  constructor(@Inject(DATABASE) private readonly db: Db) {}

  async get(workspaceId: string): Promise<AiSettingsRow | null> {
    const [row] = await this.db
      .select()
      .from(workspaceAiSettings)
      .where(eq(workspaceAiSettings.workspaceId, workspaceId))
      .limit(1);
    return row ?? null;
  }

  async create(
    workspaceId: string,
    input: AiSettingsWrite & { key: AiSettingsKey },
  ): Promise<AiSettingsRow | null> {
    const values = {
      baseUrl: input.baseUrl,
      model: input.model,
      updatedByUserId: input.updatedByUserId,
      ...input.key,
    };
    const [row] = await this.db
      .insert(workspaceAiSettings)
      .values({ workspaceId, ...values })
      .onConflictDoUpdate({
        target: workspaceAiSettings.workspaceId,
        set: values,
      })
      .returning();
    return row ?? null;
  }

  async update(
    workspaceId: string,
    input: AiSettingsWrite,
  ): Promise<AiSettingsRow | null> {
    const [row] = await this.db
      .update(workspaceAiSettings)
      .set({
        baseUrl: input.baseUrl,
        model: input.model,
        updatedByUserId: input.updatedByUserId,
        ...(input.key ?? {}),
      })
      .where(eq(workspaceAiSettings.workspaceId, workspaceId))
      .returning();
    return row ?? null;
  }

  async delete(workspaceId: string) {
    await this.db
      .delete(workspaceAiSettings)
      .where(eq(workspaceAiSettings.workspaceId, workspaceId));
  }
}
