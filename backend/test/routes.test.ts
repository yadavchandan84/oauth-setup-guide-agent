import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp, type AppDeps } from '../src/app.js';
import { buildConfig, type Config } from '../src/config.js';
import { createLogger } from '../src/log.js';
import { createMemoryStore } from '../src/store/memoryStore.js';
import { buildCuratedIndex } from '../src/curated.js';
import { GuideSchema } from '../src/generated/schema.js';
import type { Guide, StreamEvent } from '../src/generated/schema.js';
import type { PipelineCtx, PipelineDeps } from '../src/agent/pipeline.js';
import type { AppInput } from '../src/agent/input.js';
import { assembleGuide } from '../src/agent/postprocess.js';
import { asanaInput, makeDraft, makeSources, makeVerification } from './helpers.js';

const log = createLogger('error', () => {});

function baseConfig(overrides: Partial<Config> = {}): Config {
  // Build a defaulted config, then override.
  const defaults = buildConfig({
    PORT: 8787,
    NODE_ENV: 'test',
    ALLOWED_ORIGINS: undefined,
    OPENAI_API_KEY: undefined,
    OPENAI_MODEL: 'gpt-4o-mini',
    TAVILY_API_KEY: undefined,
    UPSTASH_REDIS_REST_URL: undefined,
    UPSTASH_REDIS_REST_TOKEN: undefined,
    STORE: 'memory',
    DATA_DIR: './.data',
    RATE_LIMIT_MAX: 5,
    RATE_LIMIT_WINDOW_MS: 3_600_000,
    MAX_CONCURRENT_GENERATIONS: 2,
    GENERATION_TIMEOUT_MS: 120_000,
    CACHE_TTL_HOURS: 168,
    TRUST_PROXY: 1,
    LOG_LEVEL: 'error',
  });
  return { ...defaults, ...overrides };
}

function liveGuide(): Guide {
  return assembleGuide({
    draft: makeDraft(),
    verification: makeVerification(),
    sources: makeSources(),
    input: asanaInput,
    now: new Date('2026-10-20T12:00:00Z'),
    model: 'gpt-4o-mini',
    randomSuffix: () => 'abc123',
  });
}

function stubPipeline(guide?: Guide): PipelineDeps['draft'] extends never ? never : AppDeps['runPipeline'] {
  const g = guide ?? liveGuide();
  return (async (_input: AppInput, ctx: PipelineCtx) => {
    ctx.emit({ event: 'step', data: { id: 'resolve', stage: 'resolve', status: 'done', label: 'Resolving…', at: new Date().toISOString() } });
    ctx.emit({ event: 'guide', data: { guide: g, origin: 'fresh', cached: false, persisted: true } });
    return g;
  }) as AppDeps['runPipeline'];
}

function noopPipelineDeps(): PipelineDeps {
  const store = createMemoryStore(log);
  return {
    search: async () => [],
    extract: async () => [],
    draft: async () => makeDraft(),
    verify: async () => makeVerification(),
    store,
    now: () => new Date(),
    log,
    model: 'gpt-4o-mini',
    cacheTtlSec: 3600,
  };
}

function makeApp(opts: { config?: Partial<Config>; runPipeline?: AppDeps['runPipeline'] } = {}) {
  const config = baseConfig(opts.config);
  const store = createMemoryStore(log);
  const curated = buildCuratedIndex();
  const deps: AppDeps = {
    config,
    store,
    curated,
    runPipeline: opts.runPipeline ?? stubPipeline(),
    pipelineDeps: noopPipelineDeps(),
    now: () => new Date('2026-10-20T12:00:00Z'),
    log,
  };
  return { app: createApp(deps), store, curated, config };
}

function parseSse(body: string): { event: string; data: any }[] {
  const out: { event: string; data: any }[] = [];
  for (const block of body.split('\n\n')) {
    const lines = block.split('\n');
    let event = '';
    let data = '';
    for (const line of lines) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    if (event) out.push({ event, data: data ? JSON.parse(data) : null });
  }
  return out;
}

describe('GET /api/health', () => {
  it('returns ok with store, llm/search flags and rateLimitMax', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body).toHaveProperty('store');
    expect(res.body).toHaveProperty('llmConfigured', false);
    expect(res.body).toHaveProperty('searchConfigured', false);
    expect(res.body).toHaveProperty('rateLimitMax', 5);
  });
});

describe('GET /api/guides', () => {
  it('returns curated and recent arrays', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/guides');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.curated)).toBe(true);
    expect(Array.isArray(res.body.recent)).toBe(true);
  });
});

