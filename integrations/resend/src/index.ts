import type { IntegrationAdapter } from "@workspace/integration-core";
import { type ResendAdapterConfig, resolveConfig } from "./config";
import { send } from "./send";
import { verify } from "./verify";
import { createWebhookSupport } from "./webhooks";

export type { ResendAdapterConfig } from "./config";

export function createResendAdapter(
  config?: ResendAdapterConfig,
): IntegrationAdapter {
  const resolved = resolveConfig(config);
  return {
    type: "resend",
    name: "Resend",
    auth: "api_key",
    capabilities: ["send", "volume", "webhooks"],
    verify: (credentials) => verify(resolved, credentials),
    send: (credentials, message) => send(resolved, credentials, message),
    webhooks: createWebhookSupport(resolved),
  };
}
