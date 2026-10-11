import { ActionEmailLayout } from "../components/layout";

export const changeEmailCopy = {
  lang: "en",
  wordmark: "OpenCadence",
  subject: "Confirm your new email address",
  preview: "Confirm this address to start using it for your account.",
  heading: "Confirm your new email address",
  greeting: (name: string) => (name ? `Hi ${name},` : "Hi,"),
  intro: (newEmail: string) =>
    `You asked to change the email address on your OpenCadence account to ${newEmail}. Confirm that this address belongs to you to finish the change.`,
  actionLabel: "Confirm new email address",
  fallbackLabel:
    "If the button does not work, copy this link into your browser:",
  expiryNote: (expiresIn: string) => `This link expires in ${expiresIn}.`,
  ignoreNote:
    "If you did not ask for this change, do not use the link. You can ignore this email and the address on the account will stay the same.",
  footer:
    "OpenCadence sent this email because this address was entered as the new email for an account.",
  defaultExpiresIn: "1 hour",
};

export type ChangeEmailProps = {
  name: string;
  newEmail: string;
  url: string;
  expiresIn?: string;
};

export function ChangeEmail({
  name,
  newEmail,
  url,
  expiresIn = changeEmailCopy.defaultExpiresIn,
}: ChangeEmailProps) {
  return (
    <ActionEmailLayout
      lang={changeEmailCopy.lang}
      wordmark={changeEmailCopy.wordmark}
      preview={changeEmailCopy.preview}
      heading={changeEmailCopy.heading}
      greeting={changeEmailCopy.greeting(name)}
      intro={changeEmailCopy.intro(newEmail)}
      actionLabel={changeEmailCopy.actionLabel}
      actionUrl={url}
      fallbackLabel={changeEmailCopy.fallbackLabel}
      expiryNote={changeEmailCopy.expiryNote(expiresIn)}
      ignoreNote={changeEmailCopy.ignoreNote}
      footer={changeEmailCopy.footer}
    />
  );
}

ChangeEmail.PreviewProps = {
  name: "Maya",
  newEmail: "maya@northwind.example",
  url: "http://localhost:3000/verify-email?token=preview-token",
} satisfies ChangeEmailProps;

export default ChangeEmail;
