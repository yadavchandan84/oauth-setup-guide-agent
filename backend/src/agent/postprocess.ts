import { customAlphabet } from 'nanoid';
import { CONFIDENCE_RANK, GuideSchema, SECTION_KEYS } from '../generated/schema.js';
import type { Guide, GuideInput, SectionKey } from '../generated/schema.js';

type Confidence = keyof typeof CONFIDENCE_RANK;
import type { GuideDraft, Verification } from './draftSchema.js';
import type { AppInput, } from './input.js';
import type { PromptSource } from './pipeline.js';

const DEFAULT_COLOR = '#6366F1';
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
const PLACEHOLDER = 'Not stated in the retrieved sources.';

const defaultRandomSuffix = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 6);

// ---- schema limit mirror (for clampToSchemaLimits) ----
const LIMITS = {
  summary: 700,
  difficultyReason: 200,
  criticalPath: 300,
  requiredWhen: 300,
  durationNote: 240,
  confidenceNote: 300,
  oauthNote: 400,
  stepTitle: 120,
  stepDetail: 1200,
  stepEstimate: 60,
  stepGotcha: 300,
  prereqItem: 160,
  prereqDetail: 400,
  stageName: 80,
  stageDescription: 400,
  scopeRecommended: 120,
  scopeSensitive: 160,
  scopePurpose: 200,
  scopeConsequence: 300,
  blockerTitle: 120,
  blockerText: 300,
  blockerResolution: 600,
  noteString: 300,
  exampleString: 200,
  handoffString: 200,
  alternativeString: 200,
  verificationString: 300,
  sourceTitle: 200,
} as const;

export function slugify(s: string): string {
  const slug = s
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'app';
}

const trunc = (s: string, max: number): string => (s.length > max ? s.slice(0, max) : s);
const clampArr = <T>(arr: T[], max: number): T[] => (arr.length > max ? arr.slice(0, max) : arr);

const emptyToUndef = (s: string | null | undefined): string | undefined => {
  if (s === null || s === undefined) return undefined;
  const t = s.trim();
  return t === '' ? undefined : t;
};

const requiredStr = (s: string | null | undefined): string => {
  const t = (s ?? '').trim();
  return t === '' ? PLACEHOLDER : t;
};

function registrable(hostname: string): string {
  return hostname.toLowerCase().split('.').slice(-2).join('.');
}

function retrievedDomains(sources: PromptSource[]): Set<string> {
  const set = new Set<string>();
  for (const s of sources) {
    try {
      set.add(registrable(new URL(s.url).hostname));
    } catch {
      // ignore
    }
  }
  return set;
}

function allowedUrl(url: string | null | undefined, domains: Set<string>): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  return domains.has(registrable(parsed.hostname)) ? url : null;
}

interface NormalizedDraft extends GuideDraft {}

