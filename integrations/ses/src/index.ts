import type {
  Credentials,
  IntegrationAdapter,
} from "@workspace/integration-core";
import { resolveConfig, type SesAdapterConfig } from "./config";
import {
  checkSendingIdentity,
  listIdentities,
  type SendingIdentityCheck,
  type SesIdentityList,
} from "./identities";
import { send } from "./send";
import {
  type EventDestinationOptions,
  type EventDestinationResult,
  ensureEventDestination,
} from "./setup";
import { createSnsSupport, type SnsSupport } from "./sns";
import { verify } from "./verify";

export type {
  SesAdapterConfig,
  SesClient,
  SesClientFactory,
  SesCommand,
} from "./config";
export { toProviderEvents } from "./events";
export type {
  SendingIdentityCheck,
  SesIdentity,
  SesIdentityList,
} from "./identities";
export { identityCandidates, matchSendingIdentity } from "./identities";
export { sesMessageIdHeader } from "./send";
export type {
  EventDestinationOptions,
  EventDestinationResult,
  SesEventType,
} from "./setup";
export { isStandardTopicArn } from "./setup";
export type {
  SnsMessage,
  SnsOutcome,
  SnsRequest,
  SnsSupport,
  SubscriptionConfirmation,
} from "./sns";

export type SesAdapter = IntegrationAdapter & {
  sns: SnsSupport;
  listIdentities(credentials: Credentials): Promise<SesIdentityList>;
  checkSendingIdentity(
    credentials: Credentials,
    fromEmail: string,
  ): Promise<SendingIdentityCheck>;
  ensureEventDestination(
    credentials: Credentials,
    options: EventDestinationOptions,
  ): Promise<EventDestinationResult>;
};

export function createSesAdapter(config?: SesAdapterConfig): SesAdapter {
  const resolved = resolveConfig(config);
  return {
    type: "ses",
    name: "Amazon SES",
    auth: "access_key",
    capabilities: ["send", "volume", "webhooks"],
    verify: (credentials) => verify(resolved, credentials),
    send: (credentials, message) => send(resolved, credentials, message),
    sns: createSnsSupport(resolved),
    listIdentities: (credentials) => listIdentities(resolved, credentials),
    checkSendingIdentity: (credentials, fromEmail) =>
      checkSendingIdentity(resolved, credentials, fromEmail),
    ensureEventDestination: (credentials, options) =>
      ensureEventDestination(resolved, credentials, options),
  };
}
