import { useState } from 'react';
import { Copy, Printer } from 'lucide-react';
import type { Guide } from '../../generated/schema';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { DifficultyBadge } from '../ui/DifficultyBadge';
import { ConfidenceTag } from '../ui/ConfidenceTag';
import { Toast } from '../ui/Toast';

function reviewChip(guide: Guide): string {
  if (guide.review.required) return 'Review required';
  if (guide.review.types.some((t) => t !== 'none')) return 'Optional review';
  return 'No review';
}

async function copyLink(url: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return true;
    }
  } catch {
    /* fall through to execCommand */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = url;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function GuideHeader({ guide }: { guide: Guide }) {
  const [toast, setToast] = useState<string | null>(null);

  const onCopy = async () => {
    const url = `${location.origin}/guides/${guide.slug}`;
    const ok = await copyLink(url);
    setToast(ok ? 'Link copied' : 'Copy failed');
  };

  const generatedChip =
    guide.generatedBy === 'curated'
      ? 'Curated'
      : `Live agent · ${guide.generatedAt.slice(0, 10)}`;

  return (
    <header className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-bold text-white"
            style={{ backgroundColor: guide.app.brand.color }}
            aria-hidden="true"
          >
            {guide.app.brand.monogram}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">{guide.app.name}</h1>
            <p className="text-sm text-slate-400">{guide.app.category}</p>
          </div>
        </div>
        <div className="flex gap-2" data-print="hide">
          <Button variant="secondary" onClick={onCopy}>
            <Copy className="h-4 w-4" aria-hidden="true" />
            Copy link
          </Button>
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="h-4 w-4" aria-hidden="true" />
            Print / Save PDF
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <DifficultyBadge level={guide.difficulty.level} />
        <Badge className="border-white/15 text-slate-300">{reviewChip(guide)}</Badge>
        <Badge className="border-white/15 text-slate-300">{generatedChip}</Badge>
        <ConfidenceTag sectionKey="difficulty" confidence={guide.confidence.difficulty} />
      </div>
      <p className="text-sm text-slate-400">{guide.difficulty.reason}</p>

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </header>
  );
}
