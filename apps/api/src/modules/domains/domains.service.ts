import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import { apiError } from "../../common/api-error";
import { isUuid } from "../../common/uuid";
import {
  type SendingSourceDto,
  SendingSourcesService,
} from "../integrations/sending-sources.service";
import { type DnsResolver, LookupSession } from "./dns-resolver";
import {
  type DkimCheck,
  type DmarcCheck,
  type DomainCheckResult,
  type DomainStatus,
  type RecordCheck,
  type RecordKind,
  type RecordStatus,
  rollUpStatus,
  runDomainChecks,
} from "./domain-checker";
import { parseDomainName, parseSelector } from "./domain-name";
import {
  checkConcurrency,
  claimBatchSize,
  claimLeaseMs,
  DNS_RESOLVER,
  failingRecheckMs,
  healthyRecheckMs,
  inconclusiveRecheckMs,
  maxClaimBatchesPerRun,
  maxDomainsPerWorkspace,
  maxSelectorLength,
  maxSelectors,
} from "./domains.constants";
import { DomainCheckLimiter } from "./domains.rate-limiter";
import {
  type DomainRow,
  DomainsRepository,
  type StoredChecks,
} from "./domains.repository";

export type DomainSource = {
  id: string;
  name: string;
  integrationType: string;
};

export type DomainDto = {
  id: string;
  domain: string;
  status: DomainStatus;
  dkimSelectors: string[];
  checks: {
    spf: RecordCheck | null;
    dkim: DkimCheck[];
    dmarc: DmarcCheck | null;
    mx: RecordCheck | null;
  } | null;
  inconclusive: RecordKind[];
  suggestedSelectors: string[];
  lastCheckedAt: string | null;
  statusChangedAt: string | null;
  createdAt: string;
  sources: DomainSource[];
};

export type DomainActor = { workspaceId: string; userId: string | null };

export type DomainCheckScope = { workspaceIds?: string[] };

const statuses: DomainStatus[] = ["pending", "verified", "warning", "failing"];
const recordStatuses: RecordStatus[] = ["pass", "warning", "fail", "missing"];
const recordKinds: RecordKind[] = ["spf", "dkim", "dmarc", "mx"];

const personalMailboxDomains = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "ymail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "gmx.net",
  "mail.com",
  "zoho.com",
  "yandex.com",
  "fastmail.com",
]);

function validation(message: string, field: string) {
  return apiError(HttpStatus.BAD_REQUEST, "validation", message, field);
}

function notFound() {
  return apiError(
    HttpStatus.NOT_FOUND,
    "not_found",
    "This domain was not found. It may have been removed.",
  );
}

function parseSelectors(value: unknown) {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw validation(
      "dkimSelectors must be a list of selectors.",
      "dkimSelectors",
    );
  }
  const selectors: string[] = [];
  for (const item of value) {
    const selector = parseSelector(item, maxSelectorLength);
    if (!selector) {
      throw validation(
        "A DKIM selector can only contain letters, digits, hyphens and dots, for example google or selector1.",
        "dkimSelectors",
      );
    }
    if (!selectors.includes(selector)) {
      selectors.push(selector);
    }
  }
  if (selectors.length > maxSelectors) {
    throw validation(
      `Keep to ${maxSelectors} DKIM selectors or fewer.`,
      "dkimSelectors",
    );
  }
  return selectors;
}

function texts(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function textOrNull(value: unknown) {
  return typeof value === "string" ? value : null;
}

function toRecordCheck(value: unknown): RecordCheck | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const row = value as Record<string, unknown>;
  const status = recordStatuses.find((item) => item === row.status);
  if (!status || typeof row.host !== "string") {
    return null;
  }
  return {
    status,
    host: row.host,
    found: texts(row.found),
    expected: textOrNull(row.expected),
    code: textOrNull(row.code),
    message: textOrNull(row.message) ?? "",
  };
}

export function readStoredChecks(
  stored: unknown,
  selectors: string[],
): DomainCheckResult | null {
  if (typeof stored !== "object" || stored === null) {
    return null;
  }
  const row = stored as Record<string, unknown>;
  const dmarc = toRecordCheck(row.dmarc);
  const dmarcRow = (row.dmarc ?? {}) as Record<string, unknown>;
  const dkim = (Array.isArray(row.dkim) ? row.dkim : []).flatMap(
    (item): DkimCheck[] => {
      const check = toRecordCheck(item);
      const selector = (item as { selector?: unknown } | null)?.selector;
      return check &&
        typeof selector === "string" &&
        selectors.includes(selector)
        ? [{ ...check, selector }]
        : [];
    },
  );
  return {
    spf: toRecordCheck(row.spf),
    dkim,
    dmarc: dmarc ? { ...dmarc, policy: textOrNull(dmarcRow.policy) } : null,
    mx: toRecordCheck(row.mx),
    inconclusive: texts(row.inconclusive).flatMap((item) => {
      const kind = recordKinds.find((known) => known === item);
      return kind ? [kind] : [];
    }),
    suggestedSelectors:
      selectors.length === 0 ? texts(row.suggestedSelectors) : [],
  };
}

