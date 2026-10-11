import { IntegrationError } from "@workspace/integration-core";
import { describe, expect, it } from "vitest";
import { createGmailAdapter } from "../src/index";
import {
  callAt,
  clientConfig,
  createFakeFetch,
  credentials,
  type FakeReply,
  sendScope,
} from "./helpers";

function setup(replies: FakeReply[] = []) {
  const fake = createFakeFetch(replies);
  const adapter = createGmailAdapter({ ...clientConfig, fetch: fake.fetch });
  if (!adapter.oauth) {
    throw new Error("Adapter has no OAuth support");
  }
  return { adapter, oauth: adapter.oauth, calls: fake.calls };
}

const tokenReply = {
  body: {
    access_token: "new-access-token",
    expires_in: 3599,
    refresh_token: "new-refresh-token",
    scope: `openid https://www.googleapis.com/auth/userinfo.email ${sendScope}`,
    token_type: "Bearer",
  },
};

const userinfoReply = {
  body: { sub: "1234567890", email: "ada@example.com", hd: "example.com" },
};

describe("adapter description", () => {
  it("describes a send-only OAuth adapter without webhooks", () => {
    const { adapter, oauth } = setup();
    expect(adapter.type).toBe("gmail");
    expect(adapter.name).toBe("Gmail");
    expect(adapter.auth).toBe("oauth2");
    expect(adapter.capabilities).toEqual(["send"]);
    expect(adapter.webhooks).toBeUndefined();
    expect(oauth.scopes).toEqual(["openid", "email", sendScope]);
  });
});

describe("authorizationUrl", () => {
  it("includes every required parameter", () => {
    const { oauth } = setup();
    const url = new URL(
      oauth.authorizationUrl({
        state: "state-123",
        redirectUri: "https://app.example.com/callback",
        codeChallenge: "challenge-abc",
        loginHint: "ada@example.com",
      }),
    );
    expect(url.origin + url.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: clientConfig.clientId,
      redirect_uri: "https://app.example.com/callback",
      response_type: "code",
      scope: `openid email ${sendScope}`,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state: "state-123",
      code_challenge: "challenge-abc",
      code_challenge_method: "S256",
      login_hint: "ada@example.com",
    });
  });

  it("omits PKCE and login hint when not given", () => {
    const { oauth } = setup();
    const url = new URL(
      oauth.authorizationUrl({
        state: "s",
        redirectUri: "https://app.example.com/callback",
      }),
    );
    expect(url.searchParams.has("code_challenge")).toBe(false);
    expect(url.searchParams.has("code_challenge_method")).toBe(false);
    expect(url.searchParams.has("login_hint")).toBe(false);
  });
});

describe("exchangeCode", () => {
  const exchange = {
    code: "auth-code",
    redirectUri: "https://app.example.com/callback",
    codeVerifier: "verifier-xyz",
  };

  it("returns credentials, account and settings", async () => {
    const { oauth, calls } = setup([tokenReply, userinfoReply]);
    const before = Date.now();
    const connection = await oauth.exchangeCode(exchange);

    const tokenCall = callAt(calls, 0);
    expect(tokenCall.url).toBe("https://oauth2.googleapis.com/token");
    expect(tokenCall.method).toBe("POST");
    expect(tokenCall.headers.get("content-type")).toBe(
      "application/x-www-form-urlencoded",
    );
    expect(Object.fromEntries(new URLSearchParams(tokenCall.body))).toEqual({
      grant_type: "authorization_code",
      code: "auth-code",
      redirect_uri: "https://app.example.com/callback",
      code_verifier: "verifier-xyz",
      client_id: clientConfig.clientId,
      client_secret: clientConfig.clientSecret,
    });

    const userinfoCall = callAt(calls, 1);
    expect(userinfoCall.url).toBe(
      "https://openidconnect.googleapis.com/v1/userinfo",
    );
    expect(userinfoCall.method).toBe("GET");
    expect(userinfoCall.headers.get("authorization")).toBe(
      "Bearer new-access-token",
    );

    expect(connection.account).toEqual({
      externalId: "1234567890",
      email: "ada@example.com",
    });
    expect(connection.settings).toEqual({ hostedDomain: "example.com" });
    expect(connection.credentials.kind).toBe("oauth2");
    expect(connection.credentials.refreshToken).toBe("new-refresh-token");
    expect(connection.credentials.accessToken).toBe("new-access-token");
    expect(connection.credentials.scopes).toContain(sendScope);
    const expiry = connection.credentials.accessTokenExpiresAt?.getTime() ?? 0;
    expect(expiry).toBeGreaterThanOrEqual(before + 3599 * 1000);
    expect(expiry).toBeLessThanOrEqual(Date.now() + 3599 * 1000);
  });

  it("sets hostedDomain to null for consumer accounts", async () => {
    const { oauth } = setup([
      tokenReply,
      { body: { sub: "42", email: "ada@gmail.com" } },
    ]);
    const connection = await oauth.exchangeCode(exchange);
    expect(connection.settings).toEqual({ hostedDomain: null });
  });

  it("rejects when the gmail.send scope was not granted", async () => {
    const { oauth, calls } = setup([
      { body: { ...tokenReply.body, scope: "openid email" } },
    ]);
    await expect(oauth.exchangeCode(exchange)).rejects.toMatchObject({
      code: "insufficient_permission",
    });
    expect(calls).toHaveLength(1);
  });

  it("rejects when no refresh token is returned", async () => {
    const { oauth } = setup([
      { body: { ...tokenReply.body, refresh_token: undefined } },
    ]);
    await expect(oauth.exchangeCode(exchange)).rejects.toMatchObject({
      code: "auth_revoked",
    });
  });

  it("never puts secrets in error messages", async () => {
    const { oauth } = setup([
      {
        status: 401,
        body: { error: "invalid_client", error_description: "Unauthorized" },
      },
    ]);
    const error = await oauth.exchangeCode(exchange).catch((e) => e);
    expect(error).toBeInstanceOf(IntegrationError);
    expect(error.code).toBe("invalid_credentials");
    expect(error.message).not.toContain(clientConfig.clientSecret);
    expect(error.message).not.toContain("auth-code");
  });
});

