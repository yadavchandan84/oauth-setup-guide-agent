import { Loader2 } from 'lucide-react';

/** Shown when the free-tier backend is waking from sleep. Exact wording is asserted in tests. */
export function ColdStartNotice() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300"
    >
      <Loader2 className="h-4 w-4 animate-spin-slow text-violet-300" aria-hidden="true" />
      <span>
        Waking up the agent server&hellip;
        <span className="text-slate-400"> Free hosting can take up to a minute.</span>
      </span>
    </div>
  );
}
