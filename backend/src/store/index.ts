import { Redis } from '@upstash/redis';
import type { Config } from '../config.js';
import type { Logger } from '../log.js';
import type { GuideStore } from './types.js';
import { createMemoryStore } from './memoryStore.js';
import { createFileStore } from './fileStore.js';
import { createUpstashStore } from './upstashStore.js';

export type { GuideStore } from './types.js';

export function createStore(config: Config, log: Logger): GuideStore {
  const hasUpstash = !!config.upstashUrl && !!config.upstashToken;

  switch (config.store) {
    case 'memory':
      return createMemoryStore(log);
    case 'file':
      return createFileStore(config.dataDir, log);
    case 'upstash': {
      if (!hasUpstash) {
        log.error('STORE=upstash but UPSTASH_REDIS_REST_URL/_TOKEN are not set');
        throw new Error('STORE=upstash requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN');
      }
      const redis = new Redis({ url: config.upstashUrl!, token: config.upstashToken! });
      return createUpstashStore(redis, log);
    }
    case 'auto':
    default:
      if (hasUpstash) {
        const redis = new Redis({ url: config.upstashUrl!, token: config.upstashToken! });
        return createUpstashStore(redis, log);
      }
      return createFileStore(config.dataDir, log);
  }
}
