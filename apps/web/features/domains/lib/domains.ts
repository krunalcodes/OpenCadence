import { isRow, type Row, rowsOf, textOrNull, textsOf } from "@/lib/api";

export type DomainStatus = "pending" | "verified" | "warning" | "failing";

export type RecordStatus = "pass" | "warning" | "fail" | "missing";

export type RecordKind = "spf" | "dkim" | "dmarc" | "mx";

export type RecordCheck = {
  status: RecordStatus;
  host: string;
  found: string[];
  expected: string | null;
  code: string | null;
  message: string;
};

export type DkimCheck = RecordCheck & { selector: string };

export type DmarcCheck = RecordCheck & { policy: string | null };

export type DomainChecks = {
  spf: RecordCheck | null;
  dkim: DkimCheck[];
  dmarc: DmarcCheck | null;
  mx: RecordCheck | null;
};

export type DomainSource = {
  id: string;
  name: string;
  integrationType: string;
};

export type Domain = {
  id: string;
  domain: string;
  status: DomainStatus;
  dkimSelectors: string[];
  checks: DomainChecks | null;
  inconclusive: RecordKind[];
  suggestedSelectors: string[];
  lastCheckedAt: string | null;
  statusChangedAt: string | null;
  createdAt: string;
  sources: DomainSource[];
};

export type DomainsResult =
  | { state: "ready"; domains: Domain[]; suggestions: string[] }
  | { state: "failed" };

export type DomainResult =
  | { state: "ready"; domain: Domain }
  | { state: "missing" }
  | { state: "failed" };

export type ChecklistItem = {
  key: string;
  kind: RecordKind;
  selector: string | null;
  check: RecordCheck | null;
  host: string;
  stale: boolean;
};

export const maxSelectors = 10;

const statuses: DomainStatus[] = ["pending", "verified", "warning", "failing"];
const recordStatuses: RecordStatus[] = ["pass", "warning", "fail", "missing"];
const recordKinds: RecordKind[] = ["spf", "dkim", "dmarc", "mx"];
const selectorPattern = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

function toRecordCheck(value: unknown): RecordCheck | null {
  if (!isRow(value)) {
    return null;
  }
  const status = recordStatuses.find((item) => item === value.status);
  const host = textOrNull(value.host);
  if (!status || !host) {
    return null;
  }
  return {
    status,
    host,
    found: textsOf(value.found),
    expected: textOrNull(value.expected),
    code: textOrNull(value.code),
    message: textOrNull(value.message) ?? "",
  };
}

function toChecks(value: unknown): DomainChecks | null {
  if (!isRow(value)) {
    return null;
  }
  const dmarc = toRecordCheck(value.dmarc);
  return {
    spf: toRecordCheck(value.spf),
    dkim: rowsOf(value.dkim).flatMap((row) => {
      const check = toRecordCheck(row);
      const selector = textOrNull(row.selector);
      return check && selector ? [{ ...check, selector }] : [];
    }),
    dmarc:
      dmarc && isRow(value.dmarc)
        ? { ...dmarc, policy: textOrNull(value.dmarc.policy) }
        : null,
    mx: toRecordCheck(value.mx),
  };
}

export function toDomain(value: unknown): Domain | null {
  if (!isRow(value)) {
    return null;
  }
  const row: Row = value;
  const id = textOrNull(row.id);
  const domain = textOrNull(row.domain);
  if (!id || !domain) {
    return null;
  }
  return {
    id,
    domain,
    status: statuses.find((item) => item === row.status) ?? "pending",
    dkimSelectors: textsOf(row.dkimSelectors),
    checks: toChecks(row.checks),
    inconclusive: textsOf(row.inconclusive).flatMap((item) => {
      const kind = recordKinds.find((known) => known === item);
      return kind ? [kind] : [];
    }),
    suggestedSelectors: textsOf(row.suggestedSelectors),
    lastCheckedAt: textOrNull(row.lastCheckedAt),
    statusChangedAt: textOrNull(row.statusChangedAt),
    createdAt: textOrNull(row.createdAt) ?? "",
    sources: rowsOf(row.sources).flatMap((source) => {
      const sourceId = textOrNull(source.id);
      const name = textOrNull(source.name);
      return sourceId && name
        ? [
            {
              id: sourceId,
              name,
              integrationType: textOrNull(source.integrationType) ?? "",
            },
          ]
        : [];
    }),
  };
}

export function toDomains(value: unknown): Domain[] | null {
  if (!isRow(value) || !Array.isArray(value.domains)) {
    return null;
  }
  return rowsOf(value.domains).flatMap((item) => {
    const domain = toDomain(item);
    return domain ? [domain] : [];
  });
}

export function toSuggestions(value: unknown): string[] {
  return isRow(value) ? textsOf(value.domains) : [];
}

export function normalizeSelector(raw: string) {
  return raw.trim().toLowerCase();
}

export function isSelector(value: string) {
  return (
    value.length <= 63 &&
    value.split(".").every((label) => selectorPattern.test(label))
  );
}

export function checklistOf(domain: Domain): ChecklistItem[] {
  const { checks, inconclusive } = domain;
  const stale = (kind: RecordKind) => inconclusive.includes(kind);
  return [
    {
      key: "spf",
      kind: "spf",
      selector: null,
      check: checks?.spf ?? null,
      host: domain.domain,
      stale: stale("spf"),
    },
    ...domain.dkimSelectors.map(
      (selector): ChecklistItem => ({
        key: `dkim:${selector}`,
        kind: "dkim",
        selector,
        check: checks?.dkim.find((item) => item.selector === selector) ?? null,
        host: `${selector}._domainkey.${domain.domain}`,
        stale: stale("dkim"),
      }),
    ),
    {
      key: "dmarc",
      kind: "dmarc",
      selector: null,
      check: checks?.dmarc ?? null,
      host: `_dmarc.${domain.domain}`,
      stale: stale("dmarc"),
    },
    {
      key: "mx",
      kind: "mx",
      selector: null,
      check: checks?.mx ?? null,
      host: domain.domain,
      stale: stale("mx"),
    },
  ];
}

export function dkimSummary(domain: Domain): RecordStatus | "none" | "unknown" {
  if (domain.dkimSelectors.length === 0) {
    return "none";
  }
  const found = domain.dkimSelectors.map(
    (selector) =>
      domain.checks?.dkim.find((item) => item.selector === selector)?.status ??
      null,
  );
  for (const status of ["fail", "missing"] as const) {
    if (found.includes(status)) {
      return status;
    }
  }
  if (found.includes(null)) {
    return "unknown";
  }
  return found.includes("warning") ? "warning" : "pass";
}
