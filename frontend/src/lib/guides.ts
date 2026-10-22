import { toSummary, type Guide, type GuideSummary } from '../generated/schema';

type CuratedModule = { curatedGuides: Guide[] };

let cache: Promise<Guide[]> | null = null;

/** Dynamically imports the bundled curated guides, cached after the first call. */
export async function loadCurated(): Promise<Guide[]> {
  if (!cache) {
    cache = import('../generated/curatedGuides').then(
      (m: CuratedModule) => m.curatedGuides,
    );
  }
  return cache;
}

export async function getCuratedSummaries(): Promise<GuideSummary[]> {
  const guides = await loadCurated();
  return guides.map(toSummary);
}

export async function getCuratedBySlug(slug: string): Promise<Guide | null> {
  const guides = await loadCurated();
  return guides.find((g) => g.slug === slug) ?? null;
}

const normalizeKey = (s: string) => s.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');

export interface SummaryFilters {
  q?: string;
  difficulty?: string;
  review?: 'any' | 'required' | 'none';
  category?: string;
}

/**
 * Filters summaries by text, difficulty, review status and category.
 *
 * Text match is case-insensitive against app.name, app.category, reviewTypes and aliases.
 * The query is also compared in normalized form against aliases, so "gmail" and "G Suite"
 * both find Google Workspace.
 */
export function searchSummaries(
  list: GuideSummary[],
  filters: SummaryFilters = {},
): GuideSummary[] {
  const { q, difficulty, review = 'any', category } = filters;
  const query = (q ?? '').trim().toLowerCase();
  const normQuery = normalizeKey(q ?? '');

  return list.filter((s) => {
    if (difficulty && difficulty !== 'All' && s.difficulty.level !== difficulty) return false;

    if (review === 'required' && !s.reviewRequired) return false;
    if (review === 'none' && s.reviewRequired) return false;

    if (category && category !== 'All' && s.app.category !== category) return false;

    if (query) {
      const haystack = [
        s.app.name.toLowerCase(),
        s.app.category.toLowerCase(),
        ...s.reviewTypes.map((t) => t.toLowerCase()),
        ...s.aliases.map((a) => a.toLowerCase()),
      ];
      const textHit = haystack.some((h) => h.includes(query));
      const aliasHit = normQuery.length > 0 && s.aliases.some((a) => normalizeKey(a).includes(normQuery));
      if (!textHit && !aliasHit) return false;
    }

    return true;
  });
}