/** Coerce strict-mode LLM output into something GuideSchema can accept. 8 rules, each unit-tested. */
export function normalizeDraft(
  draft: GuideDraft,
  sources: PromptSource[],
  uncertainSink: string[] = []
): NormalizedDraft {
  const domains = retrievedDomains(sources);
  const d: GuideDraft = structuredClone(draft);

  // Rule 5: durations.
  const fixDuration = (dr: GuideDraft['timeEstimate']['handsOn']) => {
    let min = Math.max(0, dr.min);
    let max = Math.max(0, dr.max);
    if (min > max) [min, max] = [max, min];
    dr.min = Math.round(min * 10) / 10;
    dr.max = Math.round(max * 10) / 10;
    const note = emptyToUndef(dr.note);
    dr.note = note === undefined ? null : note;
  };
  fixDuration(d.timeEstimate.handsOn);
  fixDuration(d.timeEstimate.approvalWait);
  for (const stage of d.review.stages) fixDuration(stage.duration);

  // Rule 1 + 2 + 3: trim strings, drop empty array items, placeholders for required strings.
  d.summary = requiredStr(d.summary);
  d.difficulty.reason = requiredStr(d.difficulty.reason);
  d.timeEstimate.criticalPath = requiredStr(d.timeEstimate.criticalPath);
  d.review.requiredWhen = requiredStr(d.review.requiredWhen);

  // Rule 1: null -> undefined for optional strings (represented as empty -> null here;
  // GuideSchema optionals get undefined via emptyToUndef at assembly).
  d.oauthAvailability.note = (emptyToUndef(d.oauthAvailability.note) ?? null) as string | null;
  d.app.website = (emptyToUndef(d.app.website) ?? null) as string | null;

  d.oauthAvailability.alternatives = d.oauthAvailability.alternatives
    .map((a) => a.trim())
    .filter((a) => a.length > 0);

  // steps
  d.steps = d.steps
    .map((s) => ({
      ...s,
      title: s.title.trim(),
      detail: s.detail.trim(),
      estimate: (emptyToUndef(s.estimate) ?? null) as string | null,
      gotcha: (emptyToUndef(s.gotcha) ?? null) as string | null,
    }))
    .filter((s) => s.title.length > 0 && s.detail.length > 0);

  // blockers
  d.blockers = d.blockers
    .map((b) => ({
      ...b,
      title: b.title.trim(),
      resolution: b.resolution.trim(),
      symptom: requiredStr(b.symptom),
      cause: requiredStr(b.cause),
    }))
    .filter((b) => b.title.length > 0 && b.resolution.length > 0);

  // prerequisites
  d.prerequisites = d.prerequisites
    .map((p) => ({
      ...p,
      item: p.item.trim(),
      detail: (emptyToUndef(p.detail) ?? null) as string | null,
    }))
    .filter((p) => p.item.length > 0);

  // scopes
  d.scopes.recommended = d.scopes.recommended
    .map((s) => ({ scope: s.scope.trim(), purpose: requiredStr(s.purpose) }))
    .filter((s) => s.scope.length > 0);
  d.scopes.sensitive = d.scopes.sensitive
    .map((s) => ({ scope: s.scope.trim(), level: s.level, consequence: requiredStr(s.consequence) }))
    .filter((s) => s.scope.length > 0);
  d.scopes.notes = d.scopes.notes.map((n) => n.trim()).filter((n) => n.length > 0);

  d.redirectUris.notes = d.redirectUris.notes.map((n) => n.trim()).filter((n) => n.length > 0);
  d.redirectUris.examples = d.redirectUris.examples.map((e) => e.trim()).filter((e) => e.length > 0);

  d.agentHandoff.agentCan = d.agentHandoff.agentCan.map((s) => s.trim()).filter((s) => s.length > 0);
  d.agentHandoff.humanMust = d.agentHandoff.humanMust.map((s) => s.trim()).filter((s) => s.length > 0);
  d.agentHandoff.handoffPoints = d.agentHandoff.handoffPoints
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // review stages required strings
  d.review.stages = d.review.stages.map((s) => ({
    ...s,
    name: requiredStr(s.name),
    description: requiredStr(s.description),
  }));

  // Rule 4: review.types dedupe; empty -> fallback.
  d.review.types = [...new Set(d.review.types)];
  if (d.review.types.length === 0) {
    d.review.types = d.review.required ? ['other'] : ['none'];
  }

  // Rule 6: app.website allow-list.
  d.app.website = allowedUrl(d.app.website, domains);

  // consoleUrl allow-list.
  d.steps = d.steps.map((s) => ({ ...s, consoleUrl: allowedUrl(s.consoleUrl, domains) }));

  // Rule 7: supported + 0 steps -> unclear + uncertain note.
  if (d.oauthAvailability.status === 'supported' && d.steps.length === 0) {
    d.oauthAvailability.status = 'unclear';
    uncertainSink.push('The agent found no concrete setup steps in the retrieved sources.');
  }

  // Rule 8: brand color.
  if (!HEX_RE.test(d.app.brand.color)) d.app.brand.color = DEFAULT_COLOR;

  return d;
}

