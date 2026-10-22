import type { Guide } from '../../generated/schema';
import { ConfidenceTag } from '../ui/ConfidenceTag';
import { GlassCard } from '../ui/GlassCard';
import { Badge } from '../ui/Badge';

const LEVEL_STYLE: Record<string, string> = {
  sensitive: 'border-amber-300/40 text-amber-200',
  restricted: 'border-orange-400/40 text-orange-300',
  admin: 'border-rose-400/40 text-rose-300',
  privileged: 'border-rose-400/40 text-rose-300',
};

export function ScopesPanel({ guide }: { guide: Guide }) {
  const { scopes, redirectUris } = guide;
  return (
    <GlassCard as="section" className="space-y-6">
      <div>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-100">Scopes</h2>
          <ConfidenceTag sectionKey="scopes" confidence={guide.confidence.scopes} />
        </div>

        {scopes.recommended.length > 0 && (
          <div className="mt-3 space-y-2">
            <h3 className="text-sm font-medium text-slate-300">Recommended</h3>
            <ul className="space-y-1.5">
              {scopes.recommended.map((s, i) => (
                <li key={i} className="flex flex-col gap-0.5 text-sm sm:flex-row sm:gap-3">
                  <code className="font-mono text-xs text-cyan-300">{s.scope}</code>
                  <span className="text-slate-400">{s.purpose}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {scopes.sensitive.length > 0 && (
          <div className="mt-4 space-y-2">
            <h3 className="text-sm font-medium text-slate-300">Sensitive / restricted</h3>
            <ul className="space-y-2">
              {scopes.sensitive.map((s, i) => (
                <li key={i} className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="font-mono text-xs text-rose-300">{s.scope}</code>
                    <Badge className={LEVEL_STYLE[s.level] ?? 'border-white/15 text-slate-300'}>
                      {s.level}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-400">{s.consequence}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {scopes.notes.length > 0 && (
          <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-slate-400">
            {scopes.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-white/10 pt-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-slate-100">Redirect URIs</h3>
          <ConfidenceTag sectionKey="redirectUris" confidence={guide.confidence.redirectUris} />
        </div>
        {redirectUris.notes.length > 0 && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-300">
            {redirectUris.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}
        {redirectUris.examples.length > 0 && (
          <div className="mt-3 space-y-1">
            <p className="text-xs text-slate-500">Examples</p>
            {redirectUris.examples.map((ex, i) => (
              <code key={i} className="block font-mono text-xs text-cyan-300">
                {ex}
              </code>
            ))}
          </div>
        )}
      </div>
    </GlassCard>
  );
}
