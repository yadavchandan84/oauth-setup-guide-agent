import { Check, Loader2, X, SkipForward, ExternalLink } from 'lucide-react';
import type { ComponentType } from 'react';
import type { StreamEvent } from '../../generated/schema';

export interface TimelineStep {
  id: string;
  label: string;
  status: 'active' | 'done' | 'failed' | 'skipped';
  detail?: string;
}

export type TimelineSource = Extract<StreamEvent, { event: 'source' }>['data'];

const ICONS: Record<TimelineStep['status'], ComponentType<{ className?: string }>> = {
  active: Loader2,
  done: Check,
  failed: X,
  skipped: SkipForward,
};

const ICON_STYLE: Record<TimelineStep['status'], string> = {
  active: 'text-violet-300 animate-spin-slow',
  done: 'text-emerald-300',
  failed: 'text-rose-300',
  skipped: 'text-slate-500',
};

export function ActivityTimeline({
  steps,
  sources,
  elapsedSec,
}: {
  steps: TimelineStep[];
  sources: TimelineSource[];
  elapsedSec: number;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-200">Agent activity</h2>
        <span className="text-xs text-slate-500">{elapsedSec}s</span>
      </div>

      <ol aria-live="polite" className="space-y-2">
        {steps.map((step) => {
          const Icon = ICONS[step.status];
          return (
            <li key={step.id} className="flex items-start gap-3 text-sm">
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${ICON_STYLE[step.status]}`} aria-hidden="true" />
              <div>
                <span className="text-slate-200">{step.label}</span>
                {step.detail && <span className="block text-xs text-slate-500">{step.detail}</span>}
              </div>
            </li>
          );
        })}
      </ol>

      {sources.length > 0 && (
        <div className="border-t border-white/10 pt-3">
          <p className="mb-1 text-xs font-medium text-slate-400">Sources read</p>
          <ul className="space-y-1">
            {sources.map((s) => (
              <li key={s.index} className="truncate text-xs">
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-violet-300 hover:underline"
                >
                  <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                  {s.title || s.url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