function emailDomain(email: string | null) {
  const at = email ? email.lastIndexOf("@") : -1;
  return email && at > 0
    ? email
        .slice(at + 1)
        .trim()
        .toLowerCase()
    : null;
}

export function sourceDomains(source: SendingSourceDto) {
  const names = [
    emailDomain(source.email),
    ...(source.details.domains ?? []).map((domain) =>
      domain.name.trim().toLowerCase(),
    ),
  ];
  return [...new Set(names.filter((name): name is string => !!name))];
}

function sourcesOf(domain: string, sources: SendingSourceDto[]) {
  return sources.filter((source) => sourceDomains(source).includes(domain));
}

function nextCheckDelay(status: DomainStatus, inconclusive: boolean) {
  if (inconclusive) {
    return inconclusiveRecheckMs;
  }
  return status === "failing" || status === "pending"
    ? failingRecheckMs
    : healthyRecheckMs;
}

@Injectable()
export class DomainsService {
  private readonly logger = new Logger(DomainsService.name);

  constructor(
    @Inject(DomainsRepository) private readonly repository: DomainsRepository,
    @Inject(SendingSourcesService)
    private readonly sources: SendingSourcesService,
    @Inject(DomainCheckLimiter) private readonly limiter: DomainCheckLimiter,
    @Inject(DNS_RESOLVER) private readonly resolver: DnsResolver,
  ) {}

  async list(workspaceId: string) {
    const [rows, sources] = await Promise.all([
      this.repository.list(workspaceId),
      this.listSources(workspaceId),
    ]);
    return { domains: rows.map((row) => this.toDto(row, sources)) };
  }

  async get(workspaceId: string, id: string) {
    const [row, sources] = await Promise.all([
      this.require(workspaceId, id),
      this.listSources(workspaceId),
    ]);
    return this.toDto(row, sources);
  }

  async create(
    actor: DomainActor,
    input: { domain: unknown; dkimSelectors: unknown },
  ) {
    const parsed = parseDomainName(input.domain);
    if (!parsed.ok) {
      throw validation(parsed.message, "domain");
    }
    const selectors = parseSelectors(input.dkimSelectors);
    if (
      (await this.repository.count(actor.workspaceId)) >= maxDomainsPerWorkspace
    ) {
      throw apiError(
        HttpStatus.CONFLICT,
        "domain_limit_reached",
        `A workspace can have up to ${maxDomainsPerWorkspace} domains. Remove one you no longer use.`,
      );
    }
    const inserted = await this.repository.insert(actor.workspaceId, {
      domain: parsed.domain,
      dkimSelectors: selectors,
      createdByUserId: actor.userId,
    });
    if (!inserted.ok) {
      throw apiError(
        HttpStatus.CONFLICT,
        "domain_taken",
        "This domain is already in the workspace.",
        "domain",
      );
    }
    const sources = await this.listSources(actor.workspaceId);
    const checked = await this.tryCheck(inserted.row, sources);
    return this.toDto(checked ?? inserted.row, sources);
  }

  async update(
    workspaceId: string,
    id: string,
    input: { dkimSelectors: unknown },
  ) {
    if (input.dkimSelectors === undefined || input.dkimSelectors === null) {
      throw validation("Send the DKIM selectors to save.", "dkimSelectors");
    }
    const selectors = parseSelectors(input.dkimSelectors);
    await this.require(workspaceId, id);
    const row = await this.repository.updateSelectors(
      workspaceId,
      id,
      selectors,
    );
    if (!row) {
      throw notFound();
    }
    const sources = await this.listSources(workspaceId);
    if (await this.limiter.take(id)) {
      const checked = await this.tryCheck(row, sources);
      if (checked) {
        return this.toDto(checked, sources);
      }
    }
    const stored = readStoredChecks(row.checks, selectors);
    const now = new Date();
    const saved = stored
      ? await this.repository.saveCheck(workspaceId, id, {
          status: rollUpStatus(stored, selectors),
          checks: stored as StoredChecks,
          checkedAt: null,
          changedAt: now,
          nextCheckAt: now,
        })
      : null;
    if (!saved) {
      await this.repository.scheduleCheck(workspaceId, id, now);
    }
    return this.toDto(saved ?? row, sources);
  }

  async check(workspaceId: string, id: string) {
    const row = await this.require(workspaceId, id);
    if (!(await this.limiter.take(id))) {
      const seconds = await this.limiter.retryAfterSeconds(id);
      throw apiError(
        HttpStatus.TOO_MANY_REQUESTS,
        "rate_limited",
        `This domain was checked a moment ago. DNS changes take a little while to show, so try again in ${seconds} ${seconds === 1 ? "second" : "seconds"}.`,
      );
    }
    const sources = await this.listSources(workspaceId);
    const checked = await this.runCheck(row, sources);
    if (!checked) {
      throw notFound();
    }
    return this.toDto(checked, sources);
  }

