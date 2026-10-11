import type { Db } from "@workspace/db";
import { schema } from "@workspace/db";
import type { Mailer } from "@workspace/email";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins/organization";
import { ensureFirstWorkspace } from "./workspace";

export type CreateAuthOptions = {
  db: Db;
  mailer: Mailer;
  secret: string;
  baseURL: string;
  google?: { clientId: string; clientSecret: string };
  trustedOrigins?: string[];
};

const VERIFICATION_TOKEN_SECONDS = 60 * 60 * 24;
const RESET_TOKEN_SECONDS = 60 * 60;

function formatLifetime(seconds: number) {
  const hours = Math.round(seconds / 3600);
  if (hours >= 1) {
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

export function createAuth(options: CreateAuthOptions) {
  const { db, mailer, google } = options;
  const webOrigin = options.baseURL.replace(/\/+$/, "");
  const pageLink = (path: string, token: string) =>
    `${webOrigin}${path}?token=${encodeURIComponent(token)}`;

  return betterAuth({
    appName: "OpenCadence",
    secret: options.secret,
    baseURL: options.baseURL,
    basePath: "/api/auth",
    trustedOrigins: options.trustedOrigins,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
      usePlural: true,
    }),
    advanced: {
      database: { generateId: "uuid" },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      resetPasswordTokenExpiresIn: RESET_TOKEN_SECONDS,
      sendResetPassword: async ({ user, token }) => {
        await mailer.sendPasswordResetEmail({
          to: user.email,
          name: user.name,
          url: pageLink("/reset-password", token),
          expiresIn: formatLifetime(RESET_TOKEN_SECONDS),
        });
      },
    },
    emailVerification: {
      expiresIn: VERIFICATION_TOKEN_SECONDS,
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, token }) => {
        await mailer.sendVerificationEmail({
          to: user.email,
          name: user.name,
          url: pageLink("/verify-email", token),
          expiresIn: formatLifetime(VERIFICATION_TOKEN_SECONDS),
        });
      },
    },
    socialProviders: google
      ? {
          google: {
            clientId: google.clientId,
            clientSecret: google.clientSecret,
          },
        }
      : undefined,
    plugins: [
      organization({
        schema: {
          session: {
            fields: { activeOrganizationId: "activeWorkspaceId" },
          },
          organization: { modelName: "workspace" },
          member: {
            modelName: "workspaceMember",
            fields: { organizationId: "workspaceId" },
          },
          invitation: {
            modelName: "workspaceInvitation",
            fields: { organizationId: "workspaceId" },
          },
        },
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await ensureFirstWorkspace(db, user.id);
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            if (session.activeOrganizationId) {
              return;
            }
            const workspaceId = await ensureFirstWorkspace(db, session.userId);
            return {
              data: { ...session, activeOrganizationId: workspaceId },
            };
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = Auth["$Infer"]["Session"];
export type Session = AuthSession["session"];
export type User = AuthSession["user"];
