import {
  type AccessKeyCredentials,
  type Credentials,
  IntegrationError,
} from "@workspace/integration-core";
import {
  type ResolvedSesConfig,
  regionPattern,
  type SesCommand,
} from "./config";
import { type SesErrorContext, toSesError } from "./errors";

const accessKeyIdPattern = /^\w{16,128}$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function optionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

export function accessKeyFrom(credentials: Credentials): AccessKeyCredentials {
  if (credentials.kind !== "access_key") {
    throw new IntegrationError(
      "invalid_credentials",
      "Amazon SES needs an access key ID, a secret access key, and a region.",
    );
  }
  const accessKeyId = credentials.accessKeyId?.trim() ?? "";
  const secretAccessKey = credentials.secretAccessKey?.trim() ?? "";
  const region = credentials.region?.trim().toLowerCase() ?? "";
  if (!accessKeyId || !secretAccessKey) {
    throw new IntegrationError(
      "invalid_credentials",
      "Amazon SES needs an access key ID and a secret access key.",
    );
  }
  if (!accessKeyIdPattern.test(accessKeyId)) {
    throw new IntegrationError(
      "invalid_credentials",
      "The access key ID is not in the format AWS uses.",
    );
  }
  if (accessKeyId.startsWith("ASIA")) {
    throw new IntegrationError(
      "invalid_credentials",
      "Temporary AWS credentials are not supported. Use the access key of an IAM user.",
    );
  }
  if (!regionPattern.test(region)) {
    throw new IntegrationError(
      "validation",
      "The AWS region is not valid. Use a region code such as us-east-1.",
    );
  }
  return { kind: "access_key", accessKeyId, secretAccessKey, region };
}

export async function call<Output>(
  config: ResolvedSesConfig,
  credentials: AccessKeyCredentials,
  command: SesCommand,
  context: Omit<SesErrorContext, "region" | "secret">,
): Promise<Output> {
  try {
    const client = config.createClient(credentials);
    return (await client.send(command)) as Output;
  } catch (error) {
    throw toSesError(error, {
      ...context,
      region: credentials.region,
      secret: credentials.secretAccessKey,
    });
  }
}
