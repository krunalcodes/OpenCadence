import { createHash } from "node:crypto";
import type { IntegrationErrorCode } from "@workspace/integration-core";
import { describe, expect, it } from "vitest";
import {
  createOutlookAdapter,
  outlookInboxScopes,
  outlookSendScopes,
} from "../src/index";
import {
  callAt,
  captureError,
  clientConfig,
  createFakeFetch,
  expectNoSecrets,
  type FakeReply,
  graphError,
  sendCredentials,
  tokenError,
} from "./helpers";

function setup(replies: FakeReply[] = [], extra: object = {}) {
  const fake = createFakeFetch(replies);
  const adapter = createOutlookAdapter({
    ...clientConfig,
    ...extra,
    fetch: fake.fetch,
  });
  if (!adapter.oauth) {
    throw new Error("The adapter has no OAuth support");
  }
  return { adapter, oauth: adapter.oauth, calls: fake.calls };
}

const redirectUri = "https://app.example.com/app/integrations/outlook/callback";

const tokenReply = {
  body: {
    token_type: "Bearer",
    expires_in: 3599,
    scope:
      "openid email https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read",
    access_token: "new-access-token",
    refresh_token: "new-refresh-token",
  },
};

const meReply = {
  body: {
    id: "87d349ed-44d7-43e1-9a83-5f2406dee5bd",
    mail: "Ada@Contoso.com",
    userPrincipalName: "ada@contoso.onmicrosoft.com",
    displayName: "Ada Lovelace",
  },
};

describe("scopes", () => {
  it("exposes a send-only set and an inbox set", () => {
    expect(outlookSendScopes).toEqual([
      "offline_access",
      "openid",
      "email",
      "User.Read",
      "Mail.Send",
    ]);
    expect(outlookInboxScopes).toEqual([...outlookSendScopes, "Mail.Read"]);
    expect(setup().oauth.scopes).toEqual(outlookSendScopes);
    expect(setup([], { inboxAccess: true }).oauth.scopes).toEqual(
      outlookInboxScopes,
    );
  });
});

describe("authorizationUrl", () => {
  it("builds a v2 authorize URL for the common tenant with PKCE", () => {
    const verifier = "ThisIsntRandomButItNeedsToBe43CharactersLong";
    const codeChallenge = createHash("sha256")
      .update(verifier)
      .digest("base64url");
    const url = new URL(
      setup().oauth.authorizationUrl({
        state: "state-123",
        redirectUri,
        codeChallenge,
        loginHint: "ada@contoso.com",
      }),
    );
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: clientConfig.clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      response_mode: "query",
      scope: "offline_access openid email User.Read Mail.Send",
      prompt: "select_account",
      state: "state-123",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      login_hint: "ada@contoso.com",
    });
    expect(url.toString()).not.toContain(clientConfig.clientSecret);
  });

  it("omits PKCE and the login hint when they are not given", () => {
    const url = new URL(
      setup().oauth.authorizationUrl({ state: "s", redirectUri }),
    );
    expect(url.searchParams.has("code_challenge")).toBe(false);
    expect(url.searchParams.has("code_challenge_method")).toBe(false);
    expect(url.searchParams.has("login_hint")).toBe(false);
  });

  it("asks for Mail.Read only when inbox access is requested", () => {
    const url = new URL(
      setup([], { inboxAccess: true }).oauth.authorizationUrl({
        state: "s",
        redirectUri,
      }),
    );
    expect(url.searchParams.get("scope")).toBe(
      "offline_access openid email User.Read Mail.Send Mail.Read",
    );
  });

  it("uses a configured tenant for both endpoints", async () => {
    const { oauth, calls } = setup([tokenReply], { tenant: "contoso.com" });
    expect(oauth.authorizationUrl({ state: "s", redirectUri })).toContain(
      "https://login.microsoftonline.com/contoso.com/oauth2/v2.0/authorize?",
    );
    await oauth.refresh(sendCredentials);
    expect(callAt(calls, 0).url).toBe(
      "https://login.microsoftonline.com/contoso.com/oauth2/v2.0/token",
    );
  });

  it("rejects a tenant that could change the URL", () => {
    expect(() =>
      createOutlookAdapter({ ...clientConfig, tenant: "evil/../x" }),
    ).toThrow();
  });
});

