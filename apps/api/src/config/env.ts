import { fileURLToPath } from "node:url";

export const rootEnvFile = fileURLToPath(
  new URL("../../../../.env", import.meta.url),
);

export type Env = {
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  EMAIL_PROVIDER: "console" | "resend";
  EMAIL_FROM: string;
  RESEND_API_KEY?: string;
  REDIS_URL: string;
  CREDENTIALS_ENCRYPTION_KEY: string;
  CREDENTIALS_ENCRYPTION_KEY_VERSION: number;
  CREDENTIALS_ENCRYPTION_OLD_KEYS: EncryptionKey[];
  GMAIL_CLIENT_ID?: string;
  GMAIL_CLIENT_SECRET?: string;
  GMAIL_CLIENT_SHARED: boolean;
  WEBHOOK_BASE_URL?: string;
  BULL_BOARD_USERNAME?: string;
  BULL_BOARD_PASSWORD?: string;
};

export type EncryptionKey = {
  version: number;
  key: string;
};

const ENCRYPTION_KEY_BYTES = 32;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;

function required(config: Record<string, unknown>, key: string) {
  const value = config[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${key} is not set. Add it to the root .env file.`);
  }
  return value;
}

function optional(config: Record<string, unknown>, key: string) {
  const value = config[key];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function isEncryptionKey(value: string) {
  return (
    BASE64_PATTERN.test(value) &&
    Buffer.from(value, "base64").length === ENCRYPTION_KEY_BYTES
  );
}

function positiveInteger(value: string) {
  if (!POSITIVE_INTEGER_PATTERN.test(value)) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function encryptionKey(config: Record<string, unknown>) {
  const key = optional(config, "CREDENTIALS_ENCRYPTION_KEY")?.trim();
  if (!key) {
    throw new Error(
      "CREDENTIALS_ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32` and add it to the root .env file.",
    );
  }
  if (!isEncryptionKey(key)) {
    throw new Error(
      "CREDENTIALS_ENCRYPTION_KEY must be base64 that decodes to exactly 32 bytes. Generate one with `openssl rand -base64 32` and add it to the root .env file.",
    );
  }
  return key;
}

function encryptionKeyVersion(config: Record<string, unknown>) {
  const raw = optional(config, "CREDENTIALS_ENCRYPTION_KEY_VERSION")?.trim();
  if (raw === undefined) {
    return 1;
  }
  const version = positiveInteger(raw);
  if (version === undefined) {
    throw new Error(
      "CREDENTIALS_ENCRYPTION_KEY_VERSION must be a positive integer.",
    );
  }
  return version;
}

function oldEncryptionKeys(
  config: Record<string, unknown>,
  currentVersion: number,
) {
  const raw = optional(config, "CREDENTIALS_ENCRYPTION_OLD_KEYS");
  if (raw === undefined) {
    return [];
  }

  const keys: EncryptionKey[] = [];
  const entries = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");

  for (const [index, entry] of entries.entries()) {
    const position = index + 1;
    const separator = entry.indexOf(":");
    const version =
      separator === -1
        ? undefined
        : positiveInteger(entry.slice(0, separator).trim());
    if (version === undefined) {
      throw new Error(
        `CREDENTIALS_ENCRYPTION_OLD_KEYS entry ${position} must look like version:base64key, with a positive integer version.`,
      );
    }
    if (!isEncryptionKey(entry.slice(separator + 1).trim())) {
      throw new Error(
        `CREDENTIALS_ENCRYPTION_OLD_KEYS entry ${position} (version ${version}) must be base64 that decodes to exactly 32 bytes.`,
      );
    }
    if (version === currentVersion) {
      throw new Error(
        `CREDENTIALS_ENCRYPTION_OLD_KEYS entry ${position} uses version ${version}, which is the current CREDENTIALS_ENCRYPTION_KEY_VERSION.`,
      );
    }
    if (keys.some((existing) => existing.version === version)) {
      throw new Error(
        `CREDENTIALS_ENCRYPTION_OLD_KEYS lists version ${version} more than once.`,
      );
    }
    keys.push({ version, key: entry.slice(separator + 1).trim() });
  }

  return keys;
}

