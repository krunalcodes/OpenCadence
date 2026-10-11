import {
  IntegrationError,
  type VerifyResult,
} from "@workspace/integration-core";
import { endpoints, type GmailContext } from "./config";
import { gmailApiError } from "./errors";
import { asString, readJson, request } from "./http";

export async function fetchIdentity(
  context: GmailContext,
  accessToken: string,
): Promise<VerifyResult> {
  const response = await request(context.fetch, endpoints.userinfo, {
    method: "GET",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw await gmailApiError(response);
  }
  const body = await readJson(response);
  const externalId = asString(body.sub);
  const email = asString(body.email);
  if (!externalId || !email) {
    throw new IntegrationError(
      "unknown",
      "Google did not return the account identity.",
      { providerStatus: response.status },
    );
  }
  return {
    account: { externalId, email },
    settings: { hostedDomain: asString(body.hd) ?? null },
  };
}