describe("refresh", () => {
  it("returns updated credentials and keeps the old refresh token", async () => {
    const { oauth, calls } = setup([
      {
        body: {
          access_token: "fresh-access-token",
          expires_in: 3600,
          scope: `openid ${sendScope}`,
        },
      },
    ]);
    const updated = await oauth.refresh(credentials);
    expect(
      Object.fromEntries(new URLSearchParams(callAt(calls, 0).body)),
    ).toEqual({
      grant_type: "refresh_token",
      refresh_token: "refresh-token-value",
      client_id: clientConfig.clientId,
      client_secret: clientConfig.clientSecret,
    });
    expect(updated.refreshToken).toBe("refresh-token-value");
    expect(updated.accessToken).toBe("fresh-access-token");
    expect(updated.scopes).toEqual(["openid", sendScope]);
    expect(updated.accessTokenExpiresAt).toBeInstanceOf(Date);
  });

  it("keeps the previous scopes when none are returned", async () => {
    const { oauth } = setup([
      { body: { access_token: "fresh-access-token", expires_in: 3600 } },
    ]);
    const updated = await oauth.refresh(credentials);
    expect(updated.scopes).toEqual(credentials.scopes);
  });

  it("maps invalid_grant to auth_revoked", async () => {
    const { oauth } = setup([
      {
        status: 400,
        body: {
          error: "invalid_grant",
          error_description: "Token has been expired or revoked.",
        },
      },
    ]);
    await expect(oauth.refresh(credentials)).rejects.toMatchObject({
      code: "auth_revoked",
      providerStatus: 400,
      providerCode: "invalid_grant",
      providerMessage: "Token has been expired or revoked.",
    });
  });

  it("maps admin_policy_enforced to auth_revoked", async () => {
    const { oauth } = setup([
      { status: 400, body: { error: "admin_policy_enforced" } },
    ]);
    await expect(oauth.refresh(credentials)).rejects.toMatchObject({
      code: "auth_revoked",
    });
  });

  it("maps server errors and network failures to temporary", async () => {
    const server = setup([{ status: 503, body: {} }]);
    await expect(server.oauth.refresh(credentials)).rejects.toMatchObject({
      code: "temporary",
      providerStatus: 503,
    });
    const network = setup([new TypeError("fetch failed")]);
    await expect(network.oauth.refresh(credentials)).rejects.toMatchObject({
      code: "temporary",
    });
  });
});

describe("revoke", () => {
  it("posts the refresh token", async () => {
    const { oauth, calls } = setup([{ body: {} }]);
    await oauth.revoke(credentials);
    const call = callAt(calls, 0);
    expect(call.url).toBe("https://oauth2.googleapis.com/revoke");
    expect(call.method).toBe("POST");
    expect(call.body).toBe("token=refresh-token-value");
  });

  it("treats an already invalid token as success", async () => {
    const { oauth } = setup([
      { status: 400, body: { error: "invalid_token" } },
    ]);
    await expect(oauth.revoke(credentials)).resolves.toBeUndefined();
  });

  it("reports server errors as temporary", async () => {
    const { oauth } = setup([{ status: 500, body: {} }]);
    await expect(oauth.revoke(credentials)).rejects.toMatchObject({
      code: "temporary",
    });
  });
});

describe("verify", () => {
  it("returns the account from userinfo", async () => {
    const { adapter, calls } = setup([userinfoReply]);
    await expect(adapter.verify(credentials)).resolves.toEqual({
      account: { externalId: "1234567890", email: "ada@example.com" },
      settings: { hostedDomain: "example.com" },
    });
    expect(callAt(calls, 0).headers.get("authorization")).toBe(
      "Bearer access-token-value",
    );
  });

  it("rejects without an access token", async () => {
    const { adapter, calls } = setup();
    await expect(
      adapter.verify({ ...credentials, accessToken: undefined }),
    ).rejects.toMatchObject({ code: "auth_expired" });
    expect(calls).toHaveLength(0);
  });

  it("rejects API key credentials", async () => {
    const { adapter } = setup();
    await expect(
      adapter.verify({ kind: "api_key", apiKey: "key" }),
    ).rejects.toMatchObject({ code: "invalid_credentials" });
  });

  it("maps an expired access token to auth_expired", async () => {
    const { adapter } = setup([
      {
        status: 401,
        body: { error: "invalid_token", error_description: "Invalid Value" },
      },
    ]);
    await expect(adapter.verify(credentials)).rejects.toMatchObject({
      code: "auth_expired",
      providerStatus: 401,
    });
  });
});
