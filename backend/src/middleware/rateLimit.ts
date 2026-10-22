import { rateLimit, type AugmentedRequest } from 'express-rate-limit';
import type { RequestHandler } from 'express';
import type { Concurrency } from './concurrency.js';
import { releaseSlot } from './concurrency.js';
import { sendError } from './errorHandler.js';

/**
 * Rate limiter for the generate endpoint. It runs AFTER the slot is acquired, so its handler
 * must release the slot before responding 429. Cache/curated short-circuits never reach it.
 */
export function createLimiter(
  windowMs: number,
  limit: number,
  concurrency: Concurrency
): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => {
      releaseSlot(concurrency, res);
      const reset = (req as AugmentedRequest).rateLimit.resetTime; // Date | undefined
      const retryAfterSec = Math.max(
        1,
        Math.ceil(((reset?.getTime() ?? Date.now() + windowMs) - Date.now()) / 1000)
      );
      res.setHeader('Retry-After', String(retryAfterSec));
      sendError(
        res,
        429,
        'RATE_LIMITED',
        `Hourly limit reached. Try again in ${Math.ceil(retryAfterSec / 60)} min.`,
        retryAfterSec
      );
    },
  });
}
