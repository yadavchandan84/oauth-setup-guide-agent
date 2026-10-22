import { GlassCard } from '../components/ui/GlassCard';

const STAGES = [
  ['Resolve', 'Work out which app and docs the request refers to.'],
  ['Search', 'Run parallel doc searches for setup, review and scope pages.'],
  ['Read', 'Extract the most relevant official pages.'],
  ['Draft', 'Write a structured guide from the retrieved evidence.'],
  ['Verify', 'A second pass checks each claim against the sources.'],
  ['Save', 'Persist a shareable permalink for the guide.'],
];

const LEVELS: Array<[string, string, string]> = [
  ['Verified', 'border-emerald-400/40 text-emerald-300', 'Backed by an official docs page that passed the link checker.'],
  ['Community-reported', 'border-sky-400/40 text-sky-300', 'Backed by forums, blogs or widely reported experience.'],
  ['Uncertain', 'border-amber-300/40 text-amber-200', 'Confirm before relying on it.'],
];

export default function About() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-12">
      <header>
        <h1 className="text-3xl font-bold text-slate-100">About this agent</h1>
        <p className="mt-2 text-slate-400">
          It turns a public app name or docs URL into a structured OAuth approval guide, with an
          evidence level on every section so you know what to trust.
        </p>
      </header>

      <GlassCard as="section" className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-100">Evidence levels</h2>
        <ul className="space-y-2">
          {LEVELS.map(([name, cls, desc]) => (
            <li key={name} className="flex items-start gap-3 text-sm">
              <span className={`inline-flex shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>
                {name}
              </span>
              <span className="text-slate-300">{desc}</span>
            </li>
          ))}
        </ul>
      </GlassCard>

      <GlassCard as="section" className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-100">How the agent works</h2>
        <ol className="space-y-2">
          {STAGES.map(([name, desc], i) => (
            <li key={name} className="flex gap-3 text-sm">
              <span className="font-semibold text-violet-300">{i + 1}</span>
              <span>
                <span className="font-medium text-slate-100">{name}. </span>
                <span className="text-slate-300">{desc}</span>
              </span>
            </li>
          ))}
        </ol>
      </GlassCard>

      <GlassCard as="section" className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-100">What we verify — and can't</h2>
        <p className="text-sm text-slate-300">
          Setup steps, scopes and redirect-URI rules are checked against official documentation.
          Approval wait times are community-reported: providers rarely publish firm numbers, so treat
          them as estimates.
        </p>
      </GlassCard>

      <GlassCard as="section" className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-100">Data handling</h2>
        <p className="text-sm text-slate-300">
          Your query and the generated guide are stored so the permalink is shareable. Nothing else is
          collected.
        </p>
      </GlassCard>
    </div>
  );
}
