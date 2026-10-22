import type { ClientErrorCode } from '../generated/schema';

export interface ErrorView {
  title: string;
  message: string;
  retry: 'now' | 'later' | 'none';
  retryAfterSec?: number;
}

const DEFAULT_MESSAGE: Record<ClientErrorCode, string> = {
  CONFIG_MISSING:
    "Live generation isn't configured on this server. The curated library still works.",
  BUSY: 'The agent is handling other requests right now.',
  RATE_LIMITED: 'You have used your hourly live generations.',
  INVALID_INPUT: 'Enter a public app name or developer docs URL (max 200 characters).',
  INVALID_SLUG: "That guide address isn't valid.",
  NOT_FOUND: "We don't have a guide for that yet.",
  NO_SOURCES: "We couldn't find developer docs for that app. Try pasting the docs URL.",
  NETWORK: "Can't reach the agent server. Check your connection and try again.",
  STORE_UNAVAILABLE: 'Saved guides are temporarily unavailable.',
  SEARCH_FAILED: 'The research step failed. Please try again.',
  LLM_FAILED: 'The guide writer failed. Please try again.',
  TIMEOUT: 'Generation took too long and was stopped. Please try again.',
  INTERNAL: 'Something went wrong while generating the guide.',
  STREAM_INTERRUPTED: 'The connection dropped before the guide finished.',
  BAD_RESPONSE: 'The server returned an unexpected response.',
};

const TITLES: Record<ClientErrorCode, string> = {
  CONFIG_MISSING: 'Live generation unavailable',
  BUSY: 'The agent is busy',
  RATE_LIMITED: 'Hourly limit reached',
  INVALID_INPUT: 'Check your input',
  INVALID_SLUG: 'Guide not found',
  NOT_FOUND: 'Guide not found',
  NO_SOURCES: 'No developer docs found',
  NETWORK: "Can't reach the agent server",
  STORE_UNAVAILABLE: 'Storage is temporarily unavailable',
  SEARCH_FAILED: 'Generation failed',
  LLM_FAILED: 'Generation failed',
  TIMEOUT: 'Generation failed',
  INTERNAL: 'Generation failed',
  STREAM_INTERRUPTED: 'Generation failed',
  BAD_RESPONSE: 'Generation failed',
};

const GENERATION_FAILURES: ReadonlySet<ClientErrorCode> = new Set<ClientErrorCode>([
  'SEARCH_FAILED',
  'LLM_FAILED',
  'TIMEOUT',
  'INTERNAL',
  'STREAM_INTERRUPTED',
  'BAD_RESPONSE',
]);

/**
 * Single client-side source of truth for error titles, body text and retry behaviour.
 * Pages never switch on error codes themselves.
 *
 * `rateLimitMax` (from GET /api/health) is used only to enrich the RATE_LIMITED hint.
 */
export function describeError(
  code: ClientErrorCode,
  message: string,
  opts: { retryable?: boolean; retryAfterSec?: number; rateLimitMax?: number } = {},
): ErrorView {
  const title = TITLES[code] ?? 'Something went wrong';
  const body = message.trim() || DEFAULT_MESSAGE[code] || 'Something went wrong.';

  if (code === 'RATE_LIMITED') {
    const sec = opts.retryAfterSec ?? 0;
    const minutes = Math.max(1, Math.ceil(sec / 60));
    const limitHint = opts.rateLimitMax
      ? ` This server allows ${opts.rateLimitMax} live generations per hour.`
      : '';
    return {
      title,
      message: `Try again in ${minutes} min.${limitHint}`,
      retry: 'later',
      retryAfterSec: sec,
    };
  }

  if (code === 'BUSY') {
    return {
      title,
      message: body,
      retry: 'later',
      retryAfterSec: opts.retryAfterSec ?? 30,
    };
  }

  if (code === 'NETWORK' || code === 'STORE_UNAVAILABLE') {
    return { title, message: body, retry: 'now' };
  }

  if (GENERATION_FAILURES.has(code)) {
    const retryable = opts.retryable ?? true;
    return { title, message: body, retry: retryable ? 'now' : 'none' };
  }

  // CONFIG_MISSING, INVALID_INPUT, INVALID_SLUG, NOT_FOUND, NO_SOURCES
  return { title, message: body, retry: 'none' };
}
