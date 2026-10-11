import {
  cleanText,
  isDmarcRecord,
  isSpfRecord,
  parseDkim,
  parseDmarc,
  parseSpf,
} from "./dns-records";
import type { DnsAnswer, DnsResolver } from "./dns-resolver";
import {
  normalizeLookupName,
  parentDomains,
  sameOrSubdomain,
} from "./domain-name";
import {
  dmarcParentLimit,
  maxFoundLength,
  maxFoundRecords,
  probedSelectors,
  spfDepthLimit,
  spfLookupLimit,
} from "./domains.constants";

export type RecordStatus = "pass" | "warning" | "fail" | "missing";

export type RecordKind = "spf" | "dkim" | "dmarc" | "mx";

export type DomainStatus = "pending" | "verified" | "warning" | "failing";

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

export type DomainCheckResult = {
  spf: RecordCheck | null;
  dkim: DkimCheck[];
  dmarc: DmarcCheck | null;
  mx: RecordCheck | null;
  inconclusive: RecordKind[];
  suggestedSelectors: string[];
};

export type CheckContext = {
  integrationTypes: string[];
  reportEmail: string | null;
};

export type CheckInput = {
  domain: string;
  selectors: string[];
  previous: DomainCheckResult | null;
  context: CheckContext;
};

type Outcome<T> = { kind: "done"; check: T } | { kind: "inconclusive" };

const googleInclude = "_spf.google.com";
const spfNeutralTypes = new Set(["resend"]);

function found(records: string[]) {
  return records
    .slice(0, maxFoundRecords)
    .map((record) => cleanText(record, maxFoundLength));
}

function done<T>(check: T): Outcome<T> {
  return { kind: "done", check };
}

const inconclusive = { kind: "inconclusive" } as const;

function uses(context: CheckContext, type: string) {
  return context.integrationTypes.includes(type);
}

function spfProviderNote(context: CheckContext) {
  if (uses(context, "resend")) {
    return " Resend authenticates mail with its own records on a subdomain: copy them from the Domains page of your Resend dashboard.";
  }
  return "";
}

function suggestedSpf(context: CheckContext) {
  const types = context.integrationTypes;
  const known =
    types.length > 0 &&
    types.every((type) => type === "gmail" || spfNeutralTypes.has(type));
  return known && uses(context, "gmail")
    ? `v=spf1 include:${googleInclude} ~all`
    : null;
}

export function withSpfInclude(record: string, include: string) {
  const terms = record.trim().split(/\s+/);
  const index = terms.findIndex(
    (term, position) =>
      position > 0 && (/^[+\-~?]?all$/i.test(term) || /^redirect=/i.test(term)),
  );
  const addition = `include:${include}`;
  if (index === -1) {
    return [...terms, addition].join(" ");
  }
  return [...terms.slice(0, index), addition, ...terms.slice(index)].join(" ");
}

export function reportAddress(domain: string, email: string | null) {
  const address = (email ?? "").trim().toLowerCase();
  const at = address.lastIndexOf("@");
  const emailDomain = at > 0 ? address.slice(at + 1) : "";
  if (
    emailDomain.includes(".") &&
    /^[^\s@;,!]+$/.test(address.slice(0, at)) &&
    (sameOrSubdomain(emailDomain, domain) ||
      sameOrSubdomain(domain, emailDomain))
  ) {
    return address;
  }
  return `dmarc@${domain}`;
}

type SpfWalk = {
  lookups: number;
  includes: Set<string>;
  problem:
    | "invalid"
    | "include_loop"
    | "include_missing"
    | "too_many_lookups"
    | null;
  inconclusive: boolean;
};

type SpfAll = "+" | "-" | "~" | "?" | null;

function spfRecords(answer: DnsAnswer<string>) {
  return answer.kind === "records" ? answer.records.filter(isSpfRecord) : [];
}

