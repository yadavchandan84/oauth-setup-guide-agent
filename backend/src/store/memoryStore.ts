import { GuideSchema, toSummary } from '../generated/schema.js';
import type { Guide, GuideSummary } from '../generated/schema.js';
import type { Logger } from '../log.js';
import type { GuideStore } from './types.js';

interface CacheEntry {
  slug: string;
  expiresAt: number;
}

const RECENT_CAP = 50;

export function createMemoryStore(log: Logger): GuideStore {
  const guides = new Map<string, Guide>();
  const cache = new Map<string, CacheEntry>();
  const recent: string[] = []; // slugs, newest first

  return {
    kind: 'memory',

    async get(slug) {
      const raw = guides.get(slug);
      if (!raw) return null;
      const parsed = GuideSchema.safeParse(raw);
      if (!parsed.success) {
        log.warn('stored guide failed schema validation', { slug });
        return null;
      }
      return parsed.data;
    },

    async put(guide) {
      guides.set(guide.slug, guide);
      const idx = recent.indexOf(guide.slug);
      if (idx !== -1) recent.splice(idx, 1);
      recent.unshift(guide.slug);
      if (recent.length > RECENT_CAP) recent.length = RECENT_CAP;
    },

    async listRecent(limit) {
      const out: GuideSummary[] = [];
      for (const slug of recent.slice(0, limit)) {
        const raw = guides.get(slug);
        if (!raw) continue;
        const parsed = GuideSchema.safeParse(raw);
        if (!parsed.success) {
          log.warn('stored guide failed schema validation', { slug });
          continue;
        }
        out.push(toSummary(parsed.data));
      }
      return out;
    },

    async getCache(key) {
      const entry = cache.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= Date.now()) {
        cache.delete(key);
        return null;
      }
      return entry.slug;
    },

    async setCache(key, slug, ttlSec) {
      cache.set(key, { slug, expiresAt: Date.now() + ttlSec * 1000 });
    },
  };
}
