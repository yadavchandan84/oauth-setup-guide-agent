import { ZodError } from 'zod';
import { AgentError } from '../errors.js';
import type { Logger } from '../log.js';
import type { Guide, Stage, StepStatus, StreamEvent } from '../generated/schema.js';
import type { AppInput } from './input.js';
import type { GuideDraft, Verification } from './draftSchema.js';
import { DraftInvalid } from './llm.js';
import { assembleGuide } from './postprocess.js';
import { classifySource } from './sources.js';
import type { GuideStore } from '../store/types.js';

/** Variable part of a Tavily search. tavily.ts adds the fixed params (search_depth, max_results, …). */
export interface TavilySearchReq {
  query: string;
  include_domains?: string[];
}
export interface TavilyResult {
  url: string;
  title: string;
  content: string;
  score: number;
}
/** One numbered source as shown to the LLM. `index` is the [i] used by draft `sourceIndexes`. */
export interface PromptSource {
  index: number;
  url: string;
  title: string;
  kind: 'official' | 'community';
  content: string; // extracted raw_content (≤8,000 chars) or the search snippet
  snippetOnly: boolean; // true when extract failed or the source was outside the top 5
}
export interface DraftArgs {
  input: AppInput;
  sources: PromptSource[];
  repairIssues: string[] | null; // null on the first attempt; ≤10 "path: message" strings on repair
}
export interface VerifyArgs {
  draft: GuideDraft;
  sources: PromptSource[];
}

export interface PipelineDeps {
  search(q: TavilySearchReq, signal: AbortSignal): Promise<TavilyResult[]>;
  extract(urls: string[], signal: AbortSignal): Promise<{ url: string; content: string }[]>;
  draft(args: DraftArgs, signal: AbortSignal): Promise<GuideDraft>; // throws DraftInvalid
  verify(args: VerifyArgs, signal: AbortSignal): Promise<Verification>;
  store: GuideStore;
  now(): Date;
  log: Logger;
  model: string;
  cacheTtlSec: number;
}
export interface PipelineCtx {
  signal: AbortSignal;
  emit: (e: StreamEvent) => void;
  requestId: string;
  curatedDomains: Set<string>;
  deps: PipelineDeps;
}

const MAX_CONTENT_CHARS = 8_000;
const MAX_TOTAL_CHARS = 32_000;
const READ_COUNT = 5;

const step = (
  id: string,
  stage: Stage,
  status: StepStatus,
  label: string,
  now: Date,
  detail?: string
): StreamEvent => ({
  event: 'step',
  data: { id, stage, status, label, at: now.toISOString(), ...(detail ? { detail } : {}) },
});

function dedupeKey(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    let p = u.pathname.replace(/\/+$/, '');
    return `${u.protocol}//${u.host}${p}${u.search}`;
  } catch {
    return url;
  }
}

