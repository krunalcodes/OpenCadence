import {
  checkEndpoint,
  isPrivateAddress,
  normalizeBaseUrl,
} from "./ai.endpoint";

const publicResolve = async () => ["104.18.2.10"];
const strict = { allowPrivate: false, resolve: publicResolve };

describe("normalizeBaseUrl", () => {
  it("trims spaces and trailing slashes", () => {
    expect(normalizeBaseUrl("  https://api.together.xyz/v1//  ")).toBe(
      "https://api.together.xyz/v1",
    );
  });
});

describe("isPrivateAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
    "::",
    "fe80::1",
    "fd00:ec2::254",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:a9fe:a9fe",
    "64:ff9b::a00:1",
    "not-an-address",
  ])("blocks %s", (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each([
    "8.8.8.8",
    "104.18.2.10",
    "172.32.0.1",
    "2606:4700::6812:20a",
    "::ffff:8.8.8.8",
  ])("allows %s", (address) => {
    expect(isPrivateAddress(address)).toBe(false);
  });
});

describe("checkEndpoint", () => {
  it("accepts a public https endpoint and strips trailing slashes", async () => {
    await expect(
      checkEndpoint("https://api.together.xyz/v1/", strict),
    ).resolves.toEqual({ ok: true, url: "https://api.together.xyz/v1" });
  });

  it.each([
    "",
    "   ",
    "not a url",
    "ftp://api.example.com/v1",
    "file:///etc/passwd",
    "https://user:secret@api.example.com/v1",
    "https://api.example.com/v1?key=1",
    "https://api.example.com/v1#frag",
    `https://api.example.com/${"a".repeat(500)}`,
  ])("rejects %s", async (value) => {
    const result = await checkEndpoint(value, strict);
    expect(result.ok).toBe(false);
  });

  it.each([
    "http://api.example.com/v1",
    "https://localhost/v1",
    "https://localhost:11434/v1",
    "https://ollama/v1",
    "https://models.internal/v1",
    "https://printer.local/v1",
    "https://127.0.0.1/v1",
    "https://2130706433/v1",
    "https://0x7f.0.0.1/v1",
    "https://10.0.0.5:8080/v1",
    "https://169.254.169.254/latest",
    "https://[::1]/v1",
    "https://[::ffff:127.0.0.1]/v1",
    "https://[fd00::1]/v1",
  ])("rejects the private or insecure endpoint %s", async (value) => {
    const result = await checkEndpoint(value, strict);
    expect(result.ok).toBe(false);
  });

  it("rejects a public name that resolves to a private address", async () => {
    const result = await checkEndpoint("https://rebind.example.com/v1", {
      allowPrivate: false,
      resolve: async () => ["93.184.216.34", "10.0.0.7"],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a host that does not resolve", async () => {
    const failing = await checkEndpoint("https://missing.example.com/v1", {
      allowPrivate: false,
      resolve: async () => {
        throw new Error("ENOTFOUND");
      },
    });
    expect(failing.ok).toBe(false);
    const empty = await checkEndpoint("https://missing.example.com/v1", {
      allowPrivate: false,
      resolve: async () => [],
    });
    expect(empty.ok).toBe(false);
  });

  it("accepts a public IP literal without resolving", async () => {
    await expect(
      checkEndpoint("https://8.8.8.8/v1", {
        allowPrivate: false,
        resolve: async () => {
          throw new Error("should not resolve");
        },
      }),
    ).resolves.toEqual({ ok: true, url: "https://8.8.8.8/v1" });
  });

  it("allows local http endpoints when private endpoints are allowed", async () => {
    await expect(
      checkEndpoint("http://127.0.0.1:11434/v1/", { allowPrivate: true }),
    ).resolves.toEqual({ ok: true, url: "http://127.0.0.1:11434/v1" });
    const stillInvalid = await checkEndpoint("ftp://127.0.0.1/v1", {
      allowPrivate: true,
    });
    expect(stillInvalid.ok).toBe(false);
  });
});
