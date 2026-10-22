import { Info } from 'lucide-react';
import type { Guide } from '../../generated/schema';
import { GuideHeader } from './GuideHeader';
import { TimeEstimate } from './TimeEstimate';
import { ApprovalTimeline } from './ApprovalTimeline';
import { Prerequisites } from './Prerequisites';
import { StepList } from './StepList';
import { ScopesPanel } from './ScopesPanel';
import { BlockersAccordion } from './BlockersAccordion';
import { AgentHandoff } from './AgentHandoff';
import { SourcesPanel } from './SourcesPanel';
import { GuideToc } from './GuideToc';
import { GlassCard } from '../ui/GlassCard';

function OAuthBanner({ guide }: { guide: Guide }) {
  const { status, note, alternatives } = guide.oauthAvailability;
  if (status === 'supported') return null;
  return (
    <GlassCard className="border-amber-300/20 bg-amber-300/[0.03]">
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-amber-200">
            {status === 'not-supported' ? 'OAuth is not supported' : 'OAuth support is unclear'}
          </p>
          {note && <p className="text-sm text-slate-300">{note}</p>}
          {alternatives.length > 0 && (
            <div>
              <p className="text-xs text-slate-400">Alternatives:</p>
              <ul className="list-disc pl-5 text-sm text-slate-300">
                {alternatives.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  );
}

export function GuideView({ guide }: { guide: Guide }) {
  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 lg:grid-cols-[14rem_1fr]">
      <aside className="hidden lg:block">
        <GuideToc />
      </aside>

      <article className="min-w-0 space-y-6">
        <GuideHeader guide={guide} />

        <section id="summary" className="scroll-mt-20 space-y-4">
          <GlassCard>
            <p className="text-sm leading-relaxed text-slate-300">{guide.summary}</p>
          </GlassCard>
          <OAuthBanner guide={guide} />
        </section>

        <div id="time" className="scroll-mt-20">
          <TimeEstimate guide={guide} />
        </div>
        <div id="timeline" className="scroll-mt-20">
          <ApprovalTimeline guide={guide} />
        </div>
        <div id="prerequisites" className="scroll-mt-20">
          <Prerequisites guide={guide} />
        </div>
        <div id="steps" className="scroll-mt-20">
          <StepList guide={guide} />
        </div>
        <div id="scopes" className="scroll-mt-20">
          <ScopesPanel guide={guide} />
        </div>
        <div id="blockers" className="scroll-mt-20">
          <BlockersAccordion guide={guide} />
        </div>
        <div id="handoff" className="scroll-mt-20">
          <AgentHandoff guide={guide} />
        </div>
        <div id="sources" className="scroll-mt-20">
          <SourcesPanel guide={guide} />
        </div>
      </article>
    </div>
  );
}
