import { ActionEmailLayout } from "../components/layout";

export const verifyEmailCopy = {
  lang: "en",
  wordmark: "OpenCadence",
  subject: "Verify your email address",
  preview: "Confirm this address to finish setting up your account.",
  heading: "Verify your email address",
  greeting: (name: string) => (name ? `Hi ${name},` : "Hi,"),
  intro:
    "Confirm that this address belongs to you to finish setting up your OpenCadence account.",
  actionLabel: "Verify email address",
  fallbackLabel:
    "If the button does not work, copy this link into your browser:",
  expiryNote: (expiresIn: string) => `This link expires in ${expiresIn}.`,
  ignoreNote:
    "If you did not create an OpenCadence account, you can ignore this email.",
  footer:
    "OpenCadence sent this email because this address was used to sign up.",
  defaultExpiresIn: "24 hours",
};

export type VerifyEmailProps = {
  name: string;
  url: string;
  expiresIn?: string;
};

export function VerifyEmail({
  name,
  url,
  expiresIn = verifyEmailCopy.defaultExpiresIn,
}: VerifyEmailProps) {
  return (
    <ActionEmailLayout
      lang={verifyEmailCopy.lang}
      wordmark={verifyEmailCopy.wordmark}
      preview={verifyEmailCopy.preview}
      heading={verifyEmailCopy.heading}
      greeting={verifyEmailCopy.greeting(name)}
      intro={verifyEmailCopy.intro}
      actionLabel={verifyEmailCopy.actionLabel}
      actionUrl={url}
      fallbackLabel={verifyEmailCopy.fallbackLabel}
      expiryNote={verifyEmailCopy.expiryNote(expiresIn)}
      ignoreNote={verifyEmailCopy.ignoreNote}
      footer={verifyEmailCopy.footer}
    />
  );
}

VerifyEmail.PreviewProps = {
  name: "Maya",
  url: "http://localhost:3000/verify-email?token=preview-token",
} satisfies VerifyEmailProps;

export default VerifyEmail;
