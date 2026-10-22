import { cn } from '../../lib/cn';

/**
 * Accessible meter. `fraction` (0..1) drives the visual fill; `valueNow` and `valueText`
 * surface the semantic value to assistive tech.
 */
export function Meter({
  label,
  fraction,
  valueNow,
  valueText,
  className,
}: {
  label: string;
  fraction: number;
  valueNow: number;
  valueText: string;
  className?: string;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  return (
    <div className={className}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-sm text-slate-300">{label}</span>
        <span className="text-sm font-medium text-slate-100">{valueText}</span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuenow={valueNow}
        aria-valuemin={0}
        aria-valuetext={valueText}
        className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]"
      >
        <div
          className={cn('h-full rounded-full bg-gradient-to-r from-indigo-400 via-violet-400 to-cyan-300')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
