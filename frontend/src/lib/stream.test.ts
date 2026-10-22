import { describe, it, expect, vi, afterEach } from 'vitest';
import { streamGenerate, type ClientStreamEvent } from './stream';
import { ApiError } from './api';
import { curatedGuides } from '../generated/curatedGuides';

const githubGuide = curatedGuides.find((g) => g.slug === 'github')!;

function streamResponse(chunks: string[], { ok = true, status = 200 } = {}): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/event-stream' },
  }) as Response & { ok: boolean };
}

function jsonErrorResponse(code: string, message: string, status = 503): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => vi.restoreAllMocks());

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

describe('streamGenerate', () => {
  it('parses events across awkward chunk boundaries', async () => {
    const meta = sseEvent('meta', {
      requestId: 'r1',
      query: 'GitHub',
      appName: 'GitHub',
      key: 'github',
      startedAt: '2026-10-20T00:00:00Z',
      force: false,
    });
    const step = sseEvent('step', {
      id: 'resolve',
      stage: 'resolve',
      status: 'done',
      label: 'Resolving GitHub…',
      at: '2026-10-20T00:00:01Z',
    });
    const guide = sseEvent('guide', {
      guide: githubGuide,
      origin: 'fresh',
      cached: false,
      persisted: true,
    });
    const done = sseEvent('done', { ok: true, slug: 'github', durationMs: 1000 });

    // Split the whole payload into tiny 7-char chunks.
    const whole = meta + step + guide + done;
    const chunks: string[] = [];
    for (let i = 0; i < whole.length; i += 7) chunks.push(whole.slice(i, i + 7));

    const firstByte = vi.fn();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(streamResponse(chunks));

    const events: ClientStreamEvent[] = [];
    await streamGenerate({
      app: 'GitHub',
      onEvent: (e) => events.push(e),
      onFirstByte: firstByte,
    });

    expect(firstByte).toHaveBeenCalledOnce();
    expect(events.map((e) => e.event)).toEqual(['meta', 'step', 'guide', 'done']);
  });

  it('throws ApiError on a non-ok JSON response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonErrorResponse('CONFIG_MISSING', 'not configured'),
    );
    await expect(
      streamGenerate({ app: 'GitHub', onEvent: () => {} }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('synthesizes STREAM_INTERRUPTED when the stream truncates without done/error', async () => {
    const meta = sseEvent('meta', {
      requestId: 'r1',
      query: 'GitHub',
      appName: 'GitHub',
      key: 'github',
      startedAt: '2026-10-20T00:00:00Z',
      force: false,
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(streamResponse([meta]));

    const events: ClientStreamEvent[] = [];
    await streamGenerate({ app: 'GitHub', onEvent: (e) => events.push(e) });

    const last = events[events.length - 1];
    expect(last.event).toBe('error');
    if (last.event === 'error') expect(last.data.code).toBe('STREAM_INTERRUPTED');
  });

  it('turns an invalid guide payload into BAD_RESPONSE', async () => {
    const badGuide = sseEvent('guide', {
      guide: { slug: 'nope' },
      origin: 'fresh',
      cached: false,
      persisted: false,
    });
    const done = sseEvent('done', { ok: true, slug: 'nope', durationMs: 1 });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(streamResponse([badGuide, done]));

    const events: ClientStreamEvent[] = [];
    await streamGenerate({ app: 'GitHub', onEvent: (e) => events.push(e) });

    const errorEvent = events.find((e) => e.event === 'error');
    expect(errorEvent).toBeDefined();
    if (errorEvent?.event === 'error') expect(errorEvent.data.code).toBe('BAD_RESPONSE');
  });
});
