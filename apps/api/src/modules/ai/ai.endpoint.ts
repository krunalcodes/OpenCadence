import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

export type EndpointCheck =
  | { ok: true; url: string }
  | { ok: false; message: string };

export type EndpointOptions = {
  allowPrivate: boolean;
  resolve?: (hostname: string) => Promise<string[]>;
};

const MAX_URL_LENGTH = 500;

const blocked = new BlockList();
blocked.addSubnet("0.0.0.0", 8, "ipv4");
blocked.addSubnet("10.0.0.0", 8, "ipv4");
blocked.addSubnet("100.64.0.0", 10, "ipv4");
blocked.addSubnet("127.0.0.0", 8, "ipv4");
blocked.addSubnet("169.254.0.0", 16, "ipv4");
blocked.addSubnet("172.16.0.0", 12, "ipv4");
blocked.addSubnet("192.0.0.0", 24, "ipv4");
blocked.addSubnet("192.0.2.0", 24, "ipv4");
blocked.addSubnet("192.168.0.0", 16, "ipv4");
blocked.addSubnet("198.18.0.0", 15, "ipv4");
blocked.addSubnet("198.51.100.0", 24, "ipv4");
blocked.addSubnet("203.0.113.0", 24, "ipv4");
blocked.addSubnet("224.0.0.0", 3, "ipv4");
blocked.addAddress("::", "ipv6");
blocked.addAddress("::1", "ipv6");
blocked.addSubnet("64:ff9b::", 96, "ipv6");
blocked.addSubnet("2001:db8::", 32, "ipv6");
blocked.addSubnet("fc00::", 7, "ipv6");
blocked.addSubnet("fe80::", 10, "ipv6");
blocked.addSubnet("fec0::", 10, "ipv6");
blocked.addSubnet("ff00::", 8, "ipv6");

const blockedHostSuffixes = [
  "localhost",
  "local",
  "internal",
  "lan",
  "home",
  "corp",
  "intranet",
];

const MAPPED_IPV4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;
const MAPPED_IPV4_HEX = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i;

function mappedIpv4(address: string) {
  const dotted = MAPPED_IPV4.exec(address);
  if (dotted?.[1]) {
    return dotted[1];
  }
  const hex = MAPPED_IPV4_HEX.exec(address);
  if (hex?.[1] && hex[2]) {
    const high = Number.parseInt(hex[1], 16);
    const low = Number.parseInt(hex[2], 16);
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  }
  return null;
}

export function isPrivateAddress(address: string) {
  const version = isIP(address);
  if (version === 4) {
    return blocked.check(address, "ipv4");
  }
  if (version === 6) {
    const mapped = mappedIpv4(address);
    if (mapped) {
      return blocked.check(mapped, "ipv4");
    }
    return blocked.check(address, "ipv6");
  }
  return true;
}

function isBlockedHostname(hostname: string) {
  const name = hostname.replace(/\.$/, "").toLowerCase();
  if (!name.includes(".")) {
    return true;
  }
  return blockedHostSuffixes.some(
    (suffix) => name === suffix || name.endsWith(`.${suffix}`),
  );
}

async function resolveAddresses(hostname: string) {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

export function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

export async function checkEndpoint(
  value: string,
  options: EndpointOptions,
): Promise<EndpointCheck> {
  const normalized = normalizeBaseUrl(value);
  if (normalized === "" || normalized.length > MAX_URL_LENGTH) {
    return {
      ok: false,
      message: "Enter the base URL of an OpenAI-compatible API.",
    };
  }
  if (!URL.canParse(normalized)) {
    return { ok: false, message: "The base URL is not a valid URL." };
  }
  const url = new URL(normalized);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, message: "The base URL must start with https://." };
  }
  if (url.username !== "" || url.password !== "") {
    return {
      ok: false,
      message: "The base URL must not contain a username or password.",
    };
  }
  if (url.search !== "" || url.hash !== "") {
    return {
      ok: false,
      message: "The base URL must not contain a query string or fragment.",
    };
  }
  if (options.allowPrivate) {
    return { ok: true, url: normalized };
  }
  if (url.protocol !== "https:") {
    return { ok: false, message: "The base URL must start with https://." };
  }

  const privateMessage =
    "The base URL points to a private or local address. Set AI_ALLOW_PRIVATE_ENDPOINTS=true on the server to use a local model server.";
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(hostname) !== 0) {
    return isPrivateAddress(hostname)
      ? { ok: false, message: privateMessage }
      : { ok: true, url: normalized };
  }
  if (isBlockedHostname(hostname)) {
    return { ok: false, message: privateMessage };
  }

  let addresses: string[];
  try {
    addresses = await (options.resolve ?? resolveAddresses)(hostname);
  } catch {
    return { ok: false, message: "The base URL host could not be found." };
  }
  if (addresses.length === 0) {
    return { ok: false, message: "The base URL host could not be found." };
  }
  if (addresses.some(isPrivateAddress)) {
    return { ok: false, message: privateMessage };
  }
  return { ok: true, url: normalized };
}
