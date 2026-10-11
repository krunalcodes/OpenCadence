import { IntegrationError } from "@workspace/integration-core";
import { describe, expect, it } from "vitest";
import {
  accessKey,
  awsError,
  captureError,
  createAdapter,
  networkError,
} from "./helpers";

const productionAccount = {
  SendingEnabled: true,
  ProductionAccessEnabled: true,
  EnforcementStatus: "HEALTHY",
  SendQuota: { Max24HourSend: 50000, MaxSendRate: 14, SentLast24Hours: 120 },
};

const sandboxAccount = {
  SendingEnabled: true,
  ProductionAccessEnabled: false,
  EnforcementStatus: "HEALTHY",
  SendQuota: { Max24HourSend: 200, MaxSendRate: 1, SentLast24Hours: 3 },
};

const identities = {
  EmailIdentities: [
    {
      IdentityName: "example.com",
      IdentityType: "DOMAIN",
      SendingEnabled: true,
      VerificationStatus: "SUCCESS",
    },
    {
      IdentityName: "pending.example.org",
      IdentityType: "DOMAIN",
      SendingEnabled: false,
      VerificationStatus: "PENDING",
    },
    {
      IdentityName: "ada@example.net",
      IdentityType: "EMAIL_ADDRESS",
      SendingEnabled: true,
      VerificationStatus: "SUCCESS",
    },
  ],
};