describe('GET /api/guides/:slug', () => {
  it('404 for a missing but valid slug', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/guides/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('400 for a malformed slug', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/guides/BAD_SLUG!');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_SLUG');
  });

  it('returns a stored live guide after put', async () => {
    const { app, store } = makeApp();
    const g = liveGuide();
    await store.put(g);
    const res = await request(app).get(`/api/guides/${g.slug}`);
    expect(res.status).toBe(200);
    expect(res.body.slug).toBe(g.slug);
  });
});

describe('POST /api/generate validation', () => {
  it('rejects empty app', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/api/generate').send({ app: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });

  it('rejects a control char', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/api/generate').send({ app: 'a\nb' });
    expect(res.status).toBe(400);
  });

  it('rejects javascript: scheme', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/api/generate').send({ app: 'javascript:alert(1)' });
    expect(res.status).toBe(400);
  });

  it('rejects a body larger than 2kb', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/generate')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ app: 'x'.repeat(3000) }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/generate 503 CONFIG_MISSING', () => {
  it('returns 503 when keys are unset', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/api/generate').send({ app: 'Asana' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('CONFIG_MISSING');
  });
});

describe('POST /api/generate SSE', () => {
  const configured = { openaiApiKey: 'sk-test', tavilyApiKey: 'tvly-test', llmConfigured: true, searchConfigured: true } as Partial<Config>;

  it('streams text/event-stream with meta -> step -> guide -> done and a valid guide', async () => {
    const { app } = makeApp({ config: configured });
    const res = await request(app).post('/api/generate').send({ app: 'Asana' });
    expect(res.headers['content-type']).toContain('text/event-stream');
    const events = parseSse(res.text);
    const names = events.map((e) => e.event);
    expect(names[0]).toBe('meta');
    expect(names).toContain('step');
    expect(names).toContain('guide');
    expect(names[names.length - 1]).toBe('done');
    const guideEvent = events.find((e) => e.event === 'guide');
    expect(GuideSchema.safeParse(guideEvent!.data.guide).success).toBe(true);
  });

  it('meta payload matches for "  Asana  "', async () => {
    const { app } = makeApp({ config: configured });
    const res = await request(app).post('/api/generate').send({ app: '  Asana  ' });
    const events = parseSse(res.text);
    const meta = events.find((e) => e.event === 'meta');
    expect(meta!.data).toMatchObject({ query: 'Asana', appName: 'Asana', key: 'asana', force: false });
    expect(typeof meta!.data.requestId).toBe('string');
  });
});

describe('rate limiting and concurrency', () => {
  const configured = { openaiApiKey: 'sk-test', tavilyApiKey: 'tvly-test', llmConfigured: true, searchConfigured: true, rateLimitMax: 2 } as Partial<Config>;

  it('429 after limit with a numeric Retry-After and matching retryAfterSec', async () => {
    const { app } = makeApp({ config: configured });
    await request(app).post('/api/generate').send({ app: 'Asana' });
    await request(app).post('/api/generate').send({ app: 'Asana' });
    const res = await request(app).post('/api/generate').send({ app: 'Asana' });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    const retryAfter = Number(res.headers['retry-after']);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(res.body.error.retryAfterSec).toBe(retryAfter);
  });

  it('curated short-circuit is not counted by the limiter', async () => {
    const { app, curated } = makeApp({ config: { ...configured, rateLimitMax: 1 } });
    if (curated.summaries.length === 0) return; // no curated guides until FEAT-003
    const slug = curated.summaries[0].slug;
    const key = slug.replace(/-/g, '');
    // two curated hits should both succeed (not counted)
    const r1 = await request(app).post('/api/generate').send({ app: key });
    const r2 = await request(app).post('/api/generate').send({ app: key });
    expect(r1.headers['content-type']).toContain('text/event-stream');
    expect(r2.headers['content-type']).toContain('text/event-stream');
  });

  it('BUSY when concurrency is saturated (MAX=1)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slowPipeline: AppDeps['runPipeline'] = (async (_i: AppInput, ctx: PipelineCtx) => {
      ctx.emit({ event: 'step', data: { id: 'resolve', stage: 'resolve', status: 'active', label: 'x', at: new Date().toISOString() } });
      await gate;
      const g = liveGuide();
      ctx.emit({ event: 'guide', data: { guide: g, origin: 'fresh', cached: false, persisted: true } });
      return g;
    }) as AppDeps['runPipeline'];

    const { app } = makeApp({ config: { ...configured, maxConcurrentGenerations: 1 }, runPipeline: slowPipeline });

    // Fire the first request eagerly so it acquires the only slot. supertest Tests are lazy,
    // so wrap in a Promise that calls .then() to trigger dispatch.
    const first = new Promise<request.Response>((resolve, reject) => {
      request(app).post('/api/generate').send({ app: 'Asana' }).then(resolve, reject);
    });
    // give the first request time to acquire the slot
    await new Promise((r) => setTimeout(r, 100));
    // 'Trello' is intentionally NOT a curated app, so this request is not short-circuited
    // and must reach acquireSlot to prove the concurrency gate returns BUSY.
    const second = await request(app).post('/api/generate').send({ app: 'Trello' });
    expect(second.status).toBe(503);
    expect(second.body.error.code).toBe('BUSY');
    release();
    await first;
  });

  it('slot is released after an error; a follow-up succeeds', async () => {
    const errorPipeline: AppDeps['runPipeline'] = (async () => {
      throw Object.assign(new Error('boom'), {});
    }) as AppDeps['runPipeline'];
    const { app } = makeApp({ config: { ...configured, maxConcurrentGenerations: 1 }, runPipeline: errorPipeline });
    const r1 = await request(app).post('/api/generate').send({ app: 'Asana' });
    expect(r1.headers['content-type']).toContain('text/event-stream');
    // second should still be able to acquire a slot (not BUSY)
    const r2 = await request(app).post('/api/generate').send({ app: 'Asana' });
    expect(r2.headers['content-type']).toContain('text/event-stream');
  });
});

