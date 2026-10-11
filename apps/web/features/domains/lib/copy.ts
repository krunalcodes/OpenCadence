import type {
  DomainStatus,
  RecordKind,
  RecordStatus,
} from "@/features/domains/lib/domains";

type Tone = "success" | "warning" | "danger" | "neutral";

const domainStatuses: Record<DomainStatus, { label: string; tone: Tone }> = {
  pending: { label: "Not checked yet", tone: "neutral" },
  verified: { label: "Verified", tone: "success" },
  warning: { label: "Needs attention", tone: "warning" },
  failing: { label: "Failing", tone: "danger" },
};

const recordStatuses: Record<RecordStatus, { label: string; tone: Tone }> = {
  pass: { label: "Passing", tone: "success" },
  warning: { label: "Needs attention", tone: "warning" },
  fail: { label: "Failing", tone: "danger" },
  missing: { label: "Not found", tone: "danger" },
};

const recordNames: Record<RecordKind, string> = {
  spf: "SPF",
  dkim: "DKIM",
  dmarc: "DMARC",
  mx: "MX",
};

const recordPurposes: Record<RecordKind, string> = {
  spf: "Lists the servers that are allowed to send mail for this domain.",
  dkim: "Publishes the key receivers use to confirm a message was not changed and really comes from you.",
  dmarc:
    "Tells receivers what to do with mail that fails SPF and DKIM, and where to send reports.",
  mx: "Says where mail to this domain is delivered, so replies and bounce notices can reach you.",
};

const recordTypes: Record<RecordKind, string> = {
  spf: "TXT",
  dkim: "TXT or CNAME",
  dmarc: "TXT",
  mx: "MX",
};

const summaries: Record<DomainStatus, string> = {
  pending:
    "The records have not been read yet. Check again in a moment to see where this domain stands.",
  verified:
    "SPF, DKIM and DMARC are in place. Mail from this domain can be authenticated by receivers.",
  warning:
    "Mail from this domain can be sent, but one or more records should be improved to protect delivery.",
  failing:
    "Receivers cannot fully authenticate mail from this domain, so it is more likely to land in spam or be rejected. Fix the records marked below.",
};

