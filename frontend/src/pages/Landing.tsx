import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Sparkles, ShieldCheck } from 'lucide-react';
import type { GuideSummary } from '../generated/schema';
import { getCuratedSummaries } from '../lib/guides';
import { Hero } from '../components/three/Hero';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { GlassCard } from '../components/ui/GlassCard';
import { GuideCard } from '../components/guide/GuideCard';

const FEATURED = ['github', 'google-workspace', 'shopify', 'slack', 'microsoft-entra', 'zoom'];
const HOW_IT_WORKS = [
  ['Search', 'Finds the official developer docs for your app.'],
  ['Read', 'Extracts the pages that describe setup and review.'],
  ['Draft', 'Writes a structured, step-by-step guide.'],
  ['Verify', 'Checks each claim against the sources.'],
];

export default function Landing() {
  const [summaries, setSummaries] = useState<GuideSummary[]>([]);
  const [libQuery, setLibQuery] = useState('');
  const [genQuery, setGenQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    getCuratedSummaries().then(setSummaries).catch(() => setSummaries([]));
  }, []);

  const difficultyStats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of summaries) counts[s.difficulty.level] = (counts[s.difficulty.level] ?? 0) + 1;
    return counts;
  }, [summaries]);

  const featured = useMemo(
    () =>
      FEATURED.map((slug) => summaries.find((s) => s.slug === slug)).filter(
        (s): s is GuideSummary => Boolean(s),
      ),
    [summaries],
  );

  const onLibSearch = (e: FormEvent) => {
    e.preventDefault();
    navigate(`/guides?q=${encodeURIComponent(libQuery.trim())}`);
  };
  const onGenerate = (e: FormEvent) => {
    e.preventDefault();
    navigate(`/generate?app=${encodeURIComponent(genQuery.trim())}`);
  };

  return (
    <div>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 h-full" aria-hidden="true">
          <Hero />
        </div>
        <div className="relative mx-auto max-w-5xl px-4 py-24 text-center">
          <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight text-slate-100 sm:text-5xl">
            Ship your OAuth integration without the{' '}
            <span className="text-gradient">approval surprises</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-300">
            Step-by-step setup, scopes, review timelines and blockers for popular apps — each claim
            tagged with how confident we are.
          </p>

          <div className="mx-auto mt-8 grid max-w-3xl gap-3 sm:grid-cols-2">
            <form onSubmit={onLibSearch} className="flex gap-2">
              <Input
                aria-label="Search the library"
                placeholder="Search the library"
                value={libQuery}
                onChange={(e) => setLibQuery(e.target.value)}
              />
              <Button type="submit" variant="secondary" aria-label="Search">
                <Search className="h-4 w-4" aria-hidden="true" />
              </Button>
            </form>
            <form onSubmit={onGenerate} className="flex gap-2">
              <Input
                aria-label="Generate a guide for any app"
                placeholder="Generate a guide for any app"
                value={genQuery}
                onChange={(e) => setGenQuery(e.target.value)}
              />
              <Button type="submit" aria-label="Generate">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              </Button>
            </form>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-sm text-slate-400">
            {['Easy', 'Moderate', 'Hard', 'Very Hard'].map((level) => (
              <span key={level} className="rounded-full border border-white/10 px-3 py-1">
                {difficultyStats[level] ?? 0} {level}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-100">Featured guides</h2>
          <Link to="/guides" className="text-sm text-violet-300 hover:underline">
            View all
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((s) => (
            <GuideCard key={s.slug} summary={s} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="mb-6 text-xl font-semibold text-slate-100">How it works</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_IT_WORKS.map(([name, desc], i) => (
            <GlassCard key={name}>
              <p className="text-sm font-semibold text-violet-300">Step {i + 1}</p>
              <h3 className="mt-1 font-medium text-slate-100">{name}</h3>
              <p className="mt-1 text-sm text-slate-400">{desc}</p>
            </GlassCard>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16">
        <GlassCard className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-6 w-6 text-emerald-300" aria-hidden="true" />
            <p className="text-sm text-slate-300">
              Every section carries an evidence level. Learn how we verify claims.
            </p>
          </div>
          <Link to="/about">
            <Button variant="secondary">Evidence levels</Button>
          </Link>
        </GlassCard>
      </section>
    </div>
  );
}
