import type { IntegrationMark } from "@/lib/brand-icons";

export type IntegrationId =
  | "gmail"
  | "outlook"
  | "imap-smtp"
  | "resend"
  | "ses"
  | "sendgrid"
  | "smtp";

export type Feature = "mailbox" | "replies" | "warmup" | "volume" | "events";

const featureLabels: Record<Feature, string> = {
  mailbox: "Sends from your own address",
  replies: "Reads replies",
  warmup: "Warm-up",
  volume: "High volume",
  events: "Bounce and complaint events",
};

function joinLabels(labels: string[]) {
  return labels
    .map((label, index) => (index === 0 ? label : label.toLowerCase()))
    .join(", ");
}

export function formatFeatures(ids: Feature[]) {
  return joinLabels(ids.map((id) => featureLabels[id]));
}

export type Option = { value: string; label: string };

export type Preset = {
  value: string;
  label: string;
  values: Record<string, string> | null;
  notice?: string;
};

export type ConnectField =
  | {
      id: string;
      kind: "text" | "email" | "password" | "number";
      label: string;
      placeholder?: string;
      hint?: string;
      missing: string;
      defaultValue?: string;
      mono?: boolean;
      half?: boolean;
      max?: number;
      optional?: boolean;
      server?: boolean;
    }
  | { id: string; kind: "region"; label: string; hint: string; missing: string }
  | {
      id: string;
      kind: "security";
      label: string;
      half?: boolean;
      server?: boolean;
      port?: { field: string; byValue: Record<string, string> };
    }
  | {
      id: string;
      kind: "preset";
      label: string;
      presets: Preset[];
      noticeAfter: string;
    };

export type { IntegrationMark };

export type Integration = {
  id: IntegrationId;
  name: string;
  mark: string | null;
  summary: string;
  features: Feature[];
  intro: string;
  fields: ConnectField[];
  submitLabel: string;
  available: boolean;
  signIn?: { provider: MailboxProvider; company: string };
};

export type MailboxProvider = "gmail" | "outlook";

export const mailboxProviders: MailboxProvider[] = ["gmail", "outlook"];

export function mailboxProviderOf(type: string): MailboxProvider | null {
  return mailboxProviders.find((provider) => provider === type) ?? null;
}

const inboxFeatures: Feature[] = ["replies", "warmup"];
const apiFeatures: Feature[] = ["volume", "events"];

const dailyLimitField: ConnectField = {
  id: "dailyLimit",
  kind: "number",
  label: "Daily sending limit",
  hint: "Sending from this mailbox stops for the day at this number. You can change it later.",
  missing: "Enter a whole number between 1 and 2,000, or leave it empty.",
  optional: true,
  defaultValue: "50",
  half: true,
  max: 2000,
};

const addressField: ConnectField = {
  id: "address",
  kind: "email",
  label: "Mailbox address",
  placeholder: "you@yourdomain.com",
  missing: "Enter the full address of the mailbox, such as you@yourdomain.com.",
};

function labelField(name: string, example: string): ConnectField {
  return {
    id: "name",
    kind: "text",
    label: "Name",
    placeholder: example,
    hint: `Tells this account apart when you connect more than one ${name} account.`,
    missing: `Enter a name for this ${name} account, such as ${example}.`,
  };
}

