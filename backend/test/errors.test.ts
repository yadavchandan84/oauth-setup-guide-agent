import { describe, it, expect } from 'vitest';
import { AgentError } from '../src/errors.js';

// Re-implement the route's classify for a focused unit test (same logic as generate.ts).
function classify(err: unknown, signal: AbortSignal): AgentError {
  if (signal.aborted) {
    const reason = signal.reason;
    if (reason instanceof AgentError) return reason;
    return new AgentError('TIMEOUT', 'Generation took too long.', true);
  }
  if (err instanceof AgentError) return err;
  return new AgentError('INTERNAL', 'Something went wrong.', true);
}

describe('classify', () => {
  it('aborted with TIMEOUT reason -> TIMEOUT even when err is an SDK abort error', () => {
    const ac = new AbortController();
    ac.abort(new AgentError('TIMEOUT', 'timed out', true));
    const sdkErr = { name: 'APIUserAbortError', message: 'Request was aborted.' };
    const e = classify(sdkErr, ac.signal);
    expect(e.code).toBe('TIMEOUT');
  });

  it('aborted with CLIENT_GONE reason -> CLIENT_GONE', () => {
    const ac = new AbortController();
    ac.abort(new AgentError('CLIENT_GONE', 'client disconnected'));
    const e = classify(new Error('whatever'), ac.signal);
    expect(e.code).toBe('CLIENT_GONE');
  });

  it('a plain Error -> INTERNAL', () => {
    const ac = new AbortController();
    const e = classify(new Error('boom'), ac.signal);
    expect(e.code).toBe('INTERNAL');
  });

  it('an AgentError passes through', () => {
    const ac = new AbortController();
    const original = new AgentError('NO_SOURCES', 'nope', false);
    const e = classify(original, ac.signal);
    expect(e).toBe(original);
  });
});
