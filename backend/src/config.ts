import { z } from 'zod';

/** The 17 environment variable names, in table order (both Upstash vars listed separately). */
export const CONFIG_KEYS = [
  'PORT',
  'NODE_ENV',
  'ALLOWED_ORIGINS',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'TAVILY_API_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'STORE',
  'DATA_DIR',
  'RATE_LIMIT_MAX',
  'RATE_LIMIT_WINDOW_MS',
  'MAX_CONCURRENT_GENERATIONS',
  'GENERATION_TIMEOUT_MS',
  'CACHE_TTL_HOURS',
  'TRUST_PROXY',
  'LOG_LEVEL',
] as const;

export type ConfigKey = (typeof CONFIG_KEYS)[number];

const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://localhost:4173'];

const intField = (min: number, max: number, def: number) =>
  z.coerce.number().int().min(min).max(max).default(def);

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(0).max(65535).default(8787),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  ALLOWED_ORIGINS: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  TAVILY_API_KEY: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  STORE: z.enum(['auto', 'memory', 'file', 'upstash']).default('auto'),
  DATA_DIR: z.string().default('./.data'),
  RATE_LIMIT_MAX: intField(1, 1000, 5),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1).default(3_600_000),
  MAX_CONCURRENT_GENERATIONS: intField(1, 20, 2),
  GENERATION_TIMEOUT_MS: intField(30_000, 300_000, 120_000),
  CACHE_TTL_HOURS: intField(1, 720, 168),
  TRUST_PROXY: intField(0, 5, 1),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type LogLevel = z.infer<typeof EnvSchema>['LOG_LEVEL'];

export interface Config {
  port: number;
  nodeEnv: 'development' | 'production' | 'test';
  allowedOrigins: string[];
  openaiApiKey?: string;
  openaiModel: string;
  tavilyApiKey?: string;
  upstashUrl?: string;
  upstashToken?: string;
  store: 'auto' | 'memory' | 'file' | 'upstash';
  dataDir: string;
  rateLimitMax: number;
  rateLimitWindowMs: number;
  maxConcurrentGenerations: number;
  generationTimeoutMs: number;
  cacheTtlSec: number;
  trustProxy: number;
  logLevel: LogLevel;
  llmConfigured: boolean;
  searchConfigured: boolean;
}

function parseOrigins(raw: string | undefined): string[] {
  if (raw === undefined) return [...DEFAULT_ORIGINS];
  const parsed = raw
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter((o) => o.length > 0);
  return parsed.length > 0 ? parsed : [...DEFAULT_ORIGINS];
}

/** Treat blank / whitespace-only values as unset so zod defaults apply (Render saves blank secrets). */
function blankToUndefined(env: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const key of CONFIG_KEYS) {
    const v = env[key];
    out[key] = v === undefined || v.trim() === '' ? undefined : v;
  }
  return out;
}

export interface LoadConfigOptions {
  env?: NodeJS.ProcessEnv;
  onError?: (issues: z.ZodIssue[]) => void;
  exit?: (code: number) => never;
}

export function buildConfig(parsed: z.infer<typeof EnvSchema>): Config {
  return {
    port: parsed.PORT,
    nodeEnv: parsed.NODE_ENV,
    allowedOrigins: parseOrigins(parsed.ALLOWED_ORIGINS),
    openaiApiKey: parsed.OPENAI_API_KEY,
    openaiModel: parsed.OPENAI_MODEL,
    tavilyApiKey: parsed.TAVILY_API_KEY,
    upstashUrl: parsed.UPSTASH_REDIS_REST_URL,
    upstashToken: parsed.UPSTASH_REDIS_REST_TOKEN,
    store: parsed.STORE,
    dataDir: parsed.DATA_DIR,
    rateLimitMax: parsed.RATE_LIMIT_MAX,
    rateLimitWindowMs: parsed.RATE_LIMIT_WINDOW_MS,
    maxConcurrentGenerations: parsed.MAX_CONCURRENT_GENERATIONS,
    generationTimeoutMs: parsed.GENERATION_TIMEOUT_MS,
    cacheTtlSec: parsed.CACHE_TTL_HOURS * 3600,
    trustProxy: parsed.TRUST_PROXY,
    logLevel: parsed.LOG_LEVEL,
    llmConfigured: !!parsed.OPENAI_API_KEY,
    searchConfigured: !!parsed.TAVILY_API_KEY,
  };
}

/**
 * Parse process.env once. Invalid values are fatal (process.exit(1)) so a bad deploy fails loudly.
 * One Upstash var without the other is also fatal.
 */
export function loadConfig(opts: LoadConfigOptions = {}): Config {
  const env = opts.env ?? process.env;
  const exit = opts.exit ?? ((code: number) => process.exit(code));
  const onError =
    opts.onError ??
    ((issues: z.ZodIssue[]) => {
      // eslint-disable-next-line no-console
      console.error(
        JSON.stringify({
          t: new Date().toISOString(),
          level: 'error',
          msg: 'invalid environment configuration',
          issues: issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        })
      );
    });

  const result = EnvSchema.safeParse(blankToUndefined(env));
  if (!result.success) {
    onError(result.error.issues);
    exit(1);
    throw new Error('unreachable');
  }

  const parsed = result.data;
  const hasUrl = !!parsed.UPSTASH_REDIS_REST_URL;
  const hasToken = !!parsed.UPSTASH_REDIS_REST_TOKEN;
  if (hasUrl !== hasToken) {
    onError([
      {
        code: z.ZodIssueCode.custom,
        path: ['UPSTASH_REDIS_REST_URL'],
        message:
          'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must both be set or both be unset',
      } as z.ZodIssue,
    ]);
    exit(1);
    throw new Error('unreachable');
  }

  return buildConfig(parsed);
}

/** True when NODE_ENV=production and every allowed origin's hostname is localhost. */
export function hasOnlyLocalhostOrigins(config: Config): boolean {
  if (config.nodeEnv !== 'production') return false;
  return config.allowedOrigins.every((o) => {
    try {
      return new URL(o).hostname === 'localhost';
    } catch {
      return false;
    }
  });
}
