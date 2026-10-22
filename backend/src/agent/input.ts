export interface AppInput {
  /** The input after rule 2 (trimmed, spaces collapsed); ≤200 chars, fits Guide.query. */
  raw: string;
  kind: 'name' | 'url';
  displayName: string;
  /** lowercase [a-z0-9] only, e.g. "googleworkspace". */
  key: string;
  /** e.g. "slack.com", or null for name inputs. */
  domainHint: string | null;
}

export type NormalizeResult =
  | { ok: true; value: AppInput }
  | { ok: false; message: string };

const VALIDATION_MESSAGE = 'Enter a public app name or developer docs URL (max 200 characters).';

const URL_SCHEME = /^https?:\/\//i;
const BARE_DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i;
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} .&+'_/()\-]*$/u;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

const SUBDOMAIN_STRIP = ['www.', 'developer.', 'developers.', 'docs.', 'api.', 'app.'];

function toKey(s: string): string {
  return s
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function capitalize(label: string): string {
  if (label.length === 0) return label;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function fail(): { ok: false; message: string } {
  return { ok: false, message: VALIDATION_MESSAGE };
}

/**
 * Validate and normalize a user-supplied app name or URL. Rules apply in order; a single
 * human-facing message is returned on any failure.
 */
export function normalizeAppInput(raw: string): NormalizeResult {
  // 1. Reject control characters FIRST (so \t \n \r \u0000 are rejected, not normalized).
  if (/\p{Cc}/u.test(raw)) return fail();

  // 2. Trim, collapse runs of spaces (spaces only).
  const trimmed = raw.trim().replace(/ {2,}/g, ' ');

  // 3. Empty.
  if (trimmed.length === 0) return fail();

  // 4. URL-like.
  if (URL_SCHEME.test(trimmed) || BARE_DOMAIN.test(trimmed)) {
    if (trimmed.length > 200) return fail();
    const withScheme = URL_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;
    let url: URL;
    try {
      url = new URL(withScheme);
    } catch {
      return fail();
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return fail();

    let hostname = url.hostname.toLowerCase();
    if (!hostname.includes('.')) return fail();
    if (IPV4.test(hostname) || hostname === 'localhost') return fail();

    for (const prefix of SUBDOMAIN_STRIP) {
      if (hostname.startsWith(prefix)) {
        hostname = hostname.slice(prefix.length);
        break;
      }
    }

    const labels = hostname.split('.').filter((l) => l.length > 0);
    if (labels.length < 2) return fail();

    const domainHint = labels.slice(-2).join('.');
    const brandLabel = labels[labels.length - 2] ?? '';
    const displayName = capitalize(brandLabel);
    const key = toKey(displayName);
    if (key.length === 0) return fail();

    return { ok: true, value: { raw: trimmed, kind: 'url', displayName, key, domainHint } };
  }

  // 5. Name.
  if (trimmed.length < 2 || trimmed.length > 80) return fail();
  if (!NAME_RE.test(trimmed)) return fail();

  const displayName = trimmed;
  const key = toKey(displayName);
  if (key.length === 0) return fail();

  return { ok: true, value: { raw: trimmed, kind: 'name', displayName, key, domainHint: null } };
}
