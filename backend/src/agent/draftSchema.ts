import { z } from 'zod';
import { Actor, Category, Confidence, Difficulty, ReviewType, ScopeLevel } from '../generated/schema.js';

const DRange = z.object({
  min: z.number(),
  max: z.number(),
  unit: z.enum(['minutes', 'hours', 'days', 'weeks']),
  note: z.string().nullable(),
});
const DConf = z.object({
  level: Confidence,
  note: z.string().nullable(),
  sourceIndexes: z.array(z.number().int()),
});

export const GuideDraftSchema = z.object({
  app: z.object({
    name: z.string(),
    website: z.string().nullable(),
    category: Category,
    brand: z.object({ color: z.string(), monogram: z.string() }),
  }),
  summary: z.string(),
  oauthAvailability: z.object({
    status: z.enum(['supported', 'not-supported', 'unclear']),
    note: z.string().nullable(),
    alternatives: z.array(z.string()),
  }),
  difficulty: z.object({ level: Difficulty, reason: z.string() }),
  timeEstimate: z.object({ handsOn: DRange, approvalWait: DRange, criticalPath: z.string() }),
  review: z.object({
    required: z.boolean(),
    requiredWhen: z.string(),
    types: z.array(ReviewType),
    stages: z.array(
      z.object({ name: z.string(), actor: Actor, duration: DRange, description: z.string() })
    ),
  }),
  prerequisites: z.array(z.object({ item: z.string(), detail: z.string().nullable(), actor: Actor })),
  steps: z.array(
    z.object({
      title: z.string(),
      detail: z.string(),
      consoleUrl: z.string().nullable(),
      actor: Actor,
      estimate: z.string().nullable(),
      gotcha: z.string().nullable(),
    })
  ),
  redirectUris: z.object({ notes: z.array(z.string()), examples: z.array(z.string()) }),
  scopes: z.object({
    recommended: z.array(z.object({ scope: z.string(), purpose: z.string() })),
    sensitive: z.array(z.object({ scope: z.string(), level: ScopeLevel, consequence: z.string() })),
    notes: z.array(z.string()),
  }),
  blockers: z.array(
    z.object({
      title: z.string(),
      symptom: z.string(),
      cause: z.string(),
      resolution: z.string(),
      actor: Actor,
    })
  ),
  agentHandoff: z.object({
    agentCan: z.array(z.string()),
    humanMust: z.array(z.string()),
    handoffPoints: z.array(z.string()),
  }),
  confidence: z.object({
    difficulty: DConf,
    timeEstimate: DConf,
    review: DConf,
    prerequisites: DConf,
    steps: DConf,
    redirectUris: DConf,
    scopes: DConf,
    blockers: DConf,
    agentHandoff: DConf,
  }),
});
export type GuideDraft = z.infer<typeof GuideDraftSchema>;

const VSec = z.object({ level: Confidence, note: z.string() });
export const VerificationSchema = z.object({
  sections: z.object({
    difficulty: VSec,
    timeEstimate: VSec,
    review: VSec,
    prerequisites: VSec,
    steps: VSec,
    redirectUris: VSec,
    scopes: VSec,
    blockers: VSec,
    agentHandoff: VSec,
  }),
  checked: z.array(z.string()),
  corrected: z.array(z.string()),
  uncertain: z.array(z.string()),
});
export type Verification = z.infer<typeof VerificationSchema>;
