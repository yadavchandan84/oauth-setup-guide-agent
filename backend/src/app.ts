import express from 'express';
import helmet from 'helmet';
import type { Config } from './config.js';
import type { CuratedIndex } from './curated.js';
import type { GuideStore } from './store/types.js';
import type { Logger } from './log.js';
import type { PipelineDeps } from './agent/pipeline.js';
import { runPipeline as defaultRunPipeline } from './agent/pipeline.js';
import { corsMiddleware } from './middleware/cors.js';
import { createConcurrency } from './middleware/concurrency.js';
import { createErrorHandler, sendError } from './middleware/errorHandler.js';
import { createHealthRouter } from './routes/health.js';
import { createGuidesRouter } from './routes/guides.js';
import { createGenerateRouter } from './routes/generate.js';

export interface AppDeps {
  config: Config;
  store: GuideStore;
  curated: CuratedIndex;
  runPipeline: typeof defaultRunPipeline;
  pipelineDeps: PipelineDeps;
  now: () => Date;
  log: Logger;
}

export function createApp(deps: AppDeps): express.Express {
  const { config, store, curated, log } = deps;
  const app = express();
  const startedAt = Date.now();
  const concurrency = createConcurrency(config.maxConcurrentGenerations);

  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(corsMiddleware(config.allowedOrigins));

  app.use('/api/health', createHealthRouter(config, store, startedAt));
  app.use('/api/guides', createGuidesRouter(curated, store, log));
  app.use(
    '/api/generate',
    createGenerateRouter({
      config,
      store,
      curated,
      concurrency,
      runPipeline: deps.runPipeline,
      pipelineDeps: deps.pipelineDeps,
      now: deps.now,
      log,
    })
  );

  // JSON 404
  app.use((_req, res) => {
    sendError(res, 404, 'NOT_FOUND', 'Not found.');
  });

  app.use(createErrorHandler(log));

  return app;
}
