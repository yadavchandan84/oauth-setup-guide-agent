import express, { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { customAlphabet } from 'nanoid';
import { z } from 'zod';
import type { Config } from '../config.js';
import type { CuratedIndex } from '../curated.js';
import type { GuideStore } from '../store/types.js';
import type { Logger } from '../log.js';
import { AgentError, toWire } from '../errors.js';
import { normalizeAppInput } from '../agent/input.js';
import type { AppInput } from '../agent/input.js';
import type { PipelineDeps } from '../agent/pipeline.js';
import { runPipeline as defaultRunPipeline } from '../agent/pipeline.js';
import type { Guide } from '../generated/schema.js';
import { buildMeta, openSse } from '../sse.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { sendError } from '../middleware/errorHandler.js';
import type { Concurrency } from '../middleware/concurrency.js';
import { releaseSlot } from '../middleware/concurrency.js';
import { createLimiter } from '../middleware/rateLimit.js';

const requestIdGen = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);

const GenerateBody = z
  .object({ app: z.string(), force: z.boolean().optional().default(false) })
  .strict();

export interface GenerateDeps {
  config: Config;
  store: GuideStore;
  curated: CuratedIndex;
  concurrency: Concurrency;
  runPipeline: typeof defaultRunPipeline;
  pipelineDeps: PipelineDeps;
  now: () => Date;
  log: Logger;
}

function writeShortCircuit(
  res: Response,
  deps: GenerateDeps,
  input: AppInput,
  requestId: string,
  now: Date,
  force: boolean,
  guide: Guide,
  origin: 'curated' | 'cache'
): void {
  const sse = openSse(res);
  const start = now.getTime();
  sse.send({ event: 'meta', data: buildMeta(requestId, input, now, force) });
  sse.send({
    event: 'step',
    data: {
      id: 'resolve',
      stage: 'resolve',
      status: 'done',
      label: origin === 'curated' ? 'Found curated guide' : 'Found cached guide',
      at: now.toISOString(),
    },
  });
  sse.send({ event: 'guide', data: { guide, origin, cached: true, persisted: true } });
  sse.send({ event: 'done', data: { ok: true, slug: guide.slug, durationMs: Date.now() - start } });
  sse.end();
}

function classify(err: unknown, signal: AbortSignal): AgentError {
  if (signal.aborted) {
    const reason = signal.reason;
    if (reason instanceof AgentError) return reason;
    return new AgentError('TIMEOUT', 'Generation took too long and was stopped. Please try again.', true);
  }
  if (err instanceof AgentError) return err;
  return new AgentError('INTERNAL', 'Something went wrong while generating the guide.', true);
}

export function createGenerateRouter(deps: GenerateDeps): Router {
  const router = Router();
  const { config, store, curated, concurrency, log } = deps;

  const limiter = createLimiter(config.rateLimitWindowMs, config.rateLimitMax, concurrency);

  // 2. validateBody
  const validateBody = (req: Request, res: Response, next: NextFunction): void => {
    const parsed = GenerateBody.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, 'INVALID_INPUT', 'Enter a public app name or developer docs URL (max 200 characters).');
      return;
    }
    const norm = normalizeAppInput(parsed.data.app);
    if (!norm.ok) {
      sendError(res, 400, 'INVALID_INPUT', norm.message);
      return;
    }
    const requestId = requestIdGen();
    res.locals.requestId = requestId;
    res.locals.input = norm.value;
    res.locals.force = parsed.data.force;
    res.locals.now = deps.now();
    next();
  };

  // 3. shortCircuit (skipped when force)
  const shortCircuit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const input = res.locals.input as AppInput;
    const force = res.locals.force as boolean;
    const requestId = res.locals.requestId as string;
    const now = res.locals.now as Date;
    if (force) return next();

    const curatedHit = curated.match(input.key);
    if (curatedHit) {
      writeShortCircuit(res, deps, input, requestId, now, force, curatedHit, 'curated');
      return;
    }

    try {
      const cachedSlug = await store.getCache(input.key);
      if (cachedSlug) {
        const cached = await store.get(cachedSlug);
        if (cached) {
          writeShortCircuit(res, deps, input, requestId, now, force, cached, 'cache');
          return;
        }
      }
    } catch {
      log.warn('cache lookup failed; treating as miss', { requestId });
    }
    next();
  };

  // 4. requireConfig
  const requireConfig = (_req: Request, res: Response, next: NextFunction): void => {
    if (!config.llmConfigured || !config.searchConfigured) {
      sendError(
        res,
        503,
        'CONFIG_MISSING',
        "Live generation isn't configured on this server (missing OPENAI_API_KEY / TAVILY_API_KEY). The curated library still works."
      );
      return;
    }
    next();
  };

  // 5. acquireSlot (synchronous)
  const acquireSlot = (_req: Request, res: Response, next: NextFunction): void => {
    if (!concurrency.tryAcquire()) {
      sendError(res, 503, 'BUSY', 'The agent is busy right now. Please try again shortly.', 30);
      return;
    }
    res.locals.slot = true;
    res.once('close', () => releaseSlot(concurrency, res));
    next();
  };

  // 7. runGeneration
  const runGeneration = async (req: Request, res: Response): Promise<void> => {
    const input = res.locals.input as AppInput;
    const requestId = res.locals.requestId as string;
    const now = res.locals.now as Date;
    const force = res.locals.force as boolean;

    const ac = new AbortController();
    const timer = setTimeout(
      () =>
        ac.abort(
          new AgentError('TIMEOUT', 'Generation took too long and was stopped. Please try again.', true)
        ),
      config.generationTimeoutMs
    );
    res.on('close', () => {
      if (!res.writableEnded) ac.abort(new AgentError('CLIENT_GONE', 'client disconnected'));
    });

    const xff = req.headers['x-forwarded-for'];
    const xffHops = typeof xff === 'string' ? xff.split(',').length : Array.isArray(xff) ? xff.length : 0;
    log.debug('generate request', { requestId, ip: req.ip, xffHops });

    const sse = openSse(res);
    const start = now.getTime();
    sse.send({ event: 'meta', data: buildMeta(requestId, input, now, force) });

    try {
      const guide = await deps.runPipeline(input, {
        signal: ac.signal,
        emit: sse.send,
        requestId,
        curatedDomains: curated.officialDomainsFor(input.key),
        deps: deps.pipelineDeps,
      });
      sse.send({ event: 'done', data: { ok: true, slug: guide.slug, durationMs: Date.now() - start } });
    } catch (err) {
      const e = classify(err, ac.signal);
      if (e.code === 'CLIENT_GONE') {
        log.info('client gone', { requestId });
      } else {
        sse.send({ event: 'error', data: toWire(e) });
        sse.send({ event: 'done', data: { ok: false, slug: null, durationMs: Date.now() - start } });
      }
    } finally {
      clearTimeout(timer);
      sse.end();
      releaseSlot(concurrency, res);
    }
  };

  router.post(
    '/',
    express.json({ limit: '2kb' }),
    validateBody,
    asyncHandler(shortCircuit),
    requireConfig,
    acquireSlot,
    limiter,
    asyncHandler(runGeneration)
  );

  return router;
}
