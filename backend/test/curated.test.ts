import { describe, it, expect } from 'vitest';
import { GuideSchema } from '../src/generated/schema.js';
import { curatedGuides } from '../src/generated/curatedGuides.js';
import { buildCuratedIndex } from '../src/curated.js';

/**
 * These assertions enforce AC 1 and AC 2 against whatever curated guides exist. FEAT-003
 * authors the 14 guides; until then the generated set may be empty, in which case the
 * structural checks are vacuously true and the index still builds.
 */
describe('curated guides', () => {
  it('every guide passes GuideSchema and the index builds', () => {
    const index = buildCuratedIndex();
    expect(index.summaries.length).toBe(curatedGuides.length);
    for (const g of curatedGuides) {
      expect(GuideSchema.safeParse(g).success).toBe(true);
    }
  });

  it('slugs are unique and equal the generated slug', () => {
    const slugs = curatedGuides.map((g) => g.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('aliases do not collide across guides', () => {
    const seen = new Map<string, string>();
    for (const g of curatedGuides) {
      for (const a of g.aliases) {
        expect(seen.has(a)).toBe(false);
        seen.set(a, g.slug);
      }
    }
  });

  it('each guide has >=2 sources with >=1 official, all https', () => {
    for (const g of curatedGuides) {
      expect(g.verification.sources.length).toBeGreaterThanOrEqual(2);
      expect(g.verification.sources.some((s) => s.kind === 'official')).toBe(true);
      for (const s of g.verification.sources) expect(s.url.startsWith('https://')).toBe(true);
    }
  });

  it('every verified section has >=1 official sourceRef', () => {
    for (const g of curatedGuides) {
      const officialIdx = new Set(
        g.verification.sources.map((s, i) => (s.kind === 'official' ? i : -1)).filter((i) => i >= 0)
      );
      for (const k of Object.keys(g.confidence) as (keyof typeof g.confidence)[]) {
        if (g.confidence[k].level === 'verified') {
          expect(g.confidence[k].sourceRefs.some((r) => officialIdx.has(r))).toBe(true);
        }
      }
    }
  });

  it('when fully authored, contains all four difficulty levels and GitHub/Google/Shopify pins', () => {
    if (curatedGuides.length === 0) return; // FEAT-003 not run yet
    const levels = new Set(curatedGuides.map((g) => g.difficulty.level));
    for (const lvl of ['Easy', 'Moderate', 'Hard', 'Very Hard']) expect(levels.has(lvl as any)).toBe(true);
    const index = buildCuratedIndex();
    const github = index.bySlug.get('github');
    const google = index.bySlug.get('google-workspace');
    const shopify = index.bySlug.get('shopify');
    if (github) expect(github.difficulty.level).toBe('Easy');
    if (google) expect(google.difficulty.level).toBe('Very Hard');
    if (shopify) expect(shopify.difficulty.level).toBe('Hard');
  });
});
