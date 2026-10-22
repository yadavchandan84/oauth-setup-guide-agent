import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Wrap an async handler so rejected promises reach Express 4's error handler. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