describe("exchangeCode", () => {
  it("redeems the code with the verifier and reads the identity", async () => {
    const { oauth, calls } = setup([tokenReply, meReply]);
    const before = Date.now();
    const connection = await oauth.exchangeCode({
      code: "auth-code",
      redirectUri,
      codeVerifier: "verifier-value",
    });

    const token = callAt(calls, 0);
    expect(token.url).toBe(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    );
    expect(token.method).toBe("POST");
    expect(token.headers.get("content-type")).toBe(
      "application/x-www-form-urlencoded",
    );
    expect(Object.fromEntries(new URLSearchParams(token.body))).toEqual({
      grant_type: "authorization_code",
      code: "auth-code",
      redirect_uri: redirectUri,
      code_verifier: "verifier-value",
      client_id: clientConfig.clientId,
      client_secret: clientConfig.clientSecret,
    });

    const me = callAt(calls, 1);
    expect(me.url).toBe(
      "https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName,displayName",
    );
    expect(me.method).toBe("GET");
    expect(me.headers.get("authorization")).toBe("Bearer new-access-token");

    expect(connection.account).toEqual({
      externalId: "87d349ed-44d7-43e1-9a83-5f2406dee5bd",
      email: "ada@contoso.com",
      displayName: "Ada Lovelace",
    });
    expect(connection.settings).toEqual({ inboxAccess: false });
    expect(connection.credentials).toMatchObject({
      kind: "oauth2",
      refreshToken: "new-refresh-token",
      accessToken: "new-access-token",
      scopes: ["openid", "email", "Mail.Send", "User.Read"],
    });
    const expiry = connection.credentials.accessTokenExpiresAt?.getTime() ?? 0;
    expect(expiry).toBeGreaterThanOrEqual(before + 3599_000);
    expect(expiry).toBeLessThanOrEqual(Date.now() + 3599_000);
  });

  it("records granted inbox access and falls back to the sign-in name", async () => {
    const { oauth } = setup(
      [
        {
          body: {
            ...tokenReply.body,
            scope: "Mail.Read Mail.Send User.Read openid email",
          },
        },
        {
          body: { id: "user-1", mail: null, userPrincipalName: "ada@live.com" },
        },
      ],
      { inboxAccess: true },
    );
    const connection = await oauth.exchangeCode({ code: "c", redirectUri });
    expect(connection.settings).toEqual({ inboxAccess: true });
    expect(connection.account).toEqual({
      externalId: "user-1",
      email: "ada@live.com",
    });
  });

  it("connects for sending when inbox access was asked for but not granted", async () => {
    const { oauth } = setup([tokenReply, meReply], { inboxAccess: true });
    const connection = await oauth.exchangeCode({ code: "c", redirectUri });
    expect(connection.settings).toEqual({ inboxAccess: false });
  });

  it("fails when permission to send was not granted", async () => {
    const { oauth, calls } = setup([
      { body: { ...tokenReply.body, scope: "openid email User.Read" } },
    ]);
    const error = await captureError(() =>
      oauth.exchangeCode({ code: "c", redirectUri }),
    );
    expect(error.code).toBe("insufficient_permission");
    expect(calls).toHaveLength(1);
  });

  it("fails when no refresh token is returned", async () => {
    const { oauth } = setup([
      { body: { ...tokenReply.body, refresh_token: undefined } },
    ]);
    const error = await captureError(() =>
      oauth.exchangeCode({ code: "c", redirectUri }),
    );
    expect(error.code).toBe("insufficient_permission");
  });

  it("fails when the identity is incomplete", async () => {
    const { oauth } = setup([tokenReply, { body: { id: "user-1" } }]);
    const error = await captureError(() =>
      oauth.exchangeCode({ code: "c", redirectUri }),
    );
    expect(error.code).toBe("unknown");
  });

  it("treats an expired or reused code as a validation error", async () => {
    const { oauth } = setup([tokenError(400, "invalid_grant", [54005])]);
    const error = await captureError(() =>
      oauth.exchangeCode({ code: "c", redirectUri }),
    );
    expect(error.code).toBe("validation");
    expect(error.retryable).toBe(false);
    expect(error.providerCode).toBe("invalid_grant");
    expect(error.providerMessage).toBe("AADSTS54005: Sign-in failed.");
  });
});

