import { describe, it, expect } from 'vitest';
import { normalizeAppInput } from '../src/agent/input.js';

describe('normalizeAppInput', () => {
  it('accepts a plain name', () => {
    const r = normalizeAppInput('Asana');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.kind).toBe('name');
      expect(r.value.displayName).toBe('Asana');
      expect(r.value.key).toBe('asana');
      expect(r.value.domainHint).toBeNull();
    }
  });

  it('normalizes padded input to displayName "Asana" and key "asana"', () => {
    const r = normalizeAppInput('  Asana  ');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.displayName).toBe('Asana');
      expect(r.value.key).toBe('asana');
      expect(r.value.raw).toBe('Asana');
    }
  });

  it('produces equal keys for "Asana", "asana.com", " ASANA "', () => {
    const a = normalizeAppInput('Asana');
    const b = normalizeAppInput('asana.com');
    const c = normalizeAppInput(' ASANA ');
    expect(a.ok && b.ok && c.ok).toBe(true);
    if (a.ok && b.ok && c.ok) {
      expect(a.value.key).toBe('asana');
      expect(b.value.key).toBe('asana');
      expect(c.value.key).toBe('asana');
    }
  });

  it('parses a bare domain to url kind with domainHint', () => {
    const r = normalizeAppInput('slack.com');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.kind).toBe('url');
      expect(r.value.domainHint).toBe('slack.com');
      expect(r.value.displayName).toBe('Slack');
    }
  });

  it('strips a developer. subdomain', () => {
    const r = normalizeAppInput('https://developers.asana.com/docs');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.domainHint).toBe('asana.com');
      expect(r.value.displayName).toBe('Asana');
    }
  });

  it('rejects empty input', () => {
    expect(normalizeAppInput('').ok).toBe(false);
    expect(normalizeAppInput('   ').ok).toBe(false);
  });

  it('rejects a 300-char string', () => {
    expect(normalizeAppInput('a'.repeat(300)).ok).toBe(false);
  });

  it('rejects javascript: scheme (falls to name rules and fails on :)', () => {
    expect(normalizeAppInput('javascript:alert(1)').ok).toBe(false);
  });

  it('rejects newline control char', () => {
    expect(normalizeAppInput('a\nb').ok).toBe(false);
  });

  it('rejects tab control char', () => {
    expect(normalizeAppInput('a\tb').ok).toBe(false);
  });

  it('rejects NUL control char', () => {
    expect(normalizeAppInput('a\u0000b').ok).toBe(false);
  });

  it('rejects localhost and IP literals', () => {
    expect(normalizeAppInput('http://localhost:3000').ok).toBe(false);
    expect(normalizeAppInput('http://127.0.0.1').ok).toBe(false);
  });

  it('rejects a single-character name', () => {
    expect(normalizeAppInput('A').ok).toBe(false);
  });

  it('returns the single validation message on failure', () => {
    const r = normalizeAppInput('');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toBe('Enter a public app name or developer docs URL (max 200 characters).');
    }
  });
});