export const integrations: Integration[] = [
  {
    id: "gmail",
    name: "Gmail",
    mark: "G",
    summary: "Google Workspace and personal Gmail mailboxes.",
    features: ["mailbox"],
    intro:
      "You approve access on Google's own page. OpenCadence can then send as this mailbox. It never sees the password and does not read the mailbox unless you turn on reply detection later.",
    fields: [dailyLimitField],
    submitLabel: "Continue to Google",
    available: true,
    signIn: { provider: "gmail", company: "Google" },
  },
  {
    id: "outlook",
    name: "Outlook",
    mark: "O",
    summary: "Microsoft 365 and Outlook.com mailboxes.",
    features: ["mailbox"],
    intro:
      "You approve access on Microsoft's own page. OpenCadence can then send as this mailbox. It never sees the password and does not read the mailbox unless you turn on reply detection later.",
    fields: [dailyLimitField],
    submitLabel: "Continue to Microsoft",
    available: true,
    signIn: { provider: "outlook", company: "Microsoft" },
  },
  {
    id: "imap-smtp",
    name: "IMAP/SMTP",
    mark: null,
    summary:
      "Any mailbox that takes a password or an app password, Gmail included.",
    features: inboxFeatures,
    intro:
      "SMTP sends the email and IMAP reads the replies. Pick Gmail to fill in the servers, or pick Other and use the details from your email host's help pages. Use an app password if the host offers one.",
    fields: [
      addressField,
      {
        id: "password",
        kind: "password",
        label: "Password or app password",
        missing: "Enter the password or app password for this mailbox.",
      },
      {
        id: "provider",
        kind: "preset",
        label: "Provider",
        noticeAfter: "password",
        presets: [
          {
            value: "gmail",
            label: "Gmail",
            values: {
              smtpHost: "smtp.gmail.com",
              smtpPort: "465",
              smtpSecurity: "tls",
              imapHost: "imap.gmail.com",
              imapPort: "993",
              imapSecurity: "tls",
            },
            notice:
              "Google does not accept your normal password here. Create an app password in your Google Account, which needs 2-Step Verification to be on, and make sure IMAP access is allowed for the account.",
          },
          { value: "other", label: "Other", values: null },
        ],
      },
      {
        id: "smtpHost",
        kind: "text",
        label: "SMTP host",
        placeholder: "smtp.yourdomain.com",
        missing: "Enter the outgoing server, such as smtp.yourdomain.com.",
        mono: true,
        half: true,
        server: true,
      },
      {
        id: "smtpPort",
        kind: "number",
        label: "SMTP port",
        missing: "Enter the port. Most hosts use 465 or 587.",
        defaultValue: "465",
        half: true,
        server: true,
      },
      {
        id: "smtpSecurity",
        kind: "security",
        label: "SMTP encryption",
        server: true,
        port: { field: "smtpPort", byValue: { tls: "465", starttls: "587" } },
      },
      {
        id: "imapHost",
        kind: "text",
        label: "IMAP host",
        placeholder: "imap.yourdomain.com",
        missing: "Enter the incoming server, such as imap.yourdomain.com.",
        mono: true,
        half: true,
        server: true,
      },
      {
        id: "imapPort",
        kind: "number",
        label: "IMAP port",
        missing: "Enter the port. Most hosts use 993.",
        defaultValue: "993",
        half: true,
        server: true,
      },
      {
        id: "imapSecurity",
        kind: "security",
        label: "IMAP encryption",
        server: true,
      },
      { ...dailyLimitField, defaultValue: "40" },
    ],
    submitLabel: "Test and connect",
    available: true,
  },
  {
    id: "resend",
    name: "Resend",
    mark: "R",
    summary: "Send through your Resend account with an API key.",
    features: apiFeatures,
    intro:
      "Create an API key in your Resend dashboard and paste it here. Sends use the domains verified in that account.",
    fields: [
      labelField("Resend", "Marketing"),
      {
        id: "apiKey",
        kind: "password",
        label: "API key",
        placeholder: "re_",
        missing:
          "Paste the API key from your Resend dashboard. It starts with re_.",
        hint: "A full access key lets OpenCadence register bounce and complaint tracking automatically.",
        mono: true,
      },
    ],
    submitLabel: "Test and connect",
    available: true,
  },
  {
    id: "ses",
    name: "Amazon SES",
    mark: "Se",
    summary: "Send through your own AWS account at Amazon SES rates.",
    features: apiFeatures,
    intro:
      "Create an IAM user that is allowed to send with SES, then paste its access key here. Pick the region where your sending identities are verified. After connecting you get the steps for bounce and complaint events and the exact IAM policy.",
    fields: [
      labelField("Amazon SES", "Newsletter"),
      {
        id: "accessKeyId",
        kind: "text",
        label: "Access key ID",
        placeholder: "AKIA",
        missing:
          "Paste the access key ID of the IAM user. It starts with AKIA.",
        hint: "Use the long-lived key of an IAM user. Temporary keys that start with ASIA are not supported.",
        mono: true,
      },
      {
        id: "secretAccessKey",
        kind: "password",
        label: "Secret access key",
        missing: "Paste the secret access key that was shown with the key ID.",
        mono: true,
      },
      {
        id: "region",
        kind: "region",
        label: "Region",
        hint: "The AWS region where your domains or addresses are verified.",
        missing: "Choose the AWS region you send from.",
      },
      {
        id: "configurationSet",
        kind: "text",
        label: "Configuration set",
        placeholder: "opencadence",
        hint: "Optional. Every send uses it, and bounce and complaint events are published through it. OpenCadence creates it during event setup if the key is allowed to.",
        missing:
          "Use up to 64 letters, numbers, hyphens, and underscores, or leave it empty.",
        optional: true,
        mono: true,
      },
    ],
    submitLabel: "Test and connect",
    available: true,
  },
  {
    id: "sendgrid",
    name: "SendGrid",
    mark: "Sg",
    summary: "Send through your SendGrid account with an API key.",
    features: apiFeatures,
    intro:
      "Create an API key with Mail Send access in your SendGrid account and paste it here.",
    fields: [
      labelField("SendGrid", "Marketing"),
      {
        id: "apiKey",
        kind: "password",
        label: "API key",
        placeholder: "SG.",
        missing:
          "Paste the API key from your SendGrid account. It starts with SG.",
        mono: true,
      },
    ],
    submitLabel: "Test and connect",
    available: false,
  },
  {
    id: "smtp",
    name: "SMTP relay",
    mark: null,
    summary: "Any other provider or mail server that accepts SMTP.",
    features: ["volume"],
    intro:
      "Use the SMTP details from your provider. A relay only sends, so replies are not read from it.",
    fields: [
      labelField("SMTP relay", "Office mail server"),
      {
        id: "smtpHost",
        kind: "text",
        label: "Host",
        placeholder: "smtp.provider.com",
        missing: "Enter the server name, such as smtp.provider.com.",
        mono: true,
        half: true,
      },
      {
        id: "smtpPort",
        kind: "number",
        label: "Port",
        missing: "Enter the port. Most providers use 465 or 587.",
        defaultValue: "587",
        half: true,
      },
      {
        id: "username",
        kind: "text",
        label: "Username",
        missing: "Enter the SMTP username from your provider.",
        mono: true,
      },
      {
        id: "password",
        kind: "password",
        label: "Password",
        missing: "Enter the SMTP password from your provider.",
      },
      { id: "security", kind: "security", label: "Encryption" },
    ],
    submitLabel: "Test and connect",
    available: false,
  },
];