describe("refresh", () => {
  it("exchanges the refresh token and stores the rotated one", async () => {
    const { oauth, calls } = setup([tokenReply]);
    const refreshed = await oauth.refresh(sendCredentials);
    const call = callAt(calls, 0);
    expect(call.method).toBe("POST");
    expect(Object.fromEntries(new URLSearchParams(call.body))).toEqual({
      grant_type: "refresh_token",
      refresh_token: "refresh-token-value",
      client_id: clientConfig.clientId,
      client_secret: clientConfig.clientSecret,
    });
    expect(refreshed).toMatchObject({
      kind: "oauth2",
      refreshToken: "new-refresh-token",
      accessToken: "new-access-token",
      scopes: ["openid", "email", "Mail.Send", "User.Read"],
    });
    expect(refreshed.accessTokenExpiresAt).toBeInstanceOf(Date);
  });

  it("keeps the old refresh token and scopes when none are returned", async () => {
    const { oauth } = setup([
      { body: { access_token: "new-access-token", expires_in: 3600 } },
    ]);
    const refreshed = await oauth.refresh(sendCredentials);
    expect(refreshed.refreshToken).toBe("refresh-token-value");
    expect(refreshed.scopes).toEqual(sendCredentials.scopes);
  });

  it("fails when no access token is returned", async () => {
    const { oauth } = setup([{ body: {} }]);
    const error = await captureError(() => oauth.refresh(sendCredentials));
    expect(error.code).toBe("unknown");
  });

  const cases: [string, FakeReply, IntegrationErrorCode, boolean][] = [
    [
      "a revoked refresh token",
      tokenError(400, "invalid_grant", [50173]),
      "auth_revoked",
      false,
    ],
    [
      "a refresh token expired by inactivity",
      tokenError(400, "invalid_grant", [700082]),
      "auth_revoked",
      false,
    ],
    [
      "a required new sign-in",
      tokenError(400, "interaction_required", [50076]),
      "auth_revoked",
      false,
    ],
    [
      "missing consent",
      tokenError(400, "consent_required", [65001]),
      "auth_revoked",
      false,
    ],
    [
      "a conditional access block",
      tokenError(400, "invalid_grant", [53003]),
      "blocked_by_policy",
      false,
    ],
    [
      "a wrong client secret",
      tokenError(401, "invalid_client", [7000215]),
      "invalid_credentials",
      false,
    ],
    [
      "an expired client secret",
      tokenError(401, "invalid_client", [7000222]),
      "invalid_credentials",
      false,
    ],
    [
      "an unknown client",
      tokenError(400, "unauthorized_client", [700016]),
      "invalid_credentials",
      false,
    ],
    [
      "a bad scope",
      tokenError(400, "invalid_scope", [70011]),
      "validation",
      false,
    ],
    [
      "a busy sign-in service",
      tokenError(400, "temporarily_unavailable"),
      "temporary",
      true,
    ],
    ["a server error", { status: 503, body: {} }, "temporary", true],
    ["an unexpected status", tokenError(404, "not_found"), "unknown", false],
  ];

  it.each(cases)("maps %s", async (_name, reply, code, retryable) => {
    const { oauth } = setup([reply]);
    const error = await captureError(() => oauth.refresh(sendCredentials));
    expect(error.code).toBe(code);
    expect(error.retryable).toBe(retryable);
    expectNoSecrets(error);
  });

  it("carries the retry delay when sign-in is throttled", async () => {
    const { oauth } = setup([
      tokenError(429, "too_many_requests", [], { "retry-after": "17" }),
    ]);
    const error = await captureError(() => oauth.refresh(sendCredentials));
    expect(error.code).toBe("rate_limited");
    expect(error.retryAfterSeconds).toBe(17);
  });

  it("maps a network failure to a temporary error", async () => {
    const { oauth } = setup([new Error("socket hang up")]);
    const error = await captureError(() => oauth.refresh(sendCredentials));
    expect(error.code).toBe("temporary");
    expect(error.retryable).toBe(true);
    expectNoSecrets(error);
  });
});

describe("revoke", () => {
  it("makes no request because the platform has no revocation endpoint", async () => {
    const { oauth, calls } = setup();
    await expect(oauth.revoke(sendCredentials)).resolves.toBeUndefined();
    expect(calls).toHaveLength(0);
  });
});

describe("verify", () => {
  it("confirms the token with one cheap call and returns the identity", async () => {
    const { adapter, calls } = setup([meReply]);
    const result = await adapter.verify({
      ...sendCredentials,
      scopes: [
        ...sendCredentials.scopes,
        "https://graph.microsoft.com/Mail.Read",
      ],
    });
    expect(calls).toHaveLength(1);
    expect(callAt(calls, 0).method).toBe("GET");
    expect(callAt(calls, 0).headers.get("authorization")).toBe(
      "Bearer access-token-value",
    );
    expect(result).toEqual({
      account: {
        externalId: "87d349ed-44d7-43e1-9a83-5f2406dee5bd",
        email: "ada@contoso.com",
        displayName: "Ada Lovelace",
      },
      settings: { inboxAccess: true },
    });
  });

  it("reports an expired access token as refreshable", async () => {
    const { adapter } = setup([
      graphError(
        401,
        "InvalidAuthenticationToken",
        "Access token has expired.",
      ),
    ]);
    const error = await captureError(() => adapter.verify(sendCredentials));
    expect(error.code).toBe("auth_expired");
    expect(error.retryable).toBe(true);
  });

  it("refuses credentials of the wrong kind or without a token", async () => {
    const { adapter, calls } = setup();
    const wrongKind = await captureError(() =>
      adapter.verify({ kind: "api_key", apiKey: "key" }),
    );
    expect(wrongKind.code).toBe("invalid_credentials");
    const noToken = await captureError(() =>
      adapter.verify({ ...sendCredentials, accessToken: undefined }),
    );
    expect(noToken.code).toBe("auth_expired");
    expect(calls).toHaveLength(0);
  });
});
