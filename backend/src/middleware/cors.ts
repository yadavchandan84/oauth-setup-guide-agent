import cors from 'cors';
import type { RequestHandler } from 'express';

/**
 * Exact-match CORS. A request with no Origin (curl, uptime pings) is allowed. A disallowed
 * origin gets no Access-Control-Allow-Origin header, so the browser blocks it.
 */
export function corsMiddleware(allowedOrigins: string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);
  return cors({
    origin: (origin, cb) => cb(null, !origin || allowed.has(origin)),
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept'],
    maxAge: 600,
  });
}
