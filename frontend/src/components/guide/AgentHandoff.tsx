import { Bot, User, ArrowLeftRight } from 'lucide-react';
import type { Guide } from '../../generated/schema';
import { ConfidenceTag } from '../ui/ConfidenceTag';
import { GlassCard } from '../ui/GlassCard';

export function AgentHandoff({ guide }: { guide: Guide }) {
  const { agentCan, humanMust, handoffPoints } = guide.agentHandoff;
  return (
    <GlassCard as="section" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-100">Agent handoff</h2>
        <ConfidenceTag sectionKey="agentHandoff" confidence={guide.confidence.agentHandoff} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-medium text-cyan-300">
            <Bot className="h-4 w-4" aria-hidden="true" />
            What an agent can do
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
            {agentCan.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="flex items-center gap-2 text-sm font-medium text-amber-200">
            <User className="h-4 w-4" aria-hidden="true" />
            Where you take over
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
            {humanMust.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
      </div>
      {handoffPoints.length > 0 && (
        <div className="border-t border-white/10 pt-3">
          <h3 className="flex items-center gap-2 text-sm font-medium text-violet-300">
            <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
            Handoff points
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
            {handoffPoints.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
      )}
    </GlassCard>
  );
}