export async function runPipeline(input: AppInput, ctx: PipelineCtx): Promise<Guide> {
  const { signal, emit, deps } = ctx;
  const { log, now } = deps;

  const throwIfAborted = () => {
    if (signal.aborted) throw signal.reason;
  };

  // ---- Stage 1: resolve ----
  throwIfAborted();
  emit(step('resolve', 'resolve', 'active', `Resolving ${input.displayName}…`, now()));
  emit(
    step(
      'resolve',
      'resolve',
      'done',
      `Resolving ${input.displayName}…`,
      now(),
      `${input.displayName} (${input.domainHint ?? 'name'})`
    )
  );

  // ---- Stage 2: search ----
  throwIfAborted();
  emit(step('search', 'search', 'active', 'Searching docs…', now()));

  const queries: TavilySearchReq[] = [
    {
      query: `${input.displayName} OAuth app setup developer documentation`,
      ...(input.domainHint ? { include_domains: [input.domainHint] } : {}),
    },
    { query: `${input.displayName} app review verification marketplace listing requirements` },
    { query: `${input.displayName} OAuth scopes redirect URI` },
  ];

  const settled = await Promise.allSettled(queries.map((q) => deps.search(q, signal)));
  throwIfAborted();

  const hits: TavilyResult[] = [];
  const rejections: unknown[] = [];
  for (const r of settled) {
    if (r.status === 'fulfilled') hits.push(...r.value);
    else rejections.push(r.reason);
  }

  if (hits.length === 0 && rejections.length === queries.length) {
    // All failed: rethrow the first non-retryable, else the first.
    const nonRetryable = rejections.find((e) => e instanceof AgentError && !e.retryable);
    throw (nonRetryable ?? rejections[0]) as Error;
  }
  if (rejections.length > 0) {
    log.warn('some search queries failed', { requestId: ctx.requestId, failed: rejections.length });
  }

  // Merge: dedupe, drop non-https, classify, rank official-first then by score, top 10.
  const seen = new Set<string>();
  const merged: PromptSource[] = [];
  for (const hit of hits) {
    if (!hit.url.startsWith('https://')) continue;
    const key = dedupeKey(hit.url);
    if (seen.has(key)) continue;
    let parsed: URL;
    try {
      parsed = new URL(hit.url);
    } catch {
      continue;
    }
    seen.add(key);
    const kind = classifySource(parsed, input, ctx.curatedDomains);
    merged.push({
      index: 0, // assigned after sort
      url: hit.url,
      title: hit.title,
      kind,
      content: hit.content.slice(0, MAX_CONTENT_CHARS),
      snippetOnly: true,
      score: hit.score,
    } as PromptSource & { score: number });
  }

  if (merged.length === 0) {
    emit(step('search', 'search', 'failed', 'Searching docs…', now()));
    throw new AgentError(
      'NO_SOURCES',
      `Couldn't find developer documentation for ${input.displayName}. Check the spelling or paste the developer docs URL.`,
      false
    );
  }

  merged.sort((a, b) => {
    const ao = a.kind === 'official' ? 0 : 1;
    const bo = b.kind === 'official' ? 0 : 1;
    if (ao !== bo) return ao - bo;
    return ((b as PromptSource & { score: number }).score ?? 0) - ((a as PromptSource & { score: number }).score ?? 0);
  });

  const candidates = merged.slice(0, 10);
  candidates.forEach((c, i) => (c.index = i));

  emit(step('search', 'search', 'done', 'Searching docs…', now(), `Found ${candidates.length} relevant pages`));

  // ---- Stage 3: read ----
  throwIfAborted();
  const toRead = candidates.slice(0, READ_COUNT);
  for (const src of toRead) {
    emit({ event: 'source', data: { index: src.index, url: src.url, title: src.title, kind: src.kind } });
    emit(step(`read-${src.index}`, 'read', 'active', `Reading ${src.title || src.url}…`, now()));
  }

  let extracted: { url: string; content: string }[] = [];
  let extractFailed = false;
  try {
    extracted = await deps.extract(toRead.map((s) => s.url), signal);
  } catch (err) {
    if (signal.aborted) throw signal.reason;
    extractFailed = true;
    log.warn('extract failed entirely; falling back to snippets', { requestId: ctx.requestId });
  }
  throwIfAborted();

  const extractedByUrl = new Map(extracted.map((e) => [dedupeKey(e.url), e.content]));
  let totalChars = 0;
  for (const src of toRead) {
    const content = extractedByUrl.get(dedupeKey(src.url));
    if (!extractFailed && content && content.trim().length > 0) {
      let slice = content.slice(0, MAX_CONTENT_CHARS);
      if (totalChars + slice.length > MAX_TOTAL_CHARS) {
        slice = slice.slice(0, Math.max(0, MAX_TOTAL_CHARS - totalChars));
      }
      totalChars += slice.length;
      src.content = slice;
      src.snippetOnly = false;
      emit(step(`read-${src.index}`, 'read', 'done', `Reading ${src.title || src.url}…`, now()));
    } else {
      // fall back to snippet
      emit(step(`read-${src.index}`, 'read', 'failed', `Reading ${src.title || src.url}…`, now()));
    }
  }

  const promptSources: PromptSource[] = candidates.map((c) => ({
    index: c.index,
    url: c.url,
    title: c.title,
    kind: c.kind,
    content: c.content,
    snippetOnly: c.snippetOnly,
  }));

  // ---- Stage 4+6: draft + assemble (with at most one repair) ----
  throwIfAborted();
  emit(step('draft', 'draft', 'active', 'Drafting guide…', now()));

  let draft: GuideDraft;
  let repairIssues: string[] | null = null;
  let attempts = 0;

  const assembleProbe = (d: GuideDraft): void => {
    // Probe: assemble with verification:null to validate against GuideSchema.
    assembleGuide({
      draft: d,
      verification: null,
      sources: promptSources,
      input,
      now: now(),
      model: deps.model,
    });
  };

  // Attempt loop: at most 2 attempts (initial + one repair).
  for (;;) {
    attempts += 1;
    throwIfAborted();
    try {
      draft = await deps.draft({ input, sources: promptSources, repairIssues }, signal);
    } catch (err) {
      if (signal.aborted) throw signal.reason;
      if (err instanceof DraftInvalid) {
        if (attempts >= 2) {
          emit(step('draft', 'draft', 'failed', 'Drafting guide…', now()));
          throw new AgentError('LLM_FAILED', "The agent couldn't produce a valid guide", true);
        }
        repairIssues = err.issues.slice(0, 10);
        emit(step('draft', 'draft', 'active', 'Drafting guide…', now(), 'Repairing an invalid draft…'));
        continue;
      }
      emit(step('draft', 'draft', 'failed', 'Drafting guide…', now()));
      throw err; // AgentError (LLM_FAILED etc.)
    }

    // Validate via probe.
    try {
      assembleProbe(draft);
      break; // valid
    } catch (err) {
      if (!(err instanceof ZodError)) throw err;
      if (attempts >= 2) {
        emit(step('draft', 'draft', 'failed', 'Drafting guide…', now()));
        throw new AgentError('LLM_FAILED', "The agent couldn't produce a valid guide", true);
      }
      repairIssues = err.issues.slice(0, 10).map((i) => `${i.path.join('.')}: ${i.message}`);
      emit(step('draft', 'draft', 'active', 'Drafting guide…', now(), 'Repairing an invalid draft…'));
    }
  }

  emit(step('draft', 'draft', 'done', 'Drafting guide…', now()));

  // ---- Stage 5: verify (exactly once) ----
  throwIfAborted();
  emit(step('verify', 'verify', 'active', 'Verifying claims…', now()));
  let verification: Verification | null = null;
  try {
    verification = await deps.verify({ draft, sources: promptSources }, signal);
    emit(step('verify', 'verify', 'done', 'Verifying claims…', now()));
  } catch (err) {
    if (signal.aborted) throw signal.reason;
    verification = null;
    log.warn('verification pass failed; proceeding unverified', { requestId: ctx.requestId });
    emit(step('verify', 'verify', 'failed', 'Verification pass unavailable', now()));
  }

  // ---- Stage 6: final assemble ----
  throwIfAborted();
  let guide: Guide;
  try {
    guide = assembleGuide({
      draft,
      verification,
      sources: promptSources,
      input,
      now: now(),
      model: deps.model,
    });
  } catch (err) {
    if (err instanceof ZodError) {
      throw new AgentError('LLM_FAILED', "The agent couldn't produce a valid guide", true);
    }
    throw err;
  }

  // ---- Stage 7: save ----
  throwIfAborted();
  emit(step('save', 'save', 'active', 'Saving shareable guide…', now()));
  let persisted = false;
  try {
    await deps.store.put(guide);
    persisted = true;
  } catch (err) {
    if (signal.aborted) throw signal.reason;
    log.error('store.put failed', { requestId: ctx.requestId });
    emit(step('save', 'save', 'failed', "Couldn't save a shareable link", now()));
  }

  if (persisted) {
    try {
      await deps.store.setCache(input.key, guide.slug, deps.cacheTtlSec);
      emit(step('save', 'save', 'done', 'Saved shareable guide', now()));
    } catch (err) {
      if (signal.aborted) throw signal.reason;
      log.warn('store.setCache failed', { requestId: ctx.requestId });
      emit(step('save', 'save', 'done', 'Saving shareable guide…', now(), 'Saved (cache unavailable)'));
    }
  }

  emit({ event: 'guide', data: { guide, origin: 'fresh', cached: false, persisted } });
  return guide;
}
