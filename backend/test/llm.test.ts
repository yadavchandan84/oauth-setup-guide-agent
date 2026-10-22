import { describe, it, expect, vi } from 'vitest';
import OpenAI from 'openai';
import { LengthFinishReasonError } from 'openai/error';
import { createLlm, DraftInvalid, type LlmClient } from '../src/agent/llm.js';
import { createLogger } from '../src/log.js';
import { AgentError } from '../src/errors.js';
import { asanaInput, makeDraft, makeSources, makeVerification } from './helpers.js';

const log = createLogger('error', () => {});

function clientReturning(parsed: unknown): { client: LlmClient; parse: ReturnType<typeof vi.fn> } {
  const parse = vi.fn(async () => ({ choices: [{ message: { parsed, refusal: null } }] }));
  const client: LlmClient = { beta: { chat: { completions: { parse } } } };
  return { client, parse };
}

function clientThrowing(err: unknown): { client: LlmClient; parse: ReturnType<typeof vi.fn> } {
  const parse = vi.fn(async () => {
    throw err;
  });
  const client: LlmClient = { beta: { chat: { completions: { parse } } } };
  return { client, parse };
}

describe('createLlm.draft', () => {
  it('passes timeout 50000 to the SDK', async () => {
    const { client, parse } = clientReturning(makeDraft());
    const llm = createLlm(client, 'gpt-4o-mini', log);
    await llm.draft({ input: asanaInput, sources: makeSources(), repairIssues: null }, new AbortController().signal);
    expect(parse).toHaveBeenCalledTimes(1);
    const opts = parse.mock.calls[0][1];
    expect(opts.timeout).toBe(50_000);
  });

  it('LengthFinishReasonError -> DraftInvalid', async () => {
    const err = new LengthFinishReasonError();
    const { client } = clientThrowing(err);
    const llm = createLlm(client, 'gpt-4o-mini', log);
    await expect(
      llm.draft({ input: asanaInput, sources: makeSources(), repairIssues: null }, new AbortController().signal)
    ).rejects.toBeInstanceOf(DraftInvalid);
  });

  it('null parsed (refusal) -> DraftInvalid', async () => {
    const { client } = clientReturning(null);
    const llm = createLlm(client, 'gpt-4o-mini', log);
    await expect(
      llm.draft({ input: asanaInput, sources: makeSources(), repairIssues: null }, new AbortController().signal)
    ).rejects.toBeInstanceOf(DraftInvalid);
  });

  it('AuthenticationError -> non-retryable LLM_FAILED', async () => {
    const err = new OpenAI.AuthenticationError(401, { error: { message: 'bad key' } }, 'bad key', new Headers());
    const { client } = clientThrowing(err);
    const llm = createLlm(client, 'gpt-4o-mini', log);
    await expect(
      llm.draft({ input: asanaInput, sources: makeSources(), repairIssues: null }, new AbortController().signal)
    ).rejects.toMatchObject({ code: 'LLM_FAILED', retryable: false });
  });

  it('rethrows signal.reason first on abort', async () => {
    const ac = new AbortController();
    ac.abort(new AgentError('TIMEOUT', 'timed out', true));
    const { client } = clientThrowing(new Error('ignored'));
    const llm = createLlm(client, 'gpt-4o-mini', log);
    await expect(
      llm.draft({ input: asanaInput, sources: makeSources(), repairIssues: null }, ac.signal)
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
});

describe('createLlm.verify', () => {
  it('passes timeout 40000 to the SDK', async () => {
    const { client, parse } = clientReturning(makeVerification());
    const llm = createLlm(client, 'gpt-4o-mini', log);
    await llm.verify({ draft: makeDraft(), sources: makeSources() }, new AbortController().signal);
    const opts = parse.mock.calls[0][1];
    expect(opts.timeout).toBe(40_000);
  });
});
