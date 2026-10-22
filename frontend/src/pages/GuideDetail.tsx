import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { ClientErrorCode, Guide } from '../generated/schema';
import { getCuratedBySlug } from '../lib/guides';
import { apiConfigured, ApiError, getJson } from '../lib/api';
import { describeError } from '../lib/errors';
import { GuideView } from '../components/guide/GuideView';
import { PageSkeleton } from '../components/ui/Skeleton';
import { ColdStartNotice } from '../components/ui/ColdStartNotice';
import { ErrorState } from '../components/ui/ErrorState';
import { Button } from '../components/ui/Button';
import { GlassCard } from '../components/ui/GlassCard';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type State =
  | { kind: 'loading' }
  | { kind: 'guide'; guide: Guide }
  | { kind: 'notFound' }
  | { kind: 'error'; code: ClientErrorCode; message: string; retryable: boolean; retryAfterSec?: number };

function NotFoundState() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-2xl font-bold text-slate-100">Guide not found</h1>
      <p className="mt-2 text-slate-400">We don't have a guide for that yet.</p>
      <div className="mt-6 flex justify-center gap-3">
        <Link to="/guides">
          <Button variant="secondary">Browse the library</Button>
        </Link>
        <Link to="/generate">
          <Button>Generate a guide</Button>
        </Link>
      </div>
    </div>
  );
}

export default function GuideDetail() {
  const { slug = '' } = useParams();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [coldStart, setColdStart] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setState({ kind: 'loading' });
    setColdStart(false);

    (async () => {
      const curated = await getCuratedBySlug(slug);
      if (!active) return;
      if (curated) {
        setState({ kind: 'guide', guide: curated });
        return;
      }

      // Not curated. Without an API there is nothing to fetch.
      if (!apiConfigured) {
        setState({ kind: 'notFound' });
        return;
      }

      // Client-side slug pre-check avoids a pointless request.
      if (!SLUG_RE.test(slug) || slug.length > 80) {
        setState({ kind: 'notFound' });
        return;
      }

      const coldTimer = setTimeout(() => active && setColdStart(true), 4000);
      try {
        const guide = await getJson<Guide>(`/api/guides/${slug}`, { signal: controller.signal });
        if (active) setState({ kind: 'guide', guide });
      } catch (err) {
        if (!active) return;
        if (err instanceof ApiError) {
          // 400 / 404 (INVALID_SLUG / NOT_FOUND) -> Guide not found, no retry.
          if (err.code === 'INVALID_SLUG' || err.code === 'NOT_FOUND') {
            setState({ kind: 'notFound' });
          } else {
            setState({
              kind: 'error',
              code: err.code,
              message: err.message,
              retryable: err.retryable,
              retryAfterSec: err.retryAfterSec,
            });
          }
        } else {
          setState({
            kind: 'error',
            code: 'NETWORK',
            message: "Can't reach the agent server.",
            retryable: true,
          });
        }
      } finally {
        clearTimeout(coldTimer);
        if (active) setColdStart(false);
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [slug, attempt]);

  if (state.kind === 'loading') {
    return (
      <div className="space-y-4">
        {coldStart && (
          <div className="mx-auto max-w-5xl px-4 pt-8">
            <ColdStartNotice />
          </div>
        )}
        <PageSkeleton />
      </div>
    );
  }

  if (state.kind === 'notFound') return <NotFoundState />;

  if (state.kind === 'error') {
    const view = describeError(state.code, state.message, {
      retryable: state.retryable,
      retryAfterSec: state.retryAfterSec,
    });
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <ErrorState
          view={view}
          onRetry={view.retry !== 'none' ? () => setAttempt((a) => a + 1) : undefined}
          extra={
            <Link to="/guides" className="text-sm text-violet-300 hover:underline">
              Browse the curated library
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <>
      {state.guide.generatedBy === 'live-agent' && (
        <div className="mx-auto max-w-6xl px-4 pt-6">
          <GlassCard className="text-sm text-slate-300">
            This guide was generated live. Approval times are estimates — verify against official docs.
          </GlassCard>
        </div>
      )}
      <GuideView guide={state.guide} />
    </>
  );
}
