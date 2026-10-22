import { ExternalLink } from 'lucide-react';
import type { Guide } from '../../generated/schema';
import { GlassCard } from '../ui/GlassCard';
import { Badge } from '../ui/Badge';

function List({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-medium text-slate-300">{title}</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-slate-400">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

export function SourcesPanel({ guide }: { guide: Guide }) {
  const { sources, checked, corrected, uncertain, lastVerified } = guide.verification;
  return (
    <GlassCard as="section" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-100">Sources</h2>
        <span className="text-xs text-slate-400">Last verified {lastVerified}</span>
      </div>
      <ol className="space-y-2">
        {sources.map((s, i) => (
          <li key={i} id={`source-${i}`} className="flex items-start gap-2 text-sm scroll-mt-20">
            <span className="text-xs font-semibold text-slate-500">[{i + 1}]</span>
            <div className="min-w-0 flex-1">
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${s.title} (opens in new tab)`}
                className="inline-flex items-center gap-1 text-violet-300 hover:underline"
              >
                <span className="truncate">{s.title}</span>
                <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
              </a>
              <div className="mt-0.5 flex items-center gap-2">
                <Badge
                  className={
                    s.kind === 'official'
                      ? 'border-emerald-400/40 text-emerald-300'
                      : 'border-sky-400/40 text-sky-300'
                  }
                >
                  {s.kind}
                </Badge>
                <span className="text-xs text-slate-500">accessed {s.accessed}</span>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <div className="grid gap-4 border-t border-white/10 pt-4 sm:grid-cols-3">
        <List title="Checked" items={checked} />
        <List title="Corrected" items={corrected} />
        <List title="Uncertain" items={uncertain} />
      </div>
    </GlassCard>
  );
}