export const copy = {
  title: "Domains",
  description:
    "The domains you send from, and whether their SPF, DKIM and DMARC records let receivers trust your mail. Records are checked again every day, and every hour while something is failing.",
  add: "Add domain",
  columns: {
    domain: "Domain",
    status: "Status",
    records: "Records",
    checked: "Last checked",
    actions: "Actions",
  },
  days: { today: "Today", yesterday: "Yesterday" },
  at: (day: string, time: string) => `${day}, ${time}`,
  neverChecked: "Not checked yet",
  status: (status: DomainStatus) => domainStatuses[status],
  recordStatus: (status: RecordStatus) => recordStatuses[status],
  recordName: (kind: RecordKind) => recordNames[kind],
  recordPurpose: (kind: RecordKind) => recordPurposes[kind],
  recordType: (kind: RecordKind) => recordTypes[kind],
  recordMark: (name: string, state: string) => `${name}: ${state}`,
  dkimNone: "No selector",
  unknown: "Not checked",
  sourcesLine: (names: string[]) =>
    names.length === 0
      ? "No connected source sends from this domain"
      : `Used by ${names.join(", ")}`,
  actionsFor: (domain: string) => `Actions for ${domain}`,
  menu: {
    open: "Open checklist",
    remove: "Remove",
  },
  emptyTitle: "No domains yet",
  emptyBody:
    "Add the domain in your From address to see whether its DNS records are set up for sending, and exactly what to add if they are not.",
  suggestionsTitle: "Your sources send from these domains",
  addSuggested: (domain: string) => `Add ${domain}`,
  loadFailed: {
    title: "Could not load your domains.",
    body: "The server did not answer. Check that the API is running, then try again.",
    retry: "Try again",
  },
  sheet: {
    title: "Add domain",
    description:
      "Enter the domain you send from. Nothing changes in your DNS: OpenCadence only reads the public records and tells you what is missing.",
    domain: "Domain",
    domainPlaceholder: "example.com",
    domainHint:
      "The part after the @ in your From address. Subdomains such as mail.example.com are added separately.",
    domainMissing: "Enter the domain you send from, for example example.com.",
    suggestions: "Used by your sources",
    selectors: "DKIM selectors",
    optional: "Optional",
    selectorsPlaceholder: "google, selector1",
    selectorsHint:
      "The name your email provider gave the DKIM key. Leave this empty if you are not sure: common selectors are looked up for you.",
    selectorsInvalid:
      "A selector can only contain letters, digits, hyphens and dots.",
    selectorList: "DKIM selectors to check",
    removeSelector: (selector: string) => `Remove ${selector}`,
    create: "Add and check",
    cancel: "Cancel",
  },
  deleteDialog: {
    title: (domain: string) => `Remove ${domain}?`,
    body: "OpenCadence stops checking this domain. Your DNS records and your sending are not changed.",
    confirm: "Remove domain",
    cancel: "Cancel",
  },
  detail: {
    back: "Domains",
    check: "Check again",
    remove: "Remove domain",
    more: "More actions",
    lastChecked: (when: string) => `Last checked ${when}`,
    summary: (status: DomainStatus) => summaries[status],
    checklistTitle: "DNS records",
    checklistDescription:
      "Add or change these at the company where your domain's DNS is managed. Changes often show within minutes, but can take longer.",
    found: "Found in DNS",
    foundNothing: "Nothing is published at this host.",
    add: "Add this record",
    change: "Change the record to",
    where: "Where the record goes",
    host: "Host",
    type: "Type",
    value: "Value",
    hostHint:
      "If your DNS provider adds the domain for you, enter only the part before it.",
    valueFromProvider:
      "The value is specific to your account, so copy it from your email provider.",
    notChecked: "Not checked yet",
    notCheckedBody:
      "This record has not been read yet. It is looked up on the next check.",
    stale:
      "The last lookup got no answer from DNS, so this is the earlier result. It is tried again in a few minutes.",
    staleBanner:
      "DNS did not answer for some records on the last check. Their earlier results are kept and the check is repeated in a few minutes.",
    selectorTitle: (selector: string) => `DKIM, selector ${selector}`,
    policy: (policy: string) => `Policy: ${policy}`,
    noSelectorsTitle: "DKIM is not being checked",
    noSelectorsBody:
      "Add the selector your email provider uses for this domain. Without one, the domain cannot be shown as verified.",
    copy: (label: string) => `Copy ${label.toLowerCase()}`,
    copied: (label: string) => `${label} copied`,
  },
  selectors: {
    title: "DKIM selectors",
    description:
      "The names of the DKIM keys to look up. Your email provider shows the selector where you set up DKIM.",
    label: "Selectors",
    placeholder: "google, selector1",
    list: "DKIM selectors to check",
    remove: (selector: string) => `Remove ${selector}`,
    invalid: "A selector can only contain letters, digits, hyphens and dots.",
    overflow: "A domain can have up to 10 selectors.",
    save: "Save and check",
    saved: "Selectors saved",
    foundTitle: "Keys found at these selectors",
    foundBody: "Add the ones your email provider set up.",
    addFound: (selector: string) => `Add ${selector}`,
  },
  sources: {
    title: "Sends from this domain",
    description: "Connected sources with an address on this domain.",
    none: "No connected source sends from this domain yet.",
    manage: "Open sources",
  },
  unavailable: {
    missingTitle: "This domain was not found.",
    missingBody: "It may have been removed.",
    failedTitle: "Could not load this domain.",
    failedBody:
      "The server did not answer. Check that the API is running, then try again.",
    retry: "Try again",
  },
  toasts: {
    created: (domain: string) => `${domain} was added`,
    createFailed: "Could not add the domain",
    checked: (domain: string) => `${domain} was checked`,
    checkedStale: "DNS did not answer for every record",
    checkedStaleBody:
      "The earlier results are kept for those records. The check is repeated in a few minutes.",
    checkFailed: "Could not check the domain",
    saveFailed: "Could not save the selectors",
    deleted: (domain: string) => `${domain} was removed`,
    deleteFailed: (domain: string) => `Could not remove ${domain}`,
  },
  clipboard: {
    failed: "Could not copy",
    failedBody: "Select the text and copy it by hand.",
  },
  errors: {
    network:
      "The server did not answer. Check your connection and that the API is running.",
    signedOut:
      "You are signed out or have no active workspace. Reload the page and sign in again.",
    fallback: "Nothing was changed. Try again in a moment.",
  },
};

type Failure = { status: number; code: string; message: string | null };

export function describeError(error: Failure) {
  if (error.status === 0) {
    return copy.errors.network;
  }
  if (error.status === 401) {
    return copy.errors.signedOut;
  }
  return error.message ?? copy.errors.fallback;
}
