import type { Guide } from '../../generated/schema';
import { formatRange, meterFraction, toHours } from '../../lib/time';
import { Meter } from '../ui/Meter';
import { ConfidenceTag } from '../ui/ConfidenceTag';
import { GlassCard } from '../ui/GlassCard';

export function TimeEstimate({ guide }: { guide: Guide }) {
  const { handsOn, approvalWait, criticalPath } = guide.timeEstimate;
  const handsOnHours = toHours(handsOn);
  const waitHours = toHours(approvalWait);

  return (
    <GlassCard as="section" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-100">Time estimate</h2>
        <ConfidenceTag sectionKey="timeEstimate" confidence={guide.confidence.timeEstimate} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Meter
          label="Hands-on effort"
          fraction={meterFraction(handsOnHours)}
          valueNow={Math.round(handsOnHours * 10) / 10}
          valueText={formatRange(handsOn)}
        />
        <Meter
          label="Approval wait"
          fraction={meterFraction(waitHours)}
          valueNow={Math.round(waitHours * 10) / 10}
          valueText={formatRange(approvalWait)}
        />
      </div>
      <p className="text-sm text-slate-400">
        <span className="font-medium text-slate-300">Critical path: </span>
        {criticalPath}
      </p>
    </GlassCard>
  );
}
