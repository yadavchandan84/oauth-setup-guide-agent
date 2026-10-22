import type { AppInput } from './input.js';

/** Last two hostname labels. Deliberately no public-suffix list: same rule as input.ts domainHint. */
export const registrableDomain = (hostname: string): string =>
  hostname.toLowerCase().split('.').slice(-2).join('.');

/** Generic words that are never brand evidence on their own. */
const GENERIC_TOKENS = new Set([
  'apps',
  'cloud',
  'connect',
  'teams',
  'team',
  'platform',
  'developer',
  'developers',
  'docs',
  'online',
  'software',
  'suite',
  'workspace',
  'graph',
  'studio',
  'labs',
  'mail',
  'calendar',
  'drive',
  'chat',
  'meet',
  'service',
  'services',
  'api',
  'app',
  'help',
  'support',
  'blog',
]);

export function brandTokens(input: AppInput): Set<string> {
  const words = input.displayName
    .normalize('NFKD')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !GENERIC_TOKENS.has(t));
  return new Set([input.key, ...words]);
}

export function classifySource(
  url: URL,
  input: AppInput,
  curatedDomains: Set<string>
): 'official' | 'community' {
  const labels = url.hostname.toLowerCase().split('.');
  const registrable = labels.slice(-2).join('.'); // "microsoft.com", "shopify.dev"
  const brandLabel = labels.at(-2) ?? ''; // "microsoft", "shopify"
  if (input.domainHint && registrable === input.domainHint) return 'official';
  if (brandTokens(input).has(brandLabel)) return 'official'; // exact label match, never substring
  if (curatedDomains.has(registrable)) return 'official'; // only populated on force:true for curated apps
  return 'community';
}
