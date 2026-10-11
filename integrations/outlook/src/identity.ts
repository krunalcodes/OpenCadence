import {
  type Credentials,
  IntegrationError,
  type VerifyResult,
} from "@workspace/integration-core";
import { endpoints, type OutlookContext, outlookMailReadScope } from "./config";
import { graphApiError } from "./errors";
import {
  asString,
  graphGet,
  hasScope,
  readJson,
  requireAccessToken,
} from "./http";

const addressPattern = /^[^\s@<>]+@[^\s@<>]+$/;

export async function fetchIdentity(
  context: OutlookContext,
  accessToken: string,
  scopes: string[],
): Promise<VerifyResult> {
  const response = await graphGet(context.fetch, endpoints.me, accessToken);
  if (!response.ok) {
    throw await graphApiError(response);
  }
  const body = await readJson(response);
  const externalId = asString(body.id);
  const email = [asString(body.mail), asString(body.userPrincipalName)].find(
    (value) => value !== undefined && addressPattern.test(value),
  );
  if (!externalId || !email) {
    throw new IntegrationError(
      "unknown",
      "Microsoft did not return the account identity.",
      { providerStatus: response.status },
    );
  }
  const displayName = asString(body.displayName);
  return {
    account: {
      externalId,
      email: email.toLowerCase(),
      ...(displayName ? { displayName } : {}),
    },
    settings: { inboxAccess: hasScope(scopes, outlookMailReadScope) },
  };
}

export function verify(
  context: OutlookContext,
  credentials: Credentials,
): Promise<VerifyResult> {
  const accessToken = requireAccessToken(credentials);
  const scopes = credentials.kind === "oauth2" ? credentials.scopes : [];
  return fetchIdentity(context, accessToken, scopes);
}
