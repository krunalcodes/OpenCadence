import { Inject, Injectable } from "@nestjs/common";
import { REDIS, type Redis } from "../../infra/redis/redis.module";

const script = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], 1000)
end
if count > tonumber(ARGV[1]) then
  local ttl = redis.call('PTTL', KEYS[1])
  if ttl < 0 then
    ttl = 1000
  end
  return ttl
end
return 0
`;

@Injectable()
export class SendRateLimiter {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async waitMs(sourceId: string, perSecond: number) {
    const second = Math.floor(Date.now() / 1000);
    const result = await this.redis.eval(
      script,
      1,
      `opencadence:send-rate:${sourceId}:${second}`,
      String(perSecond),
    );
    return Number(result);
  }
}
