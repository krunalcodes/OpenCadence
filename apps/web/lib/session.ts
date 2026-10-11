import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { requestPathHeader, safeRedirect, withRedirect } from "@/lib/redirect";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  twoFactorEnabled?: boolean | null;
  lastLoginMethod?: string | null;
};

export type Session = {
  user: SessionUser;
  session: {
    id: string;
    token?: string;
    expiresAt: string;
    activeOrganizationId?: string | null;
  };
};

export type DeviceSession = {
  id: string;
  token: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LinkedAccount = {
  id: string;
  providerId: string;
  accountId: string;
  createdAt: string;
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

type AuthResponse = { status: number; data: unknown };

async function authRequest(path: string): Promise<AuthResponse> {
  const cookie = (await headers()).get("cookie");
  if (!cookie) {
    return { status: 401, data: null };
  }
  try {
    const response = await fetch(`${apiUrl}/api/auth${path}`, {
      headers: { cookie },
      cache: "no-store",
    });
    if (!response.ok) {
      return { status: response.status, data: null };
    }
    return { status: response.status, data: await response.json() };
  } catch {
    return { status: 0, data: null };
  }
}

async function authFetch(path: string): Promise<unknown> {
  return (await authRequest(path)).data;
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

function text(value: unknown) {
  return typeof value === "string" && value !== "" ? value : null;
}

function toDeviceSession(value: unknown): DeviceSession | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const row = value as Record<string, unknown>;
  const id = text(row.id);
  const token = text(row.token);
  if (!id || !token) {
    return null;
  }
  const createdAt = text(row.createdAt) ?? "";
  return {
    id,
    token,
    userAgent: text(row.userAgent),
    ipAddress: text(row.ipAddress),
    createdAt,
    updatedAt: text(row.updatedAt) ?? createdAt,
  };
}

function toLinkedAccount(value: unknown): LinkedAccount | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const row = value as Record<string, unknown>;
  const id = text(row.id);
  const providerId = text(row.providerId);
  if (!id || !providerId) {
    return null;
  }
  return {
    id,
    providerId,
    accountId: text(row.accountId) ?? "",
    createdAt: text(row.createdAt) ?? "",
  };
}

function present<T>(value: T | null): value is T {
  return value !== null;
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

export type DeviceSessions =
  | { status: "ok"; sessions: DeviceSession[] }
  | { status: "stale" }
  | { status: "unavailable" };

export const getSessions = cache(async (): Promise<DeviceSessions> => {
  const { status, data } = await authRequest("/list-sessions");
  if (status === 403) {
    return { status: "stale" };
  }
  if (!Array.isArray(data)) {
    return { status: "unavailable" };
  }
  return {
    status: "ok",
    sessions: data
      .map(toDeviceSession)
      .filter(present)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  };
});

export const getAccounts = cache(async (): Promise<LinkedAccount[] | null> => {
  const data = await authFetch("/list-accounts");
  if (!Array.isArray(data)) {
    return null;
  }
  return data.map(toLinkedAccount).filter(present);
});

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) {
    const path = safeRedirect((await headers()).get(requestPathHeader));
    redirect(withRedirect("/sign-in", path));
  }
  return session;
}

export async function redirectIfSignedIn(target?: string | null) {
  const session = await getSession();
  if (session) {
    redirect(target ?? "/app");
  }
}

export type WorkspaceRole = "owner" | "admin" | "member";

export type WorkspaceMember = {
  id: string;
  userId: string;
  role: WorkspaceRole;
  createdAt: string;
  name: string;
  email: string;
};

export type WorkspaceInvitation = {
  id: string;
  email: string;
  role: WorkspaceRole;
  status: string;
  inviterId: string;
  expiresAt: string;
};

export type WorkspaceApiKey = {
  id: string;
  name: string | null;
  start: string | null;
  enabled: boolean;
  createdAt: string;
  lastRequest: string | null;
  expiresAt: string | null;
  rateLimit: { max: number; windowMs: number } | null;
};

export type WorkspaceApiKeys =
  | { state: "ready"; keys: WorkspaceApiKey[] }
  | { state: "forbidden" | "unavailable" | "failed" };

export type InvitationLookup =
  | {
      state: "pending";
      invitation: {
        id: string;
        email: string;
        role: WorkspaceRole;
        workspaceId: string;
        workspaceName: string;
        inviterEmail: string;
        expiresAt: string;
      };
    }
  | { state: "accepted"; workspaceId: string; workspaceName: string }
  | { state: "expired"; workspaceName: string | null }
  | { state: "cancelled" | "declined"; workspaceName: string }
  | { state: "wrong-account" | "unverified" | "unavailable" | "failed" };

type Row = Record<string, unknown>;

async function authRequestWithBody(path: string): Promise<AuthResponse> {
  const cookie = (await headers()).get("cookie");
  if (!cookie) {
    return { status: 401, data: null };
  }
  try {
    const response = await fetch(`${apiUrl}/api/auth${path}`, {
      headers: { cookie },
      cache: "no-store",
    });
    const data: unknown = await response.json().catch(() => null);
    return { status: response.status, data };
  } catch {
    return { status: 0, data: null };
  }
}

function isRow(value: unknown): value is Row {
  return typeof value === "object" && value !== null;
}

function rowsOf(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter(isRow) : [];
}

function textOf(value: unknown) {
  return typeof value === "string" ? value : "";
}

function textOrNull(value: unknown) {
  return typeof value === "string" && value !== "" ? value : null;
}

function errorCodeOf(data: unknown) {
  return isRow(data) ? textOf(data.code) : "";
}

function toWorkspaceRole(value: unknown): WorkspaceRole {
  const roles = textOf(value)
    .split(",")
    .map((role) => role.trim());
  if (roles.includes("owner")) {
    return "owner";
  }
  return roles.includes("admin") ? "admin" : "member";
}

