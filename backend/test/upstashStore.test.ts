import { describe, it, expect } from 'vitest';
import { createUpstashStore, type RedisLike } from '../src/store/upstashStore.js';
import { assembleGuide } from '../src/agent/postprocess.js';
import { createLogger } from '../src/log.js';
import { asanaInput, makeDraft, makeSources, makeVerification } from './helpers.js';

const log = createLogger('error', () => {});

function guide(slug = 'abc123') {
  return assembleGuide({
    draft: makeDraft(),
    verification: makeVerification(),
    sources: makeSources(),
    input: asanaInput,
    now: new Date('2026-10-20T12:00:00Z'),
    model: 'gpt-4o-mini',
    randomSuffix: () => slug,
  });
}

function fakeRedis(): RedisLike & { store: Map<string, unknown>; lists: Map<string, unknown[]> } {
  const store = new Map<string, unknown>();
  const lists = new Map<string, unknown[]>();
  return {
    store,
    lists,
    async get<T>(key: string) {
      return (store.has(key) ? (store.get(key) as T) : null) as T | null;
    },
    async set(key: string, value: unknown) {
      store.set(key, value);
      return 'OK';
    },
    async lpush(key: string, ...values: unknown[]) {
      const list = lists.get(key) ?? [];
      list.unshift(...values);
      lists.set(key, list);
      return list.length;
    },
    async ltrim(key: string, start: number, stop: number) {
      const list = lists.get(key) ?? [];
      lists.set(key, list.slice(start, stop + 1));
      return 'OK';
    },
    async lrange<T>(key: string, start: number, stop: number) {
      const list = lists.get(key) ?? [];
      return list.slice(start, stop + 1) as T[];
    },
  };
}

describe('upstashStore', () => {
  it('put/get round trips (auto-deserialized object)', async () => {
    const redis = fakeRedis();
    const store = createUpstashStore(redis, log);
    const g = guide();
    await store.put(g);
    const back = await store.get(g.slug);
    expect(back?.slug).toBe(g.slug);
  });

  it('listRecent returns summaries newest first', async () => {
    const redis = fakeRedis();
    const store = createUpstashStore(redis, log);
    const g2 = guide('second');
    await store.put(guide('first1'));
    await store.put(g2);
    const recent = await store.listRecent(10);
    expect(recent[0].slug).toBe(g2.slug);
  });

  it('cache get/set', async () => {
    const redis = fakeRedis();
    const store = createUpstashStore(redis, log);
    await store.setCache('asana', 'abc123', 3600);
    expect(await store.getCache('asana')).toBe('abc123');
    expect(await store.getCache('missing')).toBeNull();
  });
});