function webhookBaseUrl(config: Record<string, unknown>) {
  const raw = optional(config, "WEBHOOK_BASE_URL")?.trim();
  if (raw === undefined) {
    return undefined;
  }
  const message =
    "WEBHOOK_BASE_URL must be a public https origin with no path, for example https://mail.example.com.";
  if (!URL.canParse(raw)) {
    throw new Error(message);
  }
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.pathname.replace(/\/+$/, "") !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw new Error(message);
  }
  return url.origin;
}

export function validateEnv(config: Record<string, unknown>) {
  const secret = required(config, "BETTER_AUTH_SECRET");
  if (secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must be at least 32 characters long.");
  }

  const provider = optional(config, "EMAIL_PROVIDER") ?? "console";
  if (provider !== "console" && provider !== "resend") {
    throw new Error('EMAIL_PROVIDER must be "console" or "resend".');
  }

  const resendApiKey = optional(config, "RESEND_API_KEY");
  if (provider === "resend" && !resendApiKey) {
    throw new Error(
      "RESEND_API_KEY is required when EMAIL_PROVIDER is resend.",
    );
  }

  const googleClientId = optional(config, "GOOGLE_CLIENT_ID");
  const googleClientSecret = optional(config, "GOOGLE_CLIENT_SECRET");
  const gmailClientId = optional(config, "GMAIL_CLIENT_ID");
  const gmailClientSecret = optional(config, "GMAIL_CLIENT_SECRET");
  if ((gmailClientId === undefined) !== (gmailClientSecret === undefined)) {
    throw new Error(
      "GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set together, or both left empty to reuse GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
    );
  }
  const gmailClientShared =
    gmailClientId === undefined &&
    googleClientId !== undefined &&
    googleClientSecret !== undefined;

  const bullBoardUsername = optional(config, "BULL_BOARD_USERNAME");
  const bullBoardPassword = optional(config, "BULL_BOARD_PASSWORD");
  if ((bullBoardUsername === undefined) !== (bullBoardPassword === undefined)) {
    throw new Error(
      "BULL_BOARD_USERNAME and BULL_BOARD_PASSWORD must be set together, or both left empty to turn the queue dashboard off.",
    );
  }

  const keyVersion = encryptionKeyVersion(config);

  const env: Env = {
    DATABASE_URL: required(config, "DATABASE_URL"),
    BETTER_AUTH_SECRET: secret,
    BETTER_AUTH_URL: required(config, "BETTER_AUTH_URL"),
    GOOGLE_CLIENT_ID: googleClientId,
    GOOGLE_CLIENT_SECRET: googleClientSecret,
    EMAIL_PROVIDER: provider,
    EMAIL_FROM:
      optional(config, "EMAIL_FROM") ?? "OpenCadence <no-reply@localhost>",
    RESEND_API_KEY: resendApiKey,
    REDIS_URL:
      optional(config, "REDIS_URL")?.trim() ??
      `redis://localhost:${optional(config, "REDIS_PORT")?.trim() ?? "6379"}`,
    CREDENTIALS_ENCRYPTION_KEY: encryptionKey(config),
    CREDENTIALS_ENCRYPTION_KEY_VERSION: keyVersion,
    CREDENTIALS_ENCRYPTION_OLD_KEYS: oldEncryptionKeys(config, keyVersion),
    GMAIL_CLIENT_ID: gmailClientShared ? googleClientId : gmailClientId,
    GMAIL_CLIENT_SECRET: gmailClientShared
      ? googleClientSecret
      : gmailClientSecret,
    GMAIL_CLIENT_SHARED: gmailClientShared,
    WEBHOOK_BASE_URL: webhookBaseUrl(config),
    BULL_BOARD_USERNAME: bullBoardUsername,
    BULL_BOARD_PASSWORD: bullBoardPassword,
  };

  return { ...config, ...env };
}
