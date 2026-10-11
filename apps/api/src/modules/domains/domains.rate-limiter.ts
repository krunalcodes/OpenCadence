import { Inject, Injectable } from "@nestjs/common";
import { REDIS, type Redis } from "../../infra/redis/redis.module";
import { manualCheckWindowMs } from "./domains.constants";

function key(domainId: string) {
  return `opencadence:domain-check:${domainId}`;
}

@Injectable()
export class DomainCheckLimiter {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async take(domainId: string) {
    const set = await this.redis.set(
      key(domainId),
      "1",
      "PX",
      manualCheckWindowMs,
      "NX",
    );
    return set === "OK";
  }

  async retryAfterSeconds(domainId: string) {
    const remaining = await this.redis.pttl(key(domainId));
    return Math.max(Math.ceil(remaining / 1000), 1);
  }

  async clear(domainId: string) {
    await this.redis.del(key(domainId));
  }
}