async function walkSpf(
  resolver: DnsResolver,
  record: string,
  path: string[],
  walk: SpfWalk,
): Promise<SpfAll> {
  const parsed = parseSpf(record);
  if (!parsed) {
    walk.problem ??= "invalid";
    return null;
  }
  const stop = () => walk.problem !== null || walk.inconclusive;

  async function follow(target: string): Promise<SpfAll | "skipped"> {
    walk.lookups += 1;
    if (walk.lookups > spfLookupLimit) {
      walk.problem ??= "too_many_lookups";
      return "skipped";
    }
    if (target.includes("%")) {
      return "skipped";
    }
    const name = normalizeLookupName(target);
    if (!name) {
      walk.problem ??= "invalid";
      return "skipped";
    }
    walk.includes.add(name);
    if (path.includes(name)) {
      walk.problem ??= "include_loop";
      return "skipped";
    }
    if (path.length >= spfDepthLimit) {
      walk.problem ??= "too_many_lookups";
      return "skipped";
    }
    const answer = await resolver.txt(name);
    if (answer.kind === "error") {
      walk.inconclusive = true;
      return "skipped";
    }
    const records = spfRecords(answer);
    const [only] = records;
    if (records.length !== 1 || only === undefined) {
      walk.problem ??= "include_missing";
      return "skipped";
    }
    return walkSpf(resolver, only, [...path, name], walk);
  }

  for (const term of parsed.terms) {
    if (stop()) {
      return null;
    }
    if (term.kind === "unknown") {
      walk.problem ??= "invalid";
      return null;
    }
    if (term.kind === "all") {
      return term.qualifier;
    }
    if (term.kind !== "mechanism") {
      continue;
    }
    if (term.name === "include") {
      await follow(term.value ?? "");
    } else if (
      term.name === "a" ||
      term.name === "mx" ||
      term.name === "ptr" ||
      term.name === "exists"
    ) {
      walk.lookups += 1;
      if (walk.lookups > spfLookupLimit) {
        walk.problem ??= "too_many_lookups";
      }
    }
  }
  if (stop()) {
    return null;
  }
  const redirect = parsed.terms.find((term) => term.kind === "redirect");
  if (redirect?.kind === "redirect") {
    const result = await follow(redirect.value);
    return result === "skipped" ? null : result;
  }
  return null;
}

async function checkSpf(
  resolver: DnsResolver,
  domain: string,
  context: CheckContext,
): Promise<Outcome<RecordCheck>> {
  const answer = await resolver.txt(domain);
  if (answer.kind === "error") {
    return inconclusive;
  }
  const records = spfRecords(answer);
  const base = { host: domain, found: found(records) };
  const [record] = records;
  if (record === undefined) {
    return done({
      ...base,
      status: "missing",
      expected: suggestedSpf(context),
      code: "spf_missing",
      message: `No SPF record was found. Add one TXT record at this host that starts with v=spf1, lists every service that sends mail for this domain, and ends in ~all.${spfProviderNote(context)}`,
    });
  }
  if (records.length > 1) {
    return done({
      ...base,
      status: "fail",
      expected: null,
      code: "spf_multiple",
      message: `This domain has ${records.length} SPF records, and receivers reject SPF when there is more than one. Merge them into a single TXT record and delete the others.`,
    });
  }
  const walk: SpfWalk = {
    lookups: 0,
    includes: new Set(),
    problem: null,
    inconclusive: false,
  };
  const all = await walkSpf(resolver, record, [domain], walk);
  if (walk.inconclusive) {
    return inconclusive;
  }
  if (walk.problem === "invalid") {
    return done({
      ...base,
      status: "fail",
      expected: null,
      code: "spf_invalid",
      message:
        "The SPF record, or one it includes, has a part that receivers cannot read. Check it for typos such as a missing colon or an unknown word.",
    });
  }
  if (walk.problem === "include_loop") {
    return done({
      ...base,
      status: "fail",
      expected: null,
      code: "spf_include_loop",
      message:
        "The SPF record includes a domain that includes it back, so receivers can never finish reading it. Remove the include that loops.",
    });
  }
  if (walk.problem === "include_missing") {
    return done({
      ...base,
      status: "fail",
      expected: null,
      code: "spf_include_missing",
      message:
        "The SPF record includes a domain that has no valid SPF record of its own, which makes the whole record fail. Remove or correct that include.",
    });
  }
  if (walk.problem === "too_many_lookups") {
    return done({
      ...base,
      status: "fail",
      expected: null,
      code: "spf_too_many_lookups",
      message: `Reading this SPF record takes more than ${spfLookupLimit} DNS lookups, and receivers stop at ${spfLookupLimit} and fail it. Remove includes for services you no longer use.`,
    });
  }
  if (all === "+") {
    return done({
      ...base,
      status: "fail",
      expected: null,
      code: "spf_allows_all",
      message:
        "The SPF record ends in +all, which lets anyone send as this domain. Change the ending to ~all or -all.",
    });
  }
  if (uses(context, "gmail") && !walk.includes.has(googleInclude)) {
    return done({
      ...base,
      status: "warning",
      expected: withSpfInclude(record, googleInclude),
      code: "spf_provider_not_included",
      message: `A Google mailbox sends from this domain, but the SPF record does not include ${googleInclude}. Add it to the existing record.`,
    });
  }
  if (all === "?") {
    return done({
      ...base,
      status: "warning",
      expected: null,
      code: "spf_neutral_all",
      message:
        "The SPF record ends in ?all, which tells receivers nothing about other senders. Change the ending to ~all or -all.",
    });
  }
  if (all === null) {
    return done({
      ...base,
      status: "warning",
      expected: null,
      code: "spf_no_all",
      message:
        "The SPF record has no all term at the end, so receivers treat other senders as neutral. End the record with ~all or -all.",
    });
  }
  return done({
    ...base,
    status: "pass",
    expected: null,
    code: null,
    message: `One SPF record that ends in ${all}all and needs ${walk.lookups} of the ${spfLookupLimit} DNS lookups receivers allow.`,
  });
}

