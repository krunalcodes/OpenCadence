import type { Db } from "@workspace/db";
import { schema } from "@workspace/db";

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function uniqueSlug(name: string) {
  const base = slugify(name) || "workspace";
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function ensureFirstWorkspace(db: Db, userId: string) {
  const membership = await db.query.workspaceMembers.findFirst({
    columns: { workspaceId: true },
    where: (member, { eq }) => eq(member.userId, userId),
    orderBy: (member, { asc }) => asc(member.createdAt),
  });

  if (membership) {
    return membership.workspaceId;
  }

  const user = await db.query.users.findFirst({
    columns: { name: true, email: true },
    where: (candidate, { eq }) => eq(candidate.id, userId),
  });

  if (!user) {
    throw new Error(`Cannot create a workspace for missing user ${userId}`);
  }

  const name = user.name.trim() || user.email.split("@")[0] || "Workspace";

  return db.transaction(async (tx) => {
    const [workspace] = await tx
      .insert(schema.workspaces)
      .values({ name, slug: uniqueSlug(name) })
      .returning({ id: schema.workspaces.id });

    if (!workspace) {
      throw new Error(`Could not create a workspace for user ${userId}`);
    }

    await tx.insert(schema.workspaceMembers).values({
      workspaceId: workspace.id,
      userId,
      role: "owner",
    });

    return workspace.id;
  });
}
