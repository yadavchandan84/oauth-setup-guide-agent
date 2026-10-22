import type express from 'express';
import type { StreamEvent } from './generated/schema.js';
import type { AppInput } from './agent/input.js';

export interface SseWriter {
  send<E extends StreamEvent>(e: E): void;
  end(): void;
  readonly closed: boolean;
}

const HEARTBEAT_MS = 15_000;

/**
 * Open a Server-Sent Events stream on the response. Sets the four SSE headers, flushes them,
 * writes an initial `retry: 0`, and starts a 15 s heartbeat. `send` is a no-op once the
 * response has ended or the socket is destroyed.
 */
export function openSse(res: express.Response): SseWriter {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  res.write('retry: 0\n\n');

  let seq = 0;

  const isClosed = (): boolean => res.writableEnded || res.socket?.destroyed === true;

  const heartbeat = setInterval(() => {
    if (isClosed()) return;
    res.write(': ping\n\n');
  }, HEARTBEAT_MS);
  // Don't keep the event loop alive solely for the heartbeat.
  heartbeat.unref?.();

  return {
    send(e) {
      if (isClosed()) return;
      seq += 1;
      res.write(`id: ${seq}\nevent: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`);
    },
    end() {
      clearInterval(heartbeat);
      if (!res.writableEnded) res.end();
    },
    get closed() {
      return isClosed();
    },
  };
}

type MetaData = Extract<StreamEvent, { event: 'meta' }>['data'];

/** Shared by the short-circuit path and runGeneration so `meta` is identical for both. */
export const buildMeta = (
  requestId: string,
  input: AppInput,
  now: Date,
  force: boolean
): MetaData =>
  ({
    requestId,
    query: input.raw,
    appName: input.displayName,
    key: input.key,
    startedAt: now.toISOString(),
    force,
  }) satisfies MetaData;
