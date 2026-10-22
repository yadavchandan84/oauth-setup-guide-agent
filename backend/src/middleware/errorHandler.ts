import type { ErrorRequestHandler, Response } from 'express';
import type { ErrorCode } from '../generated/schema.js';
import { AgentError } from '../errors.js';
import type { Logger } from '../log.js';

/** Send a pre-stream JSON error body with the matching HTTP status. */
export function sendError(
  res: Response,
  status: number,
  code: ErrorCode,
  message: string,
  retryAfterSec?: number
): void {
  if (res.headersSent) return;
  res.status(status).json({
    error: { code, message, ...(retryAfterSec !== undefined ? { retryAfterSec } : {}) },
  });
}

interface BodyParserError extends Error {
  type?: string;
  status?: number;
  statusCode?: number;
}

export function createErrorHandler(log: Logger): ErrorRequestHandler {
  return (err, _req, res, _next) => {
    if (res.headersSent) {
      // Stream already open; nothing more we can send as JSON.
      return;
    }

    const bodyErr = err as BodyParserError;
    if (bodyErr?.type === 'entity.too.large') {
      return sendError(res, 400, 'INVALID_INPUT', 'Request body is too large (max 2 KB).');
    }
    if (bodyErr?.type === 'entity.parse.failed') {
      return sendError(res, 400, 'INVALID_INPUT', 'Request body is not valid JSON.');
    }

    if (err instanceof AgentError) {
      return sendError(res, err.status, err.code as ErrorCode, err.message);
    }

    log.error('unhandled error', {
      err: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return sendError(res, 500, 'INTERNAL', 'Something went wrong.');
  };
}
