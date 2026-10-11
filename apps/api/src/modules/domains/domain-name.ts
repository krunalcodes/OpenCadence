import { domainToASCII } from "node:url";

export type DomainNameResult =
  | { ok: true; domain: string }
  | { ok: false; message: string };

const labelPattern = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const lookupLabelPattern = /^[a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?$/;
const topLevelPattern = /^([a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;
const selectorLabelPattern = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

const reservedTopLevels = new Set([
  "local",
  "localhost",
  "localdomain",
  "internal",
  "invalid",
  "test",
  "example",
  "onion",
  "arpa",
  "lan",
  "home",
  "corp",
  "intranet",
]);

const knownPublicSuffixes = new Set([
  "co.uk",
  "org.uk",
  "me.uk",
  "ltd.uk",
  "plc.uk",
  "net.uk",
  "ac.uk",
  "gov.uk",
  "sch.uk",
  "nhs.uk",
  "com.au",
  "net.au",
  "org.au",
  "edu.au",
  "gov.au",
  "id.au",
  "co.nz",
  "net.nz",
  "org.nz",
  "govt.nz",
  "ac.nz",
  "co.jp",
  "ne.jp",
  "or.jp",
  "ac.jp",
  "go.jp",
  "co.in",
  "net.in",
  "org.in",
  "firm.in",
  "gen.in",
  "ind.in",
  "ac.in",
  "gov.in",
  "com.br",
  "net.br",
  "org.br",
  "gov.br",
  "com.mx",
  "org.mx",
  "gob.mx",
  "co.za",
  "org.za",
  "net.za",
  "gov.za",
  "com.cn",
  "net.cn",
  "org.cn",
  "gov.cn",
  "com.hk",
  "org.hk",
  "com.tw",
  "org.tw",
  "com.sg",
  "org.sg",
  "edu.sg",
  "com.my",
  "org.my",
  "co.id",
  "or.id",
  "co.th",
  "or.th",
  "com.ph",
  "com.vn",
  "co.kr",
  "or.kr",
  "ne.kr",
  "co.il",
  "org.il",
  "ac.il",
  "com.tr",
  "org.tr",
  "net.tr",
  "com.sa",
  "com.eg",
  "com.ng",
  "co.ke",
  "com.gh",
  "com.pk",
  "com.bd",
  "com.ar",
  "com.co",
  "com.pe",
  "com.ve",
  "com.uy",
  "com.ec",
  "com.ua",
  "com.pl",
  "com.ru",
  "com.es",
  "com.pt",
  "com.gr",
  "co.at",
  "or.at",
  "co.hu",
  "com.ro",
]);

function invalid(message: string): DomainNameResult {
  return { ok: false, message };
}

export function parseDomainName(value: unknown): DomainNameResult {
  if (typeof value !== "string" || value.trim() === "") {
    return invalid("Enter the domain you send from, for example example.com.");
  }
  const raw = value.trim();
  if (raw.length > 253) {
    return invalid("A domain is at most 253 characters long.");
  }
  if (/\s/.test(raw)) {
    return invalid("A domain cannot contain spaces.");
  }
  if (raw.includes("@")) {
    return invalid(
      "Enter only the domain, the part after the @ of your address.",
    );
  }
  if (raw.includes("://") || raw.includes("/")) {
    return invalid(
      "Enter only the domain, without https:// or anything after a slash.",
    );
  }
  if (raw.includes("*")) {
    return invalid("Wildcards are not supported. Enter one exact domain.");
  }
  if (raw.endsWith(".")) {
    return invalid("Remove the dot at the end of the domain.");
  }
  if (raw.includes(":") || raw.includes("[") || raw.includes("]")) {
    return invalid("Enter a domain name, not an IP address or a port.");
  }
  if (raw.startsWith(".") || raw.includes("..")) {
    return invalid("This domain has an empty part between two dots.");
  }
  let ascii = "";
  try {
    ascii = domainToASCII(raw).toLowerCase();
  } catch {
    ascii = "";
  }
  if (ascii === "" || ascii.length > 253) {
    return invalid("This is not a valid domain name.");
  }
  const labels = ascii.split(".");
  if (labels.length < 2) {
    return invalid(
      "Enter a full domain with an ending, for example example.com.",
    );
  }
  const topLevel = labels[labels.length - 1] ?? "";
  if (/^\d+$/.test(topLevel) || labels.every((label) => /^\d+$/.test(label))) {
    return invalid("Enter a domain name, not an IP address.");
  }
  if (!labels.every((label) => labelPattern.test(label))) {
    return invalid(
      "A domain can only contain letters, digits and hyphens, and no part can start or end with a hyphen.",
    );
  }
  if (!topLevelPattern.test(topLevel)) {
    return invalid("This domain does not end in a valid top-level domain.");
  }
  if (reservedTopLevels.has(topLevel)) {
    return invalid(
      `Domains ending in .${topLevel} are reserved and cannot receive public DNS records.`,
    );
  }
  if (knownPublicSuffixes.has(ascii)) {
    return invalid(
      `${ascii} is a public suffix shared by many owners. Enter the domain you registered under it.`,
    );
  }
  return { ok: true, domain: ascii };
}

export function isLookupName(value: string) {
  if (value.length === 0 || value.length > 253) {
    return false;
  }
  const labels = value.split(".");
  if (labels.length < 2) {
    return false;
  }
  const topLevel = labels[labels.length - 1] ?? "";
  return (
    labels.every((label) => lookupLabelPattern.test(label)) &&
    topLevelPattern.test(topLevel)
  );
}

export function normalizeLookupName(value: string) {
  const name = value.trim().toLowerCase().replace(/\.$/, "");
  return isLookupName(name) ? name : null;
}

export function parseSelector(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return null;
  }
  const selector = value.trim().toLowerCase();
  if (selector === "" || selector.length > maxLength) {
    return null;
  }
  return selector.split(".").every((label) => selectorLabelPattern.test(label))
    ? selector
    : null;
}

export function parentDomains(domain: string, limit: number) {
  const labels = domain.split(".");
  const parents: string[] = [];
  for (let start = 1; start < labels.length - 1; start += 1) {
    const parent = labels.slice(start).join(".");
    if (knownPublicSuffixes.has(parent)) {
      break;
    }
    parents.push(parent);
    if (parents.length >= limit) {
      break;
    }
  }
  return parents;
}

export function sameOrSubdomain(name: string, domain: string) {
  return name === domain || name.endsWith(`.${domain}`);
}
