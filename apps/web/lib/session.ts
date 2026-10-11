import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
};

export type Session = {
  user: SessionUser;
  session: {
    id: string;
    expiresAt: string;
    activeOrganizationId?: string | null;
  };
};

export type Workspace = {
  id: string;
  name: string;
  slug: string;
};

const apiUrl = (process.env.API_URL ?? "http://localhost:3001").replace(
  /\/+$/,
  "",
);

async function authFetch(path: string): Promise<unknown> {
  const cookie = (await headers()).get("cookie");
  if (!cookie) {
    return null;
  }
  try {
    const response = await fetch(`${apiUrl}/api/auth${path}`, {
      headers: { cookie },
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch {
    return null;
  }
}

function isSession(value: unknown): value is Session {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const { user, session } = value as Partial<Session>;
  return (
    typeof user === "object" &&
    user !== null &&
    typeof user.id === "string" &&
    typeof user.email === "string" &&
    typeof session === "object" &&
    session !== null
  );
}

function isWorkspace(value: unknown): value is Workspace {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const { id, name } = value as Partial<Workspace>;
  return typeof id === "string" && typeof name === "string";
}

export const getSession = cache(async (): Promise<Session | null> => {
  const data = await authFetch("/get-session");
  return isSession(data) ? data : null;
});

export const getWorkspaces = cache(async (): Promise<Workspace[]> => {
  const data = await authFetch("/organization/list");
  if (!Array.isArray(data)) {
    return [];
  }
  return data.filter(isWorkspace).map(({ id, name, slug }) => ({
    id,
    name,
    slug: typeof slug === "string" ? slug : "",
  }));
});

export const getActiveWorkspace = cache(async (): Promise<Workspace | null> => {
  const [session, workspaces] = await Promise.all([
    getSession(),
    getWorkspaces(),
  ]);
  if (!session) {
    return null;
  }
  const activeId = session.session.activeOrganizationId;
  return (
    workspaces.find((workspace) => workspace.id === activeId) ??
    workspaces[0] ??
    null
  );
});

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) {
    redirect("/sign-in");
  }
  return session;
}

export async function redirectIfSignedIn() {
  const session = await getSession();
  if (session) {
    redirect("/app");
  }
}
