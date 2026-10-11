import { describe, expect, it } from "vitest";
import {
  identityCandidates,
  matchSendingIdentity,
  type SesIdentity,
} from "../src/index";
import { accessKey, createAdapter } from "./helpers";

function identity(
  name: string,
  type: SesIdentity["type"],
  verified = true,
): SesIdentity {
  return {
    name,
    type,
    verificationStatus: verified ? "SUCCESS" : "PENDING",
    sendingEnabled: true,
    verified,
  };
}

describe("identityCandidates", () => {
  it("lists the address, its unlabelled form and every parent domain", () => {
    expect(identityCandidates("Ada+news@Mail.Example.com")).toEqual([
      "Ada+news@mail.example.com",
      "Ada@mail.example.com",
      "mail.example.com",
      "example.com",
    ]);
  });

  it("returns nothing for a value that is not an address", () => {
    expect(identityCandidates("not-an-address")).toEqual([]);
  });
});

describe("matchSendingIdentity", () => {
  it("matches a verified domain for any address on it", () => {
    const domain = identity("Example.com", "domain");

    expect(matchSendingIdentity([domain], "ada@example.com")).toMatchObject({
      verified: true,
      identity: domain,
    });
  });

  it("matches a subdomain through its parent domain", () => {
    const result = matchSendingIdentity(
      [identity("example.com", "domain")],
      "ada@mail.example.com",
    );

    expect(result.verified).toBe(true);
  });

  it("keeps the part before the @ sign case sensitive", () => {
    const address = identity("Ada@example.com", "email");

    expect(matchSendingIdentity([address], "Ada@EXAMPLE.com").verified).toBe(
      true,
    );
    expect(matchSendingIdentity([address], "ada@example.com").verified).toBe(
      false,
    );
  });

  it("accepts a labelled address of a verified address", () => {
    const result = matchSendingIdentity(
      [identity("ada@example.com", "email")],
      "ada+billing@example.com",
    );

    expect(result.verified).toBe(true);
  });

  it("reports an identity that exists but is not verified", () => {
    const pending = identity("example.com", "domain", false);

    expect(matchSendingIdentity([pending], "ada@example.com")).toEqual({
      verified: false,
      identity: pending,
      candidates: ["ada@example.com", "example.com"],
    });
  });

  it("reports an unknown sender", () => {
    expect(
      matchSendingIdentity([identity("example.com", "domain")], "ada@other.io"),
    ).toEqual({ verified: false, candidates: ["ada@other.io", "other.io"] });
  });
});

describe("checkSendingIdentity", () => {
  it("lists identities once and matches the from address", async () => {
    const { adapter, commands } = createAdapter({
      ListEmailIdentitiesCommand: {
        EmailIdentities: [
          {
            IdentityName: "example.com",
            IdentityType: "DOMAIN",
            SendingEnabled: true,
            VerificationStatus: "SUCCESS",
          },
        ],
      },
    });

    const result = await adapter.checkSendingIdentity(
      accessKey,
      "ada@example.com",
    );

    expect(result.verified).toBe(true);
    expect(result.identity?.name).toBe("example.com");
    expect(commands.map((command) => command.name)).toEqual([
      "ListEmailIdentitiesCommand",
    ]);
  });
});
