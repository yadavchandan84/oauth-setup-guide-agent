import { describe, it, expect } from 'vitest';
import { describeError } from './errors';
import type { ClientErrorCode } from '../generated/schema';

const ALL_CODES: ClientErrorCode[] = [
  'INVALID_INPUT',
  'INVALID_SLUG',
  'NOT_FOUND',
  'RATE_LIMITED',
  'BUSY',
  'CONFIG_MISSING',
  'SEARCH_FAILED',
  'NO_SOURCES',
  'LLM_FAILED',
  'TIMEOUT',
  'STORE_UNAVAILABLE',
  'INTERNAL',
  'NETWORK',
  'BAD_RESPONSE',
  'STREAM_INTERRUPTED',
];

describe('describeError', () => {
  it('maps every ClientErrorCode to a non-empty title', () => {
    for (const code of ALL_CODES) {
      const view = describeError(code, '', {});
      expect(view.title.length).toBeGreaterThan(0);
      expect(view.message.length).toBeGreaterThan(0);
    }
  });

  it('RATE_LIMITED with 1800s renders "Try again in 30 min"', () => {
    const view = describeError('RATE_LIMITED', '', { retryAfterSec: 1800 });
    expect(view.message).toContain('Try again in 30 min');
    expect(view.retry).toBe('later');
    expect(view.retryAfterSec).toBe(1800);
  });

  it('RATE_LIMITED includes the rateLimitMax hint when provided', () => {
    const view = describeError('RATE_LIMITED', '', { retryAfterSec: 1800, rateLimitMax: 5 });
    expect(view.message).toContain('5 live generations per hour');
  });

  it('a generation failure with retryable:false yields retry "none"', () => {
    const view = describeError('LLM_FAILED', 'nope', { retryable: false });
    expect(view.retry).toBe('none');
  });

  it('a generation failure with retryable:true yields retry "now"', () => {
    const view = describeError('SEARCH_FAILED', 'try later', { retryable: true });
    expect(view.retry).toBe('now');
  });

  it('NOT_FOUND and INVALID_SLUG both map to "Guide not found" with no retry', () => {
    expect(describeError('NOT_FOUND', '', {}).title).toBe('Guide not found');
    expect(describeError('INVALID_SLUG', '', {}).title).toBe('Guide not found');
    expect(describeError('NOT_FOUND', '', {}).retry).toBe('none');
  });

  it('NETWORK is retryable now', () => {
    expect(describeError('NETWORK', '', {}).retry).toBe('now');
  });

  it('uses the server message when provided', () => {
    const view = describeError('INTERNAL', 'Boom happened', {});
    expect(view.message).toBe('Boom happened');
  });
});
