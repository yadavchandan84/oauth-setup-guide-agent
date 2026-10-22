import type { Guide } from '../../generated/schema';
import { ConfidenceTag } from '../ui/ConfidenceTag';
import { GlassCard } from '../ui/GlassCard';
import { ActorBadge } from '../ui/ActorBadge';

export function Prerequisites({ guide }: { guide: Guide }) {
  if (guide.prerequisites.length === 0) return null;
  return (
    <GlassCard as="section" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-100">Prerequisites</h2>
        <ConfidenceTag sectionKey="prerequisites" confidence={guide.confidence.prerequisites} />
      </div>
      <ul className="space-y-3">
        {guide.prerequisites.map((p, i) => (
          <li key={i} className="flex flex-col gap-1 border-b border-white/5 pb-3 last:border-0 last:pb-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-slate-100">{p.item}</span>
              <ActorBadge actor={p.actor} />
            </div>
            {p.detail && <p className="text-xs text-slate-400">{p.detail}</p>}
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}
