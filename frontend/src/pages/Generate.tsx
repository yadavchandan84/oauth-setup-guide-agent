import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Guide } from '../generated/schema';
import { apiConfigured, ApiError, getJson } from '../lib/api';
import { describeError, type ErrorView } from '../lib/errors';
import { streamGenerate, type ClientStreamEvent } from '../lib/stream';
import { GenerateForm } from '../components/generate/GenerateForm';
import {
  ActivityTimeline,
  type TimelineSource,
  type TimelineStep,
} from '../components/generate/ActivityTimeline';
import { GuideView } from '../components/guide/GuideView';
import { GlassCard } from '../components/ui/GlassCard';
import { Button } from '../components/ui/Button';
import { ColdStartNotice } from '../components/ui/ColdStartNotice';
import { ErrorState } from '../components/ui/ErrorState';

type Status = 'idle' | 'connecting' | 'streaming' | 'complete' | 'error' | 'cancelled';

interface GenState {
  status: Status;
  steps: TimelineStep[];
  sources: TimelineSource[];
  guide: Guide | null;
  origin: 'curated' | 'cache' | 'fresh' | null;
  persisted: boolean;
  error: ErrorView | null;
}

type Action =
  | { type: 'start' }
  | { type: 'firstByte' }
  | { type: 'event'; event: ClientStreamEvent }
  | { type: 'error'; view: ErrorView }
  | { type: 'cancelled' }
  | { type: 'reset' };

const initial: GenState = {
  status: 'idle',
  steps: [],
  sources: [],
  guide: null,
  origin: null,
  persisted: false,
  error: null,
};

function reducer(state: GenState, action: Action): GenState {
  switch (action.type) {
    case 'start':
      return { ...initial, status: 'connecting' };
    case 'firstByte':
      return state.status === 'connecting' ? { ...state, status: 'streaming' } : state;
    case 'error':
      return { ...state, status: 'error', error: action.view };
    case 'cancelled':
      return { ...state, status: 'cancelled' };
    case 'reset':
      return initial;
    case 'event': {
      const e = action.event;
      if (e.event === 'step') {
        const steps = [...state.steps];
        const idx = steps.findIndex((s) => s.id === e.data.id);
        const next: TimelineStep = {
          id: e.data.id,
          label: e.data.label,
          status: e.data.status,
          detail: e.data.detail,
        };
        if (idx >= 0) steps[idx] = next;
        else steps.push(next);
        return { ...state, status: 'streaming', steps };
      }
      if (e.event === 'source') {
        if (state.sources.some((s) => s.index === e.data.index)) return state;
        return { ...state, sources: [...state.sources, e.data] };
      }
      if (e.event === 'guide') {
        return {
          ...state,
          guide: e.data.guide,
          origin: e.data.origin,
          persisted: e.data.persisted,
        };
      }
      if (e.event === 'error') {
        return {
          ...state,
          status: 'error',
          error: describeError(e.data.code, e.data.message, { retryable: e.data.retryable }),
        };
      }
      if (e.event === 'done') {
        return state.status === 'error'
          ? state
          : { ...state, status: 'complete' };
      }
      return state;
    }
    default:
      return state;
  }
}

