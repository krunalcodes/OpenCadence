import { Inject, Injectable } from "@nestjs/common";
import { and, type Db, eq, inArray, lt, schema, sql } from "@workspace/db";
import {
  type KeysetCursor,
  keysetTimestampFormat,
} from "../../common/pagination/keyset-cursor";
import { DATABASE } from "../../infra/database/database.module";
import type { StoredField, StoredSettings } from "./form-input";
import type { FormStatus, SubmissionStatus } from "./forms.constants";

const { forms, formSubmissions } = schema;

export type FormRow = typeof forms.$inferSelect;
export type SubmissionRow = typeof formSubmissions.$inferSelect;
export type SubmissionListRow = { submission: SubmissionRow; cursorAt: string };

export type FormValues = {
  name?: string;
  status?: FormStatus;
  listIds?: string[];
  doubleOptIn?: boolean;
  fields?: StoredField[];
  settings?: StoredSettings;
  sourceId?: string | null;
};

export type FormWriteResult =
  | { ok: true; row: FormRow }
  | { ok: false; reason: "name_taken" | "not_found" };

export type NewSubmission = {
  workspaceId: string;
  formId: string;
  email: string;
  data: Record<string, string>;
  status: SubmissionStatus;
  consentText: string;
  userAgent: string | null;
};

const uniqueViolation = "23505";
const nameIndex = "forms_workspace_id_name_uidx";

function databaseError(error: unknown) {
  let current = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (typeof current !== "object") {
      return null;
    }
    const { code, constraint, cause } = current as {
      code?: unknown;
      constraint?: unknown;
      cause?: unknown;
    };
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) {
      return {
        code,
        constraint: typeof constraint === "string" ? constraint : "",
      };
    }
    current = cause;
  }
  return null;
}

function isNameTaken(error: unknown) {
  const failure = databaseError(error);
  return failure?.code === uniqueViolation && failure.constraint === nameIndex;
}

export function isPublicIdTaken(error: unknown) {
  const failure = databaseError(error);
  return (
    failure?.code === uniqueViolation &&
    failure.constraint === "forms_public_id_uidx"
  );
}

@Injectable()
export class FormsRepository {
  constructor(@Inject(DATABASE) private readonly db: Db) {}

  list(workspaceId: string): Promise<FormRow[]> {
    return this.db
      .select()
      .from(forms)
      .where(eq(forms.workspaceId, workspaceId))
      .orderBy(
        sql`${forms.createdAt} desc nulls last`,
        sql`${forms.id} desc nulls last`,
      );
  }

  async find(workspaceId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(forms)
      .where(and(eq(forms.workspaceId, workspaceId), eq(forms.id, id)))
      .limit(1);
    return row ?? null;
  }

  async findByPublicId(publicId: string) {
    const [row] = await this.db
      .select()
      .from(forms)
      .where(eq(forms.publicId, publicId))
      .limit(1);
    return row ?? null;
  }

  async insert(
    workspaceId: string,
    values: {
      name: string;
      publicId: string;
      fields: StoredField[];
      createdByUserId: string | null;
    },
  ): Promise<FormWriteResult> {
    try {
      const [row] = await this.db
        .insert(forms)
        .values({ workspaceId, ...values })
        .returning();
      return row ? { ok: true, row } : { ok: false, reason: "not_found" };
    } catch (error) {
      if (isNameTaken(error)) {
        return { ok: false, reason: "name_taken" };
      }
      throw error;
    }
  }

  async update(
    workspaceId: string,
    id: string,
    values: FormValues,
  ): Promise<FormWriteResult> {
    try {
      const [row] = await this.db
        .update(forms)
        .set(values)
        .where(and(eq(forms.workspaceId, workspaceId), eq(forms.id, id)))
        .returning();
      return row ? { ok: true, row } : { ok: false, reason: "not_found" };
    } catch (error) {
      if (isNameTaken(error)) {
        return { ok: false, reason: "name_taken" };
      }
      throw error;
    }
  }