function workspaceQuery(workspaceId: string) {
  return `organizationId=${encodeURIComponent(workspaceId)}`;
}

export const getWorkspaceRole = cache(
  async (workspaceId: string): Promise<WorkspaceRole | null> => {
    const { status, data } = await authRequestWithBody(
      `/organization/get-active-member-role?${workspaceQuery(workspaceId)}`,
    );
    if (status !== 200 || !isRow(data) || typeof data.role !== "string") {
      return null;
    }
    return toWorkspaceRole(data.role);
  },
);

export const getWorkspaceMembers = cache(
  async (workspaceId: string): Promise<WorkspaceMember[] | null> => {
    const { status, data } = await authRequestWithBody(
      `/organization/list-members?${workspaceQuery(workspaceId)}&limit=500&sortBy=createdAt&sortDirection=asc`,
    );
    if (status !== 200 || !isRow(data)) {
      return null;
    }
    return rowsOf(data.members).map((member) => {
      const user = isRow(member.user) ? member.user : {};
      return {
        id: textOf(member.id),
        userId: textOf(member.userId),
        role: toWorkspaceRole(member.role),
        createdAt: textOf(member.createdAt),
        name: textOf(user.name),
        email: textOf(user.email),
      };
    });
  },
);

function toInvitation(invitation: Row): WorkspaceInvitation {
  return {
    id: textOf(invitation.id),
    email: textOf(invitation.email),
    role: toWorkspaceRole(invitation.role),
    status: textOf(invitation.status),
    inviterId: textOf(invitation.inviterId),
    expiresAt: textOf(invitation.expiresAt),
  };
}

export const getWorkspaceInvitations = cache(
  async (workspaceId: string): Promise<WorkspaceInvitation[] | null> => {
    const { status, data } = await authRequestWithBody(
      `/organization/list-invitations?${workspaceQuery(workspaceId)}`,
    );
    if (status !== 200) {
      return null;
    }
    return rowsOf(data).map(toInvitation);
  },
);

export async function getWorkspaceApiKeys(
  workspaceId: string,
): Promise<WorkspaceApiKeys> {
  const { status, data } = await authRequestWithBody(
    `/api-key/list?${workspaceQuery(workspaceId)}&sortBy=createdAt&sortDirection=desc`,
  );
  if (status === 403) {
    return { state: "forbidden" };
  }
  if (status === 404) {
    return { state: "unavailable" };
  }
  if (status !== 200 || !isRow(data)) {
    return { state: "failed" };
  }
  return {
    state: "ready",
    keys: rowsOf(data.apiKeys).map((key) => ({
      id: textOf(key.id),
      name: textOrNull(key.name),
      start: textOrNull(key.start),
      enabled: key.enabled !== false,
      createdAt: textOf(key.createdAt),
      lastRequest: textOrNull(key.lastRequest),
      expiresAt: textOrNull(key.expiresAt),
      rateLimit:
        key.rateLimitEnabled === true &&
        typeof key.rateLimitMax === "number" &&
        typeof key.rateLimitTimeWindow === "number"
          ? { max: key.rateLimitMax, windowMs: key.rateLimitTimeWindow }
          : null,
    })),
  };
}

const invitationWorkspaceScanLimit = 25;

async function findSettledInvitation(
  id: string,
  email: string,
): Promise<InvitationLookup> {
  const received = await authRequestWithBody(
    "/organization/list-user-invitations",
  );
  const pending = rowsOf(received.data).find((row) => row.id === id);
  if (pending) {
    const expired = new Date(textOf(pending.expiresAt)).getTime() <= Date.now();
    return expired
      ? {
          state: "expired",
          workspaceName: textOrNull(pending.organizationName),
        }
      : { state: "unavailable" };
  }
  const workspaces = (await getWorkspaces()).slice(
    0,
    invitationWorkspaceScanLimit,
  );
  const lists = await Promise.all(
    workspaces.map((workspace) => getWorkspaceInvitations(workspace.id)),
  );
  for (const [index, list] of lists.entries()) {
    const workspace = workspaces[index];
    const match = list?.find((invitation) => invitation.id === id);
    if (!workspace || !match) {
      continue;
    }
    if (match.email.toLowerCase() !== email.toLowerCase()) {
      return { state: "wrong-account" };
    }
    if (match.status === "accepted") {
      return {
        state: "accepted",
        workspaceId: workspace.id,
        workspaceName: workspace.name,
      };
    }
    if (match.status === "canceled") {
      return { state: "cancelled", workspaceName: workspace.name };
    }
    if (match.status === "rejected") {
      return { state: "declined", workspaceName: workspace.name };
    }
    return { state: "expired", workspaceName: workspace.name };
  }
  return { state: "unavailable" };
}

export async function lookUpInvitation(
  id: string,
  email: string,
): Promise<InvitationLookup> {
  const { status, data } = await authRequestWithBody(
    `/organization/get-invitation?id=${encodeURIComponent(id)}`,
  );
  if (status === 200 && isRow(data)) {
    return {
      state: "pending",
      invitation: {
        id: textOf(data.id),
        email: textOf(data.email),
        role: toWorkspaceRole(data.role),
        workspaceId: textOf(data.organizationId),
        workspaceName: textOf(data.organizationName),
        inviterEmail: textOf(data.inviterEmail),
        expiresAt: textOf(data.expiresAt),
      },
    };
  }
  if (status === 403) {
    return {
      state: errorCodeOf(data).startsWith("EMAIL_VERIFICATION_REQUIRED")
        ? "unverified"
        : "wrong-account",
    };
  }
  if (status === 400) {
    return findSettledInvitation(id, email);
  }
  return { state: "failed" };
}
