export const DOMAIN_CHECKS_QUEUE = "domain-checks";

export const DNS_RESOLVER = Symbol("DNS_RESOLVER");

export const domainCheckJobs = { runDue: "run-due" } as const;

export const minuteMs = 60 * 1000;
export const hourMs = 60 * minuteMs;
export const dayMs = 24 * hourMs;

export const runDueEveryMs = 5 * minuteMs;
export const healthyRecheckMs = dayMs;
export const failingRecheckMs = hourMs;
export const inconclusiveRecheckMs = 10 * minuteMs;
export const claimLeaseMs = 15 * minuteMs;
export const claimBatchSize = 20;
export const maxClaimBatchesPerRun = 10;
export const checkConcurrency = 4;

export const manualCheckWindowMs = 30 * 1000;

export const lookupTimeoutMs = 3000;
export const lookupTries = 2;
export const checkDeadlineMs = 15 * 1000;
export const maxLookupsPerCheck = 60;

export const spfLookupLimit = 10;
export const spfDepthLimit = 10;
export const dmarcParentLimit = 4;

export const maxDomainsPerWorkspace = 200;
export const maxSelectors = 10;
export const maxSelectorLength = 63;
export const maxFoundRecords = 5;
export const maxFoundLength = 1200;

export const probedSelectors = [
  "google",
  "selector1",
  "selector2",
  "resend",
  "default",
  "s1",
  "k1",
];
