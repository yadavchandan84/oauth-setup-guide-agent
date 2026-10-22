import { describe, it, expect } from 'vitest';
import { classifySource, registrableDomain } from '../src/agent/sources.js';
import { normalizeAppInput } from '../src/agent/input.js';
import type { AppInput } from '../src/agent/input.js';

function input(raw: string): AppInput {
  const r = normalizeAppInput(raw);
  if (!r.ok) throw new Error(`bad input fixture: ${raw}`);
  return r.value;
}

describe('registrableDomain', () => {
  it('takes the last two labels', () => {
    expect(registrableDomain('learn.microsoft.com')).toBe('microsoft.com');
  });
});

describe('classifySource', () => {
  const cases: Array<[string, AppInput, Set<string>, 'official' | 'community']> = [
    ['https://developers.asana.com/docs/oauth', input('Asana'), new Set(), 'official'],
    ['https://asanaalternatives.io/x', input('Asana'), new Set(), 'community'],
    ['https://bestasana.blog/x', input('Asana'), new Set(), 'community'],
    ['https://learn.microsoft.com/en-us/graph/auth', input('Microsoft Teams'), new Set(), 'official'],
    ['https://teams.com/', input('Microsoft Teams'), new Set(), 'community'],
    ['https://medium.com/@x/asana-oauth', input('Asana'), new Set(), 'community'],
    ['https://shopify.dev/docs/apps', input('Shopify'), new Set(), 'official'],
    ['https://developers.zoom.us/docs/', input('Zoom'), new Set(), 'official'],
    ['https://connect.com/', input('Stripe Connect'), new Set(), 'community'],
    ['https://docs.stripe.com/connect', input('Stripe Connect'), new Set(), 'official'],
    ['https://app.example.io/', input('example.io'), new Set(), 'official'],
    ['https://stripe.com/docs', input('Payments Thing'), new Set(['stripe.com']), 'official'],
  ];

  for (const [url, appInput, curated, expected] of cases) {
    it(`${url} + "${appInput.displayName}" -> ${expected}`, () => {
      expect(classifySource(new URL(url), appInput, curated)).toBe(expected);
    });
  }
});
