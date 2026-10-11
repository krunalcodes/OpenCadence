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
  type OutlookContext,
  outlookMailSendScope,
  scopesFor,
} from "./config";
import { type TokenAction, tokenEndpointError } from "./errors";
import {
  asString,
  hasScope,
  type JsonObject,
  normalizeScope,
  readJson,
  request,
} from "./http";
import { fetchIdentity } from "./identity";

const scopeNames = new Map(
  [...scopesFor({ inboxAccess: true }), "profile", "Mail.ReadWrite"].map(
    (scope) => [scope.toLowerCase(), scope],
  ),
);

async function postToken(
  context: OutlookContext,
  params: Record<string, string>,
  action: TokenAction,
): Promise<JsonObject> {
  const response = await request(
    context.fetch,
    endpoints.token(context.tenant),
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        ...params,
        client_id: context.clientId,
        client_secret: context.clientSecret,
      }).toString(),
    },
  );
  if (!response.ok) {
    throw await tokenEndpointError(response, action);
  }
  return readJson(response);
}

function parseScopes(value: unknown): string[] | undefined {
  const scope = asString(value);
  if (!scope) {
    return undefined;
  }
  const names = scope
    .split(/\s+/)
    .filter(Boolean)
    .map((entry) => {
      const short = normalizeScope(entry);
      return (
        scopeNames.get(short) ??
        entry.replace(/^https:\/\/graph\.microsoft\.com\//i, "")
      );
    });
  return [...new Set(names)];
}

function expiresAt(value: unknown): Date | undefined {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return undefined;
  }
  return new Date(Date.now() + seconds * 1000);
}

function requireToken(body: JsonObject): string {
  const accessToken = asString(body.access_token);
  if (!accessToken) {
    throw new IntegrationError(
      "unknown",
      "Microsoft did not return an access token.",
    );
  }
  return accessToken;
}

function authorizationUrl(
  context: OutlookContext,
  authorization: OAuthAuthorizationRequest,
): string {
  const url = new URL(endpoints.authorization(context.tenant));
  url.searchParams.set("client_id", context.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", authorization.redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", scopesFor(context).join(" "));
  url.searchParams.set("prompt", "select_account");
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
  context: OutlookContext,
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
  if (!hasScope(scopes, outlookMailSendScope)) {
    throw new IntegrationError(
      "insufficient_permission",
      "Permission to send email was not granted. Connect the account again and allow sending.",
    );
  }
  const refreshToken = asString(body.refresh_token);
  if (!refreshToken) {
    throw new IntegrationError(
      "insufficient_permission",
      "Microsoft did not grant long-term access. Connect the account again and allow the app to keep access.",
    );
  }
  const accessToken = requireToken(body);
  const identity = await fetchIdentity(context, accessToken, scopes);
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
  context: OutlookContext,
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
    accessToken: requireToken(body),
    accessTokenExpiresAt: expiresAt(body.expires_in),
    scopes: parseScopes(body.scope) ?? credentials.scopes,
  };
}

export function createOAuth(context: OutlookContext): OAuthSupport {
  return {
    scopes: scopesFor(context),
    authorizationUrl: (authorization) =>
      authorizationUrl(context, authorization),
    exchangeCode: (exchange) => exchangeCode(context, exchange),
    refresh: (credentials) => refresh(context, credentials),
    revoke: async () => undefined,
  };
}