function dkimGuidance(selector: string, context: CheckContext) {
  if (selector === "resend" && uses(context, "resend")) {
    return " Copy the DKIM record from the Domains page of your Resend dashboard.";
  }
  if (selector === "google" && uses(context, "gmail")) {
    return " Generate the key in the Google Admin console under Gmail, Authenticate email, then add it at this host.";
  }
  return " Your email provider shows the exact value where you set up DKIM for this domain.";
}

async function dkimRecords(resolver: DnsResolver, host: string) {
  const answer = await resolver.txt(host);
  if (answer.kind === "error") {
    return null;
  }
  const direct = answer.kind === "records" ? answer.records : [];
  const usable = direct.filter((record) => {
    const parsed = parseDkim(record);
    return parsed.ok || parsed.reason !== "not_dkim";
  });
  if (usable.length > 0) {
    return { records: usable, alias: null };
  }
  const cname = await resolver.cname(host);
  if (cname.kind === "error") {
    return null;
  }
  const target =
    cname.kind === "records"
      ? normalizeLookupName(cname.records[0] ?? "")
      : null;
  if (!target) {
    return { records: [], alias: null };
  }
  const aliased = await resolver.txt(target);
  if (aliased.kind === "error") {
    return null;
  }
  return {
    records: aliased.kind === "records" ? aliased.records : [],
    alias: target,
  };
}

async function checkDkim(
  resolver: DnsResolver,
  domain: string,
  selector: string,
  context: CheckContext,
): Promise<Outcome<DkimCheck>> {
  const host = `${selector}._domainkey.${domain}`;
  const result = await dkimRecords(resolver, host);
  if (!result) {
    return inconclusive;
  }
  const keys = result.records.filter((record) => {
    const parsed = parseDkim(record);
    return parsed.ok || parsed.reason !== "not_dkim";
  });
  const aliasLine = result.alias ? [`CNAME ${result.alias}`] : [];
  const base = {
    selector,
    host,
    found: found([...aliasLine, ...keys]),
    expected: null,
  };
  const [record] = keys;
  if (record === undefined) {
    return done({
      ...base,
      status: "missing",
      code: result.alias ? "dkim_alias_empty" : "dkim_missing",
      message: result.alias
        ? `This host points to ${result.alias}, but no DKIM key is published there yet. Finish the DKIM setup with your email provider, or correct the CNAME.`
        : `No DKIM key was found for the selector ${selector}. Add the TXT or CNAME record your email provider gives you at this host.${dkimGuidance(selector, context)}`,
    });
  }
  if (keys.length > 1) {
    return done({
      ...base,
      status: "warning",
      code: "dkim_multiple",
      message:
        "This host has more than one DKIM record, and receivers may pick either. Keep the current key and delete the others.",
    });
  }
  const key = parseDkim(record);
  if (!key.ok) {
    return done({
      ...base,
      status: "fail",
      code: key.reason === "revoked" ? "dkim_revoked" : "dkim_key_invalid",
      message:
        key.reason === "revoked"
          ? "This DKIM key is revoked: the record has an empty p= value, so mail signed with this selector fails. Publish the current key from your email provider, or remove the selector if it is no longer used."
          : "The public key in this record is not valid. Long keys are often cut off when pasted: copy the full value from your email provider again.",
    });
  }
  if (key.keyType === "rsa" && !key.readable) {
    return done({
      ...base,
      status: "fail",
      code: "dkim_key_invalid",
      message:
        "The public key in this record could not be read. Long keys are often cut off when pasted: copy the full value from your email provider again.",
    });
  }
  if (key.bits !== null && key.keyType === "rsa" && key.bits < 1024) {
    return done({
      ...base,
      status: "fail",
      code: "dkim_key_too_short",
      message: `This DKIM key is ${key.bits} bits, and receivers ignore keys under 1024 bits. Create a 2048 bit key with your email provider.`,
    });
  }
  if (key.bits !== null && key.keyType === "rsa" && key.bits < 2048) {
    return done({
      ...base,
      status: "warning",
      code: "dkim_key_weak",
      message: `This DKIM key is ${key.bits} bits. It works, but 2048 bits is the expected strength today. Create a 2048 bit key with your email provider when you can.`,
    });
  }
  if (key.testing) {
    return done({
      ...base,
      status: "warning",
      code: "dkim_testing",
      message:
        "This DKIM key is marked as in testing (t=y), so receivers may ignore its signatures. Remove the t=y flag when the setup is finished.",
    });
  }
  return done({
    ...base,
    status: "pass",
    code: null,
    message:
      key.bits !== null
        ? `A valid ${key.bits} bit ${key.keyType === "rsa" ? "RSA" : "Ed25519"} key is published for this selector.`
        : "A DKIM key is published for this selector.",
  });
}

