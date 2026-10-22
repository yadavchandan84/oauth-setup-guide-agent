import { createParser, type EventSourceMessage } from 'eventsource-parser';
import {
  GuideSchema,
  type ClientErrorCode,
  type StreamEvent,
} from '../generated/schema';
import { API_BASE, ApiError, errorFromResponse } from './api';

/**
 * Server stream events, but the `error` event's code is widened to ClientErrorCode so the
 * client can synthesize BAD_RESPONSE and STREAM_INTERRUPTED.
 */
export type ClientStreamEvent =
  | Exclude<StreamEvent, { event: 'error' }>
  | { event: 'error'; data: { code: ClientErrorCode; message: string; retryable: boolean } };

export interface StreamGenerateOptions {
  app: string;
  force?: boolean;
  signal?: AbortSignal;
  onEvent: (event: ClientStreamEvent) => void;
  onFirstByte?: () => void;
}

/**
 * POST /api/generate as a streamed SSE request.
 *
 * - onFirstByte fires the moment fetch resolves (response headers received), which the
 *   cold-start notice uses to hide itself.
 * - A `guide` payload is re-validated with GuideSchema; failure becomes a synthetic
 *   BAD_RESPONSE error event.
 * - Events after the first terminal event (done/error) are ignored. A stream that delivers
 *   a `guide` and then ends without an explicit `done` is treated as a complete run.
 * - A stream that ends with no terminal event at all synthesizes STREAM_INTERRUPTED.
 */
export async function streamGenerate(opts: StreamGenerateOptions): Promise<void> {
  const { app, force = false, signal, onEvent, onFirstByte } = opts;

  const res = await fetch(API_BASE + '/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ app, force }),
    signal,
  }).catch((err: unknown) => {
    if (signal?.aborted) throw signal.reason ?? err;
    throw new ApiError({
      status: 0,
      code: 'NETWORK',
      message: "Can't reach the agent server.",
      retryable: true,
    });
  });

  onFirstByte?.();

  if (!res.ok) throw await errorFromResponse(res);
  if (!res.body) {
    throw new ApiError({
      status: res.status,
      code: 'BAD_RESPONSE',
      message: 'The server returned an empty response.',
      retryable: true,
    });
  }

  let settled = false; // a terminal event (done/error/guide-complete) was seen
  let sawTerminal = false;

  const emit = (event: ClientStreamEvent) => {
    if (settled) return; // ignore anything after the first terminal event
    if (event.event === 'guide') {
      const parsed = GuideSchema.safeParse(event.data.guide);
      if (!parsed.success) {
        settled = true;
        sawTerminal = true;
        onEvent({
          event: 'error',
          data: {
            code: 'BAD_RESPONSE',
            message: 'The generated guide failed validation.',
            retryable: true,
          },
        });
        return;
      }
      onEvent({ event: 'guide', data: { ...event.data, guide: parsed.data } });
      return;
    }
    if (event.event === 'done' || event.event === 'error') {
      settled = true;
      sawTerminal = true;
    }
    onEvent(event);
  };

  const parser = createParser({
    onEvent: (message: EventSourceMessage) => {
      if (!message.event) return;
      let data: unknown;
      try {
        data = JSON.parse(message.data);
      } catch {
        return;
      }
      emit({ event: message.event, data } as ClientStreamEvent);
    },
  });

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) parser.feed(value);
      if (settled) break;
    }
  } finally {
    reader.cancel().catch(() => {});
  }

  if (!sawTerminal) {
    onEvent({
      event: 'error',
      data: {
        code: 'STREAM_INTERRUPTED',
        message: 'The connection dropped before the guide finished.',
        retryable: true,
      },
    });
  }
}
