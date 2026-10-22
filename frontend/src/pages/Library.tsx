import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { GuideSummary } from '../generated/schema';
import { getCuratedSummaries, searchSummaries } from '../lib/guides';
import { apiConfigured, getJson } from '../lib/api';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { GuideCard } from '../components/guide/GuideCard';
import { cn } from '../lib/cn';

const DIFFICULTIES = ['All', 'Easy', 'Moderate', 'Hard', 'Very Hard'];
const CATEGORIES = [
  'All',
  'Developer Tools',
  'Productivity',
  'Communication',
  'Payments',
  'E-commerce',
  'CRM',
  'Identity',
  'Project Management',
  'Design',
  'Video',
  'Other',
];

type ReviewFilter = 'any' | 'required' | 'none';

export default function Library() {
  const [params, setParams] = useSearchParams();
  const [curated, setCurated] = useState<GuideSummary[]>([]);
  const [recent, setRecent] = useState<GuideSummary[] | null>(null);

  const q = params.get('q') ?? '';
  const difficulty = params.get('difficulty') ?? 'All';
  const review = (params.get('review') as ReviewFilter) ?? 'any';
  const category = params.get('category') ?? 'All';

  useEffect(() => {
    getCuratedSummaries().then(setCurated).catch(() => setCurated([]));
  }, []);

  useEffect(() => {
    if (!apiConfigured) return;
    let active = true;
    getJson<{ curated: GuideSummary[]; recent: GuideSummary[] }>('/api/guides')
      .then((data) => {
        if (active) setRecent(data.recent);
      })
      .catch(() => {
        if (active) setRecent(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (!value || value === 'All' || value === 'any' || value === '') next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const filtered = useMemo(
    () => searchSummaries(curated, { q, difficulty, review, category }),
    [curated, q, difficulty, review, category],
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-slate-100">Guide library</h1>
        <p className="mt-1 text-slate-400">
          Curated OAuth approval guides. Filters sync to the URL, so views are shareable.
        </p>
      </header>

      <div className="mb-6 space-y-3">
        <Input
          aria-label="Search guides"
          placeholder="Search by name, category or alias (e.g. gmail)"
          value={q}
          onChange={(e) => update('q', e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Difficulty">
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => update('difficulty', d)}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-sm transition',
                difficulty === d
                  ? 'border-violet-400/60 bg-violet-400/10 text-slate-100'
                  : 'border-white/10 text-slate-400 hover:text-slate-100',
              )}
            >
              {d}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="text-sm text-slate-400">
            <span className="mr-2">Review</span>
            <select
              value={review}
              onChange={(e) => update('review', e.target.value)}
              className="rounded-lg border border-white/10 bg-ink-900 px-2 py-1 text-slate-200"
            >
              <option value="any">Any</option>
              <option value="required">Review required</option>
              <option value="none">No review</option>
            </select>
          </label>
          <label className="text-sm text-slate-400">
            <span className="mr-2">Category</span>
            <select
              value={category}
              onChange={(e) => update('category', e.target.value)}
              className="rounded-lg border border-white/10 bg-ink-900 px-2 py-1 text-slate-200"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center">
          <p className="text-slate-300">No guides match these filters</p>
          {q.trim() && (
            <Link to={`/generate?app=${encodeURIComponent(q.trim())}`} className="mt-4 inline-block">
              <Button>Generate a guide for &ldquo;{q.trim()}&rdquo;</Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <GuideCard key={s.slug} summary={s} />
          ))}
        </div>
      )}

      {recent && recent.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-xl font-semibold text-slate-100">Recently generated</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((s) => (
              <GuideCard key={s.slug} summary={s} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
