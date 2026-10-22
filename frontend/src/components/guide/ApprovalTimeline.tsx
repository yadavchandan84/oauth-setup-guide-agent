import type { Guide } from '../../generated/schema';
import { formatRange, meterFraction, toHours } from '../../lib/time';
import { ConfidenceTag } from '../ui/ConfidenceTag';
import { GlassCard } from '../ui/GlassCard';
import { ActorBadge } from '../ui/ActorBadge';

export function ApprovalTimeline({ guide }: { guide: Guide }) {
  const { stages } = guide.review;
  const handsOn = guide.timeEstimate.handsOn;

  const segments = [
    { name: 'Build & configure', fraction: meterFraction(toHours(handsOn)), range: formatRange(handsOn), actor: null as null | 'agent' | 'human' | 'assist' },
    ...stages.map((s) => ({
      name: s.name,
      fraction: meterFraction(toHours(s.duration)),
      range: formatRange(s.duration),
      actor: s.actor,
    })),
  ];

  return (
    <GlassCard as="section" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-100">Approval timeline</h2>
        <ConfidenceTag sectionKey="review" confidence={guide.confidence.review} />
      </div>

      {stages.length === 0 ? (
        <p className="text-sm text-emerald-300">No approval wait — usable immediately.</p>
      ) : (
        <>
          <p className="text-sm text-slate-400">{guide.review.requiredWhen}</p>
          <ol className="space-y-3 md:flex md:space-y-0 md:gap-2">
            {segments.map((seg, i) => (
              <li key={i} className="md:flex-1">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-100">{seg.name}</span>
                    {seg.actor && <ActorBadge actor={seg.actor} />}
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-cyan-300"
                      style={{ width: `${Math.round(seg.fraction * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{seg.range}</p>
                </div>
              </li>
            ))}
            <li className="md:flex-none md:self-center">
              <span className="inline-flex items-center rounded-full border border-emerald-400/40 px-3 py-1 text-xs font-medium text-emerald-300">
                Live
              </span>
            </li>
          </ol>
        </>
      )}
    </GlassCard>
  );
}