export default function Generate() {
  const [params] = useSearchParams();
  const prefill = params.get('app') ?? '';

  const [state, dispatch] = useReducer(reducer, initial);
  const [elapsed, setElapsed] = useState(0);
  const [coldStart, setColdStart] = useState(false);
  const [llmBanner, setLlmBanner] = useState(false);
  const [rateLimitMax, setRateLimitMax] = useState<number | undefined>(undefined);
  const [lastInput, setLastInput] = useState<{ app: string; force: boolean } | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const coldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // One non-blocking health check on mount.
  useEffect(() => {
    if (!apiConfigured) return;
    let active = true;
    getJson<{ llmConfigured: boolean; searchConfigured: boolean; rateLimitMax?: number }>(
      '/api/health',
      { timeoutMs: 8000 },
    )
      .then((health) => {
        if (!active) return;
        setRateLimitMax(health.rateLimitMax);
        if (!(health.llmConfigured && health.searchConfigured)) setLlmBanner(true);
      })
      .catch(() => {
        /* cold server or offline: no banner */
      });
    return () => {
      active = false;
    };
  }, []);

  const cleanupTimers = useCallback(() => {
    if (coldTimerRef.current) clearTimeout(coldTimerRef.current);
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    coldTimerRef.current = null;
    elapsedTimerRef.current = null;
  }, []);

  useEffect(() => cleanupTimers, [cleanupTimers]);

  const run = useCallback(
    (app: string, force: boolean) => {
      abortRef.current?.abort();
      cleanupTimers();

      const controller = new AbortController();
      abortRef.current = controller;
      setLastInput({ app, force });
      setElapsed(0);
      setColdStart(false);
      dispatch({ type: 'start' });

      const started = Date.now();
      elapsedTimerRef.current = setInterval(
        () => setElapsed(Math.floor((Date.now() - started) / 1000)),
        1000,
      );
      coldTimerRef.current = setTimeout(() => setColdStart(true), 4000);

      streamGenerate({
        app,
        force,
        signal: controller.signal,
        onFirstByte: () => {
          setColdStart(false);
          if (coldTimerRef.current) clearTimeout(coldTimerRef.current);
          dispatch({ type: 'firstByte' });
        },
        onEvent: (event) => dispatch({ type: 'event', event }),
      })
        .catch((err: unknown) => {
          if (controller.signal.aborted) {
            dispatch({ type: 'cancelled' });
            return;
          }
          if (err instanceof ApiError) {
            dispatch({
              type: 'error',
              view: describeError(err.code, err.message, {
                retryable: err.retryable,
                retryAfterSec: err.retryAfterSec,
                rateLimitMax,
              }),
            });
          } else {
            dispatch({
              type: 'error',
              view: describeError('NETWORK', "Can't reach the agent server.", {}),
            });
          }
        })
        .finally(() => {
          cleanupTimers();
        });
    },
    [cleanupTimers, rateLimitMax],
  );

  // Abort any in-flight request on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const cancel = () => {
    abortRef.current?.abort();
    dispatch({ type: 'cancelled' });
  };

  const retry = () => {
    if (lastInput) run(lastInput.app, lastInput.force);
  };

  const busy = state.status === 'connecting' || state.status === 'streaming';
  const showForceFresh = state.origin === 'curated' || state.origin === 'cache';

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <header>
        <h1 className="text-3xl font-bold text-slate-100">Generate a guide</h1>
        <p className="mt-1 text-slate-400">
          Research any public app's OAuth approval path live. Curated apps answer instantly.
        </p>
      </header>

      {llmBanner && (
        <div
          role="status"
          className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300"
        >
          Live research isn't configured on this server. Curated guides still load.
        </div>
      )}

      <GlassCard>
        <GenerateForm
          initialValue={prefill}
          apiConfigured={apiConfigured}
          busy={busy}
          showForceFresh={showForceFresh}
          onSubmit={run}
        />
      </GlassCard>

      {coldStart && busy && <ColdStartNotice />}

      {busy && (
        <GlassCard className="space-y-4">
          <ActivityTimeline steps={state.steps} sources={state.sources} elapsedSec={elapsed} />
          <Button variant="secondary" onClick={cancel}>
            Cancel
          </Button>
        </GlassCard>
      )}

      {state.status === 'cancelled' && (
        <GlassCard className="text-sm text-slate-300">Generation cancelled.</GlassCard>
      )}

      {state.status === 'error' && state.error && (
        <ErrorState
          view={state.error}
          onRetry={state.error.retry !== 'none' ? retry : undefined}
          extra={
            <Link to="/guides" className="text-sm text-violet-300 hover:underline">
              Browse the curated library
            </Link>
          }
        />
      )}

      {state.guide && (state.status === 'complete' || state.status === 'streaming') && (
        <div className="space-y-4">
          <GuideBanner
            origin={state.origin}
            persisted={state.persisted}
            slug={state.guide.slug}
            generatedAt={state.guide.generatedAt}
            onResearchLive={() => lastInput && run(lastInput.app, true)}
          />
          <GuideView guide={state.guide} />
        </div>
      )}
    </div>
  );
}

function GuideBanner({
  origin,
  persisted,
  slug,
  generatedAt,
  onResearchLive,
}: {
  origin: 'curated' | 'cache' | 'fresh' | null;
  persisted: boolean;
  slug: string;
  generatedAt: string;
  onResearchLive: () => void;
}) {
  if (origin === 'curated' || origin === 'cache') {
    const label =
      origin === 'curated'
        ? 'Showing the curated guide'
        : `Showing a guide generated ${generatedAt.slice(0, 10)}`;
    return (
      <GlassCard className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-slate-300">{label}</span>
        <Button variant="secondary" onClick={onResearchLive}>
          Research again live
        </Button>
      </GlassCard>
    );
  }
  if (persisted) {
    return (
      <GlassCard className="text-sm text-slate-300">
        Shareable link: <Link to={`/guides/${slug}`} className="text-violet-300 hover:underline">/guides/{slug}</Link>
      </GlassCard>
    );
  }
  return null;
}
