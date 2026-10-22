import { ExternalLink, AlertTriangle } from 'lucide-react';
import type { Guide } from '../../generated/schema';
import { ConfidenceTag } from '../ui/ConfidenceTag';
import { GlassCard } from '../ui/GlassCard';
import { ActorBadge } from '../ui/ActorBadge';

export function StepList({ guide }: { guide: Guide }) {
  if (guide.steps.length === 0) return null;
  return (
    <GlassCard as="section" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-100">Setup steps</h2>
        <ConfidenceTag sectionKey="steps" confidence={guide.confidence.steps} />
      </div>
      <ol className="space-y-4">
        {guide.steps.map((step, i) => (
          <li key={i} className="step-item flex gap-4">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/15 text-sm font-semibold text-slate-200">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-100">{step.title}</h3>
                <div className="flex items-center gap-2">
                  {step.estimate && <span className="text-xs text-slate-500">{step.estimate}</span>}
                  <ActorBadge actor={step.actor} />
                </div>
              </div>
              <p className="text-sm text-slate-300">{step.detail}</p>
              {step.gotcha && (
                <p className="flex items-start gap-2 rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-xs text-amber-200">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{step.gotcha}</span>
                </p>
              )}
              {step.consoleUrl && (
                <a
                  href={step.consoleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open console for "${step.title}" (opens in new tab)`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-violet-300 hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  Open console
                </a>
              )}
            </div>
          </li>
        ))}
      </ol>
    </GlassCard>
  );
}
