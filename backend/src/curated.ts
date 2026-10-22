import { GuideSchema, toSummary } from './generated/schema.js';
import { curatedGuides } from './generated/curatedGuides.js';
import type { Guide, GuideSummary } from './generated/schema.js';
import { registrableDomain } from './agent/sources.js';

export interface CuratedIndex {
  bySlug: Map<string, Guide>;
  byKey: Map<string, Guide>;
  summaries: GuideSummary[];
  match(key: string): Guide | undefined;
  officialDomainsFor(key: string): Set<string>;
}

const normalizeKey = (s: string): string =>
  s.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Build the curated index from the generated guides. Every guide is validated with
 * GuideSchema.parse at boot; a failure throws (tests catch this too).
 */
export function buildCuratedIndex(guides: Guide[] = curatedGuides): CuratedIndex {
  const bySlug = new Map<string, Guide>();
  const byKey = new Map<string, Guide>();
  const summaries: GuideSummary[] = [];

  for (const raw of guides) {
    const guide = GuideSchema.parse(raw); // fatal on failure
    bySlug.set(guide.slug, guide);
    summaries.push(toSummary(guide));

    const keys = new Set<string>();
    keys.add(guide.slug.replace(/-/g, ''));
    keys.add(normalizeKey(guide.app.name));
    for (const alias of guide.aliases) keys.add(alias);
    for (const k of keys) if (k.length > 0 && !byKey.has(k)) byKey.set(k, guide);
  }

  const match = (key: string): Guide | undefined => byKey.get(key);

  const officialDomainsFor = (key: string): Set<string> => {
    const guide = match(key);
    const domains = new Set<string>();
    if (!guide) return domains;
    for (const source of guide.verification.sources) {
      if (source.kind !== 'official') continue;
      try {
        domains.add(registrableDomain(new URL(source.url).hostname));
      } catch {
        // ignore unparseable URL
      }
    }
    return domains;
  };

  return { bySlug, byKey, summaries, match, officialDomainsFor };
}
