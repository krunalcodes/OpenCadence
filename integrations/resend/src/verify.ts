import {
  type Credentials,
  IntegrationError,
  isIntegrationError,
  type VerifyResult,
} from "@workspace/integration-core";
import { apiKeyPrefix, type ResolvedResendConfig } from "./config";
import { apiKeyFrom, isRecord, optionalString, resendRequest } from "./http";

function optionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function toDomains(body: unknown) {
  const data = isRecord(body) && Array.isArray(body.data) ? body.data : [];
  return data.filter(isRecord).map((domain) => ({
    id: optionalString(domain.id),
    name: optionalString(domain.name),
    status: optionalString(domain.status),
    region: optionalString(domain.region),
    openTracking: optionalBoolean(domain.open_tracking),
    clickTracking: optionalBoolean(domain.click_tracking),
  }));
}

export async function verify(
  config: ResolvedResendConfig,
  credentials: Credentials,
): Promise<VerifyResult> {
  const apiKey = apiKeyFrom(credentials);
  if (!apiKey.startsWith(apiKeyPrefix)) {
    throw new IntegrationError(
      "invalid_credentials",
      "Resend API keys start with re_.",
    );
  }

  try {
    const response = await resendRequest(config, apiKey, {
      method: "GET",
      path: "/domains",
    });
    return {
      account: {},
      settings: { permission: "full", domains: toDomains(response.body) },
    };
  } catch (error) {
    if (!isIntegrationError(error)) {
      throw error;
    }
    if (
      error.providerStatus === 401 &&
      error.providerCode === "restricted_api_key"
    ) {
      return { account: {}, settings: { permission: "sending", domains: [] } };
    }
    if (error.providerStatus === 401 || error.providerStatus === 403) {
      throw new IntegrationError(
        "invalid_credentials",
        "Resend rejected the API key.",
        {
          providerStatus: error.providerStatus,
          providerCode: error.providerCode,
          providerMessage: error.providerMessage,
        },
      );
    }
    throw error;
  }
}
