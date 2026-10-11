import { createHmac } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { REDIS, type Redis } from "../../infra/redis/redis.module";
import { TrackingKeys } from "../../infra/tracking-keys/tracking-keys";

export type TrackingRateGroup = "event" | "one-click" | "page";

export const trackingRateLimits: Record<TrackingRateGroup, number> = {
  event: 1200,
  "one-click": 600,
  page: 60,
};

const WINDOW_MS = 60_000;

const script = `
local count = redis.call('INCR', KEYS[1])
if count == 1 or redis.call('PTTL', KEYS[1]) < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return count
`;

@Injectable()
export class TrackingRateLimiter {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(TrackingKeys) private readonly keys: TrackingKeys,
  ) {}

  async take(group: TrackingRateGroup, ip: string) {
    const visitor = createHmac("sha256", this.keys.secret)
      .update(`rate:${ip}`)
      .digest("base64url")
      .slice(0, 22);
    try {
      const count = await this.redis.eval(
        script,
        1,
        `opencadence:tracking-rate:${group}:${visitor}`,
        String(WINDOW_MS),
      );
      return Number(count) <= trackingRateLimits[group];
    } catch {
      return true;
    }
  }
}
