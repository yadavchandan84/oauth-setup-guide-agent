import { describe, it, expect } from 'vitest';
import { assembleGuide, normalizeDraft, slugify } from '../src/agent/postprocess.js';
import { GuideSchema } from '../src/generated/schema.js';
import { asanaInput, makeDraft, makeSources, makeVerification } from './helpers.js';

const NOW = new Date('2026-10-20T12:00:00Z');
const suffix = () => 'abc123';

function assemble(draftPartial = {}, verification = makeVerification(), sources = makeSources()) {
  return assembleGuide({
    draft: makeDraft(draftPartial),
    verification,
    sources,
    input: asanaInput,
    now: NOW,
    model: 'gpt-4o-mini',
    randomSuffix: suffix,
  });
}

describe('slugify', () => {
  it('decomposes diacritics via NFKD (combining marks become separators)', () => {
    // "Déjà": NFKD puts a combining mark between "de" and "ja", which the
    // [^a-z0-9]+ rule turns into a single "-".
    expect(slugify('Café Déjà')).toBe('cafe-de-ja');
  });
  it('falls back to "app"', () => {
    expect(slugify('!!!')).toBe('app');
  });
});

describe('assembleGuide happy path', () => {
  it('produces a GuideSchema-valid guide', () => {
    const guide = assemble();
    expect(GuideSchema.safeParse(guide).success).toBe(true);
    expect(guide.generatedBy).toBe('live-agent');
    expect(guide.generatedAt.endsWith('Z')).toBe(true);
    expect(guide.model).toBe('gpt-4o-mini');
    expect(guide.query).toBe('Asana');
  });

  it('sets lastVerified to the UTC date of now', () => {
    const guide = assembleGuide({
      draft: makeDraft(),
      verification: makeVerification(),
      sources: makeSources(),
      input: asanaInput,
      now: new Date('2026-10-20T23:30:00-05:00'), // => 2026-10-21T04:30:00Z
      model: 'gpt-4o-mini',
      randomSuffix: suffix,
    });
    expect(guide.verification.lastVerified).toBe('2026-10-21');
  });
});

describe('normalizeDraft rules', () => {
  it('rule 1: null optional strings become empty/undefined (website null stays null internally)', () => {
    const d = normalizeDraft(makeDraft({ app: { ...makeDraft().app, website: null } }), makeSources());
    expect(d.app.website).toBeNull();
  });

  it('rule 2: empty step is dropped', () => {
    const draft = makeDraft({
      steps: [
        { title: '', detail: 'x', consoleUrl: null, actor: 'human', estimate: null, gotcha: null },
        {
          title: 'Keep me',
          detail: 'has detail',
          consoleUrl: null,
          actor: 'human',
          estimate: null,
          gotcha: null,
        },
      ],
    });
    const d = normalizeDraft(draft, makeSources());
    expect(d.steps).toHaveLength(1);
    expect(d.steps[0].title).toBe('Keep me');
  });

  it('rule 3: empty criticalPath becomes the placeholder', () => {
    const d = normalizeDraft(
      makeDraft({ timeEstimate: { ...makeDraft().timeEstimate, criticalPath: '   ' } }),
      makeSources()
    );
    expect(d.timeEstimate.criticalPath).toBe('Not stated in the retrieved sources.');
  });

  it('rule 4: empty review.types -> ["other"] when required, ["none"] otherwise', () => {
    const req = normalizeDraft(
      makeDraft({ review: { ...makeDraft().review, required: true, types: [] } }),
      makeSources()
    );
    expect(req.review.types).toEqual(['other']);
    const notReq = normalizeDraft(
      makeDraft({ review: { ...makeDraft().review, required: false, types: [] } }),
      makeSources()
    );
    expect(notReq.review.types).toEqual(['none']);
  });

  it('rule 5: inverted and negative durations are fixed', () => {
    const d = normalizeDraft(
      makeDraft({
        timeEstimate: {
          ...makeDraft().timeEstimate,
          handsOn: { min: 20, max: 5, unit: 'minutes', note: null },
          approvalWait: { min: -4, max: -1, unit: 'minutes', note: null },
        },
      }),
      makeSources()
    );
    expect(d.timeEstimate.handsOn.min).toBe(5);
    expect(d.timeEstimate.handsOn.max).toBe(20);
    expect(d.timeEstimate.approvalWait.min).toBe(0);
    expect(d.timeEstimate.approvalWait.max).toBe(0);
  });

  it('rule 6: invented app.website on a non-retrieved domain is dropped', () => {
    const d = normalizeDraft(
      makeDraft({ app: { ...makeDraft().app, website: 'https://totally-made-up.example/' } }),
      makeSources()
    );
    expect(d.app.website).toBeNull();
  });

  it('rule 7: supported + 0 steps -> unclear + uncertain note', () => {
    const sink: string[] = [];
    const d = normalizeDraft(
      makeDraft({ oauthAvailability: { status: 'supported', note: null, alternatives: [] }, steps: [] }),
      makeSources(),
      sink
    );
    expect(d.oauthAvailability.status).toBe('unclear');
    expect(sink.some((s) => s.includes('no concrete setup steps'))).toBe(true);
  });

  it('rule 8: invalid brand color -> default', () => {
    const d = normalizeDraft(
      makeDraft({ app: { ...makeDraft().app, brand: { color: 'not-a-hex', monogram: 'AS' } } }),
      makeSources()
    );
    expect(d.app.brand.color).toBe('#6366F1');
  });
});

