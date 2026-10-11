import {
  IntegrationError,
  type OAuthAuthorizationRequest,
  type OAuthConnection,
  type OAuthCredentials,
  type OAuthExchangeRequest,
  type OAuthSupport,
} from "@workspace/integration-core";
import {
  endpoints,
  type GmailContext,
  gmailScopes,
  gmailSendScope,
} from "./config";
import { type TokenAction, tokenEndpointError } from "./errors";
import { asString, type JsonObject, readJson, request } from "./http";
import { fetchIdentity } from "./identity";

function postForm(
  context: GmailContext,
  url: string,
  params: Record<string, string>,
): Promise<Response> {
  return request(context.fetch, url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
}

async function postToken(
  context: GmailContext,
  params: Record<string, string>,
  action: TokenAction,
): Promise<JsonObject> {
  const response = await postForm(context, endpoints.token, {
    ...params,
    client_id: context.clientId,
    client_secret: context.clientSecret,
  });
  if (!response.ok) {
    throw await tokenEndpointError(response, action);
  }
  return readJson(response);
}

function parseScopes(value: unknown): string[] | undefined {
  const scope = asString(value);
  return scope ? scope.split(/\s+/).filter(Boolean) : undefined;
}

function expiresAt(value: unknown): Date | undefined {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return undefined;
  }
  return new Date(Date.now() + seconds * 1000);
}

function requireAccessToken(body: JsonObject): string {
  const accessToken = asString(body.access_token);
  if (!accessToken) {
    throw new IntegrationError(
      "unknown",
      "Google did not return an access token.",
    );
  }
  return accessToken;
}

function authorizationUrl(
  context: GmailContext,
  authorization: OAuthAuthorizationRequest,
): string {
  const url = new URL(endpoints.authorization);
  url.searchParams.set("client_id", context.clientId);
  url.searchParams.set("redirect_uri", authorization.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", gmailScopes.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", authorization.state);
  if (authorization.codeChallenge) {
    url.searchParams.set("code_challenge", authorization.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  if (authorization.loginHint) {
    url.searchParams.set("login_hint", authorization.loginHint);
  }
  return url.toString();
}

async function exchangeCode(
  context: GmailContext,
  exchange: OAuthExchangeRequest,
): Promise<OAuthConnection> {
  const params: Record<string, string> = {
    grant_type: "authorization_code",
    code: exchange.code,
    redirect_uri: exchange.redirectUri,
  };
  if (exchange.codeVerifier) {
    params.code_verifier = exchange.codeVerifier;
  }
  const body = await postToken(context, params, "exchange");
  const scopes = parseScopes(body.scope) ?? [];
  if (!scopes.includes(gmailSendScope)) {
    throw new IntegrationError(
      "insufficient_permission",
      "Permission to send email was not granted. Connect the account again and allow sending.",
    );
  }
  const refreshToken = asString(body.refresh_token);
  if (!refreshToken) {
    throw new IntegrationError(
      "auth_revoked",
      "Google did not grant long-term access. Remove this app from the Google account's connected apps, then connect again.",
    );
  }
  const accessToken = requireAccessToken(body);
  const identity = await fetchIdentity(context, accessToken);
  return {
    credentials: {
      kind: "oauth2",
      refreshToken,
      accessToken,
      accessTokenExpiresAt: expiresAt(body.expires_in),
      scopes,
    },
    account: identity.account,
    settings: identity.settings,
  };
}

async function refresh(
  context: GmailContext,
  credentials: OAuthCredentials,
): Promise<OAuthCredentials> {
  const body = await postToken(
    context,
    { grant_type: "refresh_token", refresh_token: credentials.refreshToken },
    "refresh",
  );
  return {
    kind: "oauth2",
    refreshToken: asString(body.refresh_token) ?? credentials.refreshToken,
    accessToken: requireAccessToken(body),
    accessTokenExpiresAt: expiresAt(body.expires_in),
    scopes: parseScopes(body.scope) ?? credentials.scopes,
  };
}

async function revoke(
  context: GmailContext,
  credentials: OAuthCredentials,
): Promise<void> {
  const response = await postForm(context, endpoints.revoke, {
    token: credentials.refreshToken,
  });
  if (response.ok || response.status === 400) {
    return;
  }
  throw await tokenEndpointError(response, "revoke");
}

export function createOAuth(context: GmailContext): OAuthSupport {
  return {
    scopes: [...gmailScopes],
    authorizationUrl: (authorization) =>
      authorizationUrl(context, authorization),
    exchangeCode: (exchange) => exchangeCode(context, exchange),
    refresh: (credentials) => refresh(context, credentials),
    revoke: (credentials) => revoke(context, credentials),
  };
}
