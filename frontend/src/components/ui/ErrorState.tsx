import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { ErrorView } from '../../lib/errors';
import { GlassCard } from './GlassCard';
import { Button } from './Button';

/**
 * Renders an ErrorView from describeError. The retry button honours the retry mode:
 *  - 'now'  -> enabled immediately
 *  - 'later'-> disabled with a live countdown
 *  - 'none' -> no button
 */
export function ErrorState({
  view,
  onRetry,
  extra,
}: {
  view: ErrorView;
  onRetry?: () => void;
  extra?: React.ReactNode;
}) {
  const [remaining, setRemaining] = useState(view.retryAfterSec ?? 0);

  useEffect(() => {
    if (view.retry !== 'later') return;
    setRemaining(view.retryAfterSec ?? 0);
    const t = setInterval(() => setRemaining((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [view.retry, view.retryAfterSec]);

  const showButton = onRetry && view.retry !== 'none';
  const disabled = view.retry === 'later' && remaining > 0;

  return (
    <GlassCard className="border-rose-400/20">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" aria-hidden="true" />
        <div className="space-y-2">
          <h2 className="text-base font-semibold text-slate-100">{view.title}</h2>
          <p className="text-sm text-slate-300">{view.message}</p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {showButton && (
              <Button onClick={onRetry} disabled={disabled} variant="secondary">
                {disabled ? `Try again in ${remaining}s` : 'Try again'}
              </Button>
            )}
            {extra}
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
