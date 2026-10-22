import fs from 'node:fs/promises';
import path from 'node:path';
import { GuideSchema, toSummary } from '../generated/schema.js';
import type { Guide, GuideSummary } from '../generated/schema.js';
import type { Logger } from '../log.js';
import type { GuideStore } from './types.js';

interface CacheFile {
  [key: string]: { slug: string; expiresAt: number };
}

export function createFileStore(dataDir: string, log: Logger): GuideStore {
  const root = path.resolve(dataDir);
  const guidesDir = path.join(root, 'guides');
  const cachePath = path.join(root, 'cache.json');
  const recentPath = path.join(root, 'recent.json');

  // Promise-chain mutex to serialize writes to cache.json / recent.json.
  let mutex: Promise<unknown> = Promise.resolve();
  const withLock = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = mutex.then(fn, fn);
    mutex = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };

  async function atomicWrite(file: string, data: string): Promise<void> {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, data, 'utf8');
    await fs.rename(tmp, file);
  }

  async function readJson<T>(file: string, fallback: T): Promise<T> {
    let text: string;
    try {
      text = await fs.readFile(file, 'utf8');
    } catch {
      return fallback;
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      log.warn('corrupt json file treated as empty', { file: path.basename(file) });
      return fallback;
    }
  }

  return {
    kind: 'file',

    async get(slug) {
      const file = path.join(guidesDir, `${slug}.json`);
      let text: string;
      try {
        text = await fs.readFile(file, 'utf8');
      } catch {
        return null;
      }
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        log.warn('corrupt guide file returns null', { slug });
        return null;
      }
      const parsed = GuideSchema.safeParse(raw);
      if (!parsed.success) {
        log.warn('stored guide failed schema validation', { slug });
        return null;
      }
      return parsed.data;
    },

    async put(guide) {
      await atomicWrite(path.join(guidesDir, `${guide.slug}.json`), JSON.stringify(guide));
      await withLock(async () => {
        const recent = await readJson<string[]>(recentPath, []);
        const next = [guide.slug, ...recent.filter((s) => s !== guide.slug)].slice(0, 50);
        await atomicWrite(recentPath, JSON.stringify(next));
      });
    },

    async listRecent(limit) {
      const recent = await readJson<string[]>(recentPath, []);
      const out: GuideSummary[] = [];
      for (const slug of recent.slice(0, limit)) {
        const g = await this.get(slug);
        if (g) out.push(toSummary(g));
      }
      return out;
    },

    async getCache(key) {
      const cache = await readJson<CacheFile>(cachePath, {});
      const entry = cache[key];
      if (!entry) return null;
      if (entry.expiresAt <= Date.now()) return null;
      return entry.slug;
    },

    async setCache(key, slug, ttlSec) {
      await withLock(async () => {
        const cache = await readJson<CacheFile>(cachePath, {});
        cache[key] = { slug, expiresAt: Date.now() + ttlSec * 1000 };
        await atomicWrite(cachePath, JSON.stringify(cache));
      });
    },
  };
}
