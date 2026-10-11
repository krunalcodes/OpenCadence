import { createPublicKey } from "node:crypto";

export type SpfQualifier = "+" | "-" | "~" | "?";

export type SpfTerm =
  | { kind: "all"; qualifier: SpfQualifier }
  | {
      kind: "mechanism";
      name: "include" | "a" | "mx" | "ptr" | "exists" | "ip4" | "ip6";
      qualifier: SpfQualifier;
      value: string | null;
    }
  | { kind: "redirect"; value: string }
  | { kind: "modifier"; name: string; value: string }
  | { kind: "unknown"; text: string };

export type SpfRecord = { terms: SpfTerm[] };

export type TagList = Map<string, string>;

export type DkimKey =
  | { ok: false; reason: "not_dkim" | "invalid" | "revoked" }
  | {
      ok: true;
      keyType: string;
      bits: number | null;
      readable: boolean;
      testing: boolean;
    };

export type DmarcPolicy = "none" | "quarantine" | "reject";

export type DmarcRecord =
  | { ok: false }
  | {
      ok: true;
      policy: DmarcPolicy;
      subdomainPolicy: DmarcPolicy | null;
      rua: string[];
      publicSuffix: boolean;
    };

const mechanismNames = new Set([
  "include",
  "a",
  "mx",
  "ptr",
  "exists",
  "ip4",
  "ip6",
]);
const modifierPattern = /^([a-z][a-z0-9_.-]*)=(.*)$/i;
const mechanismPattern = /^([a-z0-9]+)(?:([:/])(.*))?$/i;
const dmarcPolicies: DmarcPolicy[] = ["none", "quarantine", "reject"];

export function cleanText(value: unknown, maxLength: number) {
  const text = typeof value === "string" ? value : String(value ?? "");
  let cleaned = "";
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    cleaned += code < 32 || code === 127 ? " " : char;
    if (cleaned.length >= maxLength) {
      break;
    }
  }
  return cleaned.trim();
}

export function isSpfRecord(text: string) {
  return /^v=spf1(\s|$)/i.test(text.trim());
}

export function isDmarcRecord(text: string) {
  return /^v\s*=\s*DMARC1\s*(;|$)/i.test(text.trim());
}

export function parseSpf(text: string): SpfRecord | null {
  if (typeof text !== "string" || !isSpfRecord(text)) {
    return null;
  }
  const terms: SpfTerm[] = [];
  for (const raw of text.trim().split(/\s+/).slice(1)) {
    if (raw === "") {
      continue;
    }
    const modifier = modifierPattern.exec(raw);
    if (modifier) {
      const name = (modifier[1] ?? "").toLowerCase();
      const value = modifier[2] ?? "";
      terms.push(
        name === "redirect"
          ? { kind: "redirect", value }
          : { kind: "modifier", name, value },
      );
      continue;
    }
    const first = raw[0] ?? "";
    const hasQualifier = "+-~?".includes(first);
    const qualifier = (hasQualifier ? first : "+") as SpfQualifier;
    const body = hasQualifier ? raw.slice(1) : raw;
    const mechanism = mechanismPattern.exec(body);
    const name = (mechanism?.[1] ?? "").toLowerCase();
    if (!mechanism) {
      terms.push({ kind: "unknown", text: raw });
    } else if (name === "all" && mechanism[2] === undefined) {
      terms.push({ kind: "all", qualifier });
    } else if (mechanismNames.has(name)) {
      const separator = mechanism[2];
      const rest = mechanism[3] ?? "";
      const value =
        separator === ":" ? rest : separator === "/" ? `/${rest}` : null;
      if (
        (name === "include" || name === "exists" || name.startsWith("ip")) &&
        (separator !== ":" || rest === "")
      ) {
        terms.push({ kind: "unknown", text: raw });
      } else {
        terms.push({
          kind: "mechanism",
          name: name as "include",
          qualifier,
          value,
        });
      }
    } else {
      terms.push({ kind: "unknown", text: raw });
    }
  }
  return { terms };
}

export function parseTagList(text: string): TagList {
  const tags: TagList = new Map();
  if (typeof text !== "string") {
    return tags;
  }
  for (const part of text.split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) {
      continue;
    }
    const name = part.slice(0, index).trim().toLowerCase();
    if (name === "" || /\s/.test(name) || tags.has(name)) {
      continue;
    }
    tags.set(name, part.slice(index + 1).trim());
  }
  return tags;
}

function rsaBitsAs(der: Buffer, type: "spki" | "pkcs1") {
  try {
    const key = createPublicKey({ key: der, format: "der", type });
    const bits = key.asymmetricKeyDetails?.modulusLength;
    return key.asymmetricKeyType === "rsa" && typeof bits === "number"
      ? bits
      : null;
  } catch {
    return null;
  }
}

function rsaBits(der: Buffer) {
  return rsaBitsAs(der, "spki") ?? rsaBitsAs(der, "pkcs1");
}

export function parseDkim(text: string): DkimKey {
  const tags = parseTagList(text);
  const version = tags.get("v");
  const key = tags.get("p");
  if (key === undefined) {
    return { ok: false, reason: "not_dkim" };
  }
  if (version !== undefined && version.toUpperCase() !== "DKIM1") {
    return { ok: false, reason: "not_dkim" };
  }
  const compact = key.replace(/\s+/g, "");
  if (compact === "") {
    return { ok: false, reason: "revoked" };
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) {
    return { ok: false, reason: "invalid" };
  }
  const keyType = (tags.get("k") ?? "rsa").toLowerCase();
  const flags = (tags.get("t") ?? "")
    .split(":")
    .map((flag) => flag.trim().toLowerCase());
  const testing = flags.includes("y");
  let der: Buffer;
  try {
    der = Buffer.from(compact, "base64");
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (keyType === "ed25519") {
    return der.length === 32
      ? { ok: true, keyType, bits: 256, readable: true, testing }
      : { ok: false, reason: "invalid" };
  }
  if (keyType !== "rsa") {
    return { ok: true, keyType, bits: null, readable: false, testing };
  }
  const bits = rsaBits(der);
  return { ok: true, keyType, bits, readable: bits !== null, testing };
}

function toPolicy(value: string | undefined) {
  const policy = (value ?? "").toLowerCase();
  return dmarcPolicies.find((item) => item === policy) ?? null;
}

export function parseDmarc(text: string): DmarcRecord {
  if (typeof text !== "string" || !isDmarcRecord(text)) {
    return { ok: false };
  }
  const tags = parseTagList(text);
  const policy = toPolicy(tags.get("p"));
  const rua = (tags.get("rua") ?? "")
    .split(",")
    .map((uri) => uri.trim())
    .filter((uri) => /^mailto:[^\s@]+@[^\s@]+$/i.test(uri.split("!")[0] ?? ""));
  const publicSuffix = (tags.get("psd") ?? "").toLowerCase() === "y";
  if (!policy) {
    return { ok: false };
  }
  return {
    ok: true,
    policy,
    subdomainPolicy: toPolicy(tags.get("sp")),
    rua,
    publicSuffix,
  };
}
