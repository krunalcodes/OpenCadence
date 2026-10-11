import {
  GetAccountCommand,
  type GetAccountCommandOutput,
} from "@aws-sdk/client-sesv2";
import type { Credentials, VerifyResult } from "@workspace/integration-core";
import { accessKeyFrom, call } from "./client";
import type { ResolvedSesConfig } from "./config";
import { listIdentitiesWith } from "./identities";

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function verify(
  config: ResolvedSesConfig,
  credentials: Credentials,
): Promise<VerifyResult> {
  const access = accessKeyFrom(credentials);
  const account = await call<GetAccountCommandOutput>(
    config,
    access,
    new GetAccountCommand({}),
    { permission: "ses:GetAccount" },
  );
  const { identities, truncated } = await listIdentitiesWith(config, access);
  const productionAccess = account.ProductionAccessEnabled === true;
  return {
    account: {},
    settings: {
      region: access.region,
      sendingEnabled: account.SendingEnabled === true,
      productionAccess,
      sandbox: !productionAccess,
      enforcementStatus: account.EnforcementStatus ?? null,
      quota: {
        max24HourSend: optionalNumber(account.SendQuota?.Max24HourSend),
        maxSendRate: optionalNumber(account.SendQuota?.MaxSendRate),
        sentLast24Hours: optionalNumber(account.SendQuota?.SentLast24Hours),
      },
      identities,
      identitiesTruncated: truncated,
    },
  };
}
