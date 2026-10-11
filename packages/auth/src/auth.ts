import { apiKey } from "@better-auth/api-key";
import type { Db } from "@workspace/db";
import { schema } from "@workspace/db";
import type { Mailer } from "@workspace/email";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { lastLoginMethod } from "better-auth/plugins";
import { haveIBeenPwned } from "better-auth/plugins/haveibeenpwned";
import {
  type DefaultOrganizationPlugin,
  type OrganizationOptions,
  organization,
} from "better-auth/plugins/organization";
import { twoFactor } from "better-auth/plugins/two-factor";
import { workspaceAccess, workspaceRoles } from "./permissions";
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
const INVITATION_SECONDS = 60 * 60 * 48;
const EMAIL_CHANGE_REQUEST = "change-email-verification";

const workspaceOrganizationOptions = {
  ac: workspaceAccess,
  roles: workspaceRoles,
  invitationExpiresIn: INVITATION_SECONDS,
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
};

const twoFactorOptions = {
  issuer: "OpenCadence",
  backupCodeOptions: { storeBackupCodes: "encrypted" as const },
};

const lastLoginMethodOptions = { storeInDatabase: false as const };

type AuthPlugins = [
  DefaultOrganizationPlugin<typeof workspaceOrganizationOptions>,
  ReturnType<typeof twoFactor<typeof twoFactorOptions>>,
  ReturnType<typeof apiKey>,
  ReturnType<typeof haveIBeenPwned>,
  ReturnType<typeof lastLoginMethod<typeof lastLoginMethodOptions>>,
];

export type Auth = ReturnType<typeof betterAuth<{ plugins: AuthPlugins }>>;

export const API_KEY_HEADER = "x-api-key";
export const API_KEY_PREFIX = "oc_";

function isEmailChangeToken(token: string) {
  const payload = token.split(".")[1];
  if (!payload) {
    return false;
  }
  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json).requestType === EMAIL_CHANGE_REQUEST;
  } catch {
    return false;
  }
}

function formatLifetime(seconds: number) {
  const hours = Math.round(seconds / 3600);
  if (hours >= 1) {
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

export function createAuth(options: CreateAuthOptions): Auth {
  const { db, mailer, google } = options;
  const webOrigin = options.baseURL.replace(/\/+$/, "");
  const pageLink = (path: string, token: string) =>
    `${webOrigin}${path}?token=${encodeURIComponent(token)}`;

  const sendInvitationEmail: NonNullable<
    OrganizationOptions["sendInvitationEmail"]
  > = async ({ id, email, role, organization: workspace, inviter }) => {
    await mailer.sendWorkspaceInvitationEmail({
      to: email,
      inviterName: inviter.user.name,
      workspaceName: workspace.name,
      role,
      url: `${webOrigin}/accept-invitation/${id}`,
      expiresIn: formatLifetime(INVITATION_SECONDS),
    });
  };

  const plugins: AuthPlugins = [
    organization({
      ...workspaceOrganizationOptions,
      sendInvitationEmail,
    }),
    twoFactor(twoFactorOptions),
    apiKey({
      references: "organization",
      apiKeyHeaders: API_KEY_HEADER,
      defaultPrefix: API_KEY_PREFIX,
      requireName: true,
      startingCharactersConfig: { shouldStore: true, charactersLength: 8 },
      schema: {
        apikey: {
          modelName: "apiKey",
          fields: { referenceId: "workspaceId" },
        },
      },
    }),
    haveIBeenPwned({
      customPasswordCompromisedMessage:
        "This password has appeared in a known data breach. Choose a different password.",
    }),
    lastLoginMethod(lastLoginMethodOptions),
  ];

  const auth = betterAuth({
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
        const email = {
          to: user.email,
          name: user.name,
          url: pageLink("/verify-email", token),
          expiresIn: formatLifetime(VERIFICATION_TOKEN_SECONDS),
        };
        if (isEmailChangeToken(token)) {
          await mailer.sendEmailChangeEmail({ ...email, newEmail: user.email });
          return;
        }
        await mailer.sendVerificationEmail(email);
      },
    },
    user: {
      changeEmail: { enabled: true },
    },
    account: {
      accountLinking: { enabled: true },
    },
    rateLimit: {
      storage: "memory",
      customRules: {
        "/organization/invite-member": { window: 60, max: 10 },
        "/api-key/create": { window: 60, max: 10 },
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
    plugins,
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

  return auth as unknown as Auth;
}

export type AuthSession = Auth["$Infer"]["Session"];
export type Session = AuthSession["session"];
export type User = AuthSession["user"];
