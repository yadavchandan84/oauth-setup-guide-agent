import { loadConfig, hasOnlyLocalhostOrigins } from './config.js';
import { createLogger } from './log.js';
import { AgentError } from './errors.js';
import { buildCuratedIndex } from './curated.js';
import { createStore } from './store/index.js';
import { createApp } from './app.js';
import { runPipeline } from './agent/pipeline.js';
import type { PipelineDeps } from './agent/pipeline.js';
import { createTavily } from './agent/tavily.js';
import { createLlm, createOpenAiClient } from './agent/llm.js';

function main(): void {
  const config = loadConfig();
  const log = createLogger(config.logLevel);

  if (hasOnlyLocalhostOrigins(config)) {
    log.warn('ALLOWED_ORIGINS has no production origin; the deployed frontend will be CORS-blocked');
  }

  const curated = buildCuratedIndex();
  const store = createStore(config, log);

  // Search dep: real Tavily when configured, else a stub that throws CONFIG_MISSING.
  const search: PipelineDeps['search'] = config.searchConfigured
    ? createTavily(config.tavilyApiKey!).search
    : () => {
        throw new AgentError('CONFIG_MISSING', 'Search is not configured on this server.', false, 503);
      };
  const extract: PipelineDeps['extract'] = config.searchConfigured
    ? createTavily(config.tavilyApiKey!).extract
    : () => {
        throw new AgentError('CONFIG_MISSING', 'Search is not configured on this server.', false, 503);
      };

  // LLM deps: real OpenAI when configured, else stubs that throw CONFIG_MISSING.
  let draft: PipelineDeps['draft'];
  let verify: PipelineDeps['verify'];
  if (config.llmConfigured) {
    const client = createOpenAiClient(config.openaiApiKey!);
    const llm = createLlm(client, config.openaiModel, log);
    draft = llm.draft;
    verify = llm.verify;
  } else {
    draft = () => {
      throw new AgentError('CONFIG_MISSING', 'The LLM is not configured on this server.', false, 503);
    };
    verify = () => {
      throw new AgentError('CONFIG_MISSING', 'The LLM is not configured on this server.', false, 503);
    };
  }

  const pipelineDeps: PipelineDeps = {
    search,
    extract,
    draft,
    verify,
    store,
    now: () => new Date(),
    log,
    model: config.openaiModel,
    cacheTtlSec: config.cacheTtlSec,
  };

  const app = createApp({
    config,
    store,
    curated,
    runPipeline,
    pipelineDeps,
    now: () => new Date(),
    log,
  });

  const server = app.listen(config.port, () => {
    log.info('server listening', { port: config.port, store: store.kind, nodeEnv: config.nodeEnv });
  });

  process.on('SIGTERM', () => {
    log.info('SIGTERM received; closing server');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  });

  process.on('unhandledRejection', (reason) => {
    log.error('unhandledRejection', {
      err: reason instanceof Error ? reason.message : String(reason),
    });
  });

  process.on('uncaughtException', (err) => {
    log.error('uncaughtException', { err: err.message, stack: err.stack });
    process.exit(1);
  });
}

main();
