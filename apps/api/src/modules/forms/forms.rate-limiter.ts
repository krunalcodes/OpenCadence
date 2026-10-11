import { createHmac } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { REDIS, type Redis } from "../../infra/redis/redis.module";
import { TrackingKeys } from "../../infra/tracking-keys/tracking-keys";
import { type FormRateGroup, formRateRules } from "./forms.constants";

const script = `
local count = redis.call('INCR', KEYS[1])
if count == 1 or redis.call('PTTL', KEYS[1]) < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return count
`;

@Injectable()
export class FormsRateLimiter {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(TrackingKeys) private readonly keys: TrackingKeys,
  ) {}

  key(group: FormRateGroup, subject: string) {
    const digest = createHmac("sha256", this.keys.secret)
      .update(`forms-rate:${group}:${subject}`)
      .digest("base64url")
      .slice(0, 22);
    return `opencadence:forms-rate:${group}:${digest}`;
  }

  async take(group: FormRateGroup, subject: string) {
    const rule = formRateRules[group];
    try {
      const count = await this.redis.eval(
        script,
        1,
        this.key(group, subject),
        String(rule.windowMs),
      );
      return Number(count) <= rule.limit;
    } catch {
      return false;
    }
  }
}
