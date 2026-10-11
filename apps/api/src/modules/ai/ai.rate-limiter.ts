import { Inject, Injectable } from "@nestjs/common";
import { REDIS, type Redis } from "../../infra/redis/redis.module";

export const AI_REQUESTS_PER_MINUTE = 30;
const WINDOW_MS = 60_000;

const script = `
local count = redis.call('INCR', KEYS[1])
if count == 1 or redis.call('PTTL', KEYS[1]) < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return count
`;

@Injectable()
export class AiRateLimiter {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async take(workspaceId: string) {
    const count = await this.redis.eval(
      script,
      1,
      `opencadence:ai-rate:${workspaceId}`,
      String(WINDOW_MS),
    );
    return Number(count) <= AI_REQUESTS_PER_MINUTE;
  }
}