function dmarcRecords(answer: DnsAnswer<string>) {
  return answer.kind === "records" ? answer.records.filter(isDmarcRecord) : [];
}

async function checkDmarc(
  resolver: DnsResolver,
  domain: string,
  context: CheckContext,
): Promise<Outcome<DmarcCheck>> {
  const ownHost = `_dmarc.${domain}`;
  const address = reportAddress(domain, context.reportEmail);
  const answer = await resolver.txt(ownHost);
  if (answer.kind === "error") {
    return inconclusive;
  }
  let host = ownHost;
  let records = dmarcRecords(answer);
  let inheritedFrom: string | null = null;
  if (records.length === 0) {
    for (const parent of parentDomains(domain, dmarcParentLimit)) {
      const parentAnswer = await resolver.txt(`_dmarc.${parent}`);
      if (parentAnswer.kind === "error") {
        return inconclusive;
      }
      const parentRecords = dmarcRecords(parentAnswer).filter((record) => {
        const parsed = parseDmarc(record);
        return !(parsed.ok && parsed.publicSuffix);
      });
      if (parentRecords.length > 0) {
        host = `_dmarc.${parent}`;
        records = parentRecords;
        inheritedFrom = parent;
        break;
      }
    }
  }
  const base = { host, found: found(records) };
  const [record] = records;
  if (record === undefined) {
    return done({
      ...base,
      status: "missing",
      policy: null,
      expected: `v=DMARC1; p=none; rua=mailto:${address}`,
      code: "dmarc_missing",
      message:
        "No DMARC record was found. Large mailbox providers expect one from every sender. Start with this record, which only asks for reports, send them to a mailbox on this domain that you read, and tighten the policy to quarantine or reject once the reports look right.",
    });
  }
  if (records.length > 1) {
    return done({
      ...base,
      status: "fail",
      policy: null,
      expected: null,
      code: "dmarc_multiple",
      message: `This host has ${records.length} DMARC records, and receivers ignore DMARC when there is more than one. Keep one and delete the others.`,
    });
  }
  const parsed = parseDmarc(record);
  if (!parsed.ok) {
    return done({
      ...base,
      status: "fail",
      policy: null,
      expected: null,
      code: "dmarc_invalid",
      message:
        "The DMARC record has no valid policy. It needs p=none, p=quarantine or p=reject right after v=DMARC1.",
    });
  }
  const policy = inheritedFrom
    ? (parsed.subdomainPolicy ?? parsed.policy)
    : parsed.policy;
  const inherited = inheritedFrom
    ? ` This domain has no DMARC record of its own and uses the one from ${inheritedFrom}.`
    : "";
  const noReports = parsed.rua.length === 0;
  const withReports =
    noReports && !inheritedFrom
      ? `${record.trim().replace(/[;\s]+$/, "")}; rua=mailto:${address}`
      : null;
  if (policy === "none") {
    return done({
      ...base,
      status: "warning",
      policy,
      expected: withReports,
      code: noReports ? "dmarc_policy_none_no_rua" : "dmarc_policy_none",
      message: `The DMARC policy is none, so receivers only report and never stop forged mail. Bulk senders are expected to move to p=quarantine or p=reject once the reports show that your own mail passes.${noReports ? " The record also has no rua address, so no reports are sent to you." : ""}${inherited}`,
    });
  }
  if (noReports) {
    return done({
      ...base,
      status: "warning",
      policy,
      expected: withReports,
      code: "dmarc_no_rua",
      message: `The DMARC record has no rua address, so you get no reports when mail fails. Add a rua tag with a mailbox on this domain that you read.${inherited}`,
    });
  }
  return done({
    ...base,
    status: "pass",
    policy,
    expected: null,
    code: null,
    message: `The DMARC policy is ${policy} and reports are sent to you.${inherited}`,
  });
}

