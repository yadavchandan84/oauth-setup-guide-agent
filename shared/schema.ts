import { z } from 'zod';

export const SCHEMA_VERSION = 1 as const;
export const Difficulty = z.enum(['Easy', 'Moderate', 'Hard', 'Very Hard']);
export const Confidence = z.enum(['verified', 'community', 'uncertain']); // ordered high→low
export const Actor = z.enum(['agent', 'human', 'assist']); // UI: "Agent can do" | "You must do" | "Agent can assist"
export const Category = z.enum(['Developer Tools', 'Productivity', 'Communication', 'Payments',
  'E-commerce', 'CRM', 'Identity', 'Project Management', 'Design', 'Video', 'Other']);
export const ReviewType = z.enum(['none', 'optional-listing', 'app-review', 'oauth-verification',
  'security-assessment', 'publisher-verification', 'admin-consent', 'partner-program',
  'platform-onboarding', 'other']);
export const ScopeLevel = z.enum(['sensitive', 'restricted', 'admin', 'privileged']);
export const SECTION_KEYS = ['difficulty', 'timeEstimate', 'review', 'prerequisites', 'steps',
  'redirectUris', 'scopes', 'blockers', 'agentHandoff'] as const;

const Str = (max: number) => z.string().trim().min(1).max(max);
const HttpsUrl = z.string().url().max(500).refine(u => u.startsWith('https://'), 'must be https');
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => {
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s); // rejects 2026-13-45, 2026-02-30
}, 'invalid calendar date');

export const DurationRange = z.object({
  min: z.number().min(0).max(10000),
  max: z.number().min(0).max(10000),
  unit: z.enum(['minutes', 'hours', 'days', 'weeks']),
  note: Str(240).optional(),
}).refine(d => d.min <= d.max, 'min must be <= max');

export const SectionConfidence = z.object({
  level: Confidence,
  note: Str(300).optional(),
  sourceRefs: z.array(z.number().int().min(0)).max(10).default([]), // indexes into verification.sources
});

export const Source = z.object({
  url: HttpsUrl, title: Str(200),
  kind: z.enum(['official', 'community']),
  accessed: IsoDate,
});

