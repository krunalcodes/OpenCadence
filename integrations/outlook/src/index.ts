import type { IntegrationAdapter } from "@workspace/integration-core";
import { createContext, type OutlookAdapterConfig } from "./config";
import { verify } from "./identity";
import { createInbox } from "./inbox";
import { createOAuth } from "./oauth";
import { send } from "./send";

export type { OutlookAdapterConfig } from "./config";
export {
  outlookInboxScopes,
  outlookMailReadScope,
  outlookMailSendScope,
  outlookSendScopes,
} from "./config";

export function createOutlookAdapter(
  config: OutlookAdapterConfig,
): IntegrationAdapter {
  const context = createContext(config);
  return {
    type: "outlook",
    name: "Outlook",
    auth: "oauth2",
    capabilities: context.inboxAccess ? ["send", "replies"] : ["send"],
    verify: (credentials) => verify(context, credentials),
    send: (credentials, message) => send(context, credentials, message),
    oauth: createOAuth(context),
    ...(context.inboxAccess ? { inbox: createInbox(context) } : {}),
  };
}
