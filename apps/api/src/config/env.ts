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
};

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

  const env: Env = {
    DATABASE_URL: required(config, "DATABASE_URL"),
    BETTER_AUTH_SECRET: secret,
    BETTER_AUTH_URL: required(config, "BETTER_AUTH_URL"),
    GOOGLE_CLIENT_ID: optional(config, "GOOGLE_CLIENT_ID"),
    GOOGLE_CLIENT_SECRET: optional(config, "GOOGLE_CLIENT_SECRET"),
    EMAIL_PROVIDER: provider,
    EMAIL_FROM:
      optional(config, "EMAIL_FROM") ?? "OpenCadence <no-reply@localhost>",
    RESEND_API_KEY: resendApiKey,
  };

  return { ...config, ...env };
}
