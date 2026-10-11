import { Inject, Injectable } from "@nestjs/common";
import { type Db, eq, schema } from "@workspace/db";
import {
  databaseError,
  foreignKeyViolation,
} from "../../common/database-error";
import { DATABASE } from "../../infra/database/database.module";

const { workspaceBrandSettings } = schema;

export type BrandRow = typeof workspaceBrandSettings.$inferSelect;

export type BrandValues = Partial<
  Pick<
    BrandRow,
    | "brandName"
    | "websiteUrl"
    | "logoMediaId"
    | "primaryColor"
    | "backgroundColor"
    | "contentColor"
    | "textColor"
    | "fontFamily"
    | "postalAddress"
    | "voice"
    | "socialLinks"
  >
>;

export type BrandWriteResult = { ok: true } | { ok: false; reason: "logo" };

@Injectable()
export class BrandRepository {
  constructor(@Inject(DATABASE) private readonly db: Db) {}

  async find(workspaceId: string): Promise<BrandRow | null> {
    const [row] = await this.db
      .select()
      .from(workspaceBrandSettings)
      .where(eq(workspaceBrandSettings.workspaceId, workspaceId));
    return row ?? null;
  }

  async upsert(
    workspaceId: string,
    values: BrandValues,
    userId: string | null,
  ): Promise<BrandWriteResult> {
    try {
      await this.db
        .insert(workspaceBrandSettings)
        .values({ workspaceId, ...values, updatedByUserId: userId })
        .onConflictDoUpdate({
          target: workspaceBrandSettings.workspaceId,
          set: { ...values, updatedByUserId: userId, updatedAt: new Date() },
        });
      return { ok: true };
    } catch (error) {
      if (databaseError(error)?.code === foreignKeyViolation) {
        return { ok: false, reason: "logo" };
      }
      throw error;
    }
  }
}
