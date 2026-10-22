import { Link } from 'react-router-dom';
import type { GuideSummary } from '../../generated/schema';
import { formatRange } from '../../lib/time';
import { DifficultyBadge } from '../ui/DifficultyBadge';
import { Badge } from '../ui/Badge';
import { TiltCard } from '../ui/TiltCard';

function reviewLabel(s: GuideSummary): string {
  if (s.reviewRequired) return 'Review required';
  if (s.reviewTypes.some((t) => t !== 'none')) return 'Optional review';
  return 'No review';
}

export function GuideCard({ summary }: { summary: GuideSummary }) {
  const { app, slug, difficulty } = summary;
  return (
    <TiltCard className="h-full">
      <Link
        to={`/guides/${slug}`}
        className="group block h-full rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition hover:border-violet-400/40 hover:bg-white/[0.07]"
      >
        <div className="flex items-start justify-between gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-xl text-sm font-bold text-white"
            style={{ backgroundColor: app.brand.color }}
            aria-hidden="true"
          >
            {app.brand.monogram}
          </div>
          <DifficultyBadge level={difficulty.level} />
        </div>
        <h3 className="mt-3 text-base font-semibold text-slate-100">{app.name}</h3>
        <p className="text-xs text-slate-400">{app.category}</p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-400">
          <div>
            <span className="block text-slate-500">Hands-on</span>
            <span className="text-slate-200">{formatRange(summary.handsOn)}</span>
          </div>
          <div>
            <span className="block text-slate-500">Approval wait</span>
            <span className="text-slate-200">{formatRange(summary.approvalWait)}</span>
          </div>
        </div>
        <div className="mt-4">
          <Badge className="border-white/15 text-slate-300">{reviewLabel(summary)}</Badge>
        </div>
      </Link>
    </TiltCard>
  );
}
