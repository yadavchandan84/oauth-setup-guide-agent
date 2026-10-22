import type { ApiErrorBody, ClientErrorCode, ErrorCode } from '../generated/schema';

export const API_BASE =
  (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '') ||
  (import.meta.env.DEV ? 'http://localhost:8787' : '');

export const apiConfigured = API_BASE !== '';

/** HTTP status codes do not matter to the UI; the ClientErrorCode drives everything. */
export class ApiError extends Error {
  status: number;
  code: ClientErrorCode;
  retryAfterSec?: number;
  retryable: boolean;

  constructor(opts: {
    status: number;
    code: ClientErrorCode;
    message: string;
    retryAfterSec?: number;
    retryable: boolean;
  }) {
    super(opts.message);
    this.name = 'ApiError';
    this.status = opts.status;
    this.code = opts.code;
    this.retryAfterSec = opts.retryAfterSec;
    this.retryable = opts.retryable;
  }
}

const SERVER_ERROR_CODES: ReadonlySet<string> = new Set<ErrorCode>([
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
]);

/** Codes whose failures are not worth retrying immediately. */
const NON_RETRYABLE: ReadonlySet<string> = new Set<ClientErrorCode>([
  'INVALID_INPUT',
  'INVALID_SLUG',
  'NOT_FOUND',
  'CONFIG_MISSING',
  'NO_SOURCES',
]);

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (!value || typeof value !== 'object') return false;
  const err = (value as { error?: unknown }).error;
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' && SERVER_ERROR_CODES.has(code);
}

/** Build an ApiError from a non-ok Response, used by getJson and streamGenerate. */
export async function errorFromResponse(res: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (isApiErrorBody(body)) {
    const { code, message, retryAfterSec } = body.error;
    return new ApiError({
      status: res.status,
      code,
      message,
      retryAfterSec,
      retryable: !NON_RETRYABLE.has(code),
    });
  }
  return new ApiError({
    status: res.status,
    code: 'BAD_RESPONSE',
    message: 'The server returned an unexpected response.',
    retryable: true,
  });
}

export async function getJson<T>(
  path: string,
  opts: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<T> {
  const { signal, timeoutMs = 70000 } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new ApiError({
    status: 0,
    code: 'NETWORK',
    message: 'The server took too long to respond.',
    retryable: true,
  })), timeoutMs);

  const onAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    const res = await fetch(API_BASE + path, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) throw await errorFromResponse(res);
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    // Our own timeout reason surfaces here.
    if (controller.signal.reason instanceof ApiError) throw controller.signal.reason;
    // Caller-initiated abort propagates untouched.
    if (signal?.aborted) throw signal.reason ?? err;
    throw new ApiError({
      status: 0,
      code: 'NETWORK',
      message: "Can't reach the agent server.",
      retryable: true,
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
