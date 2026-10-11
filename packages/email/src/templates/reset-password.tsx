import { ActionEmailLayout } from "../components/layout";

export const resetPasswordCopy = {
  lang: "en",
  wordmark: "OpenCadence",
  subject: "Reset your password",
  preview: "Use this link to choose a new password.",
  heading: "Reset your password",
  greeting: (name: string) => (name ? `Hi ${name},` : "Hi,"),
  intro:
    "We received a request to reset the password for your OpenCadence account. Choose a new one with the button below.",
  actionLabel: "Reset password",
  fallbackLabel:
    "If the button does not work, copy this link into your browser:",
  expiryNote: (expiresIn: string) => `This link expires in ${expiresIn}.`,
  ignoreNote:
    "If you did not ask to reset your password, you can ignore this email and your password will stay the same.",
  footer:
    "OpenCadence sent this email because a password reset was requested for this address.",
  defaultExpiresIn: "1 hour",
};

export type ResetPasswordProps = {
  name: string;
  url: string;
  expiresIn?: string;
};

export function ResetPassword({
  name,
  url,
  expiresIn = resetPasswordCopy.defaultExpiresIn,
}: ResetPasswordProps) {
  return (
    <ActionEmailLayout
      lang={resetPasswordCopy.lang}
      wordmark={resetPasswordCopy.wordmark}
      preview={resetPasswordCopy.preview}
      heading={resetPasswordCopy.heading}
      greeting={resetPasswordCopy.greeting(name)}
      intro={resetPasswordCopy.intro}
      actionLabel={resetPasswordCopy.actionLabel}
      actionUrl={url}
      fallbackLabel={resetPasswordCopy.fallbackLabel}
      expiryNote={resetPasswordCopy.expiryNote(expiresIn)}
      ignoreNote={resetPasswordCopy.ignoreNote}
      footer={resetPasswordCopy.footer}
    />
  );
}

ResetPassword.PreviewProps = {
  name: "Maya",
  url: "http://localhost:3000/reset-password?token=preview-token",
} satisfies ResetPasswordProps;

export default ResetPassword;
