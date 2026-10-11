import {
  type IdentityInfo,
  ListEmailIdentitiesCommand,
  type ListEmailIdentitiesCommandOutput,
} from "@aws-sdk/client-sesv2";
import type {
  AccessKeyCredentials,
  Credentials,
} from "@workspace/integration-core";
import { accessKeyFrom, call } from "./client";
import {
  identityPageSize,
  maxIdentityPages,
  type ResolvedSesConfig,
} from "./config";

export type SesIdentity = {
  name: string;
  type: "email" | "domain";
  verificationStatus: string;
  sendingEnabled: boolean;
  verified: boolean;
};

export type SesIdentityList = {
  identities: SesIdentity[];
  truncated: boolean;
};

export type SendingIdentityCheck = {
  verified: boolean;
  identity?: SesIdentity;
  candidates: string[];
};

function toIdentity(info: IdentityInfo): SesIdentity | null {
  if (!info.IdentityName) {
    return null;
  }
  const verificationStatus = info.VerificationStatus ?? "NOT_STARTED";
  const sendingEnabled = info.SendingEnabled !== false;
  return {
    name: info.IdentityName,
    type: info.IdentityType === "EMAIL_ADDRESS" ? "email" : "domain",
    verificationStatus,
    sendingEnabled,
    verified: verificationStatus === "SUCCESS" && sendingEnabled,
  };
}

export async function listIdentitiesWith(
  config: ResolvedSesConfig,
  credentials: AccessKeyCredentials,
): Promise<SesIdentityList> {
  const identities: SesIdentity[] = [];
  let nextToken: string | undefined;
  for (let page = 0; page < maxIdentityPages; page += 1) {
    const output = await call<ListEmailIdentitiesCommandOutput>(
      config,
      credentials,
      new ListEmailIdentitiesCommand({
        PageSize: identityPageSize,
        NextToken: nextToken,
      }),
      { permission: "ses:ListEmailIdentities" },
    );
    for (const info of output.EmailIdentities ?? []) {
      const identity = toIdentity(info);
      if (identity) {
        identities.push(identity);
      }
    }
    nextToken = output.NextToken;
    if (!nextToken) {
      return { identities, truncated: false };
    }
  }
  return { identities, truncated: true };
}

export function identityCandidates(fromEmail: string) {
  const address = fromEmail.trim();
  const at = address.lastIndexOf("@");
  if (at <= 0 || at === address.length - 1) {
    return [];
  }
  const local = address.slice(0, at);
  const domain = address.slice(at + 1).toLowerCase();
  const candidates = [`${local}@${domain}`];
  const plus = local.indexOf("+");
  if (plus > 0) {
    candidates.push(`${local.slice(0, plus)}@${domain}`);
  }
  const labels = domain.split(".");
  for (let start = 0; start <= labels.length - 2; start += 1) {
    candidates.push(labels.slice(start).join("."));
  }
  return candidates;
}

function matches(identity: SesIdentity, candidate: string) {
  if (identity.type === "email") {
    const at = identity.name.lastIndexOf("@");
    const normalized =
      at === -1
        ? identity.name
        : `${identity.name.slice(0, at)}@${identity.name.slice(at + 1).toLowerCase()}`;
    return candidate.includes("@") && normalized === candidate;
  }
  return !candidate.includes("@") && identity.name.toLowerCase() === candidate;
}

export function matchSendingIdentity(
  identities: SesIdentity[],
  fromEmail: string,
): SendingIdentityCheck {
  const candidates = identityCandidates(fromEmail);
  for (const candidate of candidates) {
    const identity = identities.find(
      (entry) => entry.verified && matches(entry, candidate),
    );
    if (identity) {
      return { verified: true, identity, candidates };
    }
  }
  for (const candidate of candidates) {
    const identity = identities.find((entry) => matches(entry, candidate));
    if (identity) {
      return { verified: false, identity, candidates };
    }
  }
  return { verified: false, candidates };
}

export async function listIdentities(
  config: ResolvedSesConfig,
  credentials: Credentials,
) {
  return listIdentitiesWith(config, accessKeyFrom(credentials));
}

export async function checkSendingIdentity(
  config: ResolvedSesConfig,
  credentials: Credentials,
  fromEmail: string,
): Promise<SendingIdentityCheck> {
  const { identities } = await listIdentitiesWith(
    config,
    accessKeyFrom(credentials),
  );
  return matchSendingIdentity(identities, fromEmail);
}
