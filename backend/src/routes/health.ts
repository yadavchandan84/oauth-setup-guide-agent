import { Router } from 'express';
import type { Config } from '../config.js';
import type { GuideStore } from '../store/types.js';

const VERSION = '1.0.0';

export function createHealthRouter(config: Config, store: GuideStore, startedAt: number): Router {
  const router = Router();
  router.get('/', (_req, res) => {
    res.json({
      status: 'ok',
      uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
      version: VERSION,
      store: store.kind,
      llmConfigured: config.llmConfigured,
      searchConfigured: config.searchConfigured,
      rateLimitMax: config.rateLimitMax,
      time: new Date().toISOString(),
    });
  });
  return router;
}
