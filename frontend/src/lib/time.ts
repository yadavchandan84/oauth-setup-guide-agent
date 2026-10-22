type Range = {
  min: number;
  max: number;
  unit: 'minutes' | 'hours' | 'days' | 'weeks';
  note?: string;
};

const UNIT_HOURS: Record<Range['unit'], number> = {
  minutes: 1 / 60,
  hours: 1,
  days: 24,
  weeks: 168,
};

/** Convert a duration's upper bound to wall-clock hours. */
export function toHours(range: Range): number {
  return range.max * UNIT_HOURS[range.unit];
}

const UNIT_LABEL: Record<Range['unit'], [string, string]> = {
  minutes: ['minute', 'minutes'],
  hours: ['hour', 'hours'],
  days: ['day', 'days'],
  weeks: ['week', 'weeks'],
};

/** Human-friendly range, e.g. "2–4 hours", "Instant", "30–60 minutes". */
export function formatRange(range: Range): string {
  if (range.min === 0 && range.max === 0) return 'Instant';
  const [single, plural] = UNIT_LABEL[range.unit];
  const label = range.max === 1 ? single : plural;
  if (range.min === range.max) return `${range.max} ${label}`;
  return `${range.min}\u2013${range.max} ${label}`;
}

/**
 * Logarithmic 0..1 fraction for a meter. 12 weeks (2016 hours) = full.
 */
export function meterFraction(hours: number): number {
  if (hours <= 0) return 0;
  return Math.min(1, Math.log10(1 + hours) / Math.log10(1 + 2016));
}

export type { Range as DurationRangeValue };
