import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createFileStore } from '../src/store/fileStore.js';
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

const dirs: string[] = [];
async function tmpDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'filestore-'));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  while (dirs.length) {
    const d = dirs.pop()!;
    await fs.rm(d, { recursive: true, force: true }).catch(() => {});
  }
});

describe('fileStore', () => {
  it('put/get round trips', async () => {
    const store = createFileStore(await tmpDir(), log);
    const g = guide();
    await store.put(g);
    const back = await store.get(g.slug);
    expect(back?.slug).toBe(g.slug);
  });

  it('get returns null for a missing slug', async () => {
    const store = createFileStore(await tmpDir(), log);
    expect(await store.get('nope')).toBeNull();
  });

  it('listRecent returns newest first', async () => {
    const store = createFileStore(await tmpDir(), log);
    const g1 = guide('first1');
    const g2 = guide('second');
    await store.put(g1);
    await store.put(g2);
    const recent = await store.listRecent(10);
    expect(recent[0].slug).toBe(g2.slug);
    expect(recent.map((r) => r.slug)).toContain(g1.slug);
  });

  it('cache TTL expiry', async () => {
    const store = createFileStore(await tmpDir(), log);
    await store.setCache('asana', 'abc123', 0); // already expired
    expect(await store.getCache('asana')).toBeNull();
    await store.setCache('asana', 'abc123', 3600);
    expect(await store.getCache('asana')).toBe('abc123');
  });

  it('corrupt cache file is treated as empty', async () => {
    const dir = await tmpDir();
    await fs.writeFile(path.join(dir, 'cache.json'), '{not json', 'utf8');
    const store = createFileStore(dir, log);
    expect(await store.getCache('asana')).toBeNull();
  });

  it('corrupt guide file returns null', async () => {
    const dir = await tmpDir();
    await fs.mkdir(path.join(dir, 'guides'), { recursive: true });
    await fs.writeFile(path.join(dir, 'guides', 'bad.json'), '{broken', 'utf8');
    const store = createFileStore(dir, log);
    expect(await store.get('bad')).toBeNull();
  });
});
