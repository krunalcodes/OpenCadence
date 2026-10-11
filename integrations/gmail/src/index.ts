import type { IntegrationAdapter } from "@workspace/integration-core";
import { createContext, type GmailAdapterConfig } from "./config";
import { fetchIdentity } from "./identity";
import { createInbox } from "./inbox";
import { createOAuth } from "./oauth";
import { requireAccessToken, send } from "./send";

export type { GmailAdapterConfig } from "./config";
export {
  gmailInboxScopes,
  gmailReadScope,
  gmailScopes,
  gmailSendScope,
} from "./config";

export function createGmailAdapter(
  config: GmailAdapterConfig,
): IntegrationAdapter {
  const context = createContext(config);
  return {
    type: "gmail",
    name: "Gmail",
    auth: "oauth2",
    capabilities: context.inboxAccess ? ["send", "replies"] : ["send"],
    verify: async (credentials) =>
      fetchIdentity(context, requireAccessToken(credentials)),
    send: (credentials, message) => send(context, credentials, message),
    oauth: createOAuth(context),
    ...(context.inboxAccess ? { inbox: createInbox(context) } : {}),
  };
}
