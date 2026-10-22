import type { GuideDraft, Verification } from '../src/agent/draftSchema.js';
import type { PromptSource } from '../src/agent/pipeline.js';
import type { AppInput } from '../src/agent/input.js';
import { SECTION_KEYS } from '../src/generated/schema.js';

export const asanaInput: AppInput = {
  raw: 'Asana',
  kind: 'name',
  displayName: 'Asana',
  key: 'asana',
  domainHint: null,
};

export function makeSources(overrides: Partial<PromptSource>[] = []): PromptSource[] {
  const base: PromptSource[] = [
    {
      index: 0,
      url: 'https://developers.asana.com/docs/oauth',
      title: 'Asana OAuth',
      kind: 'official',
      content: 'Asana supports OAuth 2.0 for third-party apps.',
      snippetOnly: false,
    },
    {
      index: 1,
      url: 'https://developers.asana.com/docs/scopes',
      title: 'Asana Scopes',
      kind: 'official',
      content: 'Scopes documentation.',
      snippetOnly: false,
    },
  ];
  overrides.forEach((o, i) => {
    if (base[i]) base[i] = { ...base[i], ...o };
    else base.push({ index: base.length, url: '', title: '', kind: 'community', content: '', snippetOnly: true, ...o });
  });
  return base;
}

function dconf(level: 'verified' | 'community' | 'uncertain', sourceIndexes: number[]) {
  return { level, note: null as string | null, sourceIndexes };
}

export function makeDraft(partial: Partial<GuideDraft> = {}): GuideDraft {
  const draft: GuideDraft = {
    app: {
      name: 'Asana',
      website: 'https://developers.asana.com/',
      category: 'Project Management',
      brand: { color: '#F06A6A', monogram: 'AS' },
    },
    summary: 'How to set up an OAuth app for Asana and get it approved.',
    oauthAvailability: { status: 'supported', note: null, alternatives: [] },
    difficulty: { level: 'Easy', reason: 'No review for most apps.' },
    timeEstimate: {
      handsOn: { min: 10, max: 20, unit: 'minutes', note: null },
      approvalWait: { min: 0, max: 0, unit: 'minutes', note: null },
      criticalPath: 'Creating the app and setting the redirect URI.',
    },
    review: {
      required: false,
      requiredWhen: 'Not required for private apps.',
      types: ['none'],
      stages: [],
    },
    prerequisites: [{ item: 'An Asana developer account', detail: null, actor: 'human' }],
    steps: [
      {
        title: 'Create an OAuth app',
        detail: 'Open the developer console and create a new OAuth application.',
        consoleUrl: 'https://developers.asana.com/docs/oauth',
        actor: 'human',
        estimate: '5 min',
        gotcha: null,
      },
    ],
    redirectUris: { notes: ['Use https URIs.'], examples: ['https://example.com/callback'] },
    scopes: {
      recommended: [{ scope: 'default', purpose: 'Basic access' }],
      sensitive: [],
      notes: [],
    },
    blockers: [
      {
        title: 'Invalid redirect URI',
        symptom: 'Error on callback',
        cause: 'Mismatch with registered URI',
        resolution: 'Register the exact redirect URI.',
        actor: 'human',
      },
    ],
    agentHandoff: {
      agentCan: ['Draft the config'],
      humanMust: ['Create the app'],
      handoffPoints: ['Approving scopes'],
    },
    confidence: {
      difficulty: dconf('verified', [0]),
      timeEstimate: dconf('community', [0]),
      review: dconf('community', [0]),
      prerequisites: dconf('community', [0]),
      steps: dconf('verified', [0]),
      redirectUris: dconf('community', [0]),
      scopes: dconf('verified', [1]),
      blockers: dconf('community', [0]),
      agentHandoff: dconf('community', [0]),
    },
  };
  return { ...draft, ...partial };
}

function vsec(level: 'verified' | 'community' | 'uncertain' = 'verified', note = 'ok') {
  return { level, note };
}

export function makeVerification(partial: Partial<Verification> = {}): Verification {
  const sections = {} as Verification['sections'];
  for (const k of SECTION_KEYS) sections[k] = vsec();
  return {
    sections,
    checked: ['Checked OAuth availability'],
    corrected: [],
    uncertain: [],
    ...partial,
  };
}
