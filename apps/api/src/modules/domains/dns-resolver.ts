import { Resolver } from "node:dns/promises";
import { Injectable } from "@nestjs/common";
import {
  checkDeadlineMs,
  lookupTimeoutMs,
  lookupTries,
  maxLookupsPerCheck,
} from "./domains.constants";

export type DnsAnswer<T> =
  | { kind: "records"; records: T[] }
  | { kind: "missing" }
  | { kind: "error" };

export type MxRecord = { priority: number; exchange: string };

export interface DnsResolver {
  txt(name: string): Promise<DnsAnswer<string>>;
  cname(name: string): Promise<DnsAnswer<string>>;
  mx(name: string): Promise<DnsAnswer<MxRecord>>;
}

const missingCodes = new Set(["ENOTFOUND", "ENODATA", "NXDOMAIN"]);

function errorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : "";
}

function failure<T>(error: unknown): DnsAnswer<T> {
  return missingCodes.has(errorCode(error))
    ? { kind: "missing" }
    : { kind: "error" };
}

function answer<T>(records: T[]): DnsAnswer<T> {
  return records.length > 0
    ? { kind: "records", records }
    : { kind: "missing" };
}

export function joinTxtChunks(records: unknown): string[] {
  if (!Array.isArray(records)) {
    return [];
  }
  return records.map((chunks) =>
    Array.isArray(chunks)
      ? chunks.map((chunk) => String(chunk)).join("")
      : String(chunks),
  );
}

@Injectable()
export class SystemDnsResolver implements DnsResolver {
  private async ask<R, T>(
    run: (resolver: Resolver) => Promise<R>,
    map: (result: R) => T[],
  ): Promise<DnsAnswer<T>> {
    const resolver = new Resolver({
      timeout: lookupTimeoutMs,
      tries: lookupTries,
    });
    let timer: NodeJS.Timeout | undefined;
    const guard = new Promise<DnsAnswer<T>>((resolve) => {
      timer = setTimeout(
        () => {
          resolver.cancel();
          resolve({ kind: "error" });
        },
        lookupTimeoutMs * lookupTries + 500,
      );
    });
    try {
      return await Promise.race([
        run(resolver).then(
          (result) => answer(map(result)),
          (error) => failure<T>(error),
        ),
        guard,
      ]);
    } catch {
      return { kind: "error" };
    } finally {
      clearTimeout(timer);
    }
  }

  txt(name: string) {
    return this.ask((resolver) => resolver.resolveTxt(name), joinTxtChunks);
  }

  cname(name: string) {
    return this.ask(
      (resolver) => resolver.resolveCname(name),
      (records) => records.map((record) => String(record)),
    );
  }

  mx(name: string) {
    return this.ask(
      (resolver) => resolver.resolveMx(name),
      (records) =>
        records.map((record) => ({
          priority: Number(record.priority) || 0,
          exchange: String(record.exchange ?? ""),
        })),
    );
  }
}

export class LookupSession implements DnsResolver {
  private readonly cache = new Map<string, Promise<DnsAnswer<unknown>>>();
  private readonly deadline: number;
  private used = 0;

  constructor(
    private readonly resolver: DnsResolver,
    private readonly limit = maxLookupsPerCheck,
    budgetMs = checkDeadlineMs,
    private readonly clock: () => number = Date.now,
  ) {
    this.deadline = clock() + budgetMs;
  }

  get lookups() {
    return this.used;
  }

  private ask<T>(
    type: string,
    name: string,
    run: () => Promise<DnsAnswer<T>>,
  ): Promise<DnsAnswer<T>> {
    const key = `${type}:${name}`;
    const known = this.cache.get(key);
    if (known) {
      return known as Promise<DnsAnswer<T>>;
    }
    if (this.used >= this.limit || this.clock() >= this.deadline) {
      return Promise.resolve({ kind: "error" });
    }
    this.used += 1;
    const pending = run().catch((): DnsAnswer<T> => ({ kind: "error" }));
    this.cache.set(key, pending);
    return pending;
  }

  txt(name: string) {
    return this.ask("txt", name, () => this.resolver.txt(name));
  }

  cname(name: string) {
    return this.ask("cname", name, () => this.resolver.cname(name));
  }

  mx(name: string) {
    return this.ask("mx", name, () => this.resolver.mx(name));
  }
}
