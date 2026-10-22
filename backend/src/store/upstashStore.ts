import { GuideSchema, toSummary } from '../generated/schema.js';
import type { Guide, GuideSummary } from '../generated/schema.js';
import type { Logger } from '../log.js';
import type { GuideStore } from './types.js';

/** Minimal Redis-like surface. The real @upstash/redis client satisfies this; tests inject a fake. */
export interface RedisLike {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex?: number }): Promise<unknown>;
  lpush(key: string, ...values: unknown[]): Promise<number>;
  ltrim(key: string, start: number, stop: number): Promise<unknown>;
  lrange<T = unknown>(key: string, start: number, stop: number): Promise<T[]>;
}

const RECENT_KEY = 'recent';
const RECENT_CAP = 50;

export function createUpstashStore(redis: RedisLike, log: Logger): GuideStore {
  const parseGuide = (raw: unknown, slug: string): Guide | null => {
    if (raw === null || raw === undefined) return null;
    let value: unknown = raw;
    if (typeof raw === 'string') {
      try {
        value = JSON.parse(raw);
      } catch {
        log.warn('stored guide failed to parse', { slug });
        return null;
      }
    }
    const parsed = GuideSchema.safeParse(value);
    if (!parsed.success) {
      log.warn('stored guide failed schema validation', { slug });
      return null;
    }
    return parsed.data;
  };

  return {
    kind: 'upstash',

    async get(slug) {
      const raw = await redis.get(`guide:${slug}`);
      return parseGuide(raw, slug);
    },

    async put(guide) {
      await redis.set(`guide:${guide.slug}`, guide);
      await redis.lpush(RECENT_KEY, JSON.stringify(toSummary(guide)));
      await redis.ltrim(RECENT_KEY, 0, RECENT_CAP - 1);
    },

    async listRecent(limit) {
      const rows = await redis.lrange<unknown>(RECENT_KEY, 0, limit - 1);
      const out: GuideSummary[] = [];
      for (const row of rows) {
        let value: unknown = row;
        if (typeof row === 'string') {
          try {
            value = JSON.parse(row);
          } catch {
            continue;
          }
        }
        out.push(value as GuideSummary);
      }
      return out;
    },

    async getCache(key) {
      const slug = await redis.get<string>(`cache:${key}`);
      return typeof slug === 'string' ? slug : null;
    },

    async setCache(key, slug, ttlSec) {
      await redis.set(`cache:${key}`, slug, { ex: ttlSec });
    },
  };
}
