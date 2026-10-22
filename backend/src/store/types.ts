import type { Guide, GuideSummary } from '../generated/schema.js';

export interface GuideStore {
  readonly kind: 'memory' | 'file' | 'upstash';
  get(slug: string): Promise<Guide | null>;
  put(guide: Guide): Promise<void>;
  /** newest first */
  listRecent(limit: number): Promise<GuideSummary[]>;
  /** -> slug */
  getCache(key: string): Promise<string | null>;
  setCache(key: string, slug: string, ttlSec: number): Promise<void>;
}
