import { Router } from 'express';
import { GuideSchema, toSummary } from '../generated/schema.js';
import type { GuideSummary } from '../generated/schema.js';
import type { CuratedIndex } from '../curated.js';
import type { GuideStore } from '../store/types.js';
import type { Logger } from '../log.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { sendError } from '../middleware/errorHandler.js';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function createGuidesRouter(curated: CuratedIndex, store: GuideStore, log: Logger): Router {
  const router = Router();

  // GET /api/guides -> { curated, recent }
  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      let recent: GuideSummary[] = [];
      try {
        recent = await store.listRecent(20);
        // validate output shape (NIT)
        recent = recent.filter((s) => {
          // summaries are derived; a shallow guard is enough here
          return s && typeof s.slug === 'string';
        });
      } catch {
        log.warn('listRecent failed; returning empty recent');
        recent = [];
      }
      res.json({ curated: curated.summaries, recent });
    })
  );

  // GET /api/guides/:slug
  router.get(
    '/:slug',
    asyncHandler(async (req, res) => {
      const slug = req.params.slug;
      if (!SLUG_RE.test(slug) || slug.length > 80) {
        return sendError(res, 400, 'INVALID_SLUG', 'Invalid guide slug.');
      }

      const curatedGuide = curated.bySlug.get(slug);
      if (curatedGuide) {
        res.setHeader('Cache-Control', 'public, max-age=300');
        return res.json(curatedGuide);
      }

      let stored;
      try {
        stored = await store.get(slug);
      } catch {
        log.error('store.get failed', { slug });
        return sendError(res, 503, 'STORE_UNAVAILABLE', 'Storage is temporarily unavailable.');
      }

      if (!stored) {
        return sendError(res, 404, 'NOT_FOUND', 'Guide not found.');
      }

      // Validate response against the schema (NIT).
      const parsed = GuideSchema.safeParse(stored);
      if (!parsed.success) {
        log.warn('stored guide failed response validation', { slug });
        return sendError(res, 404, 'NOT_FOUND', 'Guide not found.');
      }

      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.json(parsed.data);
    })
  );

  return router;
}