export function findIntegration(type: string): Integration | null {
  return integrations.find((item) => item.id === type) ?? null;
}

export function integrationName(type: string) {
  return findIntegration(type)?.name ?? type;
}

export function integrationMark(type: string): IntegrationMark {
  const found = findIntegration(type);
  return found ? { id: found.id, mark: found.mark } : { id: type, mark: null };
}

export const securityOptions: Option[] = [
  { value: "tls", label: "SSL/TLS" },
  { value: "starttls", label: "STARTTLS" },
];

export const sesRegions: Option[] = [
  { value: "us-east-1", label: "US East (N. Virginia), us-east-1" },
  { value: "us-east-2", label: "US East (Ohio), us-east-2" },
  { value: "us-west-2", label: "US West (Oregon), us-west-2" },
  { value: "ca-central-1", label: "Canada (Central), ca-central-1" },
  { value: "sa-east-1", label: "South America (São Paulo), sa-east-1" },
  { value: "eu-west-1", label: "Europe (Ireland), eu-west-1" },
  { value: "eu-west-2", label: "Europe (London), eu-west-2" },
  { value: "eu-central-1", label: "Europe (Frankfurt), eu-central-1" },
  { value: "eu-north-1", label: "Europe (Stockholm), eu-north-1" },
  { value: "ap-south-1", label: "Asia Pacific (Mumbai), ap-south-1" },
  {
    value: "ap-southeast-1",
    label: "Asia Pacific (Singapore), ap-southeast-1",
  },
  { value: "ap-southeast-2", label: "Asia Pacific (Sydney), ap-southeast-2" },
  { value: "ap-northeast-1", label: "Asia Pacific (Tokyo), ap-northeast-1" },
  { value: "us-west-1", label: "US West (N. California), us-west-1" },
  { value: "eu-west-3", label: "Europe (Paris), eu-west-3" },
  { value: "eu-south-1", label: "Europe (Milan), eu-south-1" },
  { value: "eu-central-2", label: "Europe (Zurich), eu-central-2" },
  { value: "il-central-1", label: "Israel (Tel Aviv), il-central-1" },
  { value: "me-south-1", label: "Middle East (Bahrain), me-south-1" },
  { value: "me-central-1", label: "Middle East (UAE), me-central-1" },
  { value: "af-south-1", label: "Africa (Cape Town), af-south-1" },
  { value: "ap-south-2", label: "Asia Pacific (Hyderabad), ap-south-2" },
  { value: "ap-southeast-3", label: "Asia Pacific (Jakarta), ap-southeast-3" },
  { value: "ap-northeast-2", label: "Asia Pacific (Seoul), ap-northeast-2" },
  { value: "ap-northeast-3", label: "Asia Pacific (Osaka), ap-northeast-3" },
  { value: "us-gov-east-1", label: "AWS GovCloud (US-East), us-gov-east-1" },
  { value: "us-gov-west-1", label: "AWS GovCloud (US-West), us-gov-west-1" },
];
