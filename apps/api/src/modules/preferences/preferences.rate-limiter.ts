import { createHmac } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { REDIS, type Redis } from "../../infra/redis/redis.module";
import { TrackingKeys } from "../../infra/tracking-keys/tracking-keys";

export const preferencesRateLimit = 60;

const WINDOW_MS = 60_000;

const script = `
local count = redis.call('INCR', KEYS[1])
if count == 1 or redis.call('PTTL', KEYS[1]) < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return count
`;

@Injectable()
export class PreferencesRateLimiter {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(TrackingKeys) private readonly keys: TrackingKeys,
  ) {}

  async take(ip: string) {
    const visitor = createHmac("sha256", this.keys.secret)
      .update(`preferences-rate:${ip}`)
      .digest("base64url")
      .slice(0, 22);
    try {
      const count = await this.redis.eval(
        script,
        1,
        `opencadence:preferences-rate:${visitor}`,
        String(WINDOW_MS),
      );
      return Number(count) <= preferencesRateLimit;
    } catch {
      return false;
    }
  }
}
