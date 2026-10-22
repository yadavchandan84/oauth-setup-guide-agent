import type { Response } from 'express';

export interface Concurrency {
  tryAcquire(): boolean;
  release(): void;
  readonly active: number;
}

export function createConcurrency(max: number): Concurrency {
  let active = 0;
  return {
    tryAcquire() {
      if (active >= max) return false;
      active += 1;
      return true;
    },
    release() {
      if (active > 0) active -= 1;
    },
    get active() {
      return active;
    },
  };
}

/** Idempotent per request: releases the slot exactly once no matter which path frees it. */
export function releaseSlot(concurrency: Concurrency, res: Response): void {
  if (res.locals.slot) {
    res.locals.slot = false;
    concurrency.release();
  }
}
