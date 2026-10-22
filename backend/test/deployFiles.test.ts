import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG_KEYS } from '../src/config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const renderYamlPath = path.join(repoRoot, 'render.yaml');
const envExamplePath = path.join(repoRoot, 'backend', '.env.example');

const SECRET_RE = /sk-[A-Za-z0-9]{20}|tvly-[A-Za-z0-9]{10}/;

function parseEnvExampleKeys(text: string): string[] {
  const keys: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    keys.push(trimmed.slice(0, eq).trim());
  }
  return keys;
}

function parseRenderEnvKeys(text: string): string[] {
  // Collect "- key: NAME" entries under envVars.
  const keys: string[] = [];
  const re = /-\s*key:\s*([A-Z0-9_]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) keys.push(m[1]);
  return keys;
}

describe('deployment files', () => {
  it('backend/.env.example exists and its keys equal CONFIG_KEYS', () => {
    expect(fs.existsSync(envExamplePath)).toBe(true);
    const text = fs.readFileSync(envExamplePath, 'utf8');
    const keys = parseEnvExampleKeys(text);
    expect(new Set(keys)).toEqual(new Set(CONFIG_KEYS));
  });

  it('backend/.env.example contains no key-shaped secrets', () => {
    const text = fs.readFileSync(envExamplePath, 'utf8');
    expect(SECRET_RE.test(text)).toBe(false);
  });

  it('render.yaml exists and its env keys are a superset of .env.example keys', () => {
    expect(fs.existsSync(renderYamlPath)).toBe(true);
    const render = fs.readFileSync(renderYamlPath, 'utf8');
    const envKeys = new Set(parseEnvExampleKeys(fs.readFileSync(envExamplePath, 'utf8')));
    const renderKeys = new Set(parseRenderEnvKeys(render));
    for (const k of envKeys) expect(renderKeys.has(k)).toBe(true);
  });

  it('render.yaml declares the exact build/start/health strings', () => {
    const render = fs.readFileSync(renderYamlPath, 'utf8');
    expect(render).toContain('cd backend && npm ci --include=dev && npm run build');
    expect(render).toContain('cd backend && npm start');
    expect(render).toContain('healthCheckPath: /api/health');
  });
});