describe("verify", () => {
  it("returns the account, quota and identities for a production account", async () => {
    const { adapter, commands, credentials } = createAdapter({
      GetAccountCommand: productionAccount,
      ListEmailIdentitiesCommand: identities,
    });

    const result = await adapter.verify(accessKey);

    expect(result).toEqual({
      account: {},
      settings: {
        region: "eu-west-1",
        sendingEnabled: true,
        productionAccess: true,
        sandbox: false,
        enforcementStatus: "HEALTHY",
        quota: { max24HourSend: 50000, maxSendRate: 14, sentLast24Hours: 120 },
        identities: [
          {
            name: "example.com",
            type: "domain",
            verificationStatus: "SUCCESS",
            sendingEnabled: true,
            verified: true,
          },
          {
            name: "pending.example.org",
            type: "domain",
            verificationStatus: "PENDING",
            sendingEnabled: false,
            verified: false,
          },
          {
            name: "ada@example.net",
            type: "email",
            verificationStatus: "SUCCESS",
            sendingEnabled: true,
            verified: true,
          },
        ],
        identitiesTruncated: false,
      },
    });
    expect(commands).toEqual([
      { name: "GetAccountCommand", input: {} },
      {
        name: "ListEmailIdentitiesCommand",
        input: { PageSize: 1000, NextToken: undefined },
      },
    ]);
    expect(credentials[0]).toEqual(accessKey);
  });

  it("reports the sandbox", async () => {
    const { adapter } = createAdapter({
      GetAccountCommand: sandboxAccount,
      ListEmailIdentitiesCommand: { EmailIdentities: [] },
    });

    const { settings } = await adapter.verify(accessKey);

    expect(settings).toMatchObject({
      sandbox: true,
      productionAccess: false,
      quota: { max24HourSend: 200, maxSendRate: 1, sentLast24Hours: 3 },
      identities: [],
    });
  });

  it("follows identity pages", async () => {
    const { adapter, commands } = createAdapter({
      GetAccountCommand: productionAccount,
      ListEmailIdentitiesCommand: (input: Record<string, unknown>) =>
        input.NextToken === "page-2"
          ? { EmailIdentities: [identities.EmailIdentities[2]] }
          : {
              EmailIdentities: [identities.EmailIdentities[0]],
              NextToken: "page-2",
            },
    });

    const { settings } = await adapter.verify(accessKey);

    expect(settings.identities).toHaveLength(2);
    expect(commands[2]?.input.NextToken).toBe("page-2");
  });

  it("normalizes the region and trims the keys", async () => {
    const { adapter, credentials } = createAdapter({
      GetAccountCommand: productionAccount,
    });

    await adapter.verify({
      ...accessKey,
      accessKeyId: ` ${accessKey.accessKeyId} `,
      region: " EU-West-1 ",
    });

    expect(credentials[0]).toEqual(accessKey);
  });

  it.each([
    [{ kind: "api_key", apiKey: "key" } as const, "invalid_credentials"],
    [{ ...accessKey, secretAccessKey: "" }, "invalid_credentials"],
    [{ ...accessKey, accessKeyId: "short" }, "invalid_credentials"],
    [
      { ...accessKey, accessKeyId: "ASIAIOSFODNN7EXAMPLE" },
      "invalid_credentials",
    ],
    [{ ...accessKey, region: "europe" }, "validation"],
  ])(
    "rejects unusable credentials before calling AWS",
    async (credentials, code) => {
      const { adapter, commands } = createAdapter();

      const error = await captureError(() => adapter.verify(credentials));

      expect(error).toBeInstanceOf(IntegrationError);
      expect((error as IntegrationError).code).toBe(code);
      expect(commands).toHaveLength(0);
    },
  );

  it.each([
    ["UnrecognizedClientException", 403],
    ["InvalidSignatureException", 403],
    ["InvalidClientTokenId", 403],
    ["ExpiredTokenException", 403],
    ["IncompleteSignature", 403],
  ])("maps %s to invalid credentials", async (name, status) => {
    const { adapter } = createAdapter({
      GetAccountCommand: awsError(
        name,
        "The security token included in the request is invalid.",
        status,
      ),
    });

    const error = (await captureError(() =>
      adapter.verify(accessKey),
    )) as IntegrationError;

    expect(error.code).toBe("invalid_credentials");
    expect(error.message).toContain("eu-west-1");
    expect(error.providerCode).toBe(name);
    expect(error.providerStatus).toBe(status);
    expect(error.retryable).toBe(false);
  });

  it("names the missing permission for the account call", async () => {
    const { adapter } = createAdapter({
      GetAccountCommand: awsError(
        "AccessDeniedException",
        "User: arn:aws:iam::123456789012:user/mailer is not authorized to perform: ses:GetAccount on resource: *",
        403,
      ),
    });

    const error = (await captureError(() =>
      adapter.verify(accessKey),
    )) as IntegrationError;

    expect(error.code).toBe("insufficient_permission");
    expect(error.message).toBe(
      "The access key is not allowed to call ses:GetAccount. Add ses:GetAccount to its IAM policy.",
    );
  });

  it("names the missing permission for the identity list", async () => {
    const { adapter } = createAdapter({
      GetAccountCommand: productionAccount,
      ListEmailIdentitiesCommand: awsError("AccessDeniedException", "", 403),
    });

    const error = (await captureError(() =>
      adapter.verify(accessKey),
    )) as IntegrationError;

    expect(error.code).toBe("insufficient_permission");
    expect(error.message).toContain("ses:ListEmailIdentities");
  });

  it("reports a region without an endpoint", async () => {
    const { adapter } = createAdapter({
      GetAccountCommand: networkError("ENOTFOUND"),
    });

    const error = (await captureError(() =>
      adapter.verify({ ...accessKey, region: "xx-nowhere-9" }),
    )) as IntegrationError;

    expect(error.code).toBe("validation");
    expect(error.message).toBe(
      "Amazon SES has no endpoint for the region xx-nowhere-9.",
    );
  });

  it("treats a network failure as temporary", async () => {
    const { adapter } = createAdapter({
      GetAccountCommand: networkError("ECONNRESET"),
    });

    const error = (await captureError(() =>
      adapter.verify(accessKey),
    )) as IntegrationError;

    expect(error.code).toBe("temporary");
    expect(error.retryable).toBe(true);
  });

  it("reuses one client per access key", async () => {
    const { adapter, credentials } = createAdapter({
      GetAccountCommand: productionAccount,
    });

    await adapter.verify(accessKey);
    await adapter.verify(accessKey);
    await adapter.verify({ ...accessKey, region: "us-east-1" });

    expect(credentials.map((used) => used.region)).toEqual([
      "eu-west-1",
      "us-east-1",
    ]);
  });
});

describe("capabilities", () => {
  it("declares sending and webhooks without an inbox", () => {
    const { adapter } = createAdapter();

    expect(adapter.type).toBe("ses");
    expect(adapter.auth).toBe("access_key");
    expect(adapter.capabilities).toEqual(["send", "volume", "webhooks"]);
    expect(adapter.inbox).toBeUndefined();
    expect(adapter.oauth).toBeUndefined();
  });
});
