import { AgentError } from '../errors.js';
import type { TavilyResult, TavilySearchReq } from './pipeline.js';

const SEARCH_URL = 'https://api.tavily.com/search';
const EXTRACT_URL = 'https://api.tavily.com/extract';
const SEARCH_TIMEOUT_MS = 15_000;
const EXTRACT_TIMEOUT_MS = 30_000;

function mapHttpError(status: number): AgentError {
  if (status === 401 || status === 403) {
    return new AgentError('SEARCH_FAILED', 'Search provider rejected the API key', false);
  }
  if (status === 429 || status === 432 || status === 433) {
    return new AgentError('SEARCH_FAILED', 'Search quota exceeded', false);
  }
  return new AgentError('SEARCH_FAILED', 'Search provider unavailable', true);
}

function networkError(): AgentError {
  return new AgentError('SEARCH_FAILED', 'Search provider unavailable', true);
}

function coerceResult(raw: unknown): TavilyResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.url !== 'string') return null;
  return {
    url: r.url,
    title: typeof r.title === 'string' ? r.title : '',
    content: typeof r.content === 'string' ? r.content : '',
    score: typeof r.score === 'number' ? r.score : 0,
  };
}

async function tavilyFetch(
  url: string,
  apiKey: string,
  body: unknown,
  signal: AbortSignal,
  timeoutMs: number
): Promise<unknown> {
  if (signal.aborted) throw signal.reason;
  const combined = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: combined,
    });
  } catch (err) {
    if (signal.aborted) throw signal.reason;
    throw networkError();
  }
  if (!res.ok) {
    res.body?.cancel().catch(() => {});
    throw mapHttpError(res.status);
  }
  try {
    return await res.json();
  } catch {
    return null; // non-JSON body -> treated as empty by callers
  }
}

export function createTavily(apiKey: string) {
  return {
    async search(q: TavilySearchReq, signal: AbortSignal): Promise<TavilyResult[]> {
      const body: Record<string, unknown> = {
        query: q.query,
        search_depth: 'basic',
        max_results: 6,
        include_answer: false,
        include_raw_content: false,
        topic: 'general',
      };
      if (q.include_domains && q.include_domains.length > 0) {
        body.include_domains = q.include_domains;
      }
      const data = await tavilyFetch(SEARCH_URL, apiKey, body, signal, SEARCH_TIMEOUT_MS);
      const results = (data as { results?: unknown })?.results;
      if (!Array.isArray(results)) return [];
      return results.map(coerceResult).filter((r): r is TavilyResult => r !== null);
    },

    async extract(
      urls: string[],
      signal: AbortSignal
    ): Promise<{ url: string; content: string }[]> {
      if (urls.length === 0) return [];
      const body = { urls, extract_depth: 'basic' };
      const data = await tavilyFetch(EXTRACT_URL, apiKey, body, signal, EXTRACT_TIMEOUT_MS);
      const results = (data as { results?: unknown })?.results;
      if (!Array.isArray(results)) return [];
      const out: { url: string; content: string }[] = [];
      for (const r of results) {
        if (!r || typeof r !== 'object') continue;
        const rec = r as Record<string, unknown>;
        if (typeof rec.url !== 'string') continue;
        const content = typeof rec.raw_content === 'string' ? rec.raw_content : '';
        out.push({ url: rec.url, content });
      }
      return out;
    },
  };
}