export const GuideSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  aliases: z.array(z.string().regex(/^[a-z0-9]+$/).max(40)).max(15).default([]), // normalized keys
  app: z.object({
    name: Str(80),
    website: HttpsUrl.optional(),
    category: Category,
    brand: z.object({ color: z.string().regex(/^#[0-9A-Fa-f]{6}$/), monogram: z.string().regex(/^[A-Za-z0-9]{1,3}$/) }),
  }),
  summary: Str(700),
  oauthAvailability: z.object({
    status: z.enum(['supported', 'not-supported', 'unclear']),
    note: Str(400).optional(),
    alternatives: z.array(Str(200)).max(6).default([]),
  }),
  difficulty: z.object({ level: Difficulty, reason: Str(200) }),
  timeEstimate: z.object({
    handsOn: DurationRange,
    approvalWait: DurationRange,          // {min:0,max:0} when no review
    criticalPath: Str(300),               // e.g. "CASA assessment dominates"
  }),
  review: z.object({
    required: z.boolean(),
    requiredWhen: Str(300),               // "Only for public apps requesting restricted scopes"
    types: z.array(ReviewType).min(1).max(5),
    stages: z.array(z.object({
      name: Str(80), actor: Actor, duration: DurationRange, description: Str(400),
    })).max(8),                           // drives the approval-wait timeline; [] when none
  }),
  prerequisites: z.array(z.object({ item: Str(160), detail: Str(400).optional(), actor: Actor })).max(12),
  steps: z.array(z.object({
    title: Str(120), detail: Str(1200),
    consoleUrl: HttpsUrl.nullable(),
    actor: Actor,
    estimate: Str(60).optional(),         // "5 min"
    gotcha: Str(300).optional(),
  })).max(20),
  redirectUris: z.object({ notes: z.array(Str(300)).max(8), examples: z.array(Str(200)).max(5) }),
  scopes: z.object({
    recommended: z.array(z.object({ scope: Str(120), purpose: Str(200) })).max(15),
    sensitive: z.array(z.object({ scope: Str(160), level: ScopeLevel, consequence: Str(300) })).max(15),
    notes: z.array(Str(300)).max(8),
  }),
  blockers: z.array(z.object({
    title: Str(120), symptom: Str(300), cause: Str(300), resolution: Str(600), actor: Actor,
  })).max(12),
  agentHandoff: z.object({
    agentCan: z.array(Str(200)).max(10),
    humanMust: z.array(Str(200)).max(10),
    handoffPoints: z.array(Str(200)).max(8),
  }),
  confidence: z.object({                  // keys written literally; must equal SECTION_KEYS
    difficulty: SectionConfidence, timeEstimate: SectionConfidence, review: SectionConfidence,
    prerequisites: SectionConfidence, steps: SectionConfidence, redirectUris: SectionConfidence,
    scopes: SectionConfidence, blockers: SectionConfidence, agentHandoff: SectionConfidence,
  }),
  verification: z.object({
    lastVerified: IsoDate,
    sources: z.array(Source).min(1).max(15),
    checked: z.array(Str(300)).max(15),
    corrected: z.array(Str(300)).max(15),
    uncertain: z.array(Str(300)).max(15),
  }),
  generatedBy: z.enum(['curated', 'live-agent']),
  generatedAt: z.string().datetime(),
  model: z.string().max(60).nullable().default(null), // OpenAI model for live guides
  query: z.string().max(200).nullable().default(null), // original user input for live guides
}).superRefine((g, ctx) => {
  if (g.oauthAvailability.status === 'supported' && g.steps.length === 0)
    ctx.addIssue({ code: 'custom', path: ['steps'], message: 'supported guides need >=1 step' });
  for (const k of SECTION_KEYS) for (const r of g.confidence[k].sourceRefs)
    if (r >= g.verification.sources.length)
      ctx.addIssue({ code: 'custom', path: ['confidence', k], message: 'sourceRef out of range' });
});
export type Guide = z.infer<typeof GuideSchema>;      // output (defaults applied)
export type GuideInput = z.input<typeof GuideSchema>; // authoring shape (defaults optional)
export type SectionKey = (typeof SECTION_KEYS)[number];
export type GuideSummary = Pick<Guide, 'slug' | 'aliases' | 'app' | 'difficulty' | 'generatedBy' | 'generatedAt'> & {
  reviewRequired: boolean; reviewTypes: Guide['review']['types'];
  handsOn: Guide['timeEstimate']['handsOn']; approvalWait: Guide['timeEstimate']['approvalWait'];
};
export const toSummary = (g: Guide): GuideSummary => ({
  slug: g.slug, aliases: g.aliases, app: g.app, difficulty: g.difficulty,
  generatedBy: g.generatedBy, generatedAt: g.generatedAt,
  reviewRequired: g.review.required, reviewTypes: g.review.types,
  handsOn: g.timeEstimate.handsOn, approvalWait: g.timeEstimate.approvalWait,
});
export const CONFIDENCE_RANK = { verified: 2, community: 1, uncertain: 0 } as const;

// ---- Wire protocol (shared by backend sse.ts/routes and frontend stream.ts/api.ts) ----
export type ErrorCode = 'INVALID_INPUT' | 'INVALID_SLUG' | 'NOT_FOUND' | 'RATE_LIMITED' | 'BUSY'
  | 'CONFIG_MISSING' | 'SEARCH_FAILED' | 'NO_SOURCES' | 'LLM_FAILED' | 'TIMEOUT'
  | 'STORE_UNAVAILABLE' | 'INTERNAL';
export type ClientErrorCode = ErrorCode | 'NETWORK' | 'BAD_RESPONSE' | 'STREAM_INTERRUPTED';
export type Stage = 'resolve' | 'search' | 'read' | 'draft' | 'verify' | 'save';
export type StepStatus = 'active' | 'done' | 'failed' | 'skipped';
export type StreamEvent =
  | { event: 'meta';   data: { requestId: string; query: string; appName: string; key: string; startedAt: string; force: boolean } }
  | { event: 'step';   data: { id: string; stage: Stage; status: StepStatus; label: string; detail?: string; at: string } }
  | { event: 'source'; data: { index: number; url: string; title: string; kind: 'official' | 'community' } }
  | { event: 'guide';  data: { guide: Guide; origin: 'curated' | 'cache' | 'fresh'; cached: boolean; persisted: boolean } }
  | { event: 'error';  data: { code: ErrorCode; message: string; retryable: boolean } }
  | { event: 'done';   data: { ok: boolean; slug: string | null; durationMs: number } };
export type StreamEventName = StreamEvent['event'];
/** Pre-stream JSON error body for every non-2xx API response. */
export interface ApiErrorBody { error: { code: ErrorCode; message: string; retryAfterSec?: number } }
