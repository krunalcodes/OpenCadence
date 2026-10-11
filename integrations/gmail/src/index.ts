import type { IntegrationAdapter } from "@workspace/integration-core";
import { createContext, type GmailAdapterConfig } from "./config";
import { fetchIdentity } from "./identity";
import { createOAuth } from "./oauth";
import { requireAccessToken, send } from "./send";

export type { GmailAdapterConfig } from "./config";
export { gmailScopes, gmailSendScope } from "./config";

export function createGmailAdapter(
  config: GmailAdapterConfig,
): IntegrationAdapter {
  const context = createContext(config);
  return {
    type: "gmail",
    name: "Gmail",
    auth: "oauth2",
    capabilities: ["send"],
    verify: async (credentials) =>
      fetchIdentity(context, requireAccessToken(credentials)),
    send: (credentials, message) => send(context, credentials, message),
    oauth: createOAuth(context),
  };
}
