import { Gauge, Flame, Mountain, ShieldAlert } from 'lucide-react';
import type { ComponentType } from 'react';
import { Badge } from './Badge';

type Level = 'Easy' | 'Moderate' | 'Hard' | 'Very Hard';

const STYLES: Record<Level, { className: string; Icon: ComponentType<{ className?: string }> }> = {
  Easy: { className: 'border-emerald-400/40 text-emerald-300', Icon: Gauge },
  Moderate: { className: 'border-amber-300/40 text-amber-200', Icon: Flame },
  Hard: { className: 'border-orange-400/40 text-orange-300', Icon: Mountain },
  'Very Hard': { className: 'border-rose-400/40 text-rose-300', Icon: ShieldAlert },
};

export function DifficultyBadge({ level }: { level: Level }) {
  const { className, Icon } = STYLES[level];
  return (
    <Badge className={className}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {level}
    </Badge>
  );
}
