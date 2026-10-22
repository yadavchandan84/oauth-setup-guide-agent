import { describe, it, expect, vi } from 'vitest';
import { runPipeline } from '../src/agent/pipeline.js';
import type { PipelineCtx, PipelineDeps, TavilyResult } from '../src/agent/pipeline.js';
import { DraftInvalid } from '../src/agent/llm.js';
import { AgentError } from '../src/errors.js';
import { createLogger } from '../src/log.js';
import { createMemoryStore } from '../src/store/memoryStore.js';
import type { StreamEvent } from '../src/generated/schema.js';
import { asanaInput, makeDraft, makeVerification } from './helpers.js';
import type { GuideStore } from '../src/store/types.js';

const log = createLogger('error', () => {});

function hit(url: string, score = 1): TavilyResult {
  return { url, title: `title ${url}`, content: `content for ${url}`, score };
}

function baseDeps(overrides: Partial<PipelineDeps> = {}): PipelineDeps {
  const store = createMemoryStore(log);
  return {
    search: async () => [hit('https://developers.asana.com/docs/oauth'), hit('https://developers.asana.com/docs/scopes')],
    extract: async (urls) => urls.map((url) => ({ url, content: `extracted ${url}` })),
    draft: async () => makeDraft(),
    verify: async () => makeVerification(),
    store,
    now: () => new Date('2026-10-20T12:00:00Z'),
    log,
    model: 'gpt-4o-mini',
    cacheTtlSec: 3600,
    ...overrides,
  };
}

function runWith(deps: PipelineDeps, signal?: AbortSignal) {
  const events: StreamEvent[] = [];
  const ac = new AbortController();
  const ctx: PipelineCtx = {
    signal: signal ?? ac.signal,
    emit: (e) => events.push(e),
    requestId: 'test',
    curatedDomains: new Set(),
    deps,
  };
  return { events, promise: runPipeline(asanaInput, ctx), ctx, ac };
}