describe('CORS', () => {
  it('disallowed origin gets no ACAO header', async () => {
    const { app } = makeApp({ config: { allowedOrigins: ['http://localhost:5173'] } });
    const res = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allowed origin is echoed back', async () => {
    const { app } = makeApp({ config: { allowedOrigins: ['https://good.example'] } });
    const res = await request(app).get('/api/health').set('Origin', 'https://good.example');
    expect(res.headers['access-control-allow-origin']).toBe('https://good.example');
  });

  it('ALLOWED_ORIGINS="" falls back to localhost defaults', async () => {
    const config = buildConfig({
      PORT: 8787, NODE_ENV: 'test', ALLOWED_ORIGINS: '', OPENAI_MODEL: 'gpt-4o-mini',
      STORE: 'memory', DATA_DIR: './.data', RATE_LIMIT_MAX: 5, RATE_LIMIT_WINDOW_MS: 3_600_000,
      MAX_CONCURRENT_GENERATIONS: 2, GENERATION_TIMEOUT_MS: 120_000, CACHE_TTL_HOURS: 168,
      TRUST_PROXY: 1, LOG_LEVEL: 'error',
    } as any);
    expect(config.allowedOrigins).toContain('http://localhost:5173');
    expect(config.allowedOrigins).toContain('http://localhost:4173');
  });
});

describe('TIMEOUT', () => {
  it('a hanging pipeline with a 50ms timeout yields error TIMEOUT', async () => {
    const hanging: AppDeps['runPipeline'] = (async (_i: AppInput, ctx: PipelineCtx) =>
      new Promise((_resolve, reject) => {
        ctx.signal.addEventListener('abort', () => reject(ctx.signal.reason));
      })) as AppDeps['runPipeline'];
    const { app } = makeApp({
      config: { openaiApiKey: 'sk-test', tavilyApiKey: 'tvly-test', llmConfigured: true, searchConfigured: true, generationTimeoutMs: 50 } as Partial<Config>,
      runPipeline: hanging,
    });
    const res = await request(app).post('/api/generate').send({ app: 'Asana' });
    const events = parseSse(res.text);
    const err = events.find((e) => e.event === 'error');
    expect(err!.data.code).toBe('TIMEOUT');
  });
});

describe('cache hit', () => {
  const configured = { openaiApiKey: 'sk-test', tavilyApiKey: 'tvly-test', llmConfigured: true, searchConfigured: true } as Partial<Config>;

  it('a second request for the same app returns cached:true without the pipeline', async () => {
    const runPipeline = vi.fn(stubPipeline());
    const { app, store } = makeApp({ config: configured, runPipeline: runPipeline as AppDeps['runPipeline'] });
    // prime the store + cache as the pipeline save step would
    const g = liveGuide();
    await store.put(g);
    await store.setCache('asana', g.slug, 3600);

    const res = await request(app).post('/api/generate').send({ app: 'ASANA' });
    const events = parseSse(res.text);
    const guideEvent = events.find((e) => e.event === 'guide');
    expect(guideEvent!.data.cached).toBe(true);
    expect(guideEvent!.data.origin).toBe('cache');
    expect(runPipeline).not.toHaveBeenCalled();
  });
});
