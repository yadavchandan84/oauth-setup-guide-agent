import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { LengthFinishReasonError, ContentFilterFinishReasonError } from 'openai/error';
import { AgentError } from '../errors.js';
import type { Logger } from '../log.js';
import { GuideDraftSchema, VerificationSchema } from './draftSchema.js';
import type { GuideDraft, Verification } from './draftSchema.js';
import {
  buildDraftUserMessage,
  buildVerifyUserMessage,
  DRAFT_SYSTEM_PROMPT,
  VERIFY_SYSTEM_PROMPT,
} from './prompts.js';
import type { DraftArgs, VerifyArgs } from './pipeline.js';

const DRAFT_TIMEOUT_MS = 50_000;
const VERIFY_TIMEOUT_MS = 40_000;

/** Module-local: a draft that is invalid (refusal / length / filter / failed assembly). Triggers one repair. */
export class DraftInvalid extends Error {
  constructor(public issues: string[]) {
    super('draft invalid');
    this.name = 'DraftInvalid';
  }
}

/** Minimal shape of the OpenAI client we use; tests inject a stub exposing only this. */
export interface LlmClient {
  beta: {
    chat: {
      completions: {
        parse(
          body: unknown,
          options?: { signal?: AbortSignal; timeout?: number }
        ): Promise<unknown>;
      };
    };
  };
}

function mapProviderError(err: unknown, log: Logger): AgentError {
  if (err instanceof OpenAI.AuthenticationError || err instanceof OpenAI.PermissionDeniedError) {
    return new AgentError('LLM_FAILED', 'LLM provider rejected the API key', false);
  }
  if (err instanceof OpenAI.RateLimitError) {
    const code = (err as { code?: unknown }).code;
    if (code === 'insufficient_quota' || code === 'credit_balance_exhausted') {
      return new AgentError('LLM_FAILED', 'LLM quota exhausted (add OpenAI credits)', false);
    }
    return new AgentError('LLM_FAILED', 'The LLM provider failed to respond', true);
  }
  if (err instanceof OpenAI.BadRequestError) {
    log.error('llm bad request', { err: err.message });
    return new AgentError('LLM_FAILED', 'The LLM rejected the request', false);
  }
  if (
    err instanceof OpenAI.APIConnectionTimeoutError ||
    err instanceof OpenAI.APIConnectionError ||
    err instanceof OpenAI.InternalServerError ||
    err instanceof OpenAI.APIError
  ) {
    return new AgentError('LLM_FAILED', 'The LLM provider failed to respond', true);
  }
  log.error('llm unexpected error', { err: err instanceof Error ? err.message : String(err) });
  return new AgentError('LLM_FAILED', 'The LLM provider failed to respond', true);
}

interface ParsedCompletion<T> {
  choices: { message: { parsed: T | null; refusal?: string | null } }[];
}

export function createLlm(client: LlmClient, model: string, log: Logger) {
  return {
    async draft(args: DraftArgs, signal: AbortSignal): Promise<GuideDraft> {
      if (signal.aborted) throw signal.reason;
      const messages = [
        { role: 'system', content: DRAFT_SYSTEM_PROMPT },
        {
          role: 'user',
          content: buildDraftUserMessage(args.input, args.sources, args.repairIssues),
        },
      ];
      let completion: ParsedCompletion<GuideDraft>;
      try {
        completion = (await client.beta.chat.completions.parse(
          {
            model,
            temperature: 0.2,
            response_format: zodResponseFormat(GuideDraftSchema, 'guide_draft'),
            messages,
          },
          { signal, timeout: DRAFT_TIMEOUT_MS }
        )) as ParsedCompletion<GuideDraft>;
      } catch (err) {
        if (signal.aborted) throw signal.reason;
        if (err instanceof LengthFinishReasonError || err instanceof ContentFilterFinishReasonError) {
          throw new DraftInvalid(['The model stopped before producing a complete guide.']);
        }
        throw mapProviderError(err, log);
      }
      const message = completion.choices[0]?.message;
      if (!message || message.parsed === null || message.parsed === undefined) {
        throw new DraftInvalid(['The model refused or returned no structured output.']);
      }
      return message.parsed;
    },

    async verify(args: VerifyArgs, signal: AbortSignal): Promise<Verification> {
      if (signal.aborted) throw signal.reason;
      const messages = [
        { role: 'system', content: VERIFY_SYSTEM_PROMPT },
        { role: 'user', content: buildVerifyUserMessage(args.draft, args.sources) },
      ];
      let completion: ParsedCompletion<Verification>;
      try {
        completion = (await client.beta.chat.completions.parse(
          {
            model,
            temperature: 0,
            response_format: zodResponseFormat(VerificationSchema, 'verification'),
            messages,
          },
          { signal, timeout: VERIFY_TIMEOUT_MS }
        )) as ParsedCompletion<Verification>;
      } catch (err) {
        if (signal.aborted) throw signal.reason;
        if (err instanceof LengthFinishReasonError || err instanceof ContentFilterFinishReasonError) {
          throw new AgentError('LLM_FAILED', 'The LLM provider failed to respond', true);
        }
        throw mapProviderError(err, log);
      }
      const message = completion.choices[0]?.message;
      if (!message || message.parsed === null || message.parsed === undefined) {
        throw new AgentError('LLM_FAILED', 'The LLM provider failed to respond', true);
      }
      return message.parsed;
    },
  };
}

/** Construct the single shared OpenAI client. Only called when llmConfigured. */
export function createOpenAiClient(apiKey: string): OpenAI {
  return new OpenAI({ apiKey, maxRetries: 1 });
}
