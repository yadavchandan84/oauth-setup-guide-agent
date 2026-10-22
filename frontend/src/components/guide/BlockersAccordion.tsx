import type { Guide } from '../../generated/schema';
import { ConfidenceTag } from '../ui/ConfidenceTag';
import { GlassCard } from '../ui/GlassCard';
import { Accordion } from '../ui/Accordion';
import { ActorBadge } from '../ui/ActorBadge';

export function BlockersAccordion({ guide }: { guide: Guide }) {
  if (guide.blockers.length === 0) return null;
  return (
    <GlassCard as="section" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-100">Common blockers</h2>
        <ConfidenceTag sectionKey="blockers" confidence={guide.confidence.blockers} />
      </div>
      <div className="space-y-2">
        {guide.blockers.map((b, i) => (
          <Accordion key={i} title={b.title} headerExtra={<ActorBadge actor={b.actor} />}>
            <dl className="space-y-2">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Symptom</dt>
                <dd className="text-sm text-slate-300">{b.symptom}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Cause</dt>
                <dd className="text-sm text-slate-300">{b.cause}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Resolution</dt>
                <dd className="text-sm text-slate-300">{b.resolution}</dd>
              </div>
            </dl>
          </Accordion>
        ))}
      </div>
    </GlassCard>
  );
}
