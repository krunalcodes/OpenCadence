import { render } from "@react-email/components";
import { createElement } from "react";
import { createConsoleProvider } from "./providers/console";
import type { EmailProvider } from "./providers/provider";
import { createResendProvider } from "./providers/resend";
import { ChangeEmail, changeEmailCopy } from "./templates/change-email";
import { ResetPassword, resetPasswordCopy } from "./templates/reset-password";
import { VerifyEmail, verifyEmailCopy } from "./templates/verify-email";
import {
  WorkspaceInvitation,
  workspaceInvitationCopy,
} from "./templates/workspace-invitation";

export type MailerConfig = {
  provider: "console" | "resend";
  from: string;
  resendApiKey?: string;
};

export type ActionEmailInput = {
  to: string;
  name: string;
  url: string;
  expiresIn?: string;
};

export type WorkspaceInvitationEmailInput = {
  to: string;
  inviterName: string;
  workspaceName: string;
  role: string;
  url: string;
  expiresIn?: string;
};

export type EmailChangeEmailInput = {
  to: string;
  name: string;
  newEmail: string;
  url: string;
  expiresIn?: string;
};

export type Mailer = {
  sendVerificationEmail(input: ActionEmailInput): Promise<void>;
  sendPasswordResetEmail(input: ActionEmailInput): Promise<void>;
  sendWorkspaceInvitationEmail(
    input: WorkspaceInvitationEmailInput,
  ): Promise<void>;
  sendEmailChangeEmail(input: EmailChangeEmailInput): Promise<void>;
};

function createProvider(config: MailerConfig): EmailProvider {
  if (config.provider === "console") {
    return createConsoleProvider();
  }

  if (config.provider === "resend") {
    if (!config.resendApiKey) {
      throw new Error(
        'createMailer: the "resend" provider needs resendApiKey. Pass a Resend API key, or use the "console" provider for local development.',
      );
    }
    return createResendProvider(config.resendApiKey);
  }

  throw new Error(
    `createMailer: unknown provider "${String(config.provider)}". Use "console" or "resend".`,
  );
}

export function createMailer(config: MailerConfig): Mailer {
  if (!config.from) {
    throw new Error("createMailer: from is required.");
  }

  const provider = createProvider(config);

  async function deliver(
    to: string,
    subject: string,
    email: ReturnType<typeof createElement>,
  ) {
    const [html, text] = await Promise.all([
      render(email),
      render(email, { plainText: true }),
    ]);
    await provider.send({ from: config.from, to, subject, html, text });
  }

  return {
    sendVerificationEmail({ to, name, url, expiresIn }) {
      return deliver(
        to,
        verifyEmailCopy.subject,
        createElement(VerifyEmail, { name, url, expiresIn }),
      );
    },
    sendPasswordResetEmail({ to, name, url, expiresIn }) {
      return deliver(
        to,
        resetPasswordCopy.subject,
        createElement(ResetPassword, { name, url, expiresIn }),
      );
    },
    sendWorkspaceInvitationEmail({
      to,
      inviterName,
      workspaceName,
      role,
      url,
      expiresIn,
    }) {
      return deliver(
        to,
        workspaceInvitationCopy.subject(workspaceName),
        createElement(WorkspaceInvitation, {
          inviterName,
          workspaceName,
          role,
          url,
          expiresIn,
        }),
      );
    },
    sendEmailChangeEmail({ to, name, newEmail, url, expiresIn }) {
      return deliver(
        to,
        changeEmailCopy.subject,
        createElement(ChangeEmail, { name, newEmail, url, expiresIn }),
      );
    },
  };
}