describe('assembleGuide source handling', () => {
  it('drops source index 99 (not retrieved) from sourceRefs', () => {
    const draft = makeDraft();
    draft.confidence.steps.sourceIndexes = [99];
    const guide = assemble();
    const guide2 = assembleGuide({
      draft,
      verification: makeVerification(),
      sources: makeSources(),
      input: asanaInput,
      now: NOW,
      model: 'gpt-4o-mini',
      randomSuffix: suffix,
    });
    for (const ref of guide2.confidence.steps.sourceRefs) {
      expect(ref).toBeLessThan(guide2.verification.sources.length);
    }
  });

  it('sets a consoleUrl on an unretrieved domain to null', () => {
    const draft = makeDraft();
    draft.steps[0].consoleUrl = 'https://evil.example/console';
    const guide = assembleGuide({
      draft,
      verification: makeVerification(),
      sources: makeSources(),
      input: asanaInput,
      now: NOW,
      model: 'gpt-4o-mini',
      randomSuffix: suffix,
    });
    expect(guide.steps[0].consoleUrl).toBeNull();
  });

  it('empty source title falls back to hostname', () => {
    const sources = makeSources([{ title: '' }]);
    const guide = assembleGuide({
      draft: makeDraft(),
      verification: makeVerification(),
      sources,
      input: asanaInput,
      now: NOW,
      model: 'gpt-4o-mini',
      randomSuffix: suffix,
    });
    expect(guide.verification.sources[0].title).toBe('developers.asana.com');
  });
});

describe('assembleGuide confidence rules', () => {
  it('confidence is min(draft, verifier)', () => {
    const verification = makeVerification();
    verification.sections.steps = { level: 'community', note: 'downgraded' };
    const guide = assembleGuide({
      draft: makeDraft(), // steps draft level = verified
      verification,
      sources: makeSources(),
      input: asanaInput,
      now: NOW,
      model: 'gpt-4o-mini',
      randomSuffix: suffix,
    });
    expect(guide.confidence.steps.level).toBe('community');
    // note taken from verifier because it lowered the level
    expect(guide.confidence.steps.note).toBe('downgraded');
  });

  it('verifier-null caps every section at community and adds an uncertain note', () => {
    const guide = assembleGuide({
      draft: makeDraft(),
      verification: null,
      sources: makeSources(),
      input: asanaInput,
      now: NOW,
      model: 'gpt-4o-mini',
      randomSuffix: suffix,
    });
    for (const k of Object.keys(guide.confidence) as (keyof typeof guide.confidence)[]) {
      expect(['community', 'uncertain']).toContain(guide.confidence[k].level);
    }
    expect(guide.verification.uncertain.some((u) => u.includes('verification pass did not complete'))).toBe(
      true
    );
  });

  it('downgrades verified to community when no official source in sourceRefs', () => {
    const sources = makeSources([{ kind: 'community' }, { kind: 'community' }]);
    const guide = assembleGuide({
      draft: makeDraft(),
      verification: makeVerification(),
      sources,
      input: asanaInput,
      now: NOW,
      model: 'gpt-4o-mini',
      randomSuffix: suffix,
    });
    expect(guide.confidence.steps.level).toBe('community');
  });
});

describe('no-OAuth draft', () => {
  it('assembles into a valid guide', () => {
    const draft = makeDraft({
      oauthAvailability: {
        status: 'not-supported',
        note: 'Uses API keys instead.',
        alternatives: ['Personal access token'],
      },
      steps: [],
      review: { required: false, requiredWhen: 'n/a', types: [], stages: [] },
    });
    const guide = assembleGuide({
      draft,
      verification: makeVerification(),
      sources: makeSources(),
      input: asanaInput,
      now: NOW,
      model: 'gpt-4o-mini',
      randomSuffix: suffix,
    });
    expect(GuideSchema.safeParse(guide).success).toBe(true);
    expect(guide.oauthAvailability.status).toBe('not-supported');
  });
});

describe('monogram from key', () => {
  it('derives UN for "Ünity"', () => {
    const input = { raw: 'Ünity', kind: 'name' as const, displayName: 'Ünity', key: 'unity', domainHint: null };
    const guide = assembleGuide({
      draft: makeDraft({ app: { ...makeDraft().app, name: 'Ünity' } }),
      verification: makeVerification(),
      sources: makeSources(),
      input,
      now: NOW,
      model: 'gpt-4o-mini',
      randomSuffix: suffix,
    });
    expect(guide.app.brand.monogram).toBe('UN');
    expect(GuideSchema.safeParse(guide).success).toBe(true);
  });
});