  async remove(workspaceId: string, id: string) {
    if (!isUuid(id) || !(await this.repository.delete(workspaceId, id))) {
      throw notFound();
    }
    await this.limiter.clear(id);
  }

  async suggestions(workspaceId: string) {
    const [added, sources] = await Promise.all([
      this.repository.listNames(workspaceId),
      this.listSources(workspaceId),
    ]);
    const taken = new Set(added);
    const domains = new Set<string>();
    for (const source of sources) {
      for (const name of sourceDomains(source)) {
        const parsed = parseDomainName(name);
        if (
          parsed.ok &&
          !taken.has(parsed.domain) &&
          !personalMailboxDomains.has(parsed.domain)
        ) {
          domains.add(parsed.domain);
        }
      }
    }
    return { domains: [...domains].sort() };
  }

  async failing(workspaceId: string) {
    const rows = await this.repository.listFailing(workspaceId);
    return rows.map((row) => ({ id: row.id, name: row.domain }));
  }

  async runDue(now = new Date(), scope: DomainCheckScope = {}) {
    const sourcesByWorkspace = new Map<string, Promise<SendingSourceDto[]>>();
    const sourcesFor = (workspaceId: string) => {
      const known = sourcesByWorkspace.get(workspaceId);
      if (known) {
        return known;
      }
      const loading = this.listSources(workspaceId);
      sourcesByWorkspace.set(workspaceId, loading);
      return loading;
    };
    let checked = 0;
    let failed = 0;
    for (let batch = 0; batch < maxClaimBatchesPerRun; batch += 1) {
      const rows = await this.repository.claimDue(
        now,
        new Date(now.getTime() + claimLeaseMs),
        claimBatchSize,
        scope.workspaceIds,
      );
      if (rows.length === 0) {
        break;
      }
      const queue = [...rows];
      const work = async () => {
        for (let row = queue.shift(); row; row = queue.shift()) {
          const saved = await this.tryCheck(
            row,
            await sourcesFor(row.workspaceId),
            now,
          );
          if (saved) {
            checked += 1;
          } else {
            failed += 1;
          }
        }
      };
      await Promise.all(Array.from({ length: checkConcurrency }, work));
      if (rows.length < claimBatchSize) {
        break;
      }
    }
    return { checked, failed };
  }

  private async listSources(workspaceId: string) {
    return (await this.sources.list(workspaceId)).sources;
  }

  private async require(workspaceId: string, id: string) {
    const row = isUuid(id) ? await this.repository.find(workspaceId, id) : null;
    if (!row) {
      throw notFound();
    }
    return row;
  }

  private async tryCheck(
    row: DomainRow,
    sources: SendingSourceDto[],
    now?: Date,
  ) {
    try {
      return await this.runCheck(row, sources, now);
    } catch (error) {
      this.logger.warn(
        `The DNS check for domain ${row.id} did not finish: ${error instanceof Error ? error.message : "unknown error"}`,
      );
      return null;
    }
  }

  private async runCheck(
    row: DomainRow,
    sources: SendingSourceDto[],
    now = new Date(),
  ) {
    const selectors = row.dkimSelectors;
    const used = sourcesOf(row.domain, sources);
    const result = await runDomainChecks(new LookupSession(this.resolver), {
      domain: row.domain,
      selectors,
      previous: readStoredChecks(row.checks, selectors),
      context: {
        integrationTypes: [
          ...new Set(used.map((source) => source.integrationType)),
        ],
        reportEmail: row.createdByUserId
          ? await this.repository.findUserEmail(row.createdByUserId)
          : null,
      },
    });
    const status = rollUpStatus(result, selectors);
    return this.repository.saveCheck(row.workspaceId, row.id, {
      status,
      checks: result as StoredChecks,
      checkedAt: now,
      changedAt: now,
      nextCheckAt: new Date(
        now.getTime() + nextCheckDelay(status, result.inconclusive.length > 0),
      ),
    });
  }

  private toDto(row: DomainRow, sources: SendingSourceDto[]): DomainDto {
    const stored = readStoredChecks(row.checks, row.dkimSelectors);
    return {
      id: row.id,
      domain: row.domain,
      status: statuses.find((status) => status === row.status) ?? "pending",
      dkimSelectors: row.dkimSelectors,
      checks: stored
        ? {
            spf: stored.spf,
            dkim: stored.dkim,
            dmarc: stored.dmarc,
            mx: stored.mx,
          }
        : null,
      inconclusive: stored?.inconclusive ?? [],
      suggestedSelectors: stored?.suggestedSelectors ?? [],
      lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
      statusChangedAt: row.statusChangedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      sources: sourcesOf(row.domain, sources).map((source) => ({
        id: source.id,
        name: source.name,
        integrationType: source.integrationType,
      })),
    };
  }
}
