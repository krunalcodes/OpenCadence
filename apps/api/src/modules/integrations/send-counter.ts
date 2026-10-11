import { Inject, Injectable } from "@nestjs/common";
import { REDIS, type Redis } from "../../infra/redis/redis.module";
import { SendingSourcesRepository, utcDay } from "./sending-sources.repository";

const keyPrefix = "opencadence:sent";
const dirtyKey = `${keyPrefix}:dirty`;
const ttlSeconds = 60 * 60 * 48;

const reserveScript = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
if ARGV[1] ~= '' and current >= tonumber(ARGV[1]) then
  return -1
end
current = redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], ARGV[2])
redis.call('SADD', KEYS[2], ARGV[3])
return current
`;

function counterKey(sourceId: string, day: string) {
  return `${keyPrefix}:${sourceId}:${day}`;
}

@Injectable()
export class SendCounter {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(SendingSourcesRepository)
    private readonly repository: SendingSourcesRepository,
  ) {}

  async reserve(workspaceId: string, sourceId: string, limit: number | null) {
    const day = utcDay();
    const key = counterKey(sourceId, day);
    if ((await this.redis.exists(key)) === 0) {
      const saved = await this.repository.findSentCount(sourceId, day);
      await this.redis.set(key, saved, "EX", ttlSeconds, "NX");
    }
    const result = await this.redis.eval(
      reserveScript,
      2,
      key,
      dirtyKey,
      limit === null ? "" : String(limit),
      String(ttlSeconds),
      `${workspaceId}:${sourceId}:${day}`,
    );
    return Number(result) >= 0;
  }

  async release(sourceId: string) {
    const key = counterKey(sourceId, utcDay());
    if ((await this.redis.decr(key)) < 0) {
      await this.redis.set(key, 0, "EX", ttlSeconds);
    }
  }

  async today(sourceIds: string[]) {
    const counts = new Map<string, number>();
    if (sourceIds.length === 0) {
      return counts;
    }
    const day = utcDay();
    const values = await this.redis.mget(
      sourceIds.map((id) => counterKey(id, day)),
    );
    sourceIds.forEach((id, index) => {
      const value = values[index];
      if (value !== null && value !== undefined) {
        counts.set(id, Number(value));
      }
    });
    return counts;
  }

  async flush(batchSize = 500) {
    const members = await this.redis.spop(dirtyKey, batchSize);
    for (const member of members) {
      const [workspaceId, sourceId, day] = member.split(":");
      if (!workspaceId || !sourceId || !day) {
        continue;
      }
      const value = await this.redis.get(counterKey(sourceId, day));
      if (value === null) {
        continue;
      }
      try {
        await this.repository.saveSentCount(
          workspaceId,
          sourceId,
          day,
          Number(value),
        );
      } catch (error) {
        await this.redis.sadd(dirtyKey, member);
        throw error;
      }
    }
    return members.length;
  }
}
