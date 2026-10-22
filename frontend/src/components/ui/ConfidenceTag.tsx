import { BadgeCheck, Users, HelpCircle } from 'lucide-react';
import type { ComponentType } from 'react';
import type { SectionKey } from '../../generated/schema';
import { Badge } from './Badge';

type Level = 'verified' | 'community' | 'uncertain';

interface SectionConfidenceValue {
  level: Level;
  note?: string;
  sourceRefs: number[];
}

const STYLES: Record<
  Level,
  { label: string; className: string; Icon: ComponentType<{ className?: string }> }
> = {
  verified: {
    label: 'Verified',
    className: 'border-emerald-400/40 text-emerald-300',
    Icon: BadgeCheck,
  },
  community: {
    label: 'Community-reported',
    className: 'border-sky-400/40 text-sky-300',
    Icon: Users,
  },
  uncertain: {
    label: 'Uncertain',
    className: 'border-amber-300/40 text-amber-200',
    Icon: HelpCircle,
  },
};

const EVIDENCE_WORDING: Record<Level, string> = {
  verified: 'Verified against official docs.',
  community: 'Community-reported.',
  uncertain: 'Uncertain — confirm before relying on it.',
};

export function ConfidenceTag({
  sectionKey,
  confidence,
}: {
  sectionKey: SectionKey;
  confidence: SectionConfidenceValue;
}) {
  const { label, className, Icon } = STYLES[confidence.level];
  const title = [EVIDENCE_WORDING[confidence.level], confidence.note].filter(Boolean).join(' ');

  return (
    <span className="inline-flex items-center gap-1.5" data-testid={`confidence-${sectionKey}`}>
      <Badge className={className} title={title}>
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </Badge>
      {confidence.sourceRefs.length > 0 && (
        <span className="text-xs text-slate-400">
          {confidence.sourceRefs.map((ref, i) => (
            <span key={ref}>
              {i > 0 && ' '}
              <a
                href={`#source-${ref}`}
                className="text-violet-300 hover:underline"
                aria-label={`Source ${ref + 1}`}
              >
                [{ref + 1}]
              </a>
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