  async delete(workspaceId: string, id: string) {
    const rows = await this.db
      .delete(forms)
      .where(and(eq(forms.workspaceId, workspaceId), eq(forms.id, id)))
      .returning({ id: forms.id });
    return rows.length > 0;
  }

  insertSubmission(values: NewSubmission): Promise<SubmissionRow> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx.insert(formSubmissions).values(values).returning();
      if (!row) {
        throw new Error("The form submission was not stored.");
      }
      await tx
        .update(forms)
        .set({
          submissionCount: sql`${forms.submissionCount} + 1`,
          updatedAt: sql`${forms.updatedAt}`,
        })
        .where(
          and(
            eq(forms.workspaceId, values.workspaceId),
            eq(forms.id, values.formId),
          ),
        );
      return row;
    });
  }

  async setConfirmationMessage(
    workspaceId: string,
    id: string,
    messageId: string,
  ) {
    await this.db
      .update(formSubmissions)
      .set({ confirmationMessageId: messageId })
      .where(
        and(
          eq(formSubmissions.workspaceId, workspaceId),
          eq(formSubmissions.id, id),
        ),
      );
  }

  async findSubmissionWithForm(id: string) {
    const [row] = await this.db
      .select({ submission: formSubmissions, form: forms })
      .from(formSubmissions)
      .innerJoin(
        forms,
        and(
          eq(forms.workspaceId, formSubmissions.workspaceId),
          eq(forms.id, formSubmissions.formId),
        ),
      )
      .where(eq(formSubmissions.id, id))
      .limit(1);
    return row ?? null;
  }

  completeSubmission(
    workspaceId: string,
    id: string,
    contactId: string,
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(formSubmissions)
        .set({
          status: "subscribed",
          contactId,
          confirmedAt: sql`now()`,
        })
        .where(
          and(
            eq(formSubmissions.workspaceId, workspaceId),
            eq(formSubmissions.id, id),
            inArray(formSubmissions.status, ["pending", "confirmed"]),
          ),
        )
        .returning({ formId: formSubmissions.formId });
      if (!row) {
        return false;
      }
      await tx
        .update(forms)
        .set({
          confirmedCount: sql`${forms.confirmedCount} + 1`,
          updatedAt: sql`${forms.updatedAt}`,
        })
        .where(
          and(eq(forms.workspaceId, workspaceId), eq(forms.id, row.formId)),
        );
      return true;
    });
  }

  listSubmissions(
    workspaceId: string,
    formId: string,
    query: { status?: SubmissionStatus; cursor?: KeysetCursor; limit: number },
  ): Promise<SubmissionListRow[]> {
    return this.db
      .select({
        submission: formSubmissions,
        cursorAt: sql<string>`to_char(${formSubmissions.createdAt} at time zone 'UTC', ${keysetTimestampFormat})`,
      })
      .from(formSubmissions)
      .where(
        and(
          eq(formSubmissions.workspaceId, workspaceId),
          eq(formSubmissions.formId, formId),
          query.status ? eq(formSubmissions.status, query.status) : undefined,
          query.cursor
            ? sql`(${formSubmissions.createdAt}, ${formSubmissions.id}) < (${query.cursor.at}::timestamptz, ${query.cursor.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(
        sql`${formSubmissions.createdAt} desc nulls last`,
        sql`${formSubmissions.id} desc nulls last`,
      )
      .limit(query.limit);
  }

  async deletePendingBefore(before: Date, limit: number) {
    const stale = this.db
      .select({ id: formSubmissions.id })
      .from(formSubmissions)
      .where(
        and(
          eq(formSubmissions.status, "pending"),
          lt(formSubmissions.createdAt, before),
        ),
      )
      .orderBy(formSubmissions.createdAt)
      .limit(limit);
    const rows = await this.db
      .delete(formSubmissions)
      .where(inArray(formSubmissions.id, stale))
      .returning({ id: formSubmissions.id });
    return rows.length;
  }
}
