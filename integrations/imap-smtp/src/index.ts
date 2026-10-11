import type { IntegrationAdapter } from "@workspace/integration-core";
import { createContext, type ImapSmtpAdapterConfig } from "./config";
import { createInbox } from "./inbox";
import { send } from "./send";
import { verify } from "./verify";

export type {
  ImapClient,
  ImapConnector,
  ImapFetchedMessage,
  ImapMailbox,
  ImapMoveResult,
  ImapOpenedMailbox,
  ImapSmtpAdapterConfig,
  SmtpTransport,
  SmtpTransportFactory,
} from "./config";

export function createImapSmtpAdapter(
  config?: ImapSmtpAdapterConfig,
): IntegrationAdapter {
  const context = createContext(config);
  return {
    type: "imap-smtp",
    name: "IMAP/SMTP",
    auth: "password",
    capabilities: ["send", "replies", "warmup"],
    verify: (credentials) => verify(context, credentials),
    send: (credentials, message) => send(context, credentials, message),
    inbox: createInbox(context),
  };
}
