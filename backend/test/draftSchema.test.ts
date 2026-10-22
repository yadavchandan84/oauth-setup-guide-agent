import { describe, it, expect } from 'vitest';
import { zodResponseFormat } from 'openai/helpers/zod';
import { GuideDraftSchema, VerificationSchema } from '../src/agent/draftSchema.js';
import { SECTION_KEYS } from '../src/generated/schema.js';

const BANNED_KEYWORDS = [
  'format',
  'pattern',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'default',
];

type JsonSchema = Record<string, any>;

function getDefs(root: JsonSchema): Record<string, JsonSchema> {
  return root.$defs ?? root.definitions ?? {};
}

function resolveRef(ref: string, defs: Record<string, JsonSchema>): JsonSchema {
  const name = ref.replace(/^#\/(\$defs|definitions)\//, '');
  const def = defs[name];
  if (!def) throw new Error(`unresolved $ref: ${ref}`);
  return def;
}

function walk(node: JsonSchema, defs: Record<string, JsonSchema>, seen: Set<JsonSchema>): void {
  if (!node || typeof node !== 'object') return;
  if (seen.has(node)) return;
  seen.add(node);

  if (typeof node.$ref === 'string') {
    walk(resolveRef(node.$ref, defs), defs, seen);
    return;
  }

  for (const kw of BANNED_KEYWORDS) {
    expect(node[kw], `banned keyword "${kw}" present`).toBeUndefined();
  }

  if (node.type === 'object') {
    expect(node.additionalProperties, 'object must set additionalProperties:false').toBe(false);
    const propKeys = Object.keys(node.properties ?? {});
    const required: string[] = node.required ?? [];
    expect(new Set(required)).toEqual(new Set(propKeys));
  }

  for (const value of Object.values(node.properties ?? {})) {
    walk(value as JsonSchema, defs, seen);
  }
  if (node.items) walk(node.items as JsonSchema, defs, seen);
  for (const key of ['anyOf', 'allOf', 'oneOf'] as const) {
    if (Array.isArray(node[key])) for (const sub of node[key]) walk(sub as JsonSchema, defs, seen);
  }
}

describe('GuideDraftSchema strict-mode JSON schema', () => {
  const schema = zodResponseFormat(GuideDraftSchema, 'guide_draft').json_schema.schema as JsonSchema;

  it('has no banned keywords and every object is strict', () => {
    walk(schema, getDefs(schema), new Set());
  });

  it('confidence keys equal SECTION_KEYS', () => {
    const defs = getDefs(schema);
    const resolve = (n: JsonSchema): JsonSchema => (n.$ref ? resolveRef(n.$ref, defs) : n);
    const root = resolve(schema);
    const confidence = resolve(root.properties.confidence);
    expect(new Set(Object.keys(confidence.properties))).toEqual(new Set(SECTION_KEYS));
  });
});

describe('VerificationSchema strict-mode JSON schema', () => {
  const schema = zodResponseFormat(VerificationSchema, 'verification').json_schema.schema as JsonSchema;

  it('has no banned keywords and every object is strict', () => {
    walk(schema, getDefs(schema), new Set());
  });

  it('sections keys equal SECTION_KEYS', () => {
    const defs = getDefs(schema);
    const resolve = (n: JsonSchema): JsonSchema => (n.$ref ? resolveRef(n.$ref, defs) : n);
    const root = resolve(schema);
    const sections = resolve(root.properties.sections);
    expect(new Set(Object.keys(sections.properties))).toEqual(new Set(SECTION_KEYS));
  });
});