describe('runPipeline', () => {
  it('happy path emits step/source/guide, never meta or done', async () => {
    const deps = baseDeps();
    const { events, promise } = runWith(deps);
    const guide = await promise;
    const names = events.map((e) => e.event);
    expect(names).toContain('step');
    expect(names).toContain('source');
    expect(names).toContain('guide');
    expect(names).not.toContain('meta');
    expect(names).not.toContain('done');
    expect(guide.slug).toMatch(/^[a-z0-9-]+$/);
    const guideEvent = events.find((e) => e.event === 'guide');
    expect(guideEvent && guideEvent.event === 'guide' && guideEvent.data.origin).toBe('fresh');
  });

  it('partial search failure still succeeds', async () => {
    let call = 0;
    const deps = baseDeps({
      search: async () => {
        call += 1;
        if (call === 1) throw new AgentError('SEARCH_FAILED', 'unavailable', true);
        return [hit('https://developers.asana.com/docs/oauth')];
      },
    });
    const { promise } = runWith(deps);
    const guide = await promise;
    expect(guide).toBeDefined();
  });

  it('all searches fail -> SEARCH_FAILED', async () => {
    const deps = baseDeps({
      search: async () => {
        throw new AgentError('SEARCH_FAILED', 'unavailable', true);
      },
    });
    const { promise } = runWith(deps);
    await expect(promise).rejects.toMatchObject({ code: 'SEARCH_FAILED' });
  });

  it('zero results -> NO_SOURCES', async () => {
    const deps = baseDeps({ search: async () => [] });
    const { promise } = runWith(deps);
    await expect(promise).rejects.toMatchObject({ code: 'NO_SOURCES' });
  });

  it('extract failure falls back to snippets', async () => {
    const deps = baseDeps({
      extract: async () => {
        throw new Error('extract down');
      },
    });
    const { events, promise } = runWith(deps);
    const guide = await promise;
    expect(guide).toBeDefined();
    const readFailed = events.some(
      (e) => e.event === 'step' && e.data.stage === 'read' && e.data.status === 'failed'
    );
    expect(readFailed).toBe(true);
  });

  it('draft invalid then valid (one repair)', async () => {
    const seenIssues: (string[] | null)[] = [];
    let call = 0;
    const deps = baseDeps({
      draft: async (args) => {
        seenIssues.push(args.repairIssues);
        call += 1;
        if (call === 1) throw new DraftInvalid(['steps: too short']);
        return makeDraft();
      },
    });
    const { promise } = runWith(deps);
    await promise;
    expect(call).toBe(2);
    expect(seenIssues[0]).toBeNull();
    expect(Array.isArray(seenIssues[1]) && seenIssues[1]!.length > 0).toBe(true);
  });

  it('draft invalid twice -> LLM_FAILED', async () => {
    const deps = baseDeps({
      draft: async () => {
        throw new DraftInvalid(['bad']);
      },
    });
    const { promise } = runWith(deps);
    await expect(promise).rejects.toMatchObject({ code: 'LLM_FAILED' });
  });

  it('verifier throws -> still a guide', async () => {
    const deps = baseDeps({
      verify: async () => {
        throw new Error('verify down');
      },
    });
    const { events, promise } = runWith(deps);
    const guide = await promise;
    expect(guide).toBeDefined();
    const verifyFailed = events.some(
      (e) => e.event === 'step' && e.data.stage === 'verify' && e.data.status === 'failed'
    );
    expect(verifyFailed).toBe(true);
  });

  it('runs verification exactly once', async () => {
    const verify = vi.fn(async () => makeVerification());
    const deps = baseDeps({ verify });
    const { promise } = runWith(deps);
    await promise;
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it('store.put throws -> persisted:false and setCache not called', async () => {
    const setCache = vi.fn(async () => {});
    const store: GuideStore = {
      ...createMemoryStore(log),
      put: async () => {
        throw new Error('disk full');
      },
      setCache,
    };
    const deps = baseDeps({ store });
    const { events, promise } = runWith(deps);
    await promise;
    const guideEvent = events.find((e) => e.event === 'guide');
    expect(guideEvent && guideEvent.event === 'guide' && guideEvent.data.persisted).toBe(false);
    expect(setCache).not.toHaveBeenCalled();
  });

  it('setCache throws -> persisted:true and save step done with cache-unavailable detail', async () => {
    const store: GuideStore = {
      ...createMemoryStore(log),
      put: async () => {},
      setCache: async () => {
        throw new Error('cache down');
      },
    };
    const deps = baseDeps({ store });
    const { events, promise } = runWith(deps);
    await promise;
    const guideEvent = events.find((e) => e.event === 'guide');
    expect(guideEvent && guideEvent.event === 'guide' && guideEvent.data.persisted).toBe(true);
    const saveDone = events.find(
      (e) => e.event === 'step' && e.data.stage === 'save' && e.data.status === 'done'
    );
    expect(saveDone && saveDone.event === 'step' && saveDone.data.detail).toBe('Saved (cache unavailable)');
  });

  it('curatedDomains makes a stripe.com hit official', async () => {
    const deps = baseDeps({
      search: async () => [hit('https://stripe.com/docs/connect')],
    });
    const events: StreamEvent[] = [];
    const ac = new AbortController();
    const ctx: PipelineCtx = {
      signal: ac.signal,
      emit: (e) => events.push(e),
      requestId: 'test',
      curatedDomains: new Set(['stripe.com']),
      deps,
    };
    await runPipeline(asanaInput, ctx);
    const source = events.find((e) => e.event === 'source');
    expect(source && source.event === 'source' && source.data.kind).toBe('official');
  });

  it('abort mid-run stops further dep calls', async () => {
    const draft = vi.fn(async () => makeDraft());
    const ac = new AbortController();
    const deps = baseDeps({
      draft,
      search: async () => {
        ac.abort(new AgentError('TIMEOUT', 'timed out', true));
        return [hit('https://developers.asana.com/docs/oauth')];
      },
    });
    const { promise } = runWith(deps, ac.signal);
    await expect(promise).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(draft).not.toHaveBeenCalled();
  });

  it('abort during a recoverable stage rethrows signal.reason', async () => {
    const ac = new AbortController();
    const deps = baseDeps({
      verify: async () => {
        ac.abort(new AgentError('CLIENT_GONE', 'gone'));
        throw new Error('verify failed after abort');
      },
    });
    const { promise } = runWith(deps, ac.signal);
    await expect(promise).rejects.toMatchObject({ code: 'CLIENT_GONE' });
  });
});