async function checkMx(
  resolver: DnsResolver,
  domain: string,
): Promise<Outcome<RecordCheck>> {
  const answer = await resolver.mx(domain);
  if (answer.kind === "error") {
    return inconclusive;
  }
  const records =
    answer.kind === "records"
      ? [...answer.records].sort((a, b) => a.priority - b.priority)
      : [];
  const real = records.filter((record) => {
    const exchange = record.exchange.replace(/\.$/, "");
    return exchange !== "";
  });
  const base = {
    host: domain,
    found: found(real.map((record) => `${record.priority} ${record.exchange}`)),
    expected: null,
  };
  if (real.length === 0) {
    return done({
      ...base,
      status: "warning",
      code: records.length > 0 ? "mx_null" : "mx_missing",
      message:
        records.length > 0
          ? "This domain publishes a null MX record, which says it accepts no mail. Replies and bounce notices to addresses on it will not arrive."
          : "This domain has no MX record, so it cannot receive mail. Replies and bounce notices to addresses on it will not arrive. Add the MX records of the mailbox provider that should receive them.",
    });
  }
  return done({
    ...base,
    status: "pass",
    code: null,
    message: "This domain can receive replies and bounce notices.",
  });
}

async function probeSelectors(resolver: DnsResolver, domain: string) {
  const results = await Promise.all(
    probedSelectors.map(async (selector) => {
      const answer = await resolver.txt(`${selector}._domainkey.${domain}`);
      return answer.kind === "records" &&
        answer.records.some((record) => parseDkim(record).ok)
        ? selector
        : null;
    }),
  );
  return results.filter((selector): selector is string => selector !== null);
}

export async function runDomainChecks(
  resolver: DnsResolver,
  input: CheckInput,
): Promise<DomainCheckResult> {
  const { domain, selectors, previous, context } = input;
  const [spf, dmarc, mx, dkim, suggested] = await Promise.all([
    checkSpf(resolver, domain, context),
    checkDmarc(resolver, domain, context),
    checkMx(resolver, domain),
    Promise.all(
      selectors.map(async (selector) => ({
        selector,
        outcome: await checkDkim(resolver, domain, selector, context),
      })),
    ),
    selectors.length === 0
      ? probeSelectors(resolver, domain)
      : Promise.resolve<string[]>([]),
  ]);
  const unresolved = new Set<RecordKind>();
  const keep = <T>(kind: RecordKind, outcome: Outcome<T>, before: T | null) => {
    if (outcome.kind === "done") {
      return outcome.check;
    }
    unresolved.add(kind);
    return before;
  };
  const dkimChecks = dkim.flatMap(({ selector, outcome }) => {
    const before =
      previous?.dkim.find((check) => check.selector === selector) ?? null;
    const check = keep("dkim", outcome, before);
    return check ? [check] : [];
  });
  return {
    spf: keep("spf", spf, previous?.spf ?? null),
    dkim: dkimChecks,
    dmarc: keep("dmarc", dmarc, previous?.dmarc ?? null),
    mx: keep("mx", mx, previous?.mx ?? null),
    inconclusive: [...unresolved],
    suggestedSelectors: suggested,
  };
}

function bad(check: RecordCheck | null) {
  return (
    check !== null && (check.status === "fail" || check.status === "missing")
  );
}

export function rollUpStatus(
  checks: Pick<DomainCheckResult, "spf" | "dkim" | "dmarc" | "mx">,
  selectors: string[],
): DomainStatus {
  const dkim = selectors.map(
    (selector) =>
      checks.dkim.find((check) => check.selector === selector) ?? null,
  );
  if (bad(checks.spf) || bad(checks.dmarc) || dkim.some(bad)) {
    return "failing";
  }
  if (
    checks.spf === null ||
    checks.dmarc === null ||
    dkim.some((check) => check === null)
  ) {
    return "pending";
  }
  const warns = [checks.spf, checks.dmarc, checks.mx, ...dkim].some(
    (check) => check !== null && check.status !== "pass",
  );
  return warns || selectors.length === 0 ? "warning" : "verified";
}
