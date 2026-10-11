import { createHmac, randomBytes, randomUUID } from "node:crypto";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { type Db, inArray, schema } from "@workspace/db";
import { DATABASE } from "../../src/infra/database/database.module";

export type TestMember = { userId: string; cookie: string };

export type TestWorkspace = {
  workspaceId: string;
  owner: TestMember;
  addMember(role: string): Promise<TestMember>;
};

export async function createApiKey(
  app: NestFastifyApplication,
  owner: TestMember,
  workspaceId: string,
) {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/api-key/create",
    headers: { cookie: owner.cookie, origin: "http://localhost:3000" },
    payload: { name: "e2e key", organizationId: workspaceId },
  });
  const key: unknown = response.json().key;
  if (response.statusCode !== 200 || typeof key !== "string") {
    throw new Error(`The test API key was not created: ${response.body}`);
  }
  return key;
}

export function createWorkspaceSessions(
  app: NestFastifyApplication,
  label: string,
) {
  const db = app.get<Db>(DATABASE);
  const secret = process.env.BETTER_AUTH_SECRET ?? "";
  const workspaceIds: string[] = [];
  const userIds: string[] = [];

  async function addMember(
    workspaceId: string,
    role: string,
  ): Promise<TestMember> {
    const [user] = await db
      .insert(schema.users)
      .values({
        name: `${label} ${role}`,
        email: `${label}-${randomUUID()}@example.com`,
        emailVerified: true,
      })
      .returning({ id: schema.users.id });
    if (!user) {
      throw new Error("The test user was not created.");
    }
    userIds.push(user.id);
    await db
      .insert(schema.workspaceMembers)
      .values({ workspaceId, userId: user.id, role });
    const token = randomBytes(24).toString("base64url");
    await db.insert(schema.sessions).values({
      token,
      userId: user.id,
      activeWorkspaceId: workspaceId,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const signature = createHmac("sha256", secret)
      .update(token)
      .digest("base64");
    return {
      userId: user.id,
      cookie: `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`,
    };
  }

  return {
    async workspace(): Promise<TestWorkspace> {
      const [workspace] = await db
        .insert(schema.workspaces)
        .values({ name: label, slug: `${label}-${randomUUID()}` })
        .returning({ id: schema.workspaces.id });
      if (!workspace) {
        throw new Error("The test workspace was not created.");
      }
      workspaceIds.push(workspace.id);
      return {
        workspaceId: workspace.id,
        owner: await addMember(workspace.id, "owner"),
        addMember: (role) => addMember(workspace.id, role),
      };
    },
    async cleanup() {
      if (userIds.length > 0) {
        await db.delete(schema.users).where(inArray(schema.users.id, userIds));
      }
      if (workspaceIds.length > 0) {
        await db
          .delete(schema.workspaces)
          .where(inArray(schema.workspaces.id, workspaceIds));
      }
    },
  };
}