/** Finding #2: trim verifier fields, drop empty array items, empty note -> undefined. */
export function normalizeVerification(v: Verification): Verification {
  const trimArr = (arr: string[]): string[] => arr.map((s) => s.trim()).filter((s) => s.length > 0);
  const sections = {} as Verification['sections'];
  for (const k of SECTION_KEYS) {
    const sec = v.sections[k];
    sections[k] = { level: sec.level, note: sec.note.trim() };
  }
  return {
    sections,
    checked: trimArr(v.checked),
    corrected: trimArr(v.corrected),
    uncertain: trimArr(v.uncertain),
  };
}

const minLevel = (a: Confidence, b: Confidence): Confidence =>
  CONFIDENCE_RANK[a] <= CONFIDENCE_RANK[b] ? a : b;

export interface AssembleArgs {
  draft: GuideDraft;
  verification: Verification | null;
  sources: PromptSource[];
  input: AppInput;
  now: Date;
  model: string;
  randomSuffix?: () => string;
  /** Pipeline notes to prepend to verification.uncertain before truncating. */
  pipelineNotes?: string[];
}

/**
 * Assemble a draft (+ optional verification) into a GuideSchema-valid Guide.
 * Pure and synchronous. Throws the zod error if the final parse fails.
 */
export function assembleGuide(args: AssembleArgs): Guide {
  const { draft: rawDraft, verification: rawVerification, sources, input, now, model } = args;
  const randomSuffix = args.randomSuffix ?? defaultRandomSuffix;

  const uncertainExtra: string[] = [];
  const draft = normalizeDraft(rawDraft, sources, uncertainExtra);

  const verification = rawVerification ? normalizeVerification(rawVerification) : null;

  const domains = retrievedDomains(sources);

  // Build the kept source list: cited draft indexes + the read pages, re-indexed.
  const dateStr = now.toISOString().slice(0, 10);
  const keptSourceUrls: string[] = [];
  const indexRemap = new Map<number, number>(); // original candidate index -> new index

  const addSource = (originalIndex: number): number | undefined => {
    const src = sources.find((s) => s.index === originalIndex);
    if (!src) return undefined;
    if (indexRemap.has(originalIndex)) return indexRemap.get(originalIndex);
    const newIndex = keptSourceUrls.length;
    keptSourceUrls.push(src.url);
    indexRemap.set(originalIndex, newIndex);
    return newIndex;
  };

  // First, keep every cited source (in draft order of appearance).
  for (const k of SECTION_KEYS) {
    for (const idx of draft.confidence[k].sourceIndexes) addSource(idx);
  }
  // Then ensure at least the read (non-snippet) pages are present so verification has ≥1 source.
  for (const s of sources) {
    if (!s.snippetOnly) addSource(s.index);
  }
  // Fallback: if still empty, keep the first source.
  if (keptSourceUrls.length === 0 && sources.length > 0) addSource(sources[0].index);

  const sourceByOriginal = new Map(sources.map((s) => [s.index, s]));
  const builtSources = keptSourceUrls.map((url, newIdx) => {
    const original = [...indexRemap.entries()].find(([, n]) => n === newIdx)?.[0];
    const src = original !== undefined ? sourceByOriginal.get(original) : undefined;
    let title = src?.title?.trim() ?? '';
    if (title === '') {
      try {
        title = new URL(url).hostname;
      } catch {
        title = url;
      }
    }
    return {
      url,
      title: trunc(title, LIMITS.sourceTitle),
      kind: (src?.kind ?? 'community') as 'official' | 'community',
      accessed: dateStr,
    };
  });

  const officialNewIndexes = new Set<number>();
  builtSources.forEach((s, i) => {
    if (s.kind === 'official') officialNewIndexes.add(i);
  });

  // Confidence per section.
  const buildConfidence = (k: SectionKey) => {
    const draftConf = draft.confidence[k];
    const verifierLevel = verification ? verification.sections[k].level : null;
    let level: Confidence = draftConf.level;
    if (verifierLevel) level = minLevel(level, verifierLevel);
    if (!verification) level = minLevel(level, 'community'); // cap when no verifier

    const sourceRefs = draftConf.sourceIndexes
      .map((idx) => indexRemap.get(idx))
      .filter((n): n is number => n !== undefined);
    const uniqueRefs = clampArr([...new Set(sourceRefs)], 10);

    // Downgrade verified -> community when no official source in sourceRefs.
    if (level === 'verified' && !uniqueRefs.some((r) => officialNewIndexes.has(r))) {
      level = 'community';
    }

    // Confidence note: verifier's note when it LOWERED the level, else draft's note.
    let note: string | undefined;
    if (verification && verifierLevel && CONFIDENCE_RANK[verifierLevel] < CONFIDENCE_RANK[draftConf.level]) {
      note = emptyToUndef(verification.sections[k].note);
    } else {
      note = emptyToUndef(draftConf.note);
    }
    if (note !== undefined) note = trunc(note, LIMITS.confidenceNote);

    return { level, note, sourceRefs: uniqueRefs };
  };

  const confidence = {} as Guide['confidence'];
  for (const k of SECTION_KEYS) confidence[k] = buildConfidence(k);

  // Verification uncertain: prepend pipeline notes BEFORE truncating to 15.
  const pipelineNotes = [...(args.pipelineNotes ?? []), ...uncertainExtra];
  let checked: string[] = verification ? verification.checked : [];
  let corrected: string[] = verification ? verification.corrected : [];
  let uncertain: string[] = verification ? verification.uncertain : [];
  if (!verification) {
    pipelineNotes.push('Automated verification pass did not complete; treat this guide as unverified.');
  }
  uncertain = [...pipelineNotes, ...uncertain];
  checked = clampArr(checked.map((s) => trunc(s, LIMITS.verificationString)), 15);
  corrected = clampArr(corrected.map((s) => trunc(s, LIMITS.verificationString)), 15);
  uncertain = clampArr(uncertain.map((s) => trunc(s, LIMITS.verificationString)), 15);

  // Slug.
  let slug = `${slugify(draft.app.name || input.displayName).slice(0, 50).replace(/-+$/, '')}-${randomSuffix()}`;

  // Monogram from key.
  const monogram = input.key.slice(0, 2).toUpperCase();
  const color = HEX_RE.test(draft.app.brand.color) ? draft.app.brand.color : DEFAULT_COLOR;

  const guideInput: GuideInput = {
    schemaVersion: 1,
    slug,
    aliases: [],
    app: {
      name: trunc(requiredStr(draft.app.name), 80),
      ...(draft.app.website ? { website: draft.app.website } : {}),
      category: draft.app.category,
      brand: { color, monogram },
    },
    summary: trunc(requiredStr(draft.summary), LIMITS.summary),
    oauthAvailability: {
      status: draft.oauthAvailability.status,
      ...(emptyToUndef(draft.oauthAvailability.note)
        ? { note: trunc(draft.oauthAvailability.note!.trim(), LIMITS.oauthNote) }
        : {}),
      alternatives: clampArr(
        draft.oauthAvailability.alternatives.map((a) => trunc(a, LIMITS.alternativeString)),
        6
      ),
    },
    difficulty: {
      level: draft.difficulty.level,
      reason: trunc(requiredStr(draft.difficulty.reason), LIMITS.difficultyReason),
    },
    timeEstimate: {
      handsOn: clampDuration(draft.timeEstimate.handsOn),
      approvalWait: clampDuration(draft.timeEstimate.approvalWait),
      criticalPath: trunc(requiredStr(draft.timeEstimate.criticalPath), LIMITS.criticalPath),
    },
    review: {
      required: draft.review.required,
      requiredWhen: trunc(requiredStr(draft.review.requiredWhen), LIMITS.requiredWhen),
      types: clampArr(draft.review.types, 5) as GuideInput['review']['types'],
      stages: clampArr(
        draft.review.stages.map((s) => ({
          name: trunc(requiredStr(s.name), LIMITS.stageName),
          actor: s.actor,
          duration: clampDuration(s.duration),
          description: trunc(requiredStr(s.description), LIMITS.stageDescription),
        })),
        8
      ),
    },
    prerequisites: clampArr(
      draft.prerequisites.map((p) => ({
        item: trunc(p.item, LIMITS.prereqItem),
        ...(emptyToUndef(p.detail) ? { detail: trunc(p.detail!.trim(), LIMITS.prereqDetail) } : {}),
        actor: p.actor,
      })),
      12
    ),
    steps: clampArr(
      draft.steps.map((s) => ({
        title: trunc(s.title, LIMITS.stepTitle),
        detail: trunc(s.detail, LIMITS.stepDetail),
        consoleUrl: s.consoleUrl,
        actor: s.actor,
        ...(emptyToUndef(s.estimate) ? { estimate: trunc(s.estimate!.trim(), LIMITS.stepEstimate) } : {}),
        ...(emptyToUndef(s.gotcha) ? { gotcha: trunc(s.gotcha!.trim(), LIMITS.stepGotcha) } : {}),
      })),
      20
    ),
    redirectUris: {
      notes: clampArr(draft.redirectUris.notes.map((n) => trunc(n, LIMITS.noteString)), 8),
      examples: clampArr(draft.redirectUris.examples.map((e) => trunc(e, LIMITS.exampleString)), 5),
    },
    scopes: {
      recommended: clampArr(
        draft.scopes.recommended.map((s) => ({
          scope: trunc(s.scope, LIMITS.scopeRecommended),
          purpose: trunc(requiredStr(s.purpose), LIMITS.scopePurpose),
        })),
        15
      ),
      sensitive: clampArr(
        draft.scopes.sensitive.map((s) => ({
          scope: trunc(s.scope, LIMITS.scopeSensitive),
          level: s.level,
          consequence: trunc(requiredStr(s.consequence), LIMITS.scopeConsequence),
        })),
        15
      ),
      notes: clampArr(draft.scopes.notes.map((n) => trunc(n, LIMITS.noteString)), 8),
    },
    blockers: clampArr(
      draft.blockers.map((b) => ({
        title: trunc(b.title, LIMITS.blockerTitle),
        symptom: trunc(requiredStr(b.symptom), LIMITS.blockerText),
        cause: trunc(requiredStr(b.cause), LIMITS.blockerText),
        resolution: trunc(b.resolution, LIMITS.blockerResolution),
        actor: b.actor,
      })),
      12
    ),
    agentHandoff: {
      agentCan: clampArr(draft.agentHandoff.agentCan.map((s) => trunc(s, LIMITS.handoffString)), 10),
      humanMust: clampArr(draft.agentHandoff.humanMust.map((s) => trunc(s, LIMITS.handoffString)), 10),
      handoffPoints: clampArr(
        draft.agentHandoff.handoffPoints.map((s) => trunc(s, LIMITS.handoffString)),
        8
      ),
    },
    confidence,
    verification: {
      lastVerified: dateStr,
      sources: builtSources.length > 0 ? builtSources : fallbackSource(sources, dateStr),
      checked,
      corrected,
      uncertain,
    },
    generatedBy: 'live-agent',
    generatedAt: now.toISOString(),
    model,
    query: input.raw,
  };

  const result = GuideSchema.safeParse(guideInput);
  if (!result.success) {
    // Regenerate slug once if it collided with the reserved form; otherwise throw for retry path.
    throw result.error;
  }
  return result.data;
}

function clampDuration(d: GuideDraft['timeEstimate']['handsOn']): GuideInput['timeEstimate']['handsOn'] {
  const out: GuideInput['timeEstimate']['handsOn'] = {
    min: Math.min(10000, Math.max(0, d.min)),
    max: Math.min(10000, Math.max(0, d.max)),
    unit: d.unit,
  };
  const note = emptyToUndef(d.note);
  if (note !== undefined) out.note = trunc(note, LIMITS.durationNote);
  return out;
}

function fallbackSource(
  sources: PromptSource[],
  dateStr: string
): GuideInput['verification']['sources'] {
  const first = sources[0];
  if (!first) {
    // Should not happen (NO_SOURCES earlier); keep schema satisfiable.
    return [{ url: 'https://example.com/', title: 'No sources', kind: 'community', accessed: dateStr }];
  }
  let title = first.title.trim();
  if (title === '') {
    try {
      title = new URL(first.url).hostname;
    } catch {
      title = first.url;
    }
  }
  return [{ url: first.url, title: trunc(title, LIMITS.sourceTitle), kind: first.kind, accessed: dateStr }];
}
